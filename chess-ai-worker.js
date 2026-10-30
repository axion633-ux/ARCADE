importScripts('https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js');

const values = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 0 };
const pst = {
  p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
  n: [-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,5,5,0,-20,-40,-30,5,10,15,15,10,5,-30,-30,0,15,20,20,15,0,-30,-30,5,15,20,20,15,5,-30,-30,0,10,15,15,10,0,-30,-40,-20,0,0,0,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
  b: [-20,-10,-10,-10,-10,-10,-10,-20,-10,5,0,0,0,0,5,-10,-10,10,10,10,10,10,10,-10,-10,0,10,10,10,10,0,-10,-10,5,5,10,10,5,5,-10,-10,0,5,10,10,5,0,-10,-10,0,0,0,0,0,0,-10,-20,-10,-10,-10,-10,-10,-10,-20],
  r: [0,0,0,5,5,0,0,0,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,5,10,10,10,10,10,10,5,0,0,0,5,5,0,0,0,0,0,0,5,5,0,0,0]
};
const center = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, g: 6, h: 7 };
function evaluate(game) {
  let score = 0;
  const board = game.board();
  const moveNumber = game.history().length;
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const piece = board[row][col]; if (!piece) continue;
    const type = piece.type, sign = piece.color === 'w' ? 1 : -1;
    const square = piece.color === 'w' ? row * 8 + col : (7 - row) * 8 + col;
    let positional = pst[type] ? pst[type][square] : 0;
    if (type === 'k' && moveNumber < 28) positional = -Math.abs(3.5 - col) * 7;
    if (type === 'k' && moveNumber >= 28) positional = (3.5 - Math.abs(3.5 - col)) * 12;
    if (type === 'p') positional += (piece.color === 'w' ? 6 - row : row - 1) * 7;
    score += sign * (values[type] + positional);
  }
  if (game.in_check()) score += game.turn() === 'w' ? -24 : 24;
  return score;
}
function ordered(game) {
  return game.moves({ verbose: true }).sort((a, b) => {
    const rank = m => (m.captured ? 10000 + values[m.captured] * 10 - values[m.piece] : 0) + (m.promotion ? 8000 + values[m.promotion] : 0) + (m.san.includes('+') ? 4000 : 0) + (m.san.includes('#') ? 10000 : 0) + ((m.piece === 'n' || m.piece === 'b') ? 25 : 0) + (3.5 - Math.abs(3.5 - 'abcdefgh'.indexOf(m.to[0]))) * 4;
    return rank(b) - rank(a);
  });
}
let nodesVisited = 0;
let nodeLimit = 0;
let searchAborted = false;
function search(game, depth, alpha, beta, maximizing, ply) {
  if (searchAborted) return evaluate(game);
  nodesVisited++;
  if (nodesVisited > nodeLimit) { searchAborted = true; return evaluate(game); }
  if (depth === 0 || game.game_over()) {
    if (game.in_checkmate()) return maximizing ? -100000 + ply : 100000 - ply;
    return evaluate(game);
  }
  const moves = ordered(game);
  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) { game.move(move); best = Math.max(best, search(game, depth - 1, alpha, beta, false, ply + 1)); game.undo(); if (searchAborted) break; alpha = Math.max(alpha, best); if (beta <= alpha) break; }
    return best;
  }
  let best = Infinity;
  for (const move of moves) { game.move(move); best = Math.min(best, search(game, depth - 1, alpha, beta, true, ply + 1)); game.undo(); if (searchAborted) break; beta = Math.min(beta, best); if (beta <= alpha) break; }
  return best;
}
onmessage = ({ data }) => {
  const game = new Chess(data.fen);
  if (game.game_over()) return postMessage({ move: null });
  const depth = Math.max(1, Math.min(4, Number(data.depth) || 1));
  const candidates = ordered(game);
  const maximizing = data.color !== 'b';
  nodesVisited = 0;
  nodeLimit = depth === 4 ? 14000 : depth === 3 ? 80000 : 50000;
  searchAborted = false;
  let scored = [];
  let completedDepth = 0;
  for (let currentDepth = 1; currentDepth <= depth; currentDepth++) {
    searchAborted = false;
    const preferred = scored[0]?.move;
    const candidatesAtDepth = candidates.slice().sort((a, b) => Number(b.from === preferred?.from && b.to === preferred?.to) - Number(a.from === preferred?.from && a.to === preferred?.to));
    let alpha = -Infinity, beta = Infinity;
    const iteration = [];
    for (const move of candidatesAtDepth) {
      game.move(move);
      const score = search(game, currentDepth - 1, alpha, beta, !maximizing, 1);
      game.undo();
      if (searchAborted) break;
      iteration.push({ move, score });
      if (maximizing) alpha = Math.max(alpha, score);
      else beta = Math.min(beta, score);
    }
    if (searchAborted) break;
    iteration.sort((a, b) => maximizing ? b.score - a.score : a.score - b.score);
    scored = iteration;
    completedDepth = currentDepth;
  }
  scored.sort((a, b) => data.color === 'b' ? a.score - b.score : b.score - a.score);
  const randomness = Number(data.randomness) || 0;
  const pool = scored.slice(0, Math.max(1, Math.ceil(scored.length * randomness)));
  const chosen = randomness ? pool[Math.floor(Math.random() * pool.length)] : scored[0];
  postMessage({ move: { from: chosen.move.from, to: chosen.move.to, promotion: chosen.move.promotion || 'q' }, score: chosen.score, depth: completedDepth, nodes: nodesVisited });
};
