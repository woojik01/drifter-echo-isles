export const BASE_STATS: Record<string, Record<string, number>> = {
    pickaxe: { atk: 2 }, sword: { atk: 4 }, boots: { spd: 10 }, cloak: { spd: 5, regen: 2 }, amulet: { stam: 25 },
    charm: { luck: 6, range: 6 }, helmet: { vit: 8 }, shield: { vit: 5, stam: 10 }, gloves: { atk: 1, spd: 4 }, ring: { luck: 4, regen: 2 },
};
const WEIGHTS = [16, 13, 15, 13, 11, 11, 10, 10, 10, 8];
const OPT: Record<string, number[]> = { atk: [1, 3], spd: [3, 12], vit: [3, 10], stam: [5, 20], regen: [1, 4], range: [3, 10], luck: [2, 8] };
export type Gear = {
    base: string;
    opts: {
        k: string;
        v: number;
    }[];
    h1: number;
    h2: number;
    id: number;
    tier: number;
    power: number;
    origin: number;
    source: string;
    effect?: string;
};
export function stableSeed(input: string) { let h = 2166136261; for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return (h >>> 0) || 1; }
export function rngFor(input: string) { let a = stableSeed(input); return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function tierAt(x: number, y: number) { const d = Math.hypot(x - 256, y - 256) / 16; return d >= 2200 ? 4 : d >= 1200 ? 3 : d >= 600 ? 2 : d >= 200 ? 1 : 0; }
export function sanitizeGear(raw: any): Gear | null {
    if (!raw || typeof raw !== 'object' || !BASE_STATS[raw.base] || !Array.isArray(raw.opts) || raw.opts.length > 3)
        return null;
    const opts: {
        k: string;
        v: number;
    }[] = [];
    const seen = new Set<string>();
    for (const o of raw.opts) {
        if (!o || !OPT[o.k] || seen.has(o.k) || !Number.isFinite(o.v) || o.v < 0 || o.v > 40)
            return null;
        seen.add(o.k);
        opts.push({ k: o.k, v: o.v });
    }
    const tier = Math.max(0, Math.min(4, Math.trunc(Number(raw.tier) || 0)));
    const power = [1, 1.15, 1.35, 1.6, 1.9][tier];
    return { base: raw.base, opts, h1: Math.trunc(Number(raw.h1) || 0), h2: Math.trunc(Number(raw.h2) || 0), id: Math.trunc(Number(raw.id) || 0), tier, power, origin: Math.max(0, Math.min(100000, Number(raw.origin) || 0)), source: String(raw.source || 'field').slice(0, 24), ...(['wader', 'vein', 'guide', 'return', 'starfish', 'duskward', 'nightstep'].includes(raw.effect) ? { effect: raw.effect } : {}) };
}
export function gearStats(equip: (Gear | null)[], level = 1) {
    const s: Record<string, number> = { atk: 1, spd: 0, vit: 0, stam: 0, regen: 0, range: 0, luck: 0 };
    for (const eq of equip) {
        if (!eq)
            continue;
        for (const [k, v] of Object.entries(BASE_STATS[eq.base]))
            s[k] += ['atk', 'vit', 'stam'].includes(k) ? Math.max(1, Math.round(v * eq.power)) : v;
        for (const o of eq.opts)
            s[o.k] += o.v;
    }
    return { atk: Math.min(120, Math.round(s.atk)), range: Math.min(90, 46 + s.range), pickup: Math.min(88, 40 + s.range), maxHp: Math.min(1000, 30 + s.vit + (level - 1) * 4), speed: Math.min(140, 70 * (1 + s.spd / 100)), luck: Math.min(40, s.luck) };
}
export function makeGear(key: string, x: number, y: number, source = 'field', minOpts = 0, luck = 0, biome = 2): Gear {
    const rng = rngFor(key), tier = tierAt(x, y), power = [1, 1.15, 1.35, 1.6, 1.9][tier], bases = Object.keys(BASE_STATS);
    let roll = rng() * WEIGHTS.reduce((a, b) => a + b, 0), base = bases[0];
    for (let i = 0; i < bases.length; i++) {
        roll -= WEIGHTS[i];
        if (roll <= 0) {
            base = bases[i];
            break;
        }
    }
    const p3 = [.06, .10, .16, .24, .32][tier] + (source === 'world' ? 0 : .10 * luck / (luck + 20)), p2 = [.22, .27, .31, .34, .37][tier], p1 = [.32, .33, .31, .28, .23][tier];
    const r = rng(), n = Math.max(minOpts, r < p3 ? 3 : r < p3 + p2 ? 2 : r < p3 + p2 + p1 ? 1 : 0), pool = Object.keys(OPT), opts: {
        k: string;
        v: number;
    }[] = [];
    const pref = biome === 3 ? ['vit', 'regen'] : biome === 4 ? ['atk', 'range'] : biome === 0 || biome === 5 ? ['spd', 'stam'] : ['luck', 'vit'];
    for (let i = 0; i < Math.min(3, n); i++) {
        let k = '';
        if (rng() < .45) {
            const left = pref.filter(k => pool.includes(k));
            if (left.length)
                k = left[Math.floor(rng() * left.length)];
        }
        if (!k)
            k = pool[Math.floor(rng() * pool.length)];
        pool.splice(pool.indexOf(k), 1);
        const [a, b] = OPT[k];
        let v = a + Math.floor(rng() * (b - a + 1));
        if (['atk', 'vit', 'stam'].includes(k))
            v = Math.max(1, Math.round(v * power));
        opts.push({ k, v });
    }
    const gear: Gear = { base, opts, h1: Math.floor(rng() * 1e9), h2: Math.floor(rng() * 1e9), id: stableSeed(key), tier, power, origin: Math.round(Math.hypot(x - 256, y - 256) / 16), source };
    if (source === 'island' || (tier >= 1 && opts.length === 3 && rng() < .12 + tier * .025)) {
        const effects = ['wader', 'vein', 'guide', 'return', 'starfish'];
        gear.effect = effects[Math.floor(rng() * effects.length)];
    }
    return gear;
}
