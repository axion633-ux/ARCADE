(function (root, factory) {
  const api = factory(root.Matter || (typeof require === 'function' ? require('matter-js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ArcadePool = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function (Matter) {
  'use strict';
  const WIDTH=800,HEIGHT=420,RADIUS=10,STEP_MS=1000/60,SUBSTEPS=4,BALL_MASS=.17,ROLLING_DECEL=.08;
  const X_MIN=64,X_MAX=736,Y_MIN=64,Y_MAX=356;
  const POCKETS=[{x:23,y:23,radius:38},{x:400,y:19,radius:34},{x:777,y:23,radius:38},{x:23,y:397,radius:38},{x:400,y:401,radius:34},{x:777,y:397,radius:38}];
  const GROUP=n=>n>=1&&n<=7?'solids':n>=9&&n<=15?'stripes':null;
  function rack(seed=1){
    const balls=[{number:0,x:185,y:210}],numbers=Array.from({length:15},(_,i)=>i+1).filter(n=>n!==8),corners=[1,9];
    if((seed>>>0)&1)corners.reverse();numbers.splice(numbers.indexOf(corners[0]),1);numbers.splice(numbers.indexOf(corners[1]),1);
    for(let row=0;row<5;row++)for(let col=0;col<=row;col++){
      let number;if(row===2&&col===1)number=8;else if(row===4&&col===0)number=corners[0];else if(row===4&&col===4)number=corners[1];else number=numbers.shift();
      balls.push({number,x:565+row*17.4,y:210+(col-row/2)*20.1});
    }
    return{seed:seed>>>0,balls,groups:[null,null],pocketed:[],currentPlayer:0,breakShot:true,ballInHand:false,winner:null,shotNumber:0};
  }
  function seeded(seed){let n=(seed>>>0)||0x9e3779b9;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;};}
  function createWorld(snapshot){
    if(!Matter)throw new Error('Matter.js did not load.');
    const{Engine,Bodies,Body,Composite,Events}=Matter,engine=Engine.create({enableSleeping:false});engine.gravity.x=0;engine.gravity.y=0;
    const rails=[];
    // Six cushion runs: two long rails with middle-pocket gaps and two closed short ends.
    [[72,30,278,24],[450,30,278,24],[72,366,278,24],[450,366,278,24],
      [30,72,24,288],[746,72,24,288]].forEach(([x,y,w,h],i)=>rails.push(Bodies.rectangle(x+w/2,y+h/2,w,h,{isStatic:true,label:'rail-'+i,restitution:.82,friction:.08})));
    Composite.add(engine.world,rails);
    const bodies=new Map(),pocketed=new Set(),railNumbers=new Set();let firstContact=null,railHit=false,collisionCount=0;
    function makeBall(number,x,y){const body=Bodies.circle(x,y,RADIUS,{label:'ball-'+number,restitution:.94,friction:.006,frictionStatic:.01,frictionAir:0,mass:BALL_MASS,slop:.01});body.poolNumber=number;return body;}
    function hasPocketPath(body){const speed=Math.hypot(body.velocity.x,body.velocity.y);if(speed<.001)return false;const ux=body.velocity.x/speed,uy=body.velocity.y/speed;return POCKETS.some(pocket=>{const dx=pocket.x-body.position.x,dy=pocket.y-body.position.y,t=dx*ux+dy*uy;if(t<=0)return false;const perpendicular=dx*dx+dy*dy-t*t;return perpendicular<pocket.radius*pocket.radius;});}
    for(const ball of snapshot.balls){const body=makeBall(ball.number,ball.x,ball.y);bodies.set(ball.number,body);Composite.add(engine.world,body);}
    Events.on(engine,'collisionStart',event=>{for(const pair of event.pairs){const a=pair.bodyA,b=pair.bodyB,rail=a.label.startsWith('rail-')?a:b.label.startsWith('rail-')?b:null;if(rail){const ball=rail===a?b:a;if(ball.poolNumber!==undefined){railHit=true;railNumbers.add(ball.poolNumber);}continue;}if(a.poolNumber===undefined||b.poolNumber===undefined)continue;collisionCount++;if(firstContact===null&&(a.poolNumber===0||b.poolNumber===0))firstContact=a.poolNumber===0?b.poolNumber:a.poolNumber;}});
    function captureAtSubstep(){for(const[number,body]of bodies){const p=POCKETS.find(item=>Math.hypot(body.position.x-item.x,body.position.y-item.y)<item.radius);if(p){Composite.remove(engine.world,body);bodies.delete(number);pocketed.add(number);continue;}
      const x=body.position.x,y=body.position.y;
      // A ball may cross a cushion opening only while its velocity still leads
      // through that pocket's capture circle. A near miss rebounds at the rail.
      const enteringPocket=hasPocketPath(body);
      const outside=x<X_MIN||x>X_MAX||y<Y_MIN||y>Y_MAX;
      if(outside&&!enteringPocket){if(x<X_MIN-1||x>X_MAX+1||y<Y_MIN-1||y>Y_MAX+1)console.warn(`[pool] Ball ${number} crossed a cushion at (${x.toFixed(1)}, ${y.toFixed(1)}); clamped back onto the table.`);const cx=Math.max(X_MIN,Math.min(X_MAX,x)),cy=Math.max(Y_MIN,Math.min(Y_MAX,y));Body.setPosition(body,{x:cx,y:cy});Body.setVelocity(body,{x:x<X_MIN?Math.abs(body.velocity.x)*.82:x>X_MAX?-Math.abs(body.velocity.x)*.82:body.velocity.x,y:y<Y_MIN?Math.abs(body.velocity.y)*.82:y>Y_MAX?-Math.abs(body.velocity.y)*.82:body.velocity.y});}
    }}
    return{
      engine,bodies,get firstContact(){return firstContact;},get railHit(){return railHit;},get railBalls(){return[...railNumbers];},get collisionCount(){return collisionCount;},get pocketed(){return[...pocketed];},
      shoot(angle,power){const cue=bodies.get(0);if(!cue)return false;const normalized=Math.max(0,Math.min(1,power)),magnitude=normalized<=.025?0:.18+Math.pow(normalized,1.65)*22;Body.setVelocity(cue,{x:Math.cos(angle)*magnitude,y:Math.sin(angle)*magnitude});firstContact=null;railHit=false;collisionCount=0;railNumbers.clear();pocketed.clear();return true;},
      placeCue(x,y){const cue=bodies.get(0);if(!cue){const body=makeBall(0,x,y);bodies.set(0,body);Composite.add(engine.world,body);}else{Body.setPosition(cue,{x,y});Body.setVelocity(cue,{x:0,y:0});}},
      step(){for(let substep=0;substep<SUBSTEPS;substep++){Engine.update(engine,STEP_MS/SUBSTEPS);captureAtSubstep();}for(const body of bodies.values()){const v=body.velocity,speed=Math.hypot(v.x,v.y);if(speed<=ROLLING_DECEL)Body.setVelocity(body,{x:0,y:0});else{const next=speed-ROLLING_DECEL;Body.setVelocity(body,{x:v.x*next/speed,y:v.y*next/speed});}}},
      moving(){for(const body of bodies.values())if(Math.hypot(body.velocity.x,body.velocity.y)>ROLLING_DECEL)return true;return false;},
      snapshot(){return{balls:[...bodies].map(([number,b])=>({number,x:+b.position.x.toFixed(4),y:+b.position.y.toFixed(4)})).sort((a,b)=>a.number-b.number),groups:[...snapshot.groups],pocketed:[...(snapshot.pocketed||[])],currentPlayer:snapshot.currentPlayer,breakShot:snapshot.breakShot,ballInHand:snapshot.ballInHand,winner:snapshot.winner,shotNumber:snapshot.shotNumber};},
      dispose(){Events.off(engine);Composite.clear(engine.world,false);}
    };
  }
  function resolveShot(before,result,shooter){
    const fallen=[...new Set(result.pocketed||[])],objectFallen=fallen.filter(n=>n>0),eight=fallen.includes(8),scratch=fallen.includes(0),groups=[...before.groups],next={...before,balls:(result.balls||[]).map(ball=>({...ball})),groups,pocketed:[...(before.pocketed||[]),...objectFallen.filter(n=>!(before.pocketed||[]).includes(n))],currentPlayer:shooter,breakShot:false,ballInHand:false,winner:null,shotNumber:(before.shotNumber||0)+1};
    const legalBreak=!!before.breakShot,railBalls=new Set(result.railBalls||[]),objectRailCount=[...railBalls].filter(n=>n>0).length,objectPocketed=objectFallen.length>0;
    // Validate first contact against the rack as it stood at shot start. A ball
    // pocketed on this shot was still a legal first target, including the last suit ball.
    const ownGroup=groups[shooter],ownRemaining=ownGroup?before.balls.some(ball=>GROUP(ball.number)===ownGroup):false;
    let foulReason='';
    if(scratch)foulReason='scratch';
    else if(result.firstContact==null)foulReason='no contact';
    else if(legalBreak){if(objectRailCount<4&&!objectPocketed)foulReason='illegal break';}
    else if(ownGroup){const expected=ownRemaining?ownGroup:null;if(GROUP(result.firstContact)!==expected)foulReason='wrong ball first';}
    else if(result.firstContact===8)foulReason='the 8-ball was hit on an open table';
    if(!foulReason&&ownGroup&&objectFallen.some(n=>{const g=GROUP(n);return g&&g!==ownGroup;}))foulReason='pocketed opponent ball';
    if(!foulReason&&!legalBreak&&!result.railHit&&objectFallen.length===0)foulReason='no cushion after contact';
    const allOwnGone=!!ownGroup&&!next.balls.some(ball=>GROUP(ball.number)===ownGroup);
    if(eight&&scratch){next.winner=1-shooter;next.ballInHand=false;return{state:next,foul:true,foulReason:'scratch on the 8-ball',event:'Scratch on the 8-ball. Your opponent wins.',pocketed:fallen,firstContact:result.firstContact};}
    if(eight&&!legalBreak&&(foulReason||!ownGroup||!allOwnGone)){next.winner=1-shooter;return{state:next,foul:!!foulReason,foulReason:foulReason||'early 8-ball',event:foulReason?`Foul: ${foulReason}. Pocketed the 8-ball; opponent wins.`:'Early 8-ball. Your opponent wins.',pocketed:fallen,firstContact:result.firstContact};}
    if(eight&&!legalBreak){next.winner=shooter;return{state:next,foul:false,event:'Game over. You win with the 8-ball!',pocketed:fallen,firstContact:result.firstContact};}
    if(eight&&legalBreak){const old=before.balls.find(ball=>ball.number===8)||{number:8,x:599.8,y:210};next.balls.push({...old});next.pocketed=next.pocketed.filter(n=>n!==8);}
    if(eight&&legalBreak&&scratch){next.winner=1-shooter;return{state:next,foul:true,foulReason:'scratch on the 8-ball',event:'Scratch on the 8-ball. Your opponent wins.',pocketed:fallen,firstContact:result.firstContact};}
    if(scratch){const cue=before.balls.find(ball=>ball.number===0)||{number:0,x:185,y:210};if(!next.balls.some(ball=>ball.number===0))next.balls.push({...cue});}
    if(foulReason){next.currentPlayer=1-shooter;next.ballInHand=true;const text=foulReason==='scratch'?'scratch':foulReason;return{state:next,foul:true,foulReason,event:`Foul: ${text}. Opponent has ball in hand.`,pocketed:fallen,firstContact:result.firstContact};}
    if(!groups[shooter]){const firstGroupBall=objectFallen.find(n=>GROUP(n));if(firstGroupBall){groups[shooter]=GROUP(firstGroupBall);groups[1-shooter]=groups[shooter]==='solids'?'stripes':'solids';}}
    const legalPocket=objectFallen.some(n=>n!==8);
    if(eight&&legalBreak){return{state:next,foul:false,event:'Legal break. The 8-ball is spotted; shoot again.',pocketed:fallen,firstContact:result.firstContact};}
    if(!legalPocket){next.currentPlayer=1-shooter;return{state:next,foul:false,event:legalBreak?'Legal break. No pocket; next player up.':'No pocket. Next player up.',pocketed:fallen,firstContact:result.firstContact};}
    let event;if(!before.groups[shooter]&&groups[shooter])event=`${legalBreak?'Break! You pocketed a':'You pocketed a'} ${groups[shooter]==='solids'?'solid':'stripe'}; you're ${groups[shooter]==='solids'?'Solids':'Stripes'}.`;else event=`Pocketed ${objectFallen.filter(n=>n!==8).length} ball${objectFallen.filter(n=>n!==8).length===1?'':'s'}. Your turn.`;
    return{state:next,foul:false,event,pocketed:fallen,firstContact:result.firstContact,assignedGroup:groups[shooter]};
  }
  function legalCuePosition(x,y,balls){return x>=X_MIN&&x<=X_MAX&&y>=Y_MIN&&y<=Y_MAX&&POCKETS.every(p=>Math.hypot(x-p.x,y-p.y)>=p.radius+RADIUS)&&balls.filter(ball=>ball.number!==0).every(ball=>Math.hypot(x-ball.x,y-ball.y)>RADIUS*2+1);}
  function rayFirstBall(snapshot,cue,angle,diameter=RADIUS*2){const ux=Math.cos(angle),uy=Math.sin(angle);let best=null;for(const ball of snapshot.balls){if(ball.number===0)continue;const dx=ball.x-cue.x,dy=ball.y-cue.y,t=dx*ux+dy*uy;if(t<=0)continue;const perpendicular=dx*dx+dy*dy-t*t;if(perpendicular>=diameter*diameter)continue;const distance=t-Math.sqrt(diameter*diameter-perpendicular);if(distance>0&&(!best||distance<best.distance))best={number:ball.number,distance};}return best;}
  function rayPocketBefore(cue,angle,maxDistance){const ux=Math.cos(angle),uy=Math.sin(angle);return POCKETS.some(pocket=>{const dx=pocket.x-cue.x,dy=pocket.y-cue.y,t=dx*ux+dy*uy;if(t<=0||t>=maxDistance)return false;const perpendicular=dx*dx+dy*dy-t*t;return perpendicular<pocket.radius*pocket.radius;});}
  function simulatedFirstContact(snapshot,angle,power){const world=createWorld(snapshot);world.shoot(angle,power);for(let i=0;i<180&&world.firstContact===null&&world.moving();i++)world.step();const contact=world.firstContact;world.dispose();return contact;}
  function chooseBotShot(snapshot,difficulty){
    const random=seeded((snapshot.seed^Math.imul((snapshot.shotNumber||0)+1,0x45d9f3b))>>>0),cue=snapshot.balls.find(ball=>ball.number===0)||{x:185,y:210};
    const group=snapshot.groups[snapshot.currentPlayer],ownRemaining=group&&snapshot.balls.some(ball=>GROUP(ball.number)===group),targets=snapshot.balls.filter(ball=>ball.number>0&&(group?(ownRemaining?GROUP(ball.number)===group:ball.number===8):ball.number!==8));
    const clear=(x1,y1,x2,y2,ignore)=>{const dx=x2-x1,dy=y2-y1,length2=dx*dx+dy*dy;if(!length2)return true;return!snapshot.balls.some(ball=>ball.number!==0&&ball.number!==ignore&&(()=>{const t=Math.max(0,Math.min(1,((ball.x-x1)*dx+(ball.y-y1)*dy)/length2));return Math.hypot(ball.x-(x1+t*dx),ball.y-(y1+t*dy))<RADIUS*2+1;})());};
    const options=[];
    for(const target of targets){for(const pocket of POCKETS){const toward=Math.atan2(pocket.y-target.y,pocket.x-target.x),ghostX=target.x-Math.cos(toward)*(RADIUS*2),ghostY=target.y-Math.sin(toward)*(RADIUS*2),approach=(ghostX-cue.x)*Math.cos(toward)+(ghostY-cue.y)*Math.sin(toward);if(approach<=0)continue;const angle=Math.atan2(ghostY-cue.y,ghostX-cue.x),first=rayFirstBall(snapshot,cue,angle);if(first?.number!==target.number||rayFirstBall(snapshot,cue,angle,RADIUS*2-2)?.number!==target.number||rayPocketBefore(cue,angle,first.distance)||!clear(target.x,target.y,pocket.x,pocket.y,target.number))continue;const cueDistance=Math.hypot(ghostX-cue.x,ghostY-cue.y),pocketDistance=Math.hypot(pocket.x-target.x,pocket.y-target.y),leaveX=ghostX+Math.cos(angle)*28,leaveY=ghostY+Math.sin(angle)*28;let score=-(cueDistance+pocketDistance*.5)+random()*.02;if(difficulty==='hard')score+=Math.max(0,220-Math.hypot(leaveX-400,leaveY-210))*.13;options.push({angle,power:Math.max(.2,Math.min(.9,.22+cueDistance/680)),score,target:target.number});}}
    if(options.length){if(difficulty==='easy')options.sort(()=>random()-.5);else options.sort((a,b)=>b.score-a.score);for(const option of options){if(simulatedFirstContact(snapshot,option.angle,.88)!==option.target)continue;return{angle:option.angle,power:difficulty==='easy'?.58+random()*.3:Math.max(.66,option.power),target:option.target};}}
    // If every pocket lane is blocked, select a clear direct contact shot at a legal object ball.
    const legalAngles=[];for(const target of targets){const angle=Math.atan2(target.y-cue.y,target.x-cue.x),first=rayFirstBall(snapshot,cue,angle);if(first?.number===target.number&&!rayPocketBefore(cue,angle,first.distance))legalAngles.push({angle,target:target.number});}
    if(legalAngles.length){if(difficulty==='easy')legalAngles.sort(()=>random()-.5);for(const selected of legalAngles){if(simulatedFirstContact(snapshot,selected.angle,.88)===selected.target)return{...selected,power:.78+random()*.16};}}
    // Choose the nearest available group ball and strike its center. This keeps
    // the bot from knowingly taking a no-contact shot when a target is present.
    const nearest=targets.slice().sort((a,b)=>Math.hypot(a.x-cue.x,a.y-cue.y)-Math.hypot(b.x-cue.x,b.y-cue.y))[0];
    if(nearest){const angle=Math.atan2(nearest.y-cue.y,nearest.x-cue.x),first=rayFirstBall(snapshot,cue,angle);if(first&&!rayPocketBefore(cue,angle,first.distance)&&simulatedFirstContact(snapshot,angle,.88)===first.number)return{angle,power:.88,target:first.number};}
    return{angle:0,power:.9,target:null};
  }
  function chooseBotCuePosition(snapshot,difficulty){const random=seeded((snapshot.seed^Math.imul((snapshot.shotNumber||0)+17,0x27d4eb2d))>>>0),candidates=[];for(let x=70;x<=510;x+=18)for(let y=62;y<=358;y+=18)if(legalCuePosition(x,y,snapshot.balls))candidates.push({x,y});if(!candidates.length)return{x:185,y:210};if(difficulty==='easy')return candidates[Math.floor(random()*candidates.length)];const targets=snapshot.balls.filter(ball=>ball.number>0&&ball.number!==8);let best=null;for(const point of candidates){const dist=targets.length?Math.min(...targets.map(ball=>Math.hypot(ball.x-point.x,ball.y-point.y))):Math.hypot(point.x-400,point.y-210),score=-dist+(difficulty==='hard'?-(Math.abs(point.y-210)*.08):0)+random()*.01;if(!best||score>best.score)best={...point,score};}return{x:best.x,y:best.y};}
  return{WIDTH,HEIGHT,RADIUS,STEP_MS,SUBSTEPS,BALL_MASS,ROLLING_DECEL,X_MIN,X_MAX,Y_MIN,Y_MAX,POCKETS,GROUP,rack,seeded,createWorld,resolveShot,legalCuePosition,rayFirstBall,rayPocketBefore,chooseBotShot,chooseBotCuePosition};
});
