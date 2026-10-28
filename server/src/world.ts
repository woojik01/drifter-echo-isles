const TILE = 16;
const CHUNK_TILES = 32;
const CHUNK_SIZE = TILE * CHUNK_TILES;
export const NODE_HP: Record<string, number> = {
    tree: 4, rock: 6, iron: 9, crystal: 12, bush: 2, cave: 1, ruin: 1,
};
export function hash2(x: number, y: number, seed: number): number {
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
    if (tx >= -4 && tx <= 4 && ty >= -4 && ty <= 4)
        return 2;
    const elevation = noise(tx * 0.045, ty * 0.045, seed) * 0.55
        + noise(tx * 0.1, ty * 0.1, seed + 7) * 0.3
        + noise(tx * 0.24, ty * 0.24, seed + 13) * 0.15;
    if (elevation < 0.30)
        return 0;
    if (elevation < 0.345)
        return 5;
    if (elevation < 0.375)
        return 1;
    if (elevation > 0.70)
        return 4;
    const moist = noise(tx * 0.05 + 100, ty * 0.05, seed + 31);
    return moist > 0.55 ? 3 : 2;
}
export type Island = {
    id: string;
    tx: number;
    ty: number;
    rx: number;
    ry: number;
    variant: number;
};
const INTRO_ISLANDS: Island[] = [
    { id: "isle:prism", tx: 158, ty: 26, rx: 14, ry: 11, variant: 1 },
    { id: "isle:wisp", tx: 151, ty: 106, rx: 14, ry: 12, variant: 2 },
];
function tutorialIsland(): Island { return { id: "isle:first", tx: 82, ty: 20, rx: 14, ry: 11, variant: 0 }; }
function islandSpec(gx: number, gy: number, seed: number): Island | null {
    if ((gx === 0 && gy === 0) || hash2(gx, gy, seed + 850) >= 0.56)
        return null;
    return {
        id: `isle:${gx},${gy}`, tx: gx * 240 + 65 + Math.floor(hash2(gx, gy, seed + 851) * 105),
        ty: gy * 240 + 65 + Math.floor(hash2(gx, gy, seed + 852) * 105),
        rx: 12 + Math.floor(hash2(gx, gy, seed + 853) * 10),
        ry: 11 + Math.floor(hash2(gx, gy, seed + 854) * 9),
        variant: Math.floor(hash2(gx, gy, seed + 855) * 3),
    };
}
function ellipse(x: number, y: number, island: Island) {
    return ((x - island.tx) / island.rx) ** 2 + ((y - island.ty) / island.ry) ** 2;
}
export function biomeAt(tx: number, ty: number, seed: number): number {
    for (const island of INTRO_ISLANDS) {
        const land = ellipse(tx, ty, island), ocean = ((tx - island.tx) / (island.rx + 26)) ** 2 + ((ty - island.ty) / (island.ry + 24)) ** 2;
        if (land < 0.68)
            return island.variant === 1 && land > 0.2 ? 4 : island.variant === 2 && land > 0.25 ? 3 : 2;
        if (land < 1)
            return 1;
        if (land < 1.23)
            return 5;
        if (ocean < 0.88)
            return 0;
        if (ocean < 1)
            return 5;
    }
    if (Math.hypot(tx - 16, ty - 16) < 27)
        return 2;
    if (tx >= 32 && tx <= 46 && ty >= 16 && ty <= 23)
        return tx >= 44 ? 1 : 2;
    const tutorial = tutorialIsland();
    const old = islandSpec(Math.floor(tx / 240), Math.floor(ty / 240), seed);
    const classic = [tutorial, ...(old ? [old] : [])];
    for (const island of classic) {
        const land = ellipse(tx, ty, island), ocean = ((tx - island.tx) / (island.rx + 27)) ** 2 + ((ty - island.ty) / (island.ry + 24)) ** 2;
        if (island === tutorial && land < 1)
            return land < 0.68 ? 2 : 1;
        if (land < 0.68)
            return island.variant === 1 && land > 0.2 ? 4 : island.variant === 2 && land > 0.25 ? 3 : 2;
        if (land < 1)
            return 1;
        if (land < 1.23)
            return 5;
        if (ocean < 0.88)
            return 0;
        if (ocean < 1)
            return 5;
    }
    return baseBiomeAt(tx, ty, seed);
}
function mulberry32(a: number) {
    return () => {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
export function chunkRng(cx: number, cy: number, seed: number, salt: number) {
    return mulberry32((Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ Math.imul(seed, 83492791) ^ salt) >>> 0);
}
export type WorldNode = {
    id: string;
    kind: string;
    x: number;
    y: number;
    hp: number;
    island?: Island;
    rune?: number;
};
const nodeCache = new Map<string, WorldNode[]>();
export function nodesForChunk(cx: number, cy: number, seed: number): WorldNode[] {
    const key = `${seed}:${cx},${cy}`;
    const cached = nodeCache.get(key);
    if (cached)
        return cached;
    const raw: WorldNode[] = [];
    for (let ty = 0; ty < CHUNK_TILES; ty++)
        for (let tx = 0; tx < CHUNK_TILES; tx++) {
            const wx = cx * CHUNK_TILES + tx, wy = cy * CHUNK_TILES + ty;
            const biome = biomeAt(wx, wy, seed);
            if (cx === 0 && cy === 0 && tx >= 13 && tx <= 19 && ty >= 13 && ty <= 19)
                continue;
            const roll = hash2(wx, wy, seed + 101);
            let kind = "";
            if (biome === 3) {
                if (roll < 0.10)
                    kind = "tree";
                else if (roll < 0.125)
                    kind = "bush";
            }
            else if (biome === 2) {
                if (roll < 0.015)
                    kind = "tree";
                else if (roll < 0.045)
                    kind = "bush";
                else if (roll < 0.047)
                    kind = "crystal";
            }
            else if (biome === 4) {
                if (roll < 0.055)
                    kind = "rock";
                else if (roll < 0.085)
                    kind = "iron";
                else if (roll < 0.090)
                    kind = "crystal";
                else if (roll < 0.097)
                    kind = "cave";
            }
            if (!kind)
                continue;
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
            if (biomeAt(Math.floor(rx / TILE), Math.floor(ry / TILE), seed) !== 0)
                ok = true;
        }
        if (ok)
            raw.push({ id: `${cx},${cy}:${raw.length}`, kind: "ruin", x: rx, y: ry, hp: 1 });
    }
    const caves = raw.filter(node => node.kind === "cave");
    const finalNodes = raw.filter(node => node.kind === "cave" || !caves.some(cave => {
        const dx = node.x - cave.x, dy = node.y - cave.y;
        return dx * dx + dy * dy < 52 * 52;
    })).filter(node => {
        const tx = node.x / TILE, ty = node.y / TILE;
        const gx = Math.floor(tx / 240), gy = Math.floor(ty / 240);
        const classic = [tutorialIsland(), islandSpec(gx, gy, seed)].filter((island): island is Island => !!island);
        for (const island of [...classic, ...INTRO_ISLANDS])
            if (ellipse(tx, ty, island) < 0.82)
                return false;
        return true;
    });
    // Echo Isles adds fixed camp resources and puzzle runestones after the base
    // chunk generator, so their IDs must match the browser's chunk cache.
    if (cx === 0 && cy === 0) {
        for (let j = 0; j < 7; j++)
            finalNodes.push({ id: `${cx},${cy}:${8000 + j}`, kind: "tree", x: (26 + j * 2) * TILE, y: (j % 2 ? 12 : 26) * TILE, hp: NODE_HP.tree });
        for (let j = 0; j < 4; j++)
            finalNodes.push({ id: `${cx},${cy}:${8100 + j}`, kind: "rock", x: (22 + j * 2) * TILE, y: 31 * TILE, hp: NODE_HP.rock });
    }
    const gx = Math.floor((cx * CHUNK_TILES + CHUNK_TILES / 2) / 240), gy = Math.floor((cy * CHUNK_TILES + CHUNK_TILES / 2) / 240);
    const islands = [tutorialIsland(), islandSpec(gx, gy, seed), ...INTRO_ISLANDS].filter((island): island is Island => !!island);
    for (const island of islands) {
        const points = [{ x: (island.tx + 0.5) * TILE, y: (island.ty + 0.5) * TILE }, ...[-2.3, -0.2, 1.8].map(angle => ({ x: (island.tx + Math.cos(angle) * island.rx * 0.57 + 0.5) * TILE, y: (island.ty + Math.sin(angle) * island.ry * 0.57 + 0.5) * TILE }))];
        for (const [j, point] of points.entries())
            if (Math.floor(point.x / CHUNK_SIZE) === cx && Math.floor(point.y / CHUNK_SIZE) === cy) {
                const idx = 9000 + j;
                if (!finalNodes.some(node => node.id === `${cx},${cy}:${idx}`))
                    finalNodes.push({ id: `${cx},${cy}:${idx}`, kind: "ruin", x: point.x, y: point.y, hp: 1, island, rune: j - 1 });
            }
    }
    nodeCache.set(key, finalNodes);
    if (nodeCache.size > 512)
        nodeCache.delete(nodeCache.keys().next().value!);
    return finalNodes;
}
export function findWorldNode(seed: number, id: string): WorldNode | null {
    const match = /^(-?\d+),(-?\d+):(\d{1,4})$/.exec(id);
    if (!match)
        return null;
    const cx = Number(match[1]), cy = Number(match[2]), idx = Number(match[3]);
    if (!Number.isSafeInteger(cx) || !Number.isSafeInteger(cy) || Math.abs(cx) > 1000000 || Math.abs(cy) > 1000000)
        return null;
    return nodesForChunk(cx, cy, seed).find(node => node.id === `${cx},${cy}:${idx}`) ?? null;
}
export function positionBlocked(seed: number, x: number, y: number, fromX: number, fromY: number, deadNodes?: Set<string>): boolean {
    const tx = Math.floor(x / TILE), ty = Math.floor((y + 4) / TILE);
    const tileBiome = (ix: number, iy: number) => biomeAt(ix, iy, seed);
    if (tileBiome(Math.floor((x - 4) / TILE), Math.floor((y + 5) / TILE)) === 0)
        return true;
    if (tileBiome(Math.floor((x + 4) / TILE), Math.floor((y + 5) / TILE)) === 0)
        return true;
    if (tileBiome(Math.floor(x / TILE), Math.floor((y + 6) / TILE)) === 0)
        return true;
    const minCx = Math.floor((x - 16) / CHUNK_SIZE), maxCx = Math.floor((x + 16) / CHUNK_SIZE);
    const minCy = Math.floor((y - 16) / CHUNK_SIZE), maxCy = Math.floor((y + 16) / CHUNK_SIZE);
    for (let cy = minCy; cy <= maxCy; cy++)
        for (let cx = minCx; cx <= maxCx; cx++) {
            for (const node of nodesForChunk(cx, cy, seed)) {
                if (deadNodes?.has(node.id))
                    continue;
                const r2 = node.kind === "tree" ? 42 : node.kind === "cave" ? 144 : 100;
                const dx = x - node.x, dy = y - node.y;
                if (dx * dx + dy * dy >= r2)
                    continue;
                const cdx = fromX - node.x, cdy = fromY - node.y;
                if (cdx * cdx + cdy * cdy < r2)
                    continue;
                return true;
            }
        }
    return false;
}
export const WORLD_CHUNK_SIZE = CHUNK_SIZE;
export function islandAt(x: number, y: number, seed: number): Island | null {
    const tx = x / 16, ty = y / 16;
    for (const i of [...INTRO_ISLANDS, tutorialIsland(), islandSpec(Math.floor(tx / 240), Math.floor(ty / 240), seed)])
        if (i && ellipse(tx, ty, i) < 1)
            return i;
    return null;
}
export function findIsland(id: string, seed: number): Island | null {
    const fixed = [tutorialIsland(), ...INTRO_ISLANDS].find(i => i.id === id);
    if (fixed)
        return fixed;
    const m = /^isle:(-?\d+),(-?\d+)$/.exec(id);
    return m ? islandSpec(Number(m[1]), Number(m[2]), seed) : null;
}
export const ENEMIES: Record<string, {
    hp: number;
    dmg: number;
    speed: number;
    aggro: number;
    size: number;
    xp: number;
    res: string;
    chance: number;
    max: number;
}> = {
    slime: { hp: 6, dmg: 3, speed: 26, aggro: 70, size: 9, xp: 4, res: 'jelly', chance: .9, max: 2 }, wolf: { hp: 10, dmg: 6, speed: 72, aggro: 150, size: 11, xp: 7, res: 'fang', chance: .9, max: 2 },
    golem: { hp: 20, dmg: 10, speed: 26, aggro: 100, size: 14, xp: 12, res: 'core', chance: 1, max: 1 }, spider: { hp: 8, dmg: 5, speed: 60, aggro: 120, size: 10, xp: 6, res: 'fang', chance: .7, max: 1 }, bat: { hp: 4, dmg: 4, speed: 85, aggro: 130, size: 8, xp: 3, res: 'jelly', chance: .5, max: 1 },
    darkling: { hp: 12, dmg: 6, speed: 44, aggro: 420, size: 10, xp: 14, res: 'gloom', chance: 1, max: 1 },
    gloomfang: { hp: 36, dmg: 18, speed: 105, aggro: 520, size: 12, xp: 32, res: 'nightFang', chance: 1, max: 1 },
    ashbrute: { hp: 100, dmg: 28, speed: 36, aggro: 620, size: 16, xp: 80, res: 'nightCore', chance: 1, max: 1 }
};
export type WorldEnemy = {
    id: string;
    kind: string;
    x: number;
    y: number;
    hp: number;
    tier: number;
    elite: boolean;
    homeX: number;
    homeY: number;
};
export function enemiesForChunk(cx: number, cy: number, seed: number): WorldEnemy[] {
    const er = hash2(cx, cy, seed + 401), count = cx === 0 && cy === 0 ? 0 : er < .25 ? 1 : er < .33 ? 2 : 0, center = biomeAt(cx * 32 + 16, cy * 32 + 16, seed), out: WorldEnemy[] = [];
    let index = 0;
    for (let i = 0; i < count; i++) {
        const r = chunkRng(cx, cy, seed, 402 + i), k = r();
        let kind = 'slime';
        if (center === 4)
            kind = k < .4 ? 'golem' : k < .7 ? 'bat' : 'wolf';
        else if (center === 3)
            kind = k < .4 ? 'wolf' : k < .7 ? 'spider' : 'slime';
        else if (center === 2)
            kind = k < .85 ? 'slime' : 'spider';
        const x = (cx * 32 + Math.floor(r() * 32)) * 16 + 8, y = (cy * 32 + Math.floor(r() * 32)) * 16 + 8;
        if (biomeAt(Math.floor(x / 16), Math.floor(y / 16), seed) === 0)
            continue;
        const n = index++, d = Math.hypot(x - 256, y - 256) / 16, tier = d >= 2200 ? 4 : d >= 1200 ? 3 : d >= 600 ? 2 : d >= 200 ? 1 : 0, elite = tier >= 2 && hash2(cx * 11 + n, cy, seed + 899) < .12;
        if (!islandAt(x, y, seed))
            out.push({ id: `${cx},${cy}:${n}`, kind, x, y, hp: Math.round(ENEMIES[kind].hp * (1 + .2 * tier) * (elite ? 1.4 : 1)), tier, elite, homeX: x, homeY: y });
    }
    return out;
}
export function worldLootForChunk(cx: number, cy: number, seed: number): {
    id: string;
    x: number;
    y: number;
} | null {
    if (hash2(cx, cy, seed + 301) >= .13)
        return null;
    const r = chunkRng(cx, cy, seed, 555), idx = Math.floor(r() * 999);
    let x = cx * 512 + 256, y = cy * 512 + 256, found = false;
    for (let a = 0; a < 8; a++) {
        x = (cx * 32 + Math.floor(r() * 32)) * 16 + 8;
        y = (cy * 32 + Math.floor(r() * 32)) * 16 + 8;
        if (biomeAt(Math.floor(x / 16), Math.floor(y / 16), seed) !== 0 && !islandAt(x, y, seed)) {
            found = true;
            break;
        }
    }
    if (!found) {
        x = cx * 512 + 256;
        y = cy * 512 + 256;
    }
    return { id: `world:${seed}:${cx},${cy}:${idx}`, x, y };
}
export function npcForChunk(cx: number, cy: number, seed: number): {
    id: string;
    x: number;
    y: number;
    persona: string;
} | null {
    if ((cx === 0 && cy === 0) || hash2(cx, cy, seed + 501) >= .17)
        return null;
    const r = chunkRng(cx, cy, seed, 502), persona = r() < .32 ? 'trader' : 'wanderer';
    let x = 0, y = 0, ok = false;
    for (let a = 0; a < 6 && !ok; a++) {
        x = (cx * 32 + Math.floor(r() * 32)) * 16 + 8;
        y = (cy * 32 + Math.floor(r() * 32)) * 16 + 8;
        if (biomeAt(Math.floor(x / 16), Math.floor(y / 16), seed) !== 0)
            ok = true;
    }
    return ok && !islandAt(x, y, seed) ? { id: `${cx},${cy}:n`, x, y, persona } : null;
}
