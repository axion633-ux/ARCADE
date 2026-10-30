(function (root, factory) {
  const api = factory(root.Matter || (typeof require === 'function' ? require('matter-js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ArcadePool = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function (Matter) {
  'use strict';
  const WIDTH = 800, HEIGHT = 420, RADIUS = 10, STEP_MS = 1000 / 60, SUBSTEPS = 4, BALL_MASS = 0.17, ROLLING_DECEL = 0.08;
  const POCKETS = [{x:23,y:23},{x:400,y:19},{x:777,y:23},{x:23,y:397},{x:400,y:401},{x:777,y:397}];
  const GROUP = n => n >= 1 && n <= 7 ? 'solids' : n >= 9 && n <= 15 ? 'stripes' : null;
  function rack(seed = 1) {
    const balls = [{ number: 0, x: 185, y: 210 }], numbers = Array.from({length: 15}, (_, i) => i + 1).filter(n => n !== 8);
    // Standard triangle with the 8 at its center and opposite suits on the rear corners.
    const corners = [1, 9];
    if ((seed >>> 0) & 1) corners.reverse();
    numbers.splice(numbers.indexOf(corners[0]), 1); numbers.splice(numbers.indexOf(corners[1]), 1);
    const rows = [];
    for (let row = 0; row < 5; row++) {
      rows[row] = [];
      for (let col = 0; col <= row; col++) {
        let number;
        if (row === 2 && col === 1) number = 8;
        else if (row === 4 && col === 0) number = corners[0];
        else if (row === 4 && col === 4) number = corners[1];
        else number = numbers.shift();
        rows[row].push(number);
        balls.push({ number, x: 565 + row * 17.4, y: 210 + (col - row / 2) * 20.1 });
      }
    }
    return { seed: seed >>> 0, balls, groups: [null, null], currentPlayer: 0, breakShot: true, ballInHand: false, winner: null, shotNumber: 0 };
  }
  function seeded(seed) { let n = (seed >>> 0) || 0x9e3779b9; return () => { n ^= n << 13; n ^= n >>> 17; n ^= n << 5; return (n >>> 0) / 4294967296; }; }
  function createWorld(snapshot) {
    if (!Matter) throw new Error('Matter.js did not load.');
    const { Engine, Bodies, Body, Composite, Events } = Matter;
    const engine = Engine.create({ enableSleeping: false }); engine.gravity.x = 0; engine.gravity.y = 0;
    const rails = [];
    // Cushion segments leave room for the six pockets.
    [[35,16,330,28],[435,16,330,28],[35,404,330,28],[435,404,330,28],
      [16,35,28,125],[16,260,28,125],[784,35,28,125],[784,260,28,125]].forEach(([x,y,w,h], i) => rails.push(Bodies.rectangle(x+w/2,y+h/2,w,h,{isStatic:true,label:'rail-'+i,restitution:.82})));
    Composite.add(engine.world, rails);
    const bodies = new Map(), pocketed = new Set(); let firstContact = null, railHit = false, collisionCount = 0;
    for (const ball of snapshot.balls) {
      const body = Bodies.circle(ball.x, ball.y, RADIUS, { label: 'ball-'+ball.number, restitution:.94, friction:.006, frictionStatic:.01, frictionAir:0, mass:BALL_MASS, slop:.01 });
      body.poolNumber = ball.number; bodies.set(ball.number, body); Composite.add(engine.world, body);
    }
    Events.on(engine, 'collisionStart', event => {
      for (const pair of event.pairs) {
        const a = pair.bodyA, b = pair.bodyB;
        if (a.label.startsWith('rail-') || b.label.startsWith('rail-')) { if (firstContact !== null) railHit = true; continue; }
        if (a.poolNumber === undefined || b.poolNumber === undefined) continue;
        collisionCount++;
        if (firstContact === null && (a.poolNumber === 0 || b.poolNumber === 0)) firstContact = a.poolNumber === 0 ? b.poolNumber : a.poolNumber;
      }
    });
    return {
      engine, bodies, get firstContact(){return firstContact;}, get railHit(){return railHit;}, get collisionCount(){return collisionCount;}, get pocketed(){return [...pocketed];},
      shoot(angle, power) { const cue = bodies.get(0); if (!cue) return false; const normalized = Math.max(0, Math.min(1, power)); const magnitude = normalized <= .025 ? 0 : .18 + Math.pow(normalized, 1.65) * 22; Body.setVelocity(cue, { x: Math.cos(angle) * magnitude, y: Math.sin(angle) * magnitude }); firstContact = null; railHit = false; collisionCount = 0; pocketed.clear(); return true; },
      placeCue(x, y) { const cue = bodies.get(0); if (!cue) { const body = Bodies.circle(x,y,RADIUS,{label:'ball-0',restitution:.94,friction:.006,frictionAir:0,mass:BALL_MASS}); body.poolNumber=0; bodies.set(0,body); Composite.add(engine.world,body); } else Matter.Body.setPosition(cue,{x,y}); },
      step() {
        for (let substep = 0; substep < SUBSTEPS; substep++) {
          Engine.update(engine, STEP_MS / SUBSTEPS);
          // Check each small integration step so a fast ball cannot skip over a pocket.
          for (const [number, body] of bodies) {
            const pocket = POCKETS.find(p => Math.hypot(body.position.x-p.x, body.position.y-p.y) < 25);
            if (pocket) { Composite.remove(engine.world, body); bodies.delete(number); pocketed.add(number); }
          }
        }
        for (const [number, body] of bodies) {
          const v = body.velocity, speed = Math.hypot(v.x,v.y);
          if (speed <= ROLLING_DECEL) Matter.Body.setVelocity(body,{x:0,y:0});
          else { const nextSpeed = speed - ROLLING_DECEL; Matter.Body.setVelocity(body,{x:v.x * nextSpeed / speed,y:v.y * nextSpeed / speed}); }
        }
      },
      moving() { for (const body of bodies.values()) if (Math.hypot(body.velocity.x,body.velocity.y) > ROLLING_DECEL) return true; return false; },
      snapshot() { return { balls:[...bodies].map(([number,b])=>({number,x:+b.position.x.toFixed(4),y:+b.position.y.toFixed(4)})).sort((a,b)=>a.number-b.number), groups:[...snapshot.groups], currentPlayer:snapshot.currentPlayer, breakShot:false, ballInHand:false, winner:snapshot.winner, shotNumber:snapshot.shotNumber }; },
      dispose() { Events.off(engine); Composite.clear(engine.world,false); }
    };
  }
  function resolveShot(before, result, shooter) {
    const next = {...before, balls:result.balls.map(ball=>({...ball})), groups:[...before.groups], currentPlayer:shooter, breakShot:false, ballInHand:false, winner:null, shotNumber:(before.shotNumber||0)+1};
    const fallen = result.pocketed || [], eight = fallen.includes(8), cueScratch = fallen.includes(0);
    let group = next.groups[shooter], own = group ? fallen.some(n => GROUP(n) === group) : false;
    const opponentFirst = !!(group && GROUP(result.firstContact) && GROUP(result.firstContact) !== group);
    const legalBreak = before.breakShot;
    const noObjectContact = result.firstContact == null;
    const noRailOrPocket = !result.railHit && fallen.length === 0;
    const foul = cueScratch || noObjectContact || opponentFirst || noRailOrPocket;
    const allOwnGone = group && !next.balls.some(ball => GROUP(ball.number) === group);
    let event;
    const eightOnBreak = legalBreak && eight;
    if (eight && !eightOnBreak && (foul || !group || !allOwnGone)) { next.winner = 1 - shooter; event = 'Early 8-ball: the shooter loses.'; }
    else if (eight && !eightOnBreak) { next.winner = shooter; event = 'Legal 8-ball. Game over!'; }
    else {
      if (cueScratch) { const cue = before.balls.find(ball=>ball.number===0) || {number:0,x:185,y:210}; if (!next.balls.some(ball=>ball.number===0)) next.balls.push({...cue}); }
      if (!foul && !legalBreak && !group) { const firstPocket = fallen.find(n => GROUP(n)); if (firstPocket) { next.groups[shooter] = GROUP(firstPocket); next.groups[1-shooter] = next.groups[shooter] === 'solids' ? 'stripes' : 'solids'; group=next.groups[shooter];own=fallen.some(n=>GROUP(n)===group); } }
      if (foul) { next.currentPlayer = 1 - shooter; next.ballInHand = true; event = cueScratch ? 'Scratch. Ball in hand for your opponent.' : 'Foul. Ball in hand for your opponent.'; }
      else { const keepTurn = eightOnBreak || (legalBreak ? fallen.some(n => n !== 0 && n !== 8) : own); if (!keepTurn) next.currentPlayer = 1-shooter; if (!eightOnBreak) event = fallen.length ? `Pocketed ${fallen.filter(n=>n!==0).length} ball${fallen.filter(n=>n!==0).length===1?'':'s'}.` : 'No pocket. Next player up.'; }
      if (eightOnBreak) { const ball8=before.balls.find(ball=>ball.number===8)||{number:8,x:599.8,y:210};let spot={x:ball8.x,y:ball8.y};for(let radius=0;next.balls.some(ball=>Math.hypot(ball.x-spot.x,ball.y-spot.y)<RADIUS*2+1)&&radius<120;radius+=20)spot={x:Math.min(740,ball8.x+radius+20),y:Math.max(50,Math.min(370,ball8.y+(radius%40===0?20:-20)))};next.balls.push({number:8,...spot});event='Eight on the break. It is spotted; shoot again.'; }
    }
    return { state:next, foul, event, pocketed:fallen, firstContact:result.firstContact };
  }
  function legalCuePosition(x, y, balls) { return x >= 42 && x <= 758 && y >= 42 && y <= 378 && balls.filter(ball=>ball.number!==0).every(ball=>Math.hypot(x-ball.x,y-ball.y) > RADIUS*2+1); }
  function chooseBotShot(snapshot, difficulty) {
    const rand = seeded((snapshot.seed ^ Math.imul(snapshot.shotNumber+1, 0x45d9f3b)) >>> 0), cue = snapshot.balls.find(ball=>ball.number===0) || {x:185,y:210};
    const targets = snapshot.balls.filter(ball=>ball.number!==0 && ball.number!==8 && (!snapshot.groups[snapshot.currentPlayer] || GROUP(ball.number)===snapshot.groups[snapshot.currentPlayer]));
    if (!targets.length) targets.push(...snapshot.balls.filter(ball=>ball.number===8));
    if (difficulty === 'easy' || !targets.length) return { angle:rand()*Math.PI*2, power:.25+rand()*.55 };
    const blocked=(fromX,fromY,toX,toY,ignore)=>{const dx=toX-fromX,dy=toY-fromY,len2=dx*dx+dy*dy;return snapshot.balls.some(ball=>ball.number!==0&&ball.number!==ignore&&(()=>{const t=Math.max(0,Math.min(1,((ball.x-fromX)*dx+(ball.y-fromY)*dy)/len2));return Math.hypot(ball.x-(fromX+t*dx),ball.y-(fromY+t*dy))<RADIUS*2+1;})());};
    let best=null;
    for (const target of targets) for (let i=0;i<POCKETS.length;i++) {
      const pocket=POCKETS[i], toPocket=Math.atan2(pocket.y-target.y,pocket.x-target.x), ghostX=target.x-Math.cos(toPocket)*20, ghostY=target.y-Math.sin(toPocket)*20;
      const angle=Math.atan2(ghostY-cue.y,ghostX-cue.x), cueDist=Math.hypot(ghostX-cue.x,ghostY-cue.y), targetDist=Math.hypot(pocket.x-target.x,pocket.y-target.y);
      let score=-(cueDist+targetDist*.48);if(blocked(cue.x,cue.y,ghostX,ghostY,target.number))score-=950;if(blocked(target.x,target.y,pocket.x,pocket.y,target.number))score-=500;
      if (difficulty==='hard') { const afterX=ghostX+Math.cos(angle)*25,afterY=ghostY+Math.sin(angle)*25; score += Math.max(0,240-Math.hypot(afterX-400,afterY-210))*.12; score -= Math.max(0,50-cueDist)*1.4; }
      score += rand()*.01; if (!best || score>best.score) best={score,angle,power:Math.max(.18,Math.min(.88,.25+cueDist/700))};
    }
    return best || {angle:0,power:.45};
  }
  function chooseBotCuePosition(snapshot, difficulty) {
    const rng=seeded((snapshot.seed ^ Math.imul((snapshot.shotNumber||0)+17,0x27d4eb2d))>>>0),candidates=[];
    for(let x=72;x<=520;x+=22)for(let y=54;y<=366;y+=22)if(legalCuePosition(x,y,snapshot.balls))candidates.push({x,y});
    if(!candidates.length)return{x:185,y:210};
    if(difficulty==='easy')return candidates[Math.floor(rng()*candidates.length)];
    const objects=snapshot.balls.filter(ball=>ball.number>0&&ball.number!==8);let best=null;
    for(const point of candidates){const dist=objects.length?Math.min(...objects.map(ball=>Math.hypot(ball.x-point.x,ball.y-point.y))):Math.hypot(point.x-400,point.y-210);let score=-dist+rng()*.01;if(difficulty==='hard')score-=Math.abs(point.y-210)*.08;if(!best||score>best.score)best={...point,score};}
    return{x:best.x,y:best.y};
  }
  return { WIDTH, HEIGHT, RADIUS, POCKETS, STEP_MS, SUBSTEPS, GROUP, rack, seeded, createWorld, resolveShot, legalCuePosition, chooseBotShot, chooseBotCuePosition };
});
