(() => {
  'use strict';
  const BOT_THINK_DELAY = Object.freeze({ easy: 800, medium: 900, hard: 1050, expert: 1200 });
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = { onlinePlayers: [], page: 'home', name: localStorage.getItem('arcade.name') || 'Guest', username: localStorage.getItem('arcade.username') || 'guest_player', games: 0, wins: 0, chessMode: 'local', chessColor: 'w', selected: null, chess: null, board: null, history: [], clocks: [600, 600], clockMode: 10, clockTimer: null, worker: null, botThinking: false, botThinkTimer: null, botRequestId: 0, sound: true, supabase: null, user: null, socialLoading: null, presenceChannel: null, requests: [], sentRequests: [], activeRoom: null, roomChannel: null, roomPly: 0, finishedMessage: '', chessFinished: false, friends: [{ username: 'jules_w', name: 'Jules', online: true }, { username: 'mari_moves', name: 'Mari', online: true }, { username: 'aceofboards', name: 'Ace', online: true }], mono: null, monoRoom: null, monoChannel: null, monoPresence: null, monoMembers: [], monoHeartbeat: null };
  const toast = message => { const node = $('#toast'); node.textContent = message; node.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('show'), 2600); };
  const escapeHtml = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const go = page => {
    if (!$('#page-' + page)) return;
    state.page = page;
    $$('.page').forEach(el => el.classList.toggle('active', el.id === 'page-' + page));
    $$('.nav-link,.mobile-nav-link').forEach(el => el.classList.toggle('active', el.dataset.page === page));
    if (page === 'chess') { if (!state.chess) startChess(); else if (state.board) { state.board.resize(); renderChess(); } }
    if (page === 'monopoly' && !state.mono) startMonopoly();
    window.scrollTo(0, 0);
  };
  document.addEventListener('click', async event => {
    const pageButton = event.target.closest('[data-page]'); if (pageButton) { go(pageButton.dataset.page); return; }
    const quick = event.target.closest('[data-quick-match]'); if (quick) { await joinQuickMatch(quick.dataset.quickMatch); return; } const inviteGame = event.target.closest('[data-invite-game]'); if (inviteGame) { $('#invite-game').value = inviteGame.dataset.inviteGame; go('friends'); $('#friend-search').focus(); toast(`Choose a friend to invite to ${inviteGame.dataset.inviteGame}.`); return; } const launcher = event.target.closest('[data-launch]'); if (launcher) { if (launcher.dataset.launch === 'chess') openChessSetup(launcher.dataset.mode || ''); else if (launcher.dataset.launch === 'pool') { go('pool'); window.ArcadePoolUI?.start(launcher.dataset.mode || 'bot'); } else { await leaveMonopolyOnline(); state.mono = null; startMonopoly(launcher.dataset.mode || 'local'); go('monopoly'); } }
  });

  function showModal(content) { $('#modal-content').innerHTML = content; $('#modal-backdrop').classList.remove('hidden'); }
  function closeModal() { $('#modal-backdrop').classList.add('hidden'); }
  function showAppNotice(message) { const notice = $('#app-notice'); if (!notice) return; notice.textContent = message; notice.classList.remove('hidden'); }
  function clearAppNotice() { $('#app-notice')?.classList.add('hidden'); }
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-backdrop').addEventListener('click', e => { if (e.target.id === 'modal-backdrop') closeModal(); });
  function openChessSetup(mode = '') {
    const force = mode ? `<div class="eyebrow muted">${mode === 'bot' ? 'PLAY THE BOT' : 'PASS & PLAY'}</div>` : '<div class="eyebrow muted">PICK YOUR TABLE</div>';
    showModal(`${force}<h2 id="modal-title">Pick your next rival</h2><p>Choose a side, set the clock and pick a bot level. The board is waiting.</p><label>GAME MODE<select id="setup-mode"><option value="local">Two players · same device</option><option value="bot">Play against the bot</option><option value="online">Invite a friend · online</option></select></label><label>CHESS CLOCK<select id="setup-clock"><option value="0">Untimed</option><option value="5">5 minutes</option><option value="10" selected>10 minutes</option></select></label><label id="difficulty-label">BOT LEVEL<select id="setup-difficulty"><option value="easy">Easy · depth 1</option><option value="medium" selected>Medium · depth 2</option><option value="hard">Hard · depth 3</option><option value="expert">Expert · depth 4</option></select></label><label id="color-label">PLAY AS<select id="setup-color"><option value="w">White</option><option value="b">Black</option></select></label><button class="button primary full" id="start-chess">Take your seat <span>→</span></button>`);
    if (mode) $('#setup-mode').value = mode;
    $('#setup-mode').addEventListener('change', updateSetupFields); updateSetupFields();
    $('#start-chess').addEventListener('click', () => { if ($('#setup-mode').value === 'online') { closeModal(); go('friends'); return toast('Send a chess invite from Friends to start an online game.'); } state.chessMode = $('#setup-mode').value; state.clockMode = Number($('#setup-clock').value); state.chessColor = $('#setup-color').value; state.difficulty = $('#setup-difficulty').value; state.activeRoom = null; if (state.roomChannel && state.supabase) state.supabase.removeChannel(state.roomChannel); state.roomChannel = null; closeModal(); state.chess = null; startChess(); go('chess'); });
  }
  function updateSetupFields() { const bot = $('#setup-mode').value === 'bot'; $('#difficulty-label').classList.toggle('hidden', !bot); $('#color-label').classList.toggle('hidden', !bot); }
  $('#chess-settings').addEventListener('click', () => openChessSetup());

  const pieceAsset = (piece) => `https://chessboardjs.com/img/chesspieces/wikipedia/${piece}.png`;
  function startChess() {
    if (typeof Chess === 'undefined' || typeof Chessboard === 'undefined') { window.arcadeReportAssetError('Chess libraries'); return; }
    clearInterval(state.clockTimer); clearTimeout(state.botThinkTimer); state.botThinking = false; state.botRequestId++; state.chess = new Chess(); state.history = []; state.clocks = [state.clockMode * 60, state.clockMode * 60]; state.selected = null; state.finishedMessage = ''; state.chessFinished = false;
    state.board = Chessboard('chessboard', { position: 'start', draggable: false, moveSpeed: 200, snapSpeed: 190, snapbackSpeed: 190, orientation: state.chessColor === 'b' && state.chessMode !== 'local' ? 'black' : 'white', pieceTheme: pieceAsset, onSnapEnd: () => state.board.position(state.chess.fen()), onMouseoverSquare: () => {} });
    const onlineBlack = state.chessMode === 'online' && state.chessColor === 'b';
    const onlineWhite = state.chessMode === 'online' && state.chessColor === 'w';
    $('#black-name').textContent = state.chessMode === 'online' ? (onlineBlack ? state.name : 'Opponent') : state.chessMode === 'bot' ? (state.chessColor === 'w' ? 'Arcade bot' : state.name) : 'Guest 2';
    $('#white-name').textContent = state.chessMode === 'online' ? (onlineWhite ? state.name : 'Opponent') : state.chessMode === 'bot' && state.chessColor === 'b' ? 'Arcade bot' : state.name;
    $('#white-avatar').textContent = state.chessMode === 'online' ? (onlineWhite ? state.name.slice(0, 1).toUpperCase() : '♞') : state.chessMode === 'bot' && state.chessColor === 'b' ? '♞' : state.name.slice(0, 1).toUpperCase();
    $('#black-avatar').textContent = state.chessMode === 'online' ? (onlineBlack ? state.name.slice(0, 1).toUpperCase() : '♞') : state.chessMode === 'bot' && state.chessColor === 'w' ? '♞' : 'G';
    $$('.clock').forEach(clock => clock.classList.toggle('hidden', !state.clockMode));
    renderChess(); state.board.resize();
    if (state.clockMode) state.clockTimer = setInterval(tickClock, 1000);
    if (state.chessMode === 'bot') { try { prepareBotWorker(); } catch (_) { window.arcadeReportAssetError('Chess bot worker'); } if (state.chessColor === 'b') requestBotMove(); }
    state.games += 1; updateStats();
  }
  const chessEnded = () => !state.chess || state.chess.game_over() || !!state.finishedMessage;
  function legalFrom(square) { return state.chess.moves({ square, verbose: true }); }
  function clearMarks() { $$('#chessboard .square-55d63').forEach(square => square.classList.remove('highlight-square', 'legal-target', 'legal-capture', 'last-move', 'in-check')); }
  function markSelection(square) { $$('#chessboard .square-55d63').forEach(node => node.classList.remove('highlight-square', 'legal-target', 'legal-capture')); if (!square) return; const origin = $(`#chessboard [data-square="${square}"]`); if (origin) origin.classList.add('highlight-square'); legalFrom(square).forEach(move => { const destination = $(`#chessboard [data-square="${move.to}"]`); if (destination) destination.classList.add(move.captured ? 'legal-capture' : 'legal-target'); }); }
  function clickSquare(event) {
    const squareEl = event.target.closest('[data-square]'); if (!squareEl || chessEnded()) return;
    const square = squareEl.dataset.square, piece = state.chess.get(square);
    if (!state.selected) { if (piece && piece.color === state.chess.turn() && (state.chessMode === 'local' || piece.color === state.chessColor)) { state.selected = square; markSelection(square); } return; }
    if (piece && piece.color === state.chess.turn() && (state.chessMode === 'local' || piece.color === state.chessColor)) { state.selected = square; markSelection(square); return; }
    const move = legalFrom(state.selected).find(item => item.to === square);
    if (move) { const from = state.selected; state.selected = null; makeMove(from, square); } else { state.selected = null; clearMarks(); }
  }
  const chessBoardElement = $('#chessboard');
  let pointerDrag = null;
  function canDragChessPiece(piece) { return !!piece && !!state.chess && !chessEnded() && !state.botThinking && piece.color === state.chess.turn() && (state.chessMode === 'local' || piece.color === state.chessColor); }
  function chessDragFrame(now) {
    if (!pointerDrag?.moved) return;
    if (pointerDrag.lastFrame) pointerDrag.frameTimes.push(now - pointerDrag.lastFrame);
    pointerDrag.lastFrame = now;
    const point = pointerDrag.point, size = pointerDrag.size;
    pointerDrag.ghost.style.transform = `translate3d(${point.x-size/2}px,${point.y-size/2}px,0)`;
    pointerDrag.raf = requestAnimationFrame(chessDragFrame);
  }
  function startChessGhost(drag) {
    const rect = chessBoardElement.getBoundingClientRect(); drag.size = rect.width / 8;
    drag.ghost = drag.sourceImage.cloneNode(true); drag.ghost.removeAttribute('id');
    Object.assign(drag.ghost.style,{position:'fixed',left:'0',top:'0',width:`${drag.size}px`,height:`${drag.size}px`,display:'block',visibility:'visible',pointerEvents:'none',zIndex:'10000',willChange:'transform',transition:'none'});
    drag.ghost.style.transform=`translate3d(${drag.point.x-drag.size/2}px,${drag.point.y-drag.size/2}px,0)`;document.body.appendChild(drag.ghost);
    if(drag.sourceImage)drag.sourceImage.style.visibility='hidden';drag.startedAt=performance.now();drag.frameTimes=[];drag.raf=requestAnimationFrame(chessDragFrame);chessBoardElement.classList.add('drag-active');
  }
  function finishChessDrag(drag, targetSquare) {
    cancelAnimationFrame(drag.raf);const frames=drag.frameTimes||[],average=frames.length?frames.reduce((a,b)=>a+b,0)/frames.length:0,max=frames.length?Math.max(...frames):0;
    window.__ARCADE_CHESS_DRAG_METRICS={frames:frames.length,averageMs:+average.toFixed(2),maxMs:+max.toFixed(2),over20ms:frames.filter(value=>value>20).length};console.info('Chess drag frame timing',window.__ARCADE_CHESS_DRAG_METRICS);chessBoardElement.classList.remove('drag-active');
    const legal=targetSquare&&legalFrom(drag.from).some(move=>move.to===targetSquare);if(legal)makeMove(drag.from,targetSquare,undefined,false,false);
    const targetEl=legal?chessBoardElement.querySelector(`[data-square="${targetSquare}"]`):chessBoardElement.querySelector(`[data-square="${drag.from}"]`);const box=targetEl?.getBoundingClientRect();
    if(!drag.ghost||!box){drag.sourceImage?.style.removeProperty('visibility');state.board.position(state.chess.fen());return;}
    drag.ghost.style.transition='transform 190ms cubic-bezier(.2,.75,.25,1)';drag.ghost.style.transform=`translate3d(${box.left+(box.width-drag.size)/2}px,${box.top+(box.height-drag.size)/2}px,0)`;
    let cleaned=false;const clean=()=>{if(cleaned)return;cleaned=true;drag.ghost?.remove();if(drag.sourceImage)drag.sourceImage.style.removeProperty('visibility');if(legal)state.board.position(state.chess.fen());};drag.ghost.addEventListener('transitionend',clean,{once:true});setTimeout(clean,240);
  }
  chessBoardElement.addEventListener('pointerdown',event=>{if(event.button!==undefined&&event.button!==0)return;const square=event.target.closest('[data-square]');if(!square)return;const piece=state.chess?.get(square.dataset.square);pointerDrag={pointerId:event.pointerId,from:square.dataset.square,piece,start:{x:event.clientX,y:event.clientY},point:{x:event.clientX,y:event.clientY},sourceImage:square.querySelector('.piece-417db'),moved:false,frameTimes:[],lastFrame:0};chessBoardElement.setPointerCapture?.(event.pointerId);event.preventDefault();});
  chessBoardElement.addEventListener('pointermove',event=>{const drag=pointerDrag;if(!drag||drag.pointerId!==event.pointerId)return;drag.point={x:event.clientX,y:event.clientY};if(!drag.moved&&Math.hypot(drag.point.x-drag.start.x,drag.point.y-drag.start.y)>6&&canDragChessPiece(drag.piece)){drag.moved=true;startChessGhost(drag);}if(drag.moved)event.preventDefault();});
  chessBoardElement.addEventListener('pointerup',event=>{const drag=pointerDrag;if(!drag||drag.pointerId!==event.pointerId)return;pointerDrag=null;const hit=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-square]');if(drag.moved){finishChessDrag(drag,hit?.dataset.square||null);event.preventDefault();}else if(hit)clickSquare({target:hit});});
  chessBoardElement.addEventListener('pointercancel',event=>{const drag=pointerDrag;if(!drag||drag.pointerId!==event.pointerId)return;pointerDrag=null;if(drag.moved)finishChessDrag(drag,null);});
  chessBoardElement.addEventListener('keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;const square=event.target.closest('[data-square]');if(square){event.preventDefault();clickSquare({target:square});}});
  function makeMove(from, to, promotion, fromBot = false, syncBoard = true) {
    if (chessEnded() || (state.chessMode === 'online' && state.chess.turn() !== state.chessColor) || (state.chessMode === 'bot' && state.chess.turn() !== state.chessColor && !fromBot)) return false;
    const choices = legalFrom(from).filter(move => move.to === to); if (!choices.length) return false;
    if (choices.some(move => move.flags.includes('p')) && !promotion) { choosePromotion(choice => makeMove(from, to, choice, fromBot)); return true; }
    const before = state.chess.fen(); const move = state.chess.move({ from, to, promotion }); if (!move) return false;
    state.history.push(before); state.selected = null; renderChess(move, syncBoard); if (state.sound) playTick();
    if (state.chessMode === 'online') syncMove(move);
    if (!chessEnded() && state.chessMode === 'bot' && state.chess.turn() !== state.chessColor) requestBotMove();
    return true;
  }
  function choosePromotion(onChoose) { showModal(`<div class="eyebrow muted">PROMOTION</div><h2 id="modal-title">Choose your piece</h2><p>Your pawn reached the far side. What should it become?</p><div class="mode-grid">${[['q','Queen ♛'],['r','Rook ♜'],['b','Bishop ♝'],['n','Knight ♞']].map(([key, label]) => `<button class="mode-choice" data-promotion="${key}"><b>${label}</b></button>`).join('')}</div>`); $$('.mode-choice').forEach(button => button.addEventListener('click', () => { const choice = button.dataset.promotion; closeModal(); onChoose(choice); })); }
  function renderChess(lastMove, syncBoard = true) {
    if (!state.chess || !state.board) return;
    if (syncBoard) state.board.position(state.chess.fen()); clearMarks();
    if (lastMove) { const from = $(`#chessboard [data-square="${lastMove.from}"]`), to = $(`#chessboard [data-square="${lastMove.to}"]`); if (from) from.classList.add('last-move'); if (to) to.classList.add('last-move'); }
    if (state.chess.in_check()) { const king = state.chess.board().flatMap((row, rank) => row.map((piece, file) => piece && piece.type === 'k' && piece.color === state.chess.turn() ? `${'abcdefgh'[file]}${8 - rank}` : null)).find(Boolean); if (king) $(`#chessboard [data-square="${king}"]`)?.classList.add('in-check'); }
    const history = state.chess.history();
    $('#move-list').innerHTML = history.length ? Array.from({ length: Math.ceil(history.length / 2) }, (_, index) => `<div class="move-pair"><span class="move-number">${index + 1}.</span><span>${escapeHtml(history[index * 2] || '')}</span><span>${escapeHtml(history[index * 2 + 1] || '')}</span></div>`).join('') : '<div class="empty-moves">Make your first move.<br><span>The board is yours.</span></div>';
    $('#move-list').scrollTop = $('#move-list').scrollHeight;
    const side = state.chess.turn() === 'w' ? 'White' : 'Black';
    const check = state.chess.in_check();
    $('#turn-message').textContent = chessEnded() ? resultText() : state.botThinking ? 'Bot is thinking…' : check ? `${side} is in check! Find a safe square.` : `${side} to move`;
    $('#white-status').textContent = chessEnded() ? resultText() : state.chess.turn() === 'w' ? (check ? 'King under fire!' : 'Your move') : state.chessMode === 'bot' ? (state.botThinking ? 'Thinking…' : 'Bot is plotting…') : check ? 'King under fire!' : 'At the board';
    $('#black-status').textContent = chessEnded() ? resultText() : state.chess.turn() === 'b' ? 'Your turn' : 'Ready';
    $('#white-clock').classList.toggle('active-clock', state.chess.turn() === 'w'); $('#black-clock').classList.toggle('active-clock', state.chess.turn() === 'b');
    drawCaptured();
    if (chessEnded()) finishChess();
  }
  function resultText() { if (state.finishedMessage) return state.finishedMessage; if (state.chess.in_checkmate()) return `Checkmate! ${state.chess.turn() === 'w' ? 'Black' : 'White'} wins. The king never saw that coming.`; if (state.chess.in_stalemate()) return 'Stalemate! No moves left, so the kings call it even.'; if (state.chess.in_threefold_repetition()) return 'Draw by repetition. We have been here before.'; if (state.chess.insufficient_material()) return 'Draw! Neither side brought enough firepower.'; return 'Draw! A well-fought game.'; }
  function drawCaptured() { const pieces = state.chess.history({ verbose: true }).filter(move => move.captured); const white = pieces.filter(move => move.color === 'w').map(move => `♟♞♝♜♛`['pnbrq'.indexOf(move.captured)] || '♟').join(''); const black = pieces.filter(move => move.color === 'b').map(move => `♟♞♝♜♛`['pnbrq'.indexOf(move.captured)] || '♟').join(''); $('#captured-white').textContent = white; $('#captured-black').textContent = black; }
  function finishChess() { clearInterval(state.clockTimer); if (state.chessFinished) return; state.chessFinished = true; if (state.chess.in_checkmate()) { $('#chessboard').classList.remove('checkmate-flash'); void $('#chessboard').offsetWidth; $('#chessboard').classList.add('checkmate-flash'); } if (state.chess.in_checkmate() && (state.chess.turn() === 'w' ? 'b' : 'w') === state.chessColor) { state.wins++; updateStats(); } $('#coach-tip').textContent = resultText(); toast(resultText()); }
  function tickClock() { if (chessEnded()) return; const index = state.chess.turn() === 'w' ? 0 : 1; state.clocks[index]--; const format = seconds => `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0')}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`; $('#white-clock').textContent = format(state.clocks[0]); $('#black-clock').textContent = format(state.clocks[1]); if (state.clocks[index] <= 0) { clearInterval(state.clockTimer); state.finishedMessage = `${index === 0 ? 'White' : 'Black'} ran out of time`; toast(`${state.finishedMessage}.`); renderChess(); } }
  function requestBotMove() {
    if (chessEnded() || state.chess.turn() === state.chessColor) return;
    const depths = { easy: 1, medium: 2, hard: 3, expert: 4 }, randomness = { easy: 0.7, medium: 0.28, hard: 0.08, expert: 0 };
    const delay = BOT_THINK_DELAY[state.difficulty || 'medium'];
    const requestId = ++state.botRequestId, fen = state.chess.fen(), startedAt = performance.now();
    state.botThinking = true; renderChess();
    const message = { fen: state.chess.fen(), depth: depths[state.difficulty || 'medium'], randomness: randomness[state.difficulty || 'medium'], color: state.chess.turn() };
    try { const worker = prepareBotWorker(); worker.onmessage = event => { const move = event.data.move; if (!move || requestId !== state.botRequestId || !state.chess || chessEnded() || state.chess.fen() !== fen || state.chess.turn() === state.chessColor) return; const wait = Math.max(0, delay - (performance.now() - startedAt)); clearTimeout(state.botThinkTimer); state.botThinkTimer = setTimeout(() => { if (requestId !== state.botRequestId || !state.chess || chessEnded()) return; state.botThinking = false; makeMove(move.from, move.to, move.promotion, true); }, wait); }; worker.postMessage(message); } catch (_) { state.botThinking = false; window.arcadeReportAssetError('Chess bot worker'); renderChess(); }
  }
  function prepareBotWorker() {
    if (state.worker) return state.worker;
    state.worker = new Worker('chess-ai-worker.js');
    state.worker.onerror = () => { state.botThinking = false; state.worker?.terminate(); state.worker = null; window.arcadeReportAssetError('Chess bot worker'); if (state.chess) renderChess(); };
    state.worker.onmessageerror = () => window.arcadeReportAssetError('Chess bot response');
    return state.worker;
  }
  function undoMove() { if (state.chessMode === 'online') return toast('Undo is available in local practice games.'); if (!state.chess || !state.history.length) { toast('There are no moves to undo yet.'); return; } state.chess.load(state.history.pop()); if (state.chessMode === 'bot' && state.history.length) state.chess.load(state.history.pop()); state.finishedMessage = ''; state.chessFinished = false; if (state.clockMode) { clearInterval(state.clockTimer); state.clockTimer = setInterval(tickClock, 1000); } renderChess(); }
  $('#undo-move').addEventListener('click', undoMove); $('#mobile-undo').addEventListener('click', undoMove);
  $('#new-game').addEventListener('click', () => openChessSetup()); $('#mobile-new').addEventListener('click', () => openChessSetup());
  $('#resign-game').addEventListener('click', async () => { if (chessEnded()) return toast('No active game to call just yet.'); if (state.chessMode === 'online' && state.activeRoom && state.supabase) { await state.supabase.from('game_rooms').update({ status: 'finished', state: { ...(state.activeRoom.lastState || { fen: state.chess.fen() }), result: `${state.name} resigned` } }).eq('id', state.activeRoom.id); } state.finishedMessage = 'You called it. The board will be here for a rematch.'; clearInterval(state.clockTimer); renderChess(); toast('You called it. Rematch when you’re ready!'); });
  $('#offer-draw').addEventListener('click', async () => { if (state.chessMode !== 'online' || !state.activeRoom || !state.supabase || chessEnded()) return toast('Draw offers work in online matches.'); const nextState = { ...(state.activeRoom.lastState || { fen: state.chess.fen() }), drawOfferBy: state.user.id }; const { error } = await state.supabase.from('game_rooms').update({ state: nextState }).eq('id', state.activeRoom.id); if (error) return toast(error.message); state.activeRoom.lastState = nextState; toast('A friendly draw offer is on its way.'); });
  function soundToggle() { state.sound = !state.sound; $('#sound-toggle').classList.toggle('on', state.sound); toast(state.sound ? 'Sound on' : 'Sound off'); }
  $('#sound-toggle').addEventListener('click', soundToggle);
  function playTick() { try { const audio = new AudioContext(), osc = audio.createOscillator(), gain = audio.createGain(); osc.frequency.value = 450; gain.gain.setValueAtTime(.035, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .065); osc.connect(gain); gain.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + .07); osc.onended = () => audio.close(); } catch (_) {} }
  $('#flip-board').addEventListener('click', () => { if (state.board) state.board.flip(); });
  function hint() { if (!state.chess || state.chess.game_over()) return; const legal = state.chess.moves({ verbose: true }); const interesting = legal.find(move => move.captured || move.san.includes('+') || move.san.includes('#')) || legal[Math.floor(Math.random() * legal.length)]; if (!interesting) return; markSelection(interesting.from); const destination = $(`#chessboard [data-square="${interesting.to}"]`); if (destination) destination.classList.add('highlight-square'); let why = interesting.san.includes('#') ? 'This move delivers checkmate.' : interesting.san.includes('+') ? 'This move puts the king in check and forces a response.' : interesting.captured ? `This captures the ${pieceName(interesting.captured)} on ${interesting.to}, trading material for an advantage.` : 'This develops a piece toward the center and gives it more useful squares.'; $('#coach-tip').innerHTML = `<b>${escapeHtml(interesting.san)}</b> · ${escapeHtml(why)}`; }
  function pieceName(code) { return ({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' })[code] || 'piece'; }
  function checkMyMove() { if (!state.chess || state.chess.game_over()) return; if (!state.selected) { $('#coach-tip').innerHTML = '<b>Select a piece first.</b> I’ll look at its legal moves and point out a strong idea.'; toast('Select one of your pieces on the board.'); return; } const choices = legalFrom(state.selected); const safe = choices.filter(move => !move.captured || ({ p: 1, n: 3, b: 3, r: 5, q: 9 })[move.captured] >= ({ p: 1, n: 3, b: 3, r: 5, q: 9 })[move.piece]); $('#coach-tip').innerHTML = safe.length ? `<b>${safe.length} solid option${safe.length === 1 ? '' : 's'} found.</b> Captures worth less than the piece that takes them can leave material behind. Try a highlighted square.` : '<b>Careful here.</b> Every capture from this square risks trading a more valuable piece for less. Consider moving to a highlighted safe square.'; }
  $('#suggest-move').addEventListener('click', hint); $('#mobile-suggest').addEventListener('click', () => { go('chess'); $('.side-tab[data-tab="learn"]').click(); hint(); }); $('#bot-warning').addEventListener('click', checkMyMove);
  $$('.side-tab').forEach(tab => tab.addEventListener('click', () => { $$('.side-tab').forEach(item => item.classList.toggle('selected', item === tab)); $('#panel-moves').classList.toggle('hidden', tab.dataset.tab !== 'moves'); $('#panel-learn').classList.toggle('hidden', tab.dataset.tab !== 'learn'); }));

  const cash = amount => '\u00a3' + amount;
  const emoji = code => String.fromCodePoint(code);
  const spaces = [
    { name: 'GO', type: 'go', icon: '\u{1F6A6}', detail: 'Collect ' + cash(200) + ' when you pass. The one square that pays you.' },
    { name: 'Old Kent Road', type: 'property', group: 'brown', price: 60, rent: 2, detail: 'A bargain with big up-and-coming energy.' },
    { name: 'Community Chest', type: 'chest', icon: '\u{1F9F0}', detail: 'A mystery envelope. Could be lovely. Could be chaos.' },
    { name: 'Whitechapel Road', type: 'property', group: 'brown', price: 60, rent: 4, detail: 'Tiny price, surprisingly large landlord energy.' },
    { name: 'Income Tax', type: 'tax', icon: '\u{1F9FE}', price: 200, detail: 'The tax collector would like a quick word.' },
    { name: "King's Cross Station", type: 'railroad', icon: '\u{1F682}', price: 200, rent: 25, detail: 'All aboard. Owners collect the fare.' },
    { name: 'The Angel Islington', type: 'property', group: 'light-blue', price: 100, rent: 6, detail: 'A little fresh air for your growing empire.' },
    { name: 'Chance', type: 'chance', icon: '\u{1F3B4}', detail: 'The deck has plans for you. Deep breaths.' },
    { name: 'Euston Road', type: 'property', group: 'light-blue', price: 100, rent: 6, detail: 'A bright spot with room to build.' },
    { name: 'Pentonville Road', type: 'property', group: 'light-blue', price: 120, rent: 8, detail: 'Good location. Better landlord potential.' },
    { name: 'Jail / Just Visiting', type: 'jail', icon: '\u{1F512}', detail: 'Just visiting? Keep your shoes on and carry on.' },
    { name: 'Pall Mall', type: 'property', group: 'pink', price: 140, rent: 10, detail: 'A polished address for a polished portfolio.' },
    { name: 'Electric Company', type: 'utility', icon: '\u{1F4A1}', price: 150, rent: 4, detail: 'Power moves. Rent is four times your dice roll.' },
    { name: 'Whitehall', type: 'property', group: 'pink', price: 140, rent: 10, detail: 'Big city buzz, little pink stripe.' },
    { name: 'Northumberland Avenue', type: 'property', group: 'pink', price: 160, rent: 12, detail: 'A tidy investment with excellent company.' },
    { name: 'Marylebone Station', type: 'railroad', icon: '\u{1F682}', price: 200, rent: 25, detail: 'Another station, another ticket to collect.' },
    { name: 'Bow Street', type: 'property', group: 'orange', price: 180, rent: 14, detail: 'Orange you glad you landed here?' },
    { name: 'Community Chest', type: 'chest', icon: '\u{1F9F0}', detail: 'A mystery envelope. Could be lovely. Could be chaos.' },
    { name: 'Marlborough Street', type: 'property', group: 'orange', price: 180, rent: 14, detail: 'A sunny street with serious rent potential.' },
    { name: 'Vine Street', type: 'property', group: 'orange', price: 200, rent: 16, detail: 'Prime orange real estate. Try not to brag.' },
    { name: 'Free Parking', type: 'parking', icon: String.fromCodePoint(0x1f17f, 0xfe0f), detail: 'Feet up. No fee, no fuss, no fine print.' },
    { name: 'The Strand', type: 'property', group: 'red', price: 220, rent: 18, detail: 'A red-hot address for a rising tycoon.' },
    { name: 'Chance', type: 'chance', icon: '\u{1F3B4}', detail: 'The deck has plans for you. Deep breaths.' },
    { name: 'Fleet Street', type: 'property', group: 'red', price: 220, rent: 18, detail: 'News flash: this street earns its keep.' },
    { name: 'Trafalgar Square', type: 'property', group: 'red', price: 240, rent: 20, detail: 'A landmark stop with headline-making rent.' },
    { name: 'Fenchurch St Station', type: 'railroad', icon: '\u{1F682}', price: 200, rent: 25, detail: 'The rail network grows. So does your income.' },
    { name: 'Leicester Square', type: 'property', group: 'yellow', price: 260, rent: 22, detail: 'Bright lights, big deals, yellow stripe.' },
    { name: 'Coventry Street', type: 'property', group: 'yellow', price: 260, rent: 22, detail: 'A golden chance to own the whole block.' },
    { name: 'Water Works', type: 'utility', icon: '\u{1F4A7}', price: 150, rent: 4, detail: 'Make a splash. Rent is four times your dice roll.' },
    { name: 'Piccadilly', type: 'property', group: 'yellow', price: 280, rent: 24, detail: "The yellow group's showstopper. Very chic." },
    { name: 'Go to Jail', type: 'gotojail', icon: '\u{1F694}', detail: 'Straight to jail. No shortcuts, no ' + cash(200) + '.' },
    { name: 'Regent Street', type: 'property', group: 'green', price: 300, rent: 26, detail: 'Fresh green money, anyone?' },
    { name: 'Oxford Street', type: 'property', group: 'green', price: 300, rent: 26, detail: 'The shops are lovely. The rent is livelier.' },
    { name: 'Community Chest', type: 'chest', icon: '\u{1F9F0}', detail: 'A mystery envelope. Could be lovely. Could be chaos.' },
    { name: 'Bond Street', type: 'property', group: 'green', price: 320, rent: 28, detail: 'A very fancy place to park your cash.' },
    { name: 'Liverpool St Station', type: 'railroad', icon: '\u{1F682}', price: 200, rent: 25, detail: 'Four stations make a very good commute.' },
    { name: 'Chance', type: 'chance', icon: '\u{1F3B4}', detail: 'The deck has plans for you. Deep breaths.' },
    { name: 'Park Lane', type: 'property', group: 'dark-blue', price: 350, rent: 35, detail: 'Blue-chip, big-ticket, slightly terrifying.' },
    { name: 'Super Tax', type: 'tax', icon: '\u{1F9FE}', price: 100, detail: 'A smaller bill. Still a bill. Sorry.' },
    { name: 'Mayfair', type: 'property', group: 'dark-blue', price: 400, rent: 50, detail: 'The crown jewel. Your wallet has been warned.' }
  ];
  const groupColors = { brown: '#9a6449', 'light-blue': '#65b9dc', pink: '#d96da5', orange: '#ea8b3f', red: '#df5052', yellow: '#dbbd43', green: '#54aa72', 'dark-blue': '#6279d4', railroad: '#7b8291', utility: '#66c9c0', tax: '#90939b' };
  const cardDeck = [
    { text: 'The bank found a tenner in the sofa. Collect ' + cash(50) + '.', amount: 50 },
    { text: 'Your tiny empire paid off. Pocket ' + cash(100) + '.', amount: 100 },
    { text: 'A surprise repair bill. Hand over ' + cash(50) + ', boss.', amount: -50 },
    { text: 'Birthday money! Collect ' + cash(20) + ' and act casual.', amount: 20 },
    { text: 'School fees are due. Pay ' + cash(100) + '. Oof.', amount: -100 },
    { text: 'Skip the board drama. Head to GO and collect ' + cash(200) + '.', go: true }
  ];
  const tokenSet = [
    { icon: '\u{1F697}', color: '#c1f078' }, { icon: '\u{1F408}', color: '#f4a05d' },
    { icon: '\u{1F3A9}', color: '#b7a6ff' }, { icon: '\u{1F680}', color: '#6dd6cf' }
  ];
  function showMonopolyOnlineMenu() {
    if (!state.user || !state.supabase) { showModal('<div class="eyebrow muted">ONLINE MONOPOLY</div><h2 id="modal-title">Bring your friends to the table</h2><p>Online rooms need a signed-in account so your seat and game can follow you between devices.</p><button class="button primary full" id="mono-account">Sign in or create account</button><button class="button secondary full" id="mono-menu-cancel">Maybe later</button>'); $('#mono-account').addEventListener('click', () => showAuth()); $('#mono-menu-cancel').addEventListener('click', closeModal); return; }
    showModal('<div class="eyebrow muted">ONLINE MONOPOLY</div><h2 id="modal-title">Deal me in</h2><p>Create a room for up to four players, or enter a friend’s six-character code.</p><button class="button primary full" id="mono-create-online">Create game</button><label for="mono-join-code">ROOM CODE<input id="mono-join-code" maxlength="6" autocomplete="off" placeholder="E.G. A1B2C3"></label><button class="button secondary full" id="mono-join-online">Join game</button>');
    $('#mono-create-online').addEventListener('click', createMonopolyRoom);
    $('#mono-join-online').addEventListener('click', () => joinMonopolyRoom($('#mono-join-code').value));
    $('#mono-join-code').addEventListener('keydown', event => { if (event.key === 'Enter') joinMonopolyRoom(event.target.value); });
  }
  async function createMonopolyRoom() {
    if (!state.supabase || !state.user) return toast('Sign in first to save your online seat.');
    const button = $('#mono-create-online'); if (button) { button.disabled = true; button.textContent = 'Setting the table…'; }
    const { data, error } = await state.supabase.rpc('create_monopoly_room', { p_name: state.name });
    if (error) { toast(error.message); if (button) { button.disabled = false; button.textContent = 'Create game'; } return; }
    await connectMonopolyRoom(data);
  }
  async function joinMonopolyRoom(code) {
    if (!state.supabase || !state.user) return toast('Sign in first to save your online seat.');
    code = String(code || '').trim().toUpperCase(); if (!/^[A-Z0-9]{6}$/.test(code)) return toast('Room codes have six letters or numbers.');
    const button = $('#mono-join-online'); if (button) { button.disabled = true; button.textContent = 'Finding your seat…'; }
    const { data, error } = await state.supabase.rpc('join_monopoly_room', { p_code: code, p_name: state.name });
    if (error) { toast(error.message); if (button) { button.disabled = false; button.textContent = 'Join game'; } return; }
    await connectMonopolyRoom(data);
  }
  async function connectMonopolyRoom(room) {
    if (state.monoChannel) await state.supabase.removeChannel(state.monoChannel);
    if (state.monoPresence) await state.supabase.removeChannel(state.monoPresence);
    clearInterval(state.monoHeartbeat);
    state.monoRoom = { id: room.room_id, code: room.code, hostId: room.host_id, status: room.status };
    state.mono = room.state; state.monoMode='local'; state.mono.players.forEach((player, index) => { player.id ||= state.monoMembers.find(member => member.seat === index)?.player_id; });
    go('monopoly'); buildMonopolyBoard(); drawMonopoly();
    await refreshMonopolyMembers();
    state.monoChannel = state.supabase.channel('monopoly-room-' + room.room_id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monopoly_rooms', filter: `id=eq.${room.room_id}` }, payload => handleMonopolyRoom(payload.new))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monopoly_room_players', filter: `room_id=eq.${room.room_id}` }, () => refreshMonopolyMembers())
      .subscribe(status => { if (status === 'SUBSCRIBED') { refreshMonopolyMembers(); if (state.monoRoom?.status === 'lobby') renderMonopolyLobby(); } });
    const presence = state.supabase.channel('monopoly-presence-' + room.room_id, { config: { presence: { key: state.user.id } } });
    state.monoPresence = presence;
    presence.on('presence', { event: 'sync' }, () => { const online = presence.presenceState(); state.monoMembers = state.monoMembers.map(member => ({ ...member, connected: Object.hasOwn(online, member.player_id) })); renderMonopolyLobby(); })
      .subscribe(status => { if (status === 'SUBSCRIBED') presence.track({ player_id: state.user.id, name: state.name }); });
    clearInterval(state.monoHeartbeat); state.monoHeartbeat = setInterval(async () => { const { error } = await state.supabase.rpc('heartbeat_monopoly_room', { p_room_id: room.room_id, p_connected: true }); if (!error) await state.supabase.rpc('skip_disconnected_monopoly_turn', { p_room_id: room.room_id }); }, 5000);
    showMonopolyLobby();
  }
  async function refreshMonopolyMembers() {
    if (!state.monoRoom || !state.supabase) return;
    const { data, error } = await state.supabase.from('monopoly_room_players').select('player_id,seat,display_name,connected,last_seen').eq('room_id', state.monoRoom.id).order('seat');
    if (error) { console.warn('Monopoly lobby players did not load:', error); return; }
    state.monoMembers = data || [];
    if (state.mono?.players) state.mono.players.forEach(player => { const member = state.monoMembers.find(item => item.player_id === player.id); if (member) player.name = member.display_name; });
    renderMonopolyLobby(); drawMonopoly();
  }
  function showMonopolyLobby() {
    renderMonopolyLobby();
  }
  function renderMonopolyLobby() {
    if (!state.monoRoom || !$('#modal-backdrop')) return;
    const room = state.monoRoom, members = state.monoMembers, host = room.hostId === state.user?.id, active = room.status === 'active';
    $('#mono-player-status').innerHTML = members.map(member => `<span title="${escapeHtml(member.display_name)} · ${member.connected ? 'connected' : 'disconnected'}"><i class="${member.connected ? 'is-connected' : ''}"></i>${escapeHtml(member.display_name)} <small>${member.connected ? 'Online' : 'Disconnected'}</small></span>`).join('');
    if (active) { closeModal(); $('#mono-note').textContent = 'Online table · room ' + room.code + ' · Invite friends from the Friends page.'; drawMonopoly(); return; }
    showModal(`<div class="eyebrow muted">ROOM ${escapeHtml(room.code)}</div><h2 id="modal-title">${host ? 'Your table is ready' : 'You have a seat'}</h2><p>Share this code with friends. The host can start once at least two players are here.</p><div class="mono-lobby-players">${members.map(member => `<div class="mono-lobby-player"><span class="current-token">${escapeHtml(tokenSet[member.seat]?.icon || '♟')}</span><b>${escapeHtml(member.display_name)}${member.player_id === room.hostId ? ' · host' : ''}</b><span class="mono-connection ${member.connected ? 'connected' : ''}">${member.connected ? 'Connected' : 'Disconnected'}</span></div>`).join('') || '<p>Loading seats…</p>'}</div>${host ? `<button class="button primary full" id="mono-start-online" ${members.length < 2 ? 'disabled' : ''}>Start game (${members.length}/4)</button>` : '<p class="mono-waiting">Waiting for the host to start…</p>'}<button class="button secondary full" id="mono-copy-code">Copy room code</button>`);
    $('#mono-start-online')?.addEventListener('click', startOnlineMonopoly);
    $('#mono-copy-code')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(room.code); toast('Room code copied. Deal away!'); } catch (_) { toast('Room code: ' + room.code); } });
  }
  async function startOnlineMonopoly() {
    if (!state.monoRoom || state.monoRoom.hostId !== state.user?.id || state.monoMembers.length < 2) return;
    const { error } = await state.supabase.from('monopoly_rooms').update({ status: 'active', state: { ...state.mono, lastAction: state.name + ' opened the table.' }, turn_player_id: state.user.id, updated_at: new Date().toISOString() }).eq('id', state.monoRoom.id);
    if (error) return toast(error.message);
    state.monoRoom.status = 'active'; state.mono.status = 'active'; state.mono.lastAction = state.name + ' opened the table.'; closeModal(); $('#mono-note').textContent = 'Online table · room ' + state.monoRoom.code + ' · Invite friends from the Friends page.'; drawMonopoly();
  }
  function handleMonopolyRoom(room) {
    if (!room || !state.monoRoom || room.id !== state.monoRoom.id) return;
    state.monoRoom.status = room.status; state.mono = room.state; state.monoMode='local'; state.mono.players.forEach((player, index) => { player.id ||= state.monoMembers.find(member => member.seat === index)?.player_id; });
    if (room.status === 'active') { closeModal(); $('#mono-note').textContent = 'Online table · room ' + state.monoRoom.code + ' · Invite friends from the Friends page.'; }
    if (room.state?.lastAction) $('#landing-copy').textContent = room.state.lastAction;
    drawMonopoly(); renderMonopolyLobby();
  }
  function canActMonopoly() { if (state.monoMode === 'bot' && state.mono?.current === 1 && !state.monoBotActing) return false; if (!state.monoRoom) return true; const current = state.mono?.players?.[state.mono.current]; return state.monoRoom.status === 'active' && current?.id === state.user?.id; }
  async function persistMonopoly(action) {
    if (!state.monoRoom || !state.supabase) return;
    if (action) { state.mono.lastAction = action; if (!state.mono.pending) $('#landing-copy').textContent = action; }
    const current = state.mono.players[state.mono.current];
    const { error } = await state.supabase.from('monopoly_rooms').update({ state: state.mono, status: state.mono.winner ? 'finished' : 'active', turn_player_id: current?.id || null, updated_at: new Date().toISOString() }).eq('id', state.monoRoom.id);
    if (error) { console.warn('Monopoly move did not sync:', error); toast('That move did not sync. Check your connection.'); }
  }
  $('#mono-online-open').addEventListener('click', showMonopolyOnlineMenu);
  function startMonopoly(mode = 'local') {
    state.monoMode = mode; state.monoBotActing = false; clearTimeout(state.monoBotTimer);
    state.mono = { players: [
      { name: state.name, token: tokenSet[0].icon, color: tokenSet[0].color, money: 1500, pos: 0, jail: 0, bankrupt: false },
      { name: mode === 'bot' ? 'Arcade bot' : 'Guest 2', token: tokenSet[1].icon, color: tokenSet[1].color, money: 1500, pos: 0, jail: 0, bankrupt: false }
    ], current: 0, owned: {}, houses: {}, rolled: false, pending: null, log: [], winner: null };
    buildMonopolyBoard(); drawMonopoly();
  }
  async function leaveMonopolyOnline() { clearInterval(state.monoHeartbeat); if (state.monoRoom && state.supabase) await state.supabase.rpc('heartbeat_monopoly_room', { p_room_id: state.monoRoom.id, p_connected: false }); if (state.monoChannel) await state.supabase.removeChannel(state.monoChannel); if (state.monoPresence) await state.supabase.removeChannel(state.monoPresence); state.monoRoom = null; state.monoChannel = null; state.monoPresence = null; state.monoMembers = []; $('#mono-note').textContent = 'Local table - 2 to 4 players. Make a deal, dodge rent, keep your friends.'; }
  function logMono(text) {
    state.mono.log.unshift(text);
    $('#mono-log-lines').innerHTML = state.mono.log.slice(0, 4).map(line => '<div>' + escapeHtml(line) + '</div>').join('');
  }
  function monopolyCoordinates() {
    const coords = [];
    for (let col = 11; col >= 1; col--) coords.push([11, col]);
    for (let row = 10; row >= 1; row--) coords.push([row, 1]);
    for (let col = 2; col <= 11; col++) coords.push([1, col]);
    for (let row = 2; row <= 10; row++) coords.push([row, 11]);
    return coords;
  }
  function buildMonopolyBoard() {
    const board = $('#mono-board');
    if (board.dataset.built) return;
    board.innerHTML = '<div class="mono-center"><div class="mono-center-dice">' + emoji(0x1f3b2) + '</div><strong>MONOPOLY</strong><span>MAKE A LITTLE DEAL</span><div class="mono-center-rule">ROLL - BUY - BE NICE ABOUT IT</div></div><div class="mono-flash" id="mono-flash" aria-live="polite"></div><div class="mono-token-layer" id="mono-token-layer"></div>';
    monopolyCoordinates().forEach((position, index) => {
      const space = spaces[index], tile = document.createElement('div'), corner = ['go', 'jail', 'parking', 'gotojail'].includes(space.type);
      tile.className = 'mono-space tile-' + space.type + (corner ? ' tile-corner' : '');
      if (position[0] === 11) tile.classList.add('edge-bottom');
      if (position[0] === 1) tile.classList.add('edge-top');
      if (position[1] === 1) tile.classList.add('edge-left');
      if (position[1] === 11) tile.classList.add('edge-right');
      tile.style.gridRow = position[0]; tile.style.gridColumn = position[1];
      const group = space.group || (space.type === 'railroad' ? 'railroad' : space.type === 'utility' ? 'utility' : space.type === 'tax' ? 'tax' : 'brown');
      tile.style.setProperty('--tile-color', groupColors[group]); tile.dataset.space = index;
      tile.title = space.name + ' - ' + space.detail + (space.price ? ' Price ' + cash(space.price) + ', rent ' + cash(space.rent) + '.' : '');
      tile.setAttribute('aria-label', tile.title);
      tile.innerHTML = '<span class="space-band"></span><span class="space-icon" aria-hidden="true">' + (space.icon || '') + '</span><span class="space-name">' + escapeHtml(space.name) + '</span><span class="space-detail">' + escapeHtml(space.detail) + '</span><span class="space-price">' + (space.price ? cash(space.price) : '') + '</span>';
      board.append(tile);
    });
    board.dataset.built = 'true';
  }
  function flashMonopoly(kind, message) {
    const board = $('#mono-board'), notice = $('#mono-flash');
    board.classList.remove('event-pass-go', 'event-purchase'); notice.classList.remove('show'); void board.offsetWidth;
    board.classList.add('event-' + kind); notice.textContent = message; notice.classList.add('show');
    clearTimeout(flashMonopoly.timer);
    flashMonopoly.timer = setTimeout(() => { board.classList.remove('event-pass-go', 'event-purchase'); notice.classList.remove('show'); }, 1500);
  }
  function drawMonopoly() {
    if (!state.mono) return;
    buildMonopolyBoard();
    const board = $('#mono-board'), current = state.mono.players[state.mono.current], coords = monopolyCoordinates();
    $('#mono-log-lines').innerHTML = (state.mono.log || []).slice(0, 4).map(line => '<div>' + escapeHtml(line) + '</div>').join('') || 'Welcome to the deal. Roll when you are ready.';
    spaces.forEach((space, index) => {
      const tile = board.querySelector('[data-space="' + index + '"]'), ownerIndex = state.mono.owned[index];
      const occupants = state.mono.players.filter(player => !player.bankrupt && player.pos === index);
      tile.classList.toggle('current-player', occupants.length > 0); tile.classList.toggle('active-space', current.pos === index);
      tile.classList.toggle('owned', Number.isInteger(ownerIndex));
      tile.style.setProperty('--owner-color', Number.isInteger(ownerIndex) ? state.mono.players[ownerIndex].color : 'transparent');
      tile.setAttribute('aria-label', space.name + (Number.isInteger(ownerIndex) ? ', owned by ' + state.mono.players[ownerIndex].name : '') + '. ' + space.detail + (space.price ? ' Price ' + cash(space.price) + ', rent ' + cash(space.rent) + '.' : ''));
    });
    const tokenLayer = $('#mono-token-layer');
    state.mono.players.forEach((player, index) => {
      let token = tokenLayer.querySelector('[data-player-token="' + index + '"]');
      if (!token) { token = document.createElement('div'); token.className = 'mono-token'; token.dataset.playerToken = index; tokenLayer.append(token); }
      token.classList.toggle('token-active', index === state.mono.current); token.classList.toggle('token-bankrupt', player.bankrupt);
      token.style.setProperty('--token-color', player.color); token.setAttribute('aria-label', player.name + ' token'); token.title = player.name;
      token.innerHTML = '<span>' + escapeHtml(player.token) + '</span>';
      const position = coords[player.pos], sameSpot = state.mono.players.filter(other => !other.bankrupt && other.pos === player.pos).length;
      const offset = sameSpot > 1 ? (index === 0 ? -6 : 6) : 0;
      token.style.left = 'calc(' + ((position[1] - .5) / 11 * 100) + '% + ' + offset + 'px)'; token.style.top = ((position[0] - .5) / 11 * 100) + '%';
    });
    $('#mono-current').innerHTML = '<span class="current-token">' + escapeHtml(current.token) + '</span><span>' + escapeHtml(current.name) + ' - <small>' + cash(current.money) + '</small></span>';
    $('#mono-current').style.setProperty('--player-color', current.color); $('.mono-turn').classList.toggle('is-active', !current.bankrupt);
    $('#roll-dice').disabled = state.mono.rolled || current.bankrupt || !canActMonopoly(); $('#roll-dice').classList.toggle('hidden', state.mono.rolled);
    ['buy-property', 'build-house', 'pay-rent'].forEach(id => { const button = $('#' + id); if (button) button.disabled = !canActMonopoly(); });
    if (state.monoRoom && !canActMonopoly() && !state.mono.rolled && state.monoRoom.status === 'active') $('#landing-copy').textContent = current.name + ' is up. Their turn is underway.';
    if (!state.mono.pending) {
      $('#landing-name').textContent = 'Your move, ' + current.name + '.';
      $('#landing-copy').textContent = 'Give the dice a toss. Your future landlord awaits.';
      $('#property-price').textContent = ''; $('#buy-property').classList.add('hidden'); $('#build-house').classList.add('hidden'); $('#pay-rent').classList.add('hidden');
    }
    if (state.monoRoom?.status === 'active' && !state.mono.pending && state.mono.lastAction) $('#landing-copy').textContent = state.mono.lastAction;
    if (state.mono.winner) { $('#landing-name').textContent = emoji(0x1f3c6) + ' ' + state.mono.winner.name + ' wins!'; $('#landing-copy').textContent = 'The rest of the table is officially out of pocket.'; }
  }
  function endMonoTurn() { if (state.mono.winner || !canActMonopoly()) return;
    state.mono.rolled = false; state.mono.pending = null;
    let attempts = 0;
    do { state.mono.current = (state.mono.current + 1) % state.mono.players.length; attempts++; }
    while (state.mono.players[state.mono.current].bankrupt && attempts < state.mono.players.length);
    drawMonopoly(); persistMonopoly(state.mono.players[state.mono.current].name + ' is up next.'); if (state.monoMode === 'bot' && state.mono.current === 1) scheduleMonopolyBot();
  }
  function scheduleMonopolyBot() {
    clearTimeout(state.monoBotTimer);
    state.monoBotTimer = setTimeout(() => {
      if (state.monoMode !== 'bot' || state.mono.current !== 1 || state.mono.winner) return;
      state.monoBotActing = true;
      drawMonopoly();
      if (!state.mono.rolled) $('#roll-dice').click();
      state.monoBotTimer = setTimeout(() => {
        if (state.mono.current !== 1 || state.mono.winner) { state.monoBotActing = false; return; }
        if (state.mono.pending?.type === 'jail' && state.mono.rolled) {
          $('#pay-rent').click();
          if (state.mono.current === 1 && !state.mono.rolled) {
            state.monoBotTimer = setTimeout(scheduleMonopolyBot, 400);
            return;
          }
        } else if (state.mono.pending?.type === 'property' && !Number.isInteger(state.mono.owned[state.mono.pending.index]) && state.mono.players[1].money > spaces[state.mono.pending.index].price + 100) {
          $('#buy-property').click();
        }
        if (state.mono.rolled && !state.mono.winner) $('#pay-rent').click();
        state.monoBotActing = false;
        if (state.mono.current === 1 && !state.mono.winner) state.monoBotTimer = setTimeout(scheduleMonopolyBot, 400);
      }, 650);
    }, 650);
  }
  function getOut(player, cost, recipient) {
    if (player.money >= cost) { player.money -= cost; if (recipient) recipient.money += cost; return true; }
    player.bankrupt = true; player.money = 0; logMono(emoji(0x1f4b8) + ' ' + player.name + ' is out of cash. That rent came in swinging.');
    const living = state.mono.players.filter(person => !person.bankrupt);
    if (living.length === 1) state.mono.winner = living[0];
    return false;
  }
  $('#roll-dice').addEventListener('click', () => {
    const game = state.mono;
    if (!game || game.rolled || game.winner || !canActMonopoly()) return;
    const player = game.players[game.current];
    if (player.jail > 0) {
      player.jail--; player.pos = 10; game.rolled = true; game.pending = { type: 'jail' };
      $('#dice-result').textContent = player.name + ' is on a short break (' + player.jail + ' turn' + (player.jail === 1 ? '' : 's') + ' left).';
      $('#landing-name').textContent = 'Behind bars for a bit'; $('#landing-copy').textContent = 'Pay ' + cash(50) + ' to make bail, or sit tight for another turn.';
      $('#pay-rent').textContent = 'Pay ' + cash(50) + ' bail'; $('#pay-rent').classList.remove('hidden');
      $('#pay-rent').onclick = () => { if (!canActMonopoly()) return; if (player.money >= 50) { player.money -= 50; player.jail = 0; game.rolled = false; $('#dice-result').textContent = 'Bail paid. You are back in business.'; $('#pay-rent').classList.add('hidden'); } else return endMonoTurn(); drawMonopoly(); persistMonopoly(player.name + ' paid bail.'); };
      drawMonopoly(); persistMonopoly(player.name + ' is cooling off in jail.'); return;
    }
    const a = 1 + Math.floor(Math.random() * 6), b = 1 + Math.floor(Math.random() * 6), roll = a + b;
    game.rolled = true;
    const dice = $('#dice-result'); dice.innerHTML = '<span class="roll-die">' + emoji(0x1f3b2) + ' ' + a + '</span><span class="roll-die">' + emoji(0x1f3b2) + ' ' + b + '</span><strong>- ' + roll + ' spaces</strong>';
    dice.classList.remove('rolling'); void dice.offsetWidth; dice.classList.add('rolling');
    clearTimeout(dice.rollTimer); dice.rollTimer = setTimeout(() => dice.classList.remove('rolling'), 700);
    const old = player.pos; player.pos = (player.pos + roll) % spaces.length;
    if (player.pos < old) { player.money += 200; logMono(emoji(0x2728) + ' ' + player.name + ' swept past GO. Pocket ' + cash(200) + '!'); flashMonopoly('pass-go', emoji(0x2728) + ' GO bonus - ' + cash(200)); }
    const space = spaces[player.pos], ownerIndex = Number(game.owned[player.pos]);
    game.pending = { index: player.pos, type: space.type };
    $('#landing-name').textContent = space.name; $('#landing-copy').textContent = space.detail; $('#property-price').textContent = '';
    $('#buy-property').classList.add('hidden'); $('#build-house').classList.add('hidden'); $('#pay-rent').classList.add('hidden');
    if (space.type === 'property' || space.type === 'railroad' || space.type === 'utility') {
      if (Number.isInteger(ownerIndex)) {
        const owner = game.players[ownerIndex];
        if (ownerIndex !== game.current && !owner.bankrupt) {
          const rent = space.type === 'property' ? space.rent + (game.houses[player.pos] || 0) * Math.max(3, Math.ceil(space.rent * .7)) : space.type === 'utility' ? roll * 4 : space.rent;
          const paid = getOut(player, rent, owner);
          if (paid) logMono(emoji(0x1f4b8) + ' ' + player.name + ' paid ' + cash(rent) + ' rent to ' + owner.name + '. ' + isOuch(space.name));
          $('#landing-copy').textContent = paid ? 'Rent: ' + cash(rent) + '. ' + owner.name + ' collects. Ouch!' : 'That rent emptied your wallet. ' + owner.name + ' takes the win.';
        } else {
          const houses = game.houses[player.pos] || 0;
          $('#landing-copy').textContent = houses ? 'Your place, your rules. It has ' + houses + ' house' + (houses === 1 ? '' : 's') + '.' : 'You own this spot. Nobody can charge you rent here.';
          if (space.type === 'property' && houses < 4 && player.money >= Math.ceil(space.price / 2)) { $('#property-price').textContent = 'HOUSE - ' + cash(Math.ceil(space.price / 2)); $('#build-house').classList.remove('hidden'); }
        }
      } else {
        $('#landing-copy').textContent = space.detail + ' Nobody owns it yet. Claim it before the rent gets spicy.';
        $('#property-price').textContent = 'PRICE - ' + cash(space.price) + ' / RENT - ' + cash(space.rent);
        if (player.money >= space.price) $('#buy-property').classList.remove('hidden');
      }
    } else if (space.type === 'tax') {
      getOut(player, space.price); $('#landing-copy').textContent = 'Pay ' + cash(space.price) + ' to the bank. Rude.'; logMono(emoji(0x1f9fe) + ' ' + player.name + ' paid ' + cash(space.price) + ' in tax.');
    } else if (space.type === 'gotojail') {
      player.pos = 10; player.jail = 2; $('#landing-copy').textContent = 'Straight to jail. No shortcuts, no ' + cash(200) + '. See you after your break.'; logMono(emoji(0x1f694) + ' ' + player.name + ' was sent to jail.');
    } else if (space.type === 'chance' || space.type === 'chest') {
      const card = cardDeck[Math.floor(Math.random() * cardDeck.length)];
      $('#landing-copy').textContent = (space.type === 'chance' ? 'Chance says: ' : 'Community Chest says: ') + card.text;
      if (card.go) { player.pos = 0; player.money += 200; logMono(emoji(0x2728) + ' ' + player.name + ' drew a GO card. Pocket ' + cash(200) + '!'); flashMonopoly('pass-go', emoji(0x2728) + ' GO card - ' + cash(200)); }
      else if (card.amount > 0) player.money += card.amount; else getOut(player, -card.amount);
      logMono(emoji(0x1f3b4) + ' ' + card.text);
    } else {
      $('#landing-copy').textContent = space.type === 'go' ? 'Welcome to GO. Collect ' + cash(200) + ' when you pass.' : space.type === 'parking' ? 'Feet up. Free Parking is a breather - no bill today.' : 'Just visiting. Keep your nose clean.';
    }
    $('#pay-rent').classList.remove('hidden'); $('#pay-rent').textContent = 'Next player'; $('#pay-rent').onclick = endMonoTurn;
    drawMonopoly();
    persistMonopoly(player.name + ' rolled ' + roll + ' and landed on ' + space.name + '.');
  });
  function isOuch(name) { return name === 'The Angel Islington' ? '- that is a steep little angel.' : '- ouch, that adds up.'; }
  $('#buy-property').addEventListener('click', () => {
    const game = state.mono, player = game.players[game.current], index = game.pending.index, space = spaces[index];
    if (!game || !canActMonopoly() || player.money < space.price) return;
    player.money -= space.price; game.owned[index] = game.current;
    logMono(emoji(0x2728) + ' ' + player.name + ' claimed ' + space.name + ' for ' + cash(space.price) + '. Nice little land grab.');
    $('#landing-copy').textContent = 'The deed is yours. ' + space.detail + ' Keep the rent coming.';
    $('#buy-property').classList.add('hidden'); $('#property-price').textContent = 'YOURS - ' + cash(space.price);
    drawMonopoly(); flashMonopoly('purchase', emoji(0x2728) + ' ' + space.name + ' is yours!'); persistMonopoly(player.name + ' bought ' + space.name + '.');
  });
  $('#build-house').addEventListener('click', () => {
    const game = state.mono, player = game.players[game.current], index = game.pending.index, space = spaces[index], cost = Math.ceil(space.price / 2);
    if (!game || !canActMonopoly() || game.owned[index] !== game.current || player.money < cost || (game.houses[index] || 0) >= 4) return;
    player.money -= cost; game.houses[index] = (game.houses[index] || 0) + 1;
    logMono(emoji(0x1f3e0) + ' ' + player.name + ' added a house to ' + space.name + ' for ' + cash(cost) + '. Rent just got ambitious.');
    $('#build-house').classList.add('hidden'); $('#landing-copy').textContent = 'Home sweet home. Your place now has ' + game.houses[index] + ' house' + (game.houses[index] === 1 ? '' : 's') + '.'; $('#property-price').textContent = 'HOUSE BUILT'; drawMonopoly(); persistMonopoly(player.name + ' built on ' + space.name + '.');
  });
  $('#mono-new').addEventListener('click', async () => {
    const count = Number(prompt('How many players are joining the deal? (2-4)', '2'));
    if (!Number.isFinite(count) || count < 2 || count > 4) { toast('Pick a table for 2-4 players.'); return; }
    const customNames = [state.name];
    for (let i = 1; i < count; i++) customNames.push(prompt('Player ' + (i + 1) + ' name?', 'Guest ' + (i + 1)) || 'Guest ' + (i + 1));
    await leaveMonopolyOnline();
    startMonopoly();
    state.mono.players = customNames.map((name, index) => ({ name: escapeHtml(name), token: tokenSet[index].icon, color: tokenSet[index].color, money: 1500, pos: 0, jail: 0, bankrupt: false }));
    drawMonopoly();
  });

  $('#theme-toggle').addEventListener('click', () => { document.body.classList.toggle('theme-light'); localStorage.setItem('arcade.theme', document.body.classList.contains('theme-light') ? 'light' : 'dark'); });
  if (localStorage.getItem('arcade.theme') === 'light') document.body.classList.add('theme-light');
  function syncProfile() { $('#header-name').textContent = state.name; $('#header-avatar').textContent = state.name.slice(0, 1).toUpperCase(); $('#profile-avatar').textContent = state.name.slice(0, 1).toUpperCase(); $('#display-name').value = state.name; $('#username').value = state.username; }
  function updateStats() { $('#stat-games').textContent = state.games; $('#stat-wins').textContent = state.wins; $('#stat-friends').textContent = state.friends.length; }
  syncProfile(); updateStats();
  $('#profile-open').addEventListener('click', () => go('profile'));
  $('#save-profile').addEventListener('click', async () => { const name = $('#display-name').value.trim().slice(0, 24), username = $('#username').value.trim().replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24); if (!name || username.length < 3) return toast('Use a name and a username with at least 3 characters.'); state.name = name; state.username = username; localStorage.setItem('arcade.name', name); localStorage.setItem('arcade.username', username); if (state.user && state.supabase) { const { error } = await state.supabase.from('profiles').upsert({ id: state.user.id, username, display_name: name, updated_at: new Date().toISOString() }); if (error) return toast(error.message); } syncProfile(); toast('Profile saved.'); });

  async function joinQuickMatch(game) {
    if (!state.user || !state.supabase) { toast('Sign in before searching for an online match.'); $('#auth-button').click(); return; }
    const payload = game === 'pool' ? { game: ArcadePool.rack((Date.now() ^ Math.floor(Math.random()*0xffffffff)) >>> 0) } : {};
    showModal(`<div class="eyebrow muted">QUICK MATCH</div><h2 id="modal-title">Finding a ${escapeHtml(game)} rival?</h2><p id="matchmaking-status">You?re in line. We?ll pair you with the next player looking for the same game.</p><button class="button secondary full" id="cancel-matchmaking">Leave queue</button>`);
    $('#cancel-matchmaking').addEventListener('click', async () => { await state.supabase.rpc('leave_arcade_matchmaking'); if(state.matchQueueChannel)await state.supabase.removeChannel(state.matchQueueChannel);state.matchQueueChannel=null;closeModal();toast('Matchmaking cancelled.'); });
    const {data,error}=await state.supabase.rpc('join_arcade_matchmaking',{p_game:game,p_name:state.name,p_payload:payload});
    if(error){console.warn('Matchmaking request failed:',error);$('#matchmaking-status').textContent='Quick match is unavailable. Apply the latest Supabase schema and try again.';return;}
    if(data?.status==='matched'){await launchMatchedGame(data);return;}
    if(state.matchQueueChannel)await state.supabase.removeChannel(state.matchQueueChannel);
    const channel=state.supabase.channel('matchmaking-'+data.queue_id).on('postgres_changes',{event:'UPDATE',schema:'public',table:'arcade_matchmaking',filter:`player_id=eq.${state.user.id}`},event=>{if(event.new?.id===data.queue_id&&event.new.status==='matched')launchMatchedGame(event.new);if(event.new?.id===data.queue_id&&event.new.status==='cancelled')closeModal();}).subscribe(async status=>{if(status==='SUBSCRIBED'){const {data:ticket}=await state.supabase.from('arcade_matchmaking').select('*').eq('id',data.queue_id).maybeSingle();if(ticket?.status==='matched')launchMatchedGame(ticket);}});
    state.matchQueueChannel=channel;
  }
  async function launchMatchedGame(match) {
    if(!match?.room_id||!state.supabase)return; if(state.matchQueueChannel){await state.supabase.removeChannel(state.matchQueueChannel);state.matchQueueChannel=null;}
    closeModal();
    if(match.game==='chess'){await launchOnlineRoom(match.room_id,'chess',match.seat===0);return;}
    if(match.game==='monopoly'){const {data,error}=await state.supabase.rpc('join_monopoly_room',{p_code:match.room_code,p_name:state.name});if(error)return toast(error.message);await connectMonopolyRoom(data);return;}
    if(match.game==='pool'){await window.ArcadePoolUI?.joinByCode(match.room_code);return;}
  }

  function renderFriends(list = state.friends) { const query = $('#friend-search').value.toLowerCase(); const friends = list.filter(friend => friend.username.includes(query)); $('#friend-list').innerHTML = friends.length ? friends.map(friend => `<div class="friend-row"><span class="avatar friend-avatar ${friend.color || 'green'}">${escapeHtml((friend.name || friend.username).slice(0,1).toUpperCase())}</span><div class="friend-detail"><b>${escapeHtml(friend.username)}</b><span><i class="online-dot"></i> ${friend.online ? 'Online · just now' : 'Recently active'}</span></div><button class="button invite-button" data-invite="${escapeHtml(friend.username)}">Invite</button><button class="icon-button friend-more" data-remove="${escapeHtml(friend.username)}" aria-label="Remove friend">•••</button></div>`).join('') : '<div class="empty-state">No friends match that search.</div>'; $('#friends-count').textContent = friends.length; $('#friends-online-caption').textContent = `${friends.filter(friend => friend.online).length} friends online now`; }
  function renderOnlinePlayers() { const host = $('#online-player-list'); if (!host) return; host.innerHTML = state.onlinePlayers.length ? state.onlinePlayers.map(player => `<div class="friend-row"><span class="avatar friend-avatar lilac">${escapeHtml((player.name||player.username).slice(0,1).toUpperCase())}</span><div class="friend-detail"><b>${escapeHtml(player.username||player.name)}</b><span><i class="online-dot"></i> Online now</span></div><button class="button invite-button" data-challenge="${escapeHtml(player.id)}">Challenge</button></div>`).join('') : '<div class="empty-state">No other players are online yet.</div>'; $('#online-player-count').textContent = state.onlinePlayers.length; }
  $('#online-player-list').addEventListener('click', async event => { const button=event.target.closest('[data-challenge]'); if(!button)return; const player=state.onlinePlayers.find(item=>item.id===button.dataset.challenge); if(!player||!state.user||!state.supabase)return toast('Sign in to challenge online players.'); const game=$('#invite-game').value; const poolCode=window.ArcadePoolUI?.inspect()?.room; const roomCode=game==='monopoly'?(state.monoRoom?.status==='lobby'?state.monoRoom.code:''):game==='pool'?(poolCode||''):''; if(game!=='chess'&&!roomCode)return toast(`Create a ${game} online room first, then challenge ${player.username}.`); const {error}=await state.supabase.from('invitations').insert({sender_id:state.user.id,receiver_id:player.id,game,...(game!=='chess'?{room_code:roomCode}:{})}); if(error)return toast(error.message);toast(`${player.username} has your ${game} challenge.`); });
  $('#friend-search').addEventListener('input', () => renderFriends());
  $('#add-friend').addEventListener('click', () => { const query = $('#friend-search').value.trim(); if (query) sendFriendRequest(query); else { $('#friend-search').focus(); toast('Search a username first.'); } });
  async function sendFriendRequest(username) { username = ArcadeSocial.normalizeUsername(username); if (!ArcadeSocial.canRequestFriend(username, state.username, state.friends, state.requests.concat(state.sentRequests))) return toast('That username is invalid, already a friend, or already has a request.'); if (!state.user || !state.supabase) { state.sentRequests.push({ username }); toast(`Friend request sent to @${username}.`); return; } const { data: profile, error } = await state.supabase.from('profiles').select('id,username,display_name').eq('username', username).maybeSingle(); if (error) { console.warn('Username search failed:', error); return toast('Username search is unavailable. Try again shortly.'); } if (!profile) return toast('No player found with that username.'); if (profile.id === state.user.id) return toast('That is your username.'); const { error: requestError } = await state.supabase.from('friend_requests').insert({ sender_id: state.user.id, receiver_id: profile.id }); if (!requestError) state.sentRequests.push({ username }); toast(requestError ? requestError.message : `Friend request sent to @${username}.`); }
  function renderRequests() { $('#request-count').textContent = state.requests.length; $('#request-list').innerHTML = state.requests.length ? state.requests.map(request => `<div class="request-row"><span class="avatar friend-avatar lilac">${escapeHtml((request.name || request.username).slice(0,1).toUpperCase())}</span><div class="friend-detail"><b>${escapeHtml(request.username)}</b><span>Wants to be friends</span></div><div class="request-actions"><button class="accept" data-accept="${escapeHtml(request.id)}">Accept</button><button data-decline="${escapeHtml(request.id)}">Decline</button></div></div>`).join('') : '<div class="empty-state">No new requests. Your next opponent might be one search away.</div>'; }
  $('#request-list').addEventListener('click', async event => { const accept = event.target.closest('[data-accept]'), decline = event.target.closest('[data-decline]'); const id = accept?.dataset.accept || decline?.dataset.decline; if (!id) return; const request = state.requests.find(item => String(item.id) === String(id)); if (!request) return; if (state.user && state.supabase && request.dbId) { await state.supabase.from('friend_requests').update({ status: accept ? 'accepted' : 'declined' }).eq('id', request.dbId); if (accept) await state.supabase.from('friendships').insert({ user_id: state.user.id, friend_id: request.id }); } const result = ArcadeSocial.respondToRequest(state.friends, state.requests, id, !!accept); state.friends = result.friends; state.requests = result.requests; renderRequests(); renderFriends(); updateStats(); toast(accept ? `You and @${request.username} are friends now.` : 'Request declined.'); });
  $('#friend-list').addEventListener('click', async event => { const remove = event.target.closest('[data-remove]'); if (remove) { const username = remove.dataset.remove; if (state.user && state.supabase) { const { data } = await state.supabase.from('profiles').select('id').eq('username', username).maybeSingle(); if (data) await state.supabase.from('friendships').delete().or(`and(user_id.eq.${state.user.id},friend_id.eq.${data.id}),and(user_id.eq.${data.id},friend_id.eq.${state.user.id})`); } state.friends = state.friends.filter(friend => friend.username !== username); renderFriends(); updateStats(); toast(`Removed @${username} from friends.`); } const invite = event.target.closest('[data-invite]'); if (invite) { $('#friend-search').value = invite.dataset.invite; $('#invite-game').value = 'chess'; toast(`Choose a game below to invite @${invite.dataset.invite}.`); } });
  $('#send-invite').addEventListener('click', async () => { const selected = $('#friend-search').value.trim(); if (!selected) return toast('Search for a friend first, then tap Invite.'); const game = $('#invite-game').value; const poolCode = window.ArcadePoolUI?.inspect()?.room; const roomCode = game === 'monopoly' ? (state.monoRoom?.status === 'lobby' ? state.monoRoom.code : '') : game === 'pool' ? (poolCode || '') : ''; if (game !== 'chess' && !roomCode) return toast(`Create a ${game} online room first, then invite your friend.`); if (!state.user || !state.supabase) return toast(`Sign in and connect Supabase to send a live ${game} invite.`); const { data: profile } = await state.supabase.from('profiles').select('id').eq('username', ArcadeSocial.normalizeUsername(selected)).maybeSingle(); if (!profile) return toast('No player found.'); const { error } = await state.supabase.from('invitations').insert({ sender_id: state.user.id, receiver_id: profile.id, game, ...(game !== 'chess' ? { room_code: roomCode } : {}) }); if (error) return toast(error.message); toast(game === 'monopoly' ? `Room invite sent to @${selected}.` : `Invitation sent to @${selected}.`); });
  $('#friend-search').addEventListener('keydown', event => { if (event.key === 'Enter') sendFriendRequest(event.target.value.trim()); });

  async function syncMove(move) { if (!state.user || !state.supabase || !state.activeRoom || !state.chess) return; const ply = state.roomPly + 1, record = { room_id: state.activeRoom.id, player_id: state.user.id, ply, state: { fen: state.chess.fen(), san: move.san, from: move.from, to: move.to } }; const { error } = await state.supabase.from('game_moves').insert(record); if (error) { toast('Move could not sync. Reconnecting…'); loadRoom(); return; } state.roomPly = ply; state.activeRoom.lastState = record.state; await state.supabase.from('game_rooms').update({ state: record.state, updated_at: new Date().toISOString() }).eq('id', state.activeRoom.id); }
  async function createRoomForInvite(invite) { if (invite.game === 'monopoly' || !state.supabase || !state.user || invite.status !== 'accepted' || invite.room_id || state.creatingRooms?.has(invite.id)) return; if (!state.creatingRooms) state.creatingRooms = new Set(); state.creatingRooms.add(invite.id); const fen = new Chess().fen(); const { data: room, error } = await state.supabase.from('game_rooms').insert({ game: invite.game, player_one: invite.sender_id, player_two: invite.receiver_id, state: { fen } }).select('id').single(); if (error) { toast(error.message); state.creatingRooms.delete(invite.id); return; } await state.supabase.from('invitations').update({ room_id: room.id }).eq('id', invite.id); launchOnlineRoom(room.id, invite.game, true); }
  async function launchOnlineRoom(roomId, game, isSender) { if (game !== 'chess') { toast('Monopoly invites use room codes. Create or join a table from the Monopoly page.'); return; } if (state.activeRoom?.id === roomId) return; state.activeRoom = { id: roomId }; state.roomPly = 0; state.chessMode = 'online'; state.chessColor = isSender ? 'w' : 'b'; state.clockMode = 0; state.chess = null; closeModal(); go('chess'); if (state.roomChannel) await state.supabase.removeChannel(state.roomChannel); state.roomChannel = state.supabase.channel(`room-${roomId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_moves', filter: `room_id=eq.${roomId}` }, payload => applyRoomMove(payload.new)).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_rooms', filter: `id=eq.${roomId}` }, payload => handleRoomUpdate(payload.new)).subscribe(status => { if (status === 'SUBSCRIBED') loadRoom(); }); }
  async function loadRoom() { if (!state.activeRoom || !state.supabase) return; const { data: room } = await state.supabase.from('game_rooms').select('id,game,state,status').eq('id', state.activeRoom.id).maybeSingle(); if (!room) { toast('Waiting for the game room to reconnect.'); return; } state.activeRoom.lastState = room.state; if (!state.chess) { state.chessMode = 'online'; state.clockMode = 0; startChess(); go('chess'); } const { data: moves } = await state.supabase.from('game_moves').select('ply,player_id,state').eq('room_id', room.id).order('ply', { ascending: false }).limit(1); const latest = moves?.[0]; if (latest && latest.ply > state.roomPly) applyRoomMove(latest); else if (!latest && room.state?.fen && state.chess.fen() !== room.state.fen) { state.chess.load(room.state.fen); state.board.position(room.state.fen); } if (room.status === 'finished') handleRoomUpdate(room); }
  function applyRoomMove(record) { if (!state.chess || !record?.state?.fen || record.ply <= state.roomPly) return; state.roomPly = record.ply; state.activeRoom.lastState = record.state; if (record.player_id !== state.user?.id) { state.history.push(state.chess.fen()); state.chess.load(record.state.fen); renderChess(record.state); } }
  function handleRoomUpdate(room) { if (!state.activeRoom || room.id !== state.activeRoom.id) return; state.activeRoom.lastState = room.state; if (room.status === 'finished') { state.finishedMessage = room.state?.result || 'Game finished'; clearInterval(state.clockTimer); renderChess(); return; } if (room.state?.drawOfferBy && room.state.drawOfferBy !== state.user?.id && !state.drawOfferOpen) { state.drawOfferOpen = true; showModal(`<div class="eyebrow muted">DRAW OFFER</div><h2 id="modal-title">Call it a draw?</h2><p>Your opponent suggests shaking hands and sharing the point.</p><button class="button primary full" id="accept-draw">Shake on it</button><button class="button secondary full" id="decline-draw">Not yet</button>`); $('#accept-draw').addEventListener('click', async () => { await state.supabase.from('game_rooms').update({ status: 'finished', state: { ...room.state, result: 'Draw agreed' } }).eq('id', room.id); state.drawOfferOpen = false; closeModal(); }); $('#decline-draw').addEventListener('click', async () => { const nextState = { ...room.state }; delete nextState.drawOfferBy; await state.supabase.from('game_rooms').update({ state: nextState }).eq('id', room.id); state.drawOfferOpen = false; closeModal(); }); } }
  async function connectSupabase() {
    const config = window.ARCADE_CONFIG;
    if (!config) throw new Error('config.js is missing or did not define window.ARCADE_CONFIG.');
    if (typeof config.supabaseUrl !== 'string' || typeof config.supabaseAnonKey !== 'string' || !config.supabaseAnonKey.trim() || config.supabaseUrl.includes('YOUR_PROJECT') || config.supabaseAnonKey.includes('YOUR_PUBLIC')) throw new Error('Supabase settings are incomplete in config.js.');
    let projectUrl; try { projectUrl = new URL(config.supabaseUrl); } catch (_) { throw new Error('The Supabase project URL in config.js is invalid.'); }
    if (projectUrl.protocol !== 'https:' || !window.supabase?.createClient) throw new Error('Supabase is unavailable. Check the project URL and library connection.');
    state.supabase = window.supabase.createClient(projectUrl.origin, config.supabaseAnonKey.trim());
    const health = await fetch(`${projectUrl.origin}/auth/v1/health`, { headers: { apikey: config.supabaseAnonKey.trim() }, cache: 'no-store', signal: AbortSignal.timeout(7000) });
    if (!health.ok) throw new Error(`Supabase returned HTTP ${health.status}. Check the project URL and publishable key.`);
    const { data, error } = await state.supabase.auth.getSession(); if (error) throw error; state.user = data.session?.user || null; updateAuthButton(); clearAppNotice();
    state.supabase.auth.onAuthStateChange((_event, session) => { state.user = session?.user || null; updateAuthButton(); if (state.user) loadSocial(); });
    if (state.user) loadSocial();
  }
  function updateAuthButton() { $('#auth-button').textContent = state.user ? `Signed in as ${state.user.email}` : 'Sign in or create account →'; $('#sign-out').classList.toggle('hidden', !state.user); }
  async function loadSocial() {
    if (!state.user) return;
    if (state.socialLoading) return state.socialLoading;
    state.socialLoading = loadSocialData();
    try { await state.socialLoading; } catch (error) { console.warn('Social data could not load:', error); showAppNotice('You are signed in, but some social features could not connect. Refresh to try again.'); }
    finally { state.socialLoading = null; }
  }
  async function loadSocialData() {
    if (!state.user) return;
    const { data: profile } = await state.supabase.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
    if (profile) { state.name = profile.display_name || state.name; state.username = profile.username || state.username; localStorage.setItem('arcade.name', state.name); localStorage.setItem('arcade.username', state.username); syncProfile(); }
    const { data: incoming } = await state.supabase.from('friend_requests').select('id,sender_id,profiles!friend_requests_sender_id_fkey(username,display_name)').eq('receiver_id', state.user.id).eq('status', 'pending');
    state.requests = (incoming || []).map(item => ({ id: item.sender_id, dbId: item.id, username: item.profiles?.username || 'player', name: item.profiles?.display_name || 'Player' })); renderRequests();
    const { data: edges } = await state.supabase.from('friendships').select('friend_id,user_id'); const ids = [...new Set((edges || []).flatMap(edge => edge.user_id === state.user.id ? [edge.friend_id] : edge.friend_id === state.user.id ? [edge.user_id] : []))];
    const { data: profiles } = ids.length ? await state.supabase.from('profiles').select('id,username,display_name').in('id', ids) : { data: [] }; state.friends = (profiles || []).map(item => ({ username: item.username, name: item.display_name, id: item.id, online: false })); renderFriends(); updateStats();
    if (!state.socialChannel) state.socialChannel = state.supabase.channel('arcade-social-' + state.user.id).on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests', filter: `receiver_id=eq.${state.user.id}` }, payload => { if (payload.eventType === 'INSERT') { toast('You have a new friend request.'); loadSocial(); } }).on('postgres_changes', { event: '*', schema: 'public', table: 'invitations', filter: `receiver_id=eq.${state.user.id}` }, payload => { if (payload.eventType === 'INSERT') showIncomingInvite(payload.new); if (payload.eventType === 'UPDATE' && payload.new.status === 'accepted' && payload.new.room_id) launchOnlineRoom(payload.new.room_id, payload.new.game, false); }).on('postgres_changes', { event: '*', schema: 'public', table: 'invitations', filter: `sender_id=eq.${state.user.id}` }, payload => { if (payload.eventType === 'UPDATE' && payload.new.status === 'accepted' && !payload.new.room_id && !payload.new.room_code) createRoomForInvite(payload.new); if (payload.eventType === 'UPDATE' && payload.new.room_id) launchOnlineRoom(payload.new.room_id, payload.new.game, true); }).subscribe();
    if (!state.presenceChannel) { const presence = state.supabase.channel('arcade-presence', { config: { presence: { key: state.user.id } } }); state.presenceChannel = presence; presence.on('presence', { event: 'sync' }, () => { const online = presence.presenceState(); state.friends = state.friends.map(friend => ({ ...friend, online: Object.values(online).flat().some(user => user.username === friend.username) })); state.onlinePlayers = Object.entries(online).flatMap(([id, records]) => records.map(record => ({ id, username: record.username, name: record.name || record.username })).filter(player => player.id !== state.user.id)); renderFriends(); renderOnlinePlayers(); }).subscribe(async status => { if (status === 'SUBSCRIBED') await presence.track({ username: state.username, name: state.name, online_at: new Date().toISOString() }); }); }
  }
  function showIncomingInvite(invite) { showModal(`<div class="eyebrow muted">GAME INVITATION</div><h2 id="modal-title">A ${escapeHtml(invite.game)} challenge!</h2><p>Someone saved you a seat at the board. Fancy a match?</p><button class="button primary full" id="accept-invite">Accept the challenge →</button><button class="button secondary full" id="decline-invite">Maybe next round</button>`); $('#accept-invite').addEventListener('click', async () => { if (invite.game === 'monopoly') { const { data, error } = await state.supabase.rpc('join_monopoly_room', { p_code: invite.room_code || '', p_name: state.name }); if (error) return toast(error.message); const { error: acceptError } = await state.supabase.from('invitations').update({ status: 'accepted' }).eq('id', invite.id); if (acceptError) return toast(acceptError.message); await connectMonopolyRoom(data); toast('Seat claimed. Time to wheel and deal!'); return; } if (invite.game === 'pool') { const { error } = await state.supabase.from('invitations').update({ status: 'accepted' }).eq('id', invite.id); if (error) return toast(error.message); closeModal(); await window.ArcadePoolUI?.joinByCode(invite.room_code || ''); return; } const { error } = await state.supabase.from('invitations').update({ status: 'accepted' }).eq('id', invite.id); if (error) return toast(error.message); closeModal(); toast('Challenge accepted. See you at the board!'); }); $('#decline-invite').addEventListener('click', async () => { await state.supabase.from('invitations').update({ status: 'declined' }).eq('id', invite.id); closeModal(); }); }
  $('#auth-button').addEventListener('click', () => { if (!state.supabase) return toast('Add your Supabase project keys in config.js first.'); showAuth(); });
  function showAuth(showGuestOption = false) { showModal(`<div class="eyebrow muted">YOUR ARCADE ACCOUNT</div><h2 id="modal-title">Welcome to the arcade</h2><p id="auth-intro">Sign in to save your profile and play with friends.</p><label id="auth-username-label" class="hidden">USERNAME<input id="auth-username" maxlength="24" autocomplete="username" placeholder="letters, numbers, underscores"></label><label>EMAIL<input id="auth-email" type="email" autocomplete="email" placeholder="you@example.com"></label><label>PASSWORD<input id="auth-password" type="password" autocomplete="current-password" placeholder="At least 6 characters"></label><button class="button primary full" id="auth-submit">Sign in</button><p class="auth-feedback" id="auth-feedback" role="status" aria-live="polite"></p><span class="inline-link" id="auth-toggle">New here? Create an account</span>${showGuestOption ? '<button class="button secondary full guest-continue" id="continue-guest">Continue as guest</button>' : ''}`); let signup = false; $('#auth-toggle').addEventListener('click', () => { signup = !signup; $('#modal-title').textContent = signup ? 'Join the arcade' : 'Welcome back'; $('#auth-intro').textContent = signup ? 'Create an account and save your place at the table.' : 'Sign in to save your profile and play with friends.'; $('#auth-username-label').classList.toggle('hidden', !signup); $('#auth-submit').textContent = signup ? 'Create account' : 'Sign in'; $('#auth-toggle').textContent = signup ? 'Already have an account? Sign in' : 'New here? Create an account'; $('#auth-feedback').textContent = ''; }); $('#continue-guest')?.addEventListener('click', () => { closeModal(); toast('Playing as a guest. Have a good game!'); }); $('#auth-submit').addEventListener('click', async () => { const email = $('#auth-email').value.trim(), password = $('#auth-password').value, button = $('#auth-submit'), feedback = $('#auth-feedback'); const signupName = signup ? ($('#auth-username')?.value || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24) : ''; if (!email || password.length < 6 || (signup && signupName.length < 3)) { feedback.textContent = signup && signupName.length < 3 ? 'Choose a username with 3 to 24 letters, numbers, or underscores.' : 'Enter your email and a password with at least 6 characters.'; return; } if (!state.supabase) { feedback.textContent = 'Account access is offline. Continue as a guest or check the message above.'; return; } button.disabled = true; button.textContent = signup ? 'Creating account…' : 'Signing in…'; feedback.textContent = ''; try { const result = signup ? await state.supabase.auth.signUp({ email, password, options: { data: { display_name: state.name, username: signupName } } }) : await state.supabase.auth.signInWithPassword({ email, password }); if (result.error) throw result.error; if (signup && !result.data.session) { feedback.textContent = 'Account created. Check your inbox for a confirmation link, then sign in.'; $('#auth-password').value = ''; button.textContent = 'Create account'; return; } state.user = result.data.user; if (signup && state.user) { const { error: profileError } = await state.supabase.from('profiles').upsert({ id: state.user.id, username: signupName, display_name: state.name, updated_at: new Date().toISOString() }); if (profileError) throw profileError; state.username = signupName; localStorage.setItem('arcade.username', signupName); syncProfile(); } updateAuthButton(); if (state.user) loadSocial(); closeModal(); toast(signup ? 'You’re in. Welcome to the arcade!' : 'Signed in. Good to have you back!'); } catch (error) { console.warn('Supabase authentication request failed', error); feedback.textContent = error.message || 'Supabase could not complete that request. Try again in a moment.'; } finally { button.disabled = false; if ($('#auth-submit')) $('#auth-submit').textContent = signup ? 'Create account' : 'Sign in'; } }); }
  $('#sign-out').addEventListener('click', async () => { await state.supabase.auth.signOut(); state.user = null; state.friends = []; state.requests = []; state.sentRequests = []; renderFriends(); renderRequests(); updateAuthButton(); toast('Signed out.'); });
  async function boot() { renderFriends(); renderRequests(); updateAuthButton(); try { await connectSupabase(); } catch (error) { const message = error.message || 'Unable to connect to Supabase.'; console.warn('Supabase startup issue:', message); showAppNotice(`${message} You can continue as a guest; sign-in and sign-up may be unavailable.`); } if (!state.user) showAuth(true); if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(error => console.warn('Service worker unavailable:', error)); }
  window.ArcadeRuntime = { get supabase() { return state.supabase; }, get user() { return state.user; }, get name() { return state.name; }, openAuth() { showAuth(); } };
  window.arcadeReady = false;
  boot().finally(() => { window.arcadeReady = true; });
})();


