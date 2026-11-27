// maps.mjs: the benchmark's worlds as plain cell maps (spatial-eval, 2026-11-27).
// Four worlds: the village generator at seed 23, hearthvale and millbrook-farm
// (scenarios/, through procgen's applyToScenario, as the game builds them), and
// riverford, drawn here (a river, a bridge, an inn, a shrine with a grove).
// Each map: { id, title, W, H, rows: [...one glyph a cell], places: [{ id, kind,
// rect: [x0, y0, x1, y1] (inclusive), outer, door, building }], hidden: {...} }.
// Coordinates: x = column from the west edge (0), y = row from the north edge (0).
// The game's board cell is x_board = floor((W-1)/2) - x, z_board = y - floor((H-1)/2).
//   node tools/spatial-eval/maps.mjs [outdir]   (writes <id>.json and prints the grids)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const P = require('../../app/procgen.js');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

export const LEGEND = {
  '.': 'open ground (grass)', ':': 'road or dirt path', '=': 'paved square', '#': 'building wall', '+': 'door',
  'o': 'inside a building (floor, furniture)', 'H': 'closed building (solid)', '~': 'water', 'B': 'bridge',
  '%': 'tree', 'r': 'rock', 'f': 'fence', '*': 'crops / garden bed', 'x': 'small object (cart, well, woodpile, hay...)',
};

// game glyph -> benchmark class (outside buildings; building interiors are set from the places)
const CLASS = { ',': '.', ';': '.', ':': ':', 'U': '=', '#': '#', '+': '+', '~': '~', 'y': '~', '-': '~', '%': '%', 'r': 'r', 'f': 'f', 'g': '*', '*': '.', '^': '.', '=': '.', '_': '.' };
const TREES = /tree|pine|oak|birch|willow/;
const SOFT = /flower|heather|grass|fern|bush|light|bear_trap|tuft/;
// closed buildings: half the span (village HALF in procgen; the farm's P.building spans)
const HALF_VILLAGE = { inn: 4, barracks: 4, barn: 4, big_barn: 4, blacksmith: 3, open_barn: 3, stone_house: 3, tall_house: 3, fantasy_house: 3, mill_house: 2, sawmill: 2, small_barn: 2, gazebo: 1 };
const HALF_FARM = { barn: 2, big_barn: 2, silo_barn: 2, silo: 1, chicken_coop: 1, windmill: 2, stone_windmill: 2, open_barn: 2, small_barn: 2 };

function fromScenario(id, title, scn, half, opts = {}) {
  let out;
  if (scn.raw) { const v = P.village(scn.raw); out = { scenario: v, places: v.places }; }  // the generator itself, before applyToScenario
  else out = P.applyToScenario(scn);
  const sc = out.scenario;
  const [W, H] = sc.size, x0 = Math.floor((W - 1) / 2), z0 = Math.floor((H - 1) / 2);
  const toXY = (bx, bz) => [x0 - bx, bz + z0];
  const g = sc.grid.map(row => [...row].map(ch => CLASS[ch] ?? 'x'));
  while (g.length < H) g.push(Array(W).fill('.'));
  for (const row of g) while (row.length < W) row.push('.');
  const places = [];
  for (const p of out.places) {
    const [xa, ya] = toXY(p.x1, p.z0), [xb, yb] = toXY(p.x0, p.z1);
    const rect = [Math.min(xa, xb), Math.min(ya, yb), Math.max(xa, xb), Math.max(ya, yb)];
    const walled = g[rect[1] - 1]?.[rect[0]] === '#' || g[rect[1] - 1]?.[rect[0]] === '+';
    const pl = { id: p.id, kind: p.kind, rect };
    if (walled) {
      pl.building = true; pl.outer = [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1];
      for (let y = rect[1]; y <= rect[3]; y++) for (let x = rect[0]; x <= rect[2]; x++) g[y][x] = 'o';
      for (let y = pl.outer[1]; y <= pl.outer[3]; y++) for (let x = pl.outer[0]; x <= pl.outer[2]; x++) if (g[y][x] === '+') pl.door = [x, y];
    }
    places.push(pl);
  }
  let n = {};
  for (const o of sc.objects || []) {
    if (!Number.isFinite(+o.x) || o.x === '') continue;
    const [x, y] = toXY(Math.round(+o.x), Math.round(+o.z));
    if (!g[y] || g[y][x] === undefined) continue;
    if (half[o.type] != null) {
      const h = half[o.type];
      for (let yy = y - h; yy <= y + h; yy++) for (let xx = x - h; xx <= x + h; xx++) if (g[yy]?.[xx] !== undefined) g[yy][xx] = 'H';
      n[o.type] = (n[o.type] || 0) + 1;
      const name = (opts.names?.[o.type]) || o.type.replace(/_/g, ' ');
      const pid = places.some(p => p.id === name) ? `${name} ${n[o.type]}` : name;
      places.push({ id: pid, kind: 'closed building', rect: [x - h, y - h, x + h, y + h], closed: true });
    } else if (TREES.test(o.type)) { if (g[y][x] === '.') g[y][x] = '%'; }
    else if (o.type === 'fence_section') { if (g[y][x] === '.') g[y][x] = 'f'; }
    else if (!SOFT.test(o.type)) { if (g[y][x] === '.') g[y][x] = 'x'; }
  }
  return { id, title, W, H, rows: g.map(r => r.join('')), places };
}

// A village's four road arms as places (the generator's two roads, two cells wide, cross at the square).
function addRoads(map) {
  const sq = map.places.find(p => p.id === 'square'); if (!sq) return;
  const g = map.rows, roadRows = [], roadCols = [];
  for (let y = 0; y < map.H; y++) if ([...g[y]].filter(c => c === ':' || c === '=').length > map.W * 0.8) roadRows.push(y);
  for (let x = 0; x < map.W; x++) { let k = 0; for (let y = 0; y < map.H; y++) if (g[y][x] === ':' || g[y][x] === '=') k++; if (k > map.H * 0.8) roadCols.push(x); }
  const [ry0, ry1] = [Math.min(...roadRows), Math.max(...roadRows)], [rx0, rx1] = [Math.min(...roadCols), Math.max(...roadCols)];
  const [sx0, sy0, sx1, sy1] = sq.rect;
  map.places.push({ id: 'north road', kind: 'road', rect: [rx0, 0, rx1, sy0 - 1] }, { id: 'south road', kind: 'road', rect: [rx0, sy1 + 1, rx1, map.H - 1] },
    { id: 'west road', kind: 'road', rect: [0, ry0, sx0 - 1, ry1] }, { id: 'east road', kind: 'road', rect: [sx1 + 1, ry0, map.W - 1, ry1] });
}

function riverford() {
  const W = 33, H = 23, g = Array.from({ length: H }, () => Array(W).fill('.'));
  const set = (x, y, c) => { if (g[y]?.[x] !== undefined) g[y][x] = c; };
  const fill = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };
  // the river, three wide, bending a little east going south
  for (let y = 0; y < H; y++) { const c = y < 7 ? 14 : y < 16 ? 15 : 16; fill(c, y, c + 2, y, '~'); }
  // the east-west road (rows 11-12) and its bridge
  fill(0, 11, W - 1, 12, ':'); fill(15, 11, 17, 12, 'B');
  const places = [];
  const building = (id, kind, x0, y0, x1, y1, door) => { // outer walls x0..x1, y0..y1
    fill(x0, y0, x1, y1, '#'); fill(x0 + 1, y0 + 1, x1 - 1, y1 - 1, 'o'); set(door[0], door[1], '+');
    places.push({ id, kind, rect: [x0 + 1, y0 + 1, x1 - 1, y1 - 1], outer: [x0, y0, x1, y1], door, building: true });
  };
  building('inn', 'tavern', 3, 3, 9, 8, [6, 8]); fill(6, 9, 6, 10, ':');
  building('smithy', 'smithy', 3, 15, 8, 19, [5, 15]); fill(5, 13, 5, 14, ':');
  building('house', 'house', 9, 15, 12, 18, [10, 15]); fill(10, 13, 10, 14, ':');
  building('shrine', 'shrine', 27, 2, 31, 6, [29, 6]); fill(29, 7, 29, 10, ':');
  // the mill: a closed building on the east bank, north of the road
  fill(18, 4, 20, 6, 'H'); places.push({ id: 'mill', kind: 'closed building', rect: [18, 4, 20, 6], closed: true });
  // the field south-east of the bridge: crops in rows
  for (let y = 15; y <= 19; y++) for (let x = 21; x <= 28; x++) set(x, y, (y - 15) % 2 ? '.' : '*');
  places.push({ id: 'field', kind: 'field', rect: [21, 15, 28, 19] });
  // the grove by the shrine (not a named place: the "sacred grove" task) and other trees
  const grove = [[23, 2], [24, 2], [22, 3], [24, 3], [25, 3], [23, 4], [25, 4], [22, 5], [24, 5], [23, 6]];
  for (const [x, y] of grove) set(x, y, '%');
  for (const [x, y] of [[1, 20], [2, 20], [1, 21], [3, 21], [2, 19], [30, 19], [31, 20], [12, 1], [11, 2], [28, 21], [20, 21]]) set(x, y, '%');
  for (const [x, y] of [[13, 7], [19, 18], [2, 13]]) set(x, y, 'r');
  set(12, 9, 'x'); set(19, 9, 'x');
  places.push({ id: 'bridge', kind: 'bridge', rect: [15, 11, 17, 12] });
  places.push({ id: 'west road', kind: 'road', rect: [0, 11, 14, 12] }, { id: 'east road', kind: 'road', rect: [18, 11, W - 1, 12] });
  places.push({ id: 'river', kind: 'water', rect: [14, 0, 18, H - 1] });
  return { id: 'riverford', title: 'Riverford (drawn by hand)', W, H, rows: g.map(r => r.join('')), places, hidden: { grove } };
}

export function buildMaps() {
  const maps = [];
  // the village generator at seed 23 itself (applyToScenario turns a characterless world's
  // rooms into unnamed walk-in models, which would leave nothing to name)
  const v23 = fromScenario('village23', 'Village, seed 23', { raw: { seed: 23 } }, HALF_VILLAGE); addRoads(v23); maps.push(v23);
  const hv = fromScenario('hearthvale', 'Hearthvale', JSON.parse(fs.readFileSync(path.join(ROOT, 'scenarios/hearthvale.json'), 'utf8')), HALF_VILLAGE); addRoads(hv); maps.push(hv);
  const fm = fromScenario('farm', 'Millbrook farm', JSON.parse(fs.readFileSync(path.join(ROOT, 'scenarios/millbrook-farm.json'), 'utf8')), HALF_FARM, { names: { big_barn: 'barn building', barn: 'barn building' } });
  const lane = fm.rows.findIndex(r => [...r].every(c => c === ':' || c === '=')); if (lane >= 0) fm.places.push({ id: 'lane', kind: 'road', rect: [0, lane, fm.W - 1, lane] });
  maps.push(fm);
  maps.push(riverford());
  return maps;
}

// The map as text: a column header, each row with its number, the legend and the places.
export function mapText(m, { coords = true } = {}) {
  const pad = n => String(n).padStart(2, ' ');
  const lines = [];
  lines.push(`Map "${m.title}": ${m.W} columns (x = 0..${m.W - 1}, west to east) by ${m.H} rows (y = 0..${m.H - 1}, north to south). North is up.`);
  const tens = '   ' + Array.from({ length: m.W }, (_, x) => x >= 10 ? String(Math.floor(x / 10)) : ' ').join('');
  const ones = '   ' + Array.from({ length: m.W }, (_, x) => String(x % 10)).join('');
  lines.push('x: ' + tens.slice(3), '   ' + ones.slice(3));
  m.rows.forEach((r, y) => lines.push(pad(y) + ' ' + r));
  lines.push('', 'Legend: ' + Object.entries(LEGEND).filter(([k]) => m.rows.some(r => r.includes(k))).map(([k, v]) => `${k} ${v}`).join('; '));
  lines.push('', 'Places' + (coords ? ' (rectangles are inclusive [x0,y0]-[x1,y1]; a building\'s rectangle is its inside, its walls are one square further out):' : ':'));
  for (const p of m.places) lines.push(coords ? `- ${p.id} (${p.kind}): [${p.rect[0]},${p.rect[1]}]-[${p.rect[2]},${p.rect[3]}]${p.door ? `, door at [${p.door[0]},${p.door[1]}]` : ''}` : `- ${p.id} (${p.kind})`);
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] || path.join(ROOT, 'work/spatial-eval/maps');
  fs.mkdirSync(out, { recursive: true });
  for (const m of buildMaps()) { fs.writeFileSync(path.join(out, m.id + '.json'), JSON.stringify(m)); fs.writeFileSync(path.join(out, m.id + '.txt'), mapText(m)); console.log(mapText(m) + '\n'); }
}
