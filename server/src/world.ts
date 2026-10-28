const TILE = 16;
const CHUNK_TILES = 32;
const CHUNK_SIZE = TILE * CHUNK_TILES;

export const NODE_HP: Record<string, number> = {
  tree: 4, rock: 6, iron: 9, crystal: 12, bush: 2, cave: 1, ruin: 1,
};

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 974711);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function noise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const smooth = (n: number) => n * n * (3 - 2 * n);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function baseBiomeAt(tx: number, ty: number, seed: number): number {
  if (tx >= -4 && tx <= 4 && ty >= -4 && ty <= 4) return 2;
  const elevation = noise(tx * 0.045, ty * 0.045, seed) * 0.55
    + noise(tx * 0.1, ty * 0.1, seed + 7) * 0.3
    + noise(tx * 0.24, ty * 0.24, seed + 13) * 0.15;
  if (elevation < 0.30) return 0;
  if (elevation < 0.345) return 5;
  if (elevation < 0.375) return 1;
  if (elevation > 0.70) return 4;
  const moist = noise(tx * 0.05 + 100, ty * 0.05, seed + 31);
  return moist > 0.55 ? 3 : 2;
}

type Island = { tx: number; ty: number; rx: number; ry: number; variant: number };
const INTRO_ISLANDS: Island[] = [
  { tx: 158, ty: 26, rx: 14, ry: 11, variant: 1 },
  { tx: 151, ty: 106, rx: 14, ry: 12, variant: 2 },
];
function tutorialIsland(): Island { return { tx: 82, ty: 20, rx: 14, ry: 11, variant: 0 }; }
function islandSpec(gx: number, gy: number, seed: number): Island | null {
  if ((gx === 0 && gy === 0) || hash2(gx, gy, seed + 850) >= 0.56) return null;
  return {
    tx: gx * 240 + 65 + Math.floor(hash2(gx, gy, seed + 851) * 105),
    ty: gy * 240 + 65 + Math.floor(hash2(gx, gy, seed + 852) * 105),
    rx: 12 + Math.floor(hash2(gx, gy, seed + 853) * 10),
    ry: 11 + Math.floor(hash2(gx, gy, seed + 854) * 9),
    variant: Math.floor(hash2(gx, gy, seed + 855) * 3),
  };
}
function ellipse(x: number, y: number, island: Island) {
  return ((x - island.tx) / island.rx) ** 2 + ((y - island.ty) / island.ry) ** 2;
}
function biomeAt(tx: number, ty: number, seed: number): number {
  if (Math.hypot(tx - 16, ty - 16) < 27) return 2;
  if (tx >= 32 && tx <= 46 && ty >= 16 && ty <= 23) return tx >= 44 ? 1 : 2;
  const tutorial = tutorialIsland();
  const old = islandSpec(Math.floor(tx / 240), Math.floor(ty / 240), seed);
  const classic = [tutorial, ...(old ? [old] : [])];
  for (const island of classic) {
    const land = ellipse(tx, ty, island), ocean = ((tx - island.tx) / (island.rx + 27)) ** 2 + ((ty - island.ty) / (island.ry + 24)) ** 2;
    if (island === tutorial && land < 1) return land < 0.68 ? 2 : 1;
    if (land < 0.68) return island.variant === 1 && land > 0.2 ? 4 : island.variant === 2 && land > 0.25 ? 3 : 2;
    if (land < 1) return 1;
    if (land < 1.23) return 5;
    if (ocean < 0.88) return 0;
    if (ocean < 1) return 5;
  }
  for (const island of INTRO_ISLANDS) {
    const land = ellipse(tx, ty, island), ocean = ((tx - island.tx) / (island.rx + 26)) ** 2 + ((ty - island.ty) / (island.ry + 24)) ** 2;
    if (land < 0.68) return island.variant === 1 && land > 0.2 ? 4 : island.variant === 2 && land > 0.25 ? 3 : 2;
    if (land < 1) return 1;
    if (land < 1.23) return 5;
    if (ocean < 0.88) return 0;
    if (ocean < 1) return 5;
  }
  return baseBiomeAt(tx, ty, seed);
}

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chunkRng(cx: number, cy: number, seed: number, salt: number) {
  return mulberry32((Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ Math.imul(seed, 83492791) ^ salt) >>> 0);
}

export type WorldNode = { id: string; kind: string; x: number; y: number; hp: number };

const nodeCache = new Map<string, WorldNode[]>();

function nodesForChunk(cx: number, cy: number, seed: number): WorldNode[] {
  const key = `${seed}:${cx},${cy}`;
  const cached = nodeCache.get(key);
  if (cached) return cached;
  const raw: WorldNode[] = [];
  for (let ty = 0; ty < CHUNK_TILES; ty++) for (let tx = 0; tx < CHUNK_TILES; tx++) {
    const wx = cx * CHUNK_TILES + tx, wy = cy * CHUNK_TILES + ty;
    const biome = biomeAt(wx, wy, seed);
    if (cx === 0 && cy === 0 && tx >= 13 && tx <= 19 && ty >= 13 && ty <= 19) continue;
    const roll = hash2(wx, wy, seed + 101);
    let kind = "";
    if (biome === 3) { if (roll < 0.10) kind = "tree"; else if (roll < 0.125) kind = "bush"; }
    else if (biome === 2) {
      if (roll < 0.015) kind = "tree"; else if (roll < 0.045) kind = "bush"; else if (roll < 0.047) kind = "crystal";
    } else if (biome === 4) {
      if (roll < 0.055) kind = "rock"; else if (roll < 0.085) kind = "iron";
      else if (roll < 0.090) kind = "crystal"; else if (roll < 0.097) kind = "cave";
    }
    if (!kind) continue;
    const ox = (hash2(wx, wy, seed + 113) - 0.5) * 10;
    const oy = (hash2(wx, wy, seed + 127) - 0.5) * 10;
    raw.push({ id: `${cx},${cy}:${raw.length}`, kind, x: wx * TILE + 8 + ox, y: wy * TILE + 8 + oy, hp: NODE_HP[kind] });
  }
  if (hash2(cx, cy, seed + 701) < 0.12 && !(cx === 0 && cy === 0)) {
    const rng = chunkRng(cx, cy, seed, 702);
    let rx = 0, ry = 0, ok = false;
    for (let a = 0; a < 8 && !ok; a++) {
      rx = (cx * CHUNK_TILES + Math.floor(rng() * CHUNK_TILES)) * TILE + 8;
      ry = (cy * CHUNK_TILES + Math.floor(rng() * CHUNK_TILES)) * TILE + 8;
      if (biomeAt(Math.floor(rx / TILE), Math.floor(ry / TILE), seed) !== 0) ok = true;
    }
    if (ok) raw.push({ id: `${cx},${cy}:${raw.length}`, kind: "ruin", x: rx, y: ry, hp: 1 });
  }
  const caves = raw.filter(node => node.kind === "cave");
  const finalNodes = raw.filter(node => node.kind === "cave" || !caves.some(cave => {
    const dx = node.x - cave.x, dy = node.y - cave.y;
    return dx * dx + dy * dy < 52 * 52;
  })).filter(node => {
    const tx = node.x / TILE, ty = node.y / TILE;
    const gx = Math.floor(tx / 240), gy = Math.floor(ty / 240);
    const classic = [tutorialIsland(), islandSpec(gx, gy, seed)].filter((island): island is Island => !!island);
    for (const island of [...classic, ...INTRO_ISLANDS]) if (ellipse(tx, ty, island) < 0.82) return false;
    return true;
  });

  // Echo Isles adds fixed camp resources and puzzle runestones after the base
  // chunk generator, so their IDs must match the browser's chunk cache.
  if (cx === 0 && cy === 0) {
    for (let j = 0; j < 7; j++) finalNodes.push({ id: `${cx},${cy}:${8000 + j}`, kind: "tree", x: (26 + j * 2) * TILE, y: (j % 2 ? 12 : 26) * TILE, hp: NODE_HP.tree });
    for (let j = 0; j < 4; j++) finalNodes.push({ id: `${cx},${cy}:${8100 + j}`, kind: "rock", x: (22 + j * 2) * TILE, y: 31 * TILE, hp: NODE_HP.rock });
  }
  const gx = Math.floor((cx * CHUNK_TILES + CHUNK_TILES / 2) / 240), gy = Math.floor((cy * CHUNK_TILES + CHUNK_TILES / 2) / 240);
  const islands = [tutorialIsland(), islandSpec(gx, gy, seed), ...INTRO_ISLANDS].filter((island): island is Island => !!island);
  for (const island of islands) {
    const points = [{ x: (island.tx + 0.5) * TILE, y: (island.ty + 0.5) * TILE }, ...[-2.3, -0.2, 1.8].map(angle => ({ x: (island.tx + Math.cos(angle) * island.rx * 0.57 + 0.5) * TILE, y: (island.ty + Math.sin(angle) * island.ry * 0.57 + 0.5) * TILE }))];
    for (const [j, point] of points.entries()) if (Math.floor(point.x / CHUNK_SIZE) === cx && Math.floor(point.y / CHUNK_SIZE) === cy) {
      const idx = 9000 + j;
      if (!finalNodes.some(node => node.id === `${cx},${cy}:${idx}`)) finalNodes.push({ id: `${cx},${cy}:${idx}`, kind: "ruin", x: point.x, y: point.y, hp: 1 });
    }
  }
  nodeCache.set(key, finalNodes);
  if (nodeCache.size > 512) nodeCache.delete(nodeCache.keys().next().value!);
  return finalNodes;
}

export function findWorldNode(seed: number, id: string): WorldNode | null {
  const match = /^(-?\d+),(-?\d+):(\d{1,4})$/.exec(id);
  if (!match) return null;
  const cx = Number(match[1]), cy = Number(match[2]), idx = Number(match[3]);
  if (!Number.isSafeInteger(cx) || !Number.isSafeInteger(cy) || Math.abs(cx) > 1_000_000 || Math.abs(cy) > 1_000_000) return null;
  return nodesForChunk(cx, cy, seed).find(node => node.id === `${cx},${cy}:${idx}`) ?? null;
}

export function positionBlocked(seed: number, x: number, y: number, fromX: number, fromY: number, deadNodes?: Set<string>): boolean {
  const tx = Math.floor(x / TILE), ty = Math.floor((y + 4) / TILE);
  const tileBiome = (ix: number, iy: number) => biomeAt(ix, iy, seed);
  if (tileBiome(Math.floor((x - 4) / TILE), Math.floor((y + 5) / TILE)) === 0) return true;
  if (tileBiome(Math.floor((x + 4) / TILE), Math.floor((y + 5) / TILE)) === 0) return true;
  if (tileBiome(Math.floor(x / TILE), Math.floor((y + 6) / TILE)) === 0) return true;
  const minCx = Math.floor(x / CHUNK_SIZE) - 1, maxCx = Math.floor(x / CHUNK_SIZE) + 1;
  const minCy = Math.floor(y / CHUNK_SIZE) - 1, maxCy = Math.floor(y / CHUNK_SIZE) + 1;
  for (let cy = minCy; cy <= maxCy; cy++) for (let cx = minCx; cx <= maxCx; cx++) {
    for (const node of nodesForChunk(cx, cy, seed)) {
      if (deadNodes?.has(node.id)) continue;
      const r2 = node.kind === "tree" ? 42 : node.kind === "cave" ? 144 : 100;
      const dx = x - node.x, dy = y - node.y;
      if (dx * dx + dy * dy >= r2) continue;
      const cdx = fromX - node.x, cdy = fromY - node.y;
      if (cdx * cdx + cdy * cdy < r2) continue;
      return true;
    }
  }
  return false;
}

export const WORLD_CHUNK_SIZE = CHUNK_SIZE;
