import { timingSafeEqual } from "node:crypto";
import { getHeapStatistics } from "node:v8";
function memoryMetrics() {
    let rss: number | null = null;
    try { rss = process.memoryUsage().rss; } catch { /* Sandboxed hosts may deny /proc reads. */ }
    return { processRssBytes: rss, processPeakRssBytes: process.resourceUsage().maxRSS * 1024, processHeapBytes: getHeapStatistics().used_heap_size };
}
import { Client, Room } from "colyseus";
import { DrifterRoomState, PlayerState, SharedEntity, SharedLoot, SharedNode } from "./schema.js";
import { findWorldNode, nodesForChunk, positionBlocked, biomeAt, enemiesForChunk, worldLootForChunk, ENEMIES, findIsland, npcForChunk, type WorldNode } from "./world.js";
import { type Gear, gearStats, makeGear, rngFor, sanitizeGear, stableSeed, tierAt } from "./items.js";
import { constrainDarkspawn, dayNightAt, FIRE_MAX_RADIUS, FIRE_MIN_RADIUS, FIRE_START_RADIUS, FIRE_STOKE_COST, FIRE_STOKE_GROWTH, fireRadiusAt, insideFirelight, nightBuffed } from "./survival.js";
const PLAYER_LIMIT = Math.max(2, Math.min(8, Number(process.env.DRIFTER_MAX_PLAYERS) || 4));
const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;
const MAX_COORD = 10000000, CHUNK = 512, INTEREST_RADIUS = 2;
const RESOURCES = new Set(['wood', 'stone', 'iron', 'crystal', 'berry', 'jelly', 'fang', 'core', 'gloom', 'nightFang', 'nightCore']);
const WORLD_VERSION = 3, CAMP_X = 256, CAMP_Y = 256;
const NODE_DROPS: Record<string, {
    res: string;
    xp: number;
    chance: number;
}> = { tree: { res: 'wood', xp: 3, chance: .04 }, bush: { res: 'berry', xp: 2, chance: .01 }, rock: { res: 'stone', xp: 3, chance: .04 }, iron: { res: 'iron', xp: 6, chance: .08 }, crystal: { res: 'crystal', xp: 10, chance: .3 } };
type Loose = Record<string, any>;
type ClientOptions = {
    roomCode?: unknown;
    nickname?: unknown;
    role?: unknown;
    internalToken?: unknown;
};
type RoomOptions = {
    roomCode?: unknown;
    worldSeed?: unknown;
    maxPlayers?: unknown;
    x?: unknown;
    y?: unknown;
    internalToken?: unknown;
};
type Runtime = {
    lastMove: number;
    lastSnapshot: number;
    lastAttack: number;
    invulnerableUntil: number;
    respawnAt: number;
    lastHeal: number;
    lastCorrection: number;
    initialized: boolean;
    equipment: (Gear | null)[];
    resources: Record<string, number>;
    profileSeq: number;
    stats: ReturnType<typeof gearStats>;
    shore: {
        x: number;
        y: number;
    } | null;
    grants: Map<string, Loose>;
    rewards: Map<string, Loose>;
    actions: Map<string, Loose>;
};
type EnemyRuntime = {
    entity: SharedEntity;
    wander: number;
    turnAt: number;
    kx: number;
    ky: number;
    lastAttackAt: number;
};
type LootPayload = {
    id: string;
    kind: 'resource' | 'equipment';
    x: number;
    y: number;
    res?: string;
    amount?: number;
    eq?: Gear;
    ttl: number | null;
    star?: boolean;
    ck?: string;
    idx?: number;
};
function object(v: unknown): Loose | null { return v && typeof v === 'object' && !Array.isArray(v) ? v as Loose : null; }
function finite(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v); }
function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function safePosition(x: unknown, y: unknown): boolean { return finite(x) && finite(y) && Math.abs(x) <= MAX_COORD && Math.abs(y) <= MAX_COORD; }
function safeName(v: unknown) { return String(v ?? 'Drifter').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 20) || 'Drifter'; }
function hasInternalToken(v: unknown) { if (process.env.DRIFTER_SERVICE_ROLE !== 'worker')
    return true; const a = Buffer.from(process.env.DRIFTER_INTERNAL_SECRET ?? ''), b = Buffer.from(typeof v === 'string' ? v : ''); return a.length > 0 && a.length === b.length && timingSafeEqual(a, b); }
function chunkKey(x: number, y: number) { return `${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}`; }
class RateGate {
    private buckets = new Map<string, {
        tokens: number;
        at: number;
    }>();
    allow(key: string, perSecond: number, burst = perSecond) { const now = Date.now(), b = this.buckets.get(key) || { tokens: burst, at: now }; b.tokens = Math.min(burst, b.tokens + (now - b.at) * perSecond / 1000); b.at = now; const ok = b.tokens >= 1; if (ok)
        b.tokens--; this.buckets.set(key, b); return ok; }
    remove(id: string) { for (const k of this.buckets.keys())
        if (k.startsWith(id + ':'))
            this.buckets.delete(k); }
}
export class DrifterRoom extends Room<{
    state: DrifterRoomState;
}> {
    maxClients = PLAYER_LIMIT;
    maxMessagesPerSecond = 100;
    state = new DrifterRoomState();
    private bootstrapUpload: {
        id: string;
        count: number;
        chunks: Map<number, string>;
        bytes: number;
    } | null = null;
    private roomCode = '';
    private runtime = new Map<string, Runtime>();
    private gate = new RateGate();
    private hostX = 268;
    private hostY = 268;
    private deadNodes = new Set<string>();
    private deadEnemies = new Set<string>();
    private nodeJournal = new Map<string, SharedNode>();
    private enemies = new Map<string, EnemyRuntime>();
    private darkspawnIds = new Set<string>();
    private enemyChunks = new Map<string, Set<string>>();
    private nodeChunks = new Map<string, Set<string>>();
    private lootJournal = new Map<string, SharedLoot>();
    private lootData = new Map<string, LootPayload>();
    private lootChunks = new Map<string, Set<string>>();
    private removedLoot = new Set<string>();
    private claimedLoot = new Map<string, {
        winner: string;
        item: LootPayload;
    }>();
    private visitedChunks = new Set<string>();
    private interest = new Set<string>();
    private interestSignature = '';
    private progress: Loose = { claimed: [], runes: {}, mirrors: {}, seeds: [], planted: [], stash: [], sold: {}, fireRadius: FIRE_START_RADIUS, fireUpdatedAt: 0 };
    private timeBank = 0;
    private pruneBank = 0;
    private nightIndex = -1;
    private nextDarkspawnAt = 0;
    private darkspawnSequence = 0;
    private darkspawnThisNight = 0;
    private starAt = 60;
    private starSeq = 0;
    private metrics = { ticks: 0, totalMs: 0, maxMs: 0, entitiesPeak: 0, lootPeak: 0, inputs: 0, rejected: 0 };
    onCreate(options: RoomOptions) {
        if (!hasInternalToken(options.internalToken))
            throw Error('ROOM_CREATE_FORBIDDEN');
        this.roomCode = String(options.roomCode ?? '').toUpperCase();
        if (!CODE_RE.test(this.roomCode))
            throw Error('Invalid room code.');
        this.maxClients = clamp(Number(options.maxPlayers) || PLAYER_LIMIT, 2, 8);
        this.state.roomCode = this.roomCode;
        this.state.worldSeed = clamp(Math.trunc(Number(options.worldSeed) || Math.random() * 2147483646 + 1), 1, 4294967295);
        if (safePosition(options.x, options.y)) {
            this.hostX = Number(options.x);
            this.hostY = Number(options.y);
        }
        this.setPrivate(true);
        this.setPatchRate(100);
        this.syncProgress();
        this.onMessage('room:start', (c, m) => this.startRoom(c, m));
        this.onMessage('world:bootstrap-chunk', (c, m) => this.bootstrapChunk(c, m));
        this.onMessage('player:swing', (c, m) => this.swing(c, m));
        this.onMessage('player:ready', (c, m) => this.ready(c, m));
        this.onMessage('player:snapshot', (c, m) => this.playerSnapshot(c, m));
        this.onMessage('player:attack', (c, m) => this.playerAttack(c, m));
        this.onMessage('player:heal', (c, m) => this.heal(c, m));
        this.onMessage('player:warp', (c, m) => this.warp(c, m));
        this.onMessage('world:node-hit', (c, m) => this.nodeHit(c, m));
        this.onMessage('world:interact', (c, m) => this.interact(c, m));
        this.onMessage('world:enemy-hit', (c, m) => this.enemyHit(c, m));
        // Legacy client simulations can never overwrite the authoritative world.
        this.onMessage('world:enemy-snapshot', () => { });
        this.onMessage('loot:batch', (c, m) => this.publishLoot(c, m));
        this.onMessage('loot:upsert', (c, m) => this.publishLoot(c, { items: [m] }));
        this.onMessage('loot:claim', (c, m) => this.claimLoot(c, m));
        this.onMessage('loot:ack', (c, m) => { if (typeof m?.id === 'string')
            this.runtime.get(c.sessionId)?.grants.delete(m.id); });
        this.onMessage('loot:remove', (c, m) => this.removeOwnedLoot(c, m));
        this.onMessage('reward:ack', (c, m) => { if (typeof m?.id === 'string')
            this.runtime.get(c.sessionId)?.rewards.delete(m.id); });
        this.onMessage('world:action', (c, m) => this.worldAction(c, m));
        this.onMessage('action:ack', (c, m) => { const result = this.runtime.get(c.sessionId)?.actions.get(m?.requestId); if (result)
            result.acknowledged = true; });
        this.onMessage('world:resync', c => this.resend(c));
        this.onMessage('world:metrics', c => { if (c.sessionId === this.state.hostSessionId)
            c.send('world:metrics', { ...this.metrics, activeEntities: this.state.entities.size, activeLoot: this.state.loot.size, nodeChanges: this.nodeJournal.size, meanTickMs: this.metrics.totalMs / Math.max(1, this.metrics.ticks), ...memoryMetrics(), processCpu: process.cpuUsage() }); });
        this.setSimulationInterval(dt => this.tick(Math.min(.2, dt / 1000)), 100);
    }
    async onAuth(_c: Client, o: ClientOptions) { if (!hasInternalToken(o.internalToken))
        throw Error('ROOM_JOIN_FORBIDDEN'); if (String(o.roomCode ?? '').toUpperCase() !== this.roomCode)
        throw Error('ROOM_CODE_INVALID'); if (this.state.players.size >= this.maxClients)
        throw Error('ROOM_FULL'); return { nickname: safeName(o.nickname), role: o.role === 'host' && !this.state.hostSessionId ? 'host' : 'guest' }; }
    onJoin(c: Client, o: ClientOptions, a: {
        nickname?: string;
        role?: string;
    }) {
        const p = new PlayerState();
        p.nickname = safeName(a?.nickname ?? o.nickname);
        p.role = a?.role === 'host' && !this.state.hostSessionId ? 'host' : 'guest';
        if (p.role === 'host') {
            this.state.hostSessionId = c.sessionId;
            p.x = this.hostX;
            p.y = this.hostY;
        }
        else {
            const h = this.state.players.get(this.state.hostSessionId);
            if (h) {
                p.x = h.x + 24;
                p.y = h.y + 24;
            }
        }
        this.state.players.set(c.sessionId, p);
        const eq = [sanitizeGear({ base: 'pickaxe', opts: [] }), null, null];
        this.runtime.set(c.sessionId, { lastMove: Date.now(), lastSnapshot: 0, lastAttack: 0, invulnerableUntil: Date.now() + 2000, respawnAt: 0, lastHeal: 0, lastCorrection: 0, initialized: false, equipment: eq, resources: {}, profileSeq: 0, stats: gearStats(eq), shore: null, grants: new Map(), rewards: new Map(), actions: new Map() });
        this.broadcast('party:member', { action: 'joined', nickname: p.nickname, role: p.role });
    }
    onDrop(c: Client) { const p = this.state.players.get(c.sessionId); if (p) {
        p.connected = false;
        p.moving = false;
    } this.interestSignature = ''; this.allowReconnection(c, 30); }
    onReconnect(c: Client) { const p = this.state.players.get(c.sessionId); if (p)
        p.connected = true; this.interestSignature = ''; this.resend(c); }
    onLeave(c: Client) { const host = c.sessionId === this.state.hostSessionId; this.state.players.delete(c.sessionId); this.runtime.delete(c.sessionId); this.gate.remove(c.sessionId); this.interestSignature = ''; if (host) {
        this.broadcast('party:ended', { reason: 'host-left' });
        this.disconnect();
    }
    else
        this.broadcast('party:member', { action: 'left' }); }
    private client(id: string) { return this.clients.find(c => c.sessionId === id); }
    private syncProgress() { this.state.progress = JSON.stringify(this.progress); }
    private resend(c: Client) { const r = this.runtime.get(c.sessionId); if (!r)
        return; for (const g of r.grants.values())
        c.send('loot:claimed', g); for (const g of r.rewards.values())
        c.send('world:reward', g); for (const result of r.actions.values())
        if (!result.acknowledged)
            c.send('world:action-result', result); }
    private reward(id: string, key: string, data: Loose) { const r = this.runtime.get(id); if (!r)
        return; const event = { id: key, ...data }; r.rewards.set(key, event); this.client(id)?.send('world:reward', event); }
    private startRoom(c: Client, raw: unknown) { if (c.sessionId !== this.state.hostSessionId || this.state.started)
        return; const request = object(raw); let world = object(request?.world); if (request?.bootstrapId) {
        const upload = this.bootstrapUpload;
        if (!upload || upload.id !== request.bootstrapId || upload.chunks.size !== upload.count)
            return;
        try {
            world = object(JSON.parse(Array.from({ length: upload.count }, (_, i) => upload.chunks.get(i)).join('')));
        }
        catch {
            return;
        }
    } this.bootstrapUpload = null; if (world)
        this.bootstrap(world); this.state.started = true; this.refreshInterest(true); this.broadcast('party:started', { worldSeed: this.state.worldSeed, worldVersion: WORLD_VERSION }); }
    private bootstrapChunk(c: Client, raw: unknown) { const d = object(raw); if (c.sessionId !== this.state.hostSessionId || this.state.started || !d || typeof d.id !== 'string' || d.id.length > 100 || typeof d.data !== 'string' || d.data.length > 32000 || !Number.isInteger(d.index) || !Number.isInteger(d.count) || d.count < 1 || d.count > 132 || d.index < 0 || d.index >= d.count)
        return; if (!this.bootstrapUpload || this.bootstrapUpload.id !== d.id)
        this.bootstrapUpload = { id: d.id, count: d.count, chunks: new Map(), bytes: 0 }; const u = this.bootstrapUpload; if (u.count !== d.count || u.chunks.has(d.index))
        return; u.bytes += Buffer.byteLength(d.data); if (u.bytes > 4 * 1024 * 1024) {
        this.bootstrapUpload = null;
        return;
    } u.chunks.set(d.index, d.data); }
    private swing(c: Client, raw: unknown) { const p = this.state.players.get(c.sessionId), r = this.runtime.get(c.sessionId), d = object(raw), now = Date.now(); if (!p?.ready || p.dead || p.sailing || !r || !d || !finite(d.dir) || now - r.lastAttack < 400)
        return; r.lastAttack = now; p.attackSeq++; p.attackDir = d.dir; this.broadcast('player:swung', { id: c.sessionId, seq: p.attackSeq, dir: p.attackDir }); }
    private bootstrap(w: Loose) {
        for (const [key, indices] of Object.entries(object(w.destroyed) || {})) {
            if (!Array.isArray(indices))
                continue;
            for (const idx of indices) {
                const n = findWorldNode(this.state.worldSeed, `${key}:${idx}`);
                if (n) {
                    const s = this.sharedNode(n);
                    s.hp = 0;
                    s.dead = true;
                    s.revision++;
                    this.deadNodes.add(n.id);
                }
            }
        }
        for (const id of [...(Array.isArray(w.caveLooted) ? w.caveLooted : []), ...(Array.isArray(w.ruinDone) ? w.ruinDone : [])]) {
            const n = findWorldNode(this.state.worldSeed, String(id));
            if (n) {
                const s = this.sharedNode(n);
                s.looted = true;
                s.revision++;
                if (n.kind === 'cave')
                    this.visitedChunks.add('cave:' + n.id);
            }
        }
        for (const id of Object.keys(object(w.exp?.enemyDead) || {}))
            if (/^[-\d]+,[-\d]+:/.test(id))
                this.deadEnemies.add(id);
        for (const [key, indices] of Object.entries(object(w.looted) || {}))
            if (Array.isArray(indices))
                for (const idx of indices)
                    this.removedLoot.add(`world:${this.state.worldSeed}:${key}:${idx}`);
        const baseWorldTime = clamp(Number(w.gameT) || 0, 0, 1e8), e = object(w.exp);
        if (e) {
            for (const k of ['claimed', 'seeds', 'planted'])
                if (Array.isArray(e[k]))
                    this.progress[k] = e[k];
            for (const k of ['runes', 'mirrors']) {
                const v = object(e[k]);
                if (v)
                    this.progress[k] = Object.fromEntries(Object.entries(v).filter(([id, a]) => findIsland(id, this.state.worldSeed) && Array.isArray(a)));
            }
            if (Array.isArray(e.stash))
                this.progress.stash = e.stash.slice(0, 12).map((g: any) => sanitizeGear(g)).filter(Boolean);
            if (finite(e.fireRadius))
                this.progress.fireRadius = clamp(e.fireRadius, FIRE_MIN_RADIUS, FIRE_MAX_RADIUS);
            this.progress.fireUpdatedAt = finite(e.fireUpdatedAt) ? clamp(e.fireUpdatedAt, 0, 1e8) : baseWorldTime;
        }
        else this.progress.fireUpdatedAt = baseWorldTime;
        this.state.worldTime = baseWorldTime;
        this.starAt = this.state.worldTime + 60;
        for (const [i, g] of [...(Array.isArray(w.groundEquip) ? w.groundEquip : []), ...(Array.isArray(w.groundRes) ? w.groundRes : [])].entries()) {
            const id = g.ck !== undefined ? `world:${this.state.worldSeed}:${g.ck}:${g.idx}` : `bootstrap:${i}`;
            const item = this.sanitizeLoot({ ...g, id, kind: g.eq ? 'equipment' : 'resource' });
            if (item)
                this.addLoot(item, 'server');
        }
        this.syncProgress();
    }
    private ready(c: Client, raw: unknown) {
        const p = this.state.players.get(c.sessionId), r = this.runtime.get(c.sessionId), d = object(raw);
        if (!p || !r || !d || !this.state.started || !this.gate.allow(c.sessionId + ':profile', 3, 3))
            return;
        if (Array.isArray(d.equipment) && d.equipment.length === 3)
            r.equipment = d.equipment.map((g: any) => g ? sanitizeGear(g) : null);
        const seq = Math.max(0, Math.trunc(Number(d.seq) || 0));
        if (seq > r.profileSeq || !r.initialized) {
            const resources = object(d.resources);
            if (resources) for (const [key, value] of Object.entries(resources))
                if (RESOURCES.has(key) && finite(value)) r.resources[key] = clamp(Math.trunc(value), 0, 999999);
            r.profileSeq = seq;
        }
        const oldLevel = p.level;
        p.level = Math.round(clamp(Number(d.level) || p.level, 1, 200));
        r.stats = gearStats(r.equipment, p.level);
        p.maxHp = r.stats.maxHp;
        p.equipment = JSON.stringify(r.equipment);
        if (!r.initialized) {
            p.hp = clamp(finite(d.hp) ? d.hp : p.maxHp, 1, p.maxHp);
            r.initialized = true;
            r.invulnerableUntil = Date.now() + 2000;
        }
        else
            p.hp = Math.min(p.hp + Math.max(0, p.level - oldLevel) * 4, p.maxHp);
        p.ready = true;
        c.send('player:profiled', { seq });
        this.interestSignature = '';
        this.refreshInterest(true);
        this.resend(c);
    }
    private playerSnapshot(c: Client, raw: unknown) {
        const p = this.state.players.get(c.sessionId), r = this.runtime.get(c.sessionId), d = object(raw), now = Date.now();
        if (!p || !r || !this.state.started || !d || !this.gate.allow(c.sessionId + ':move', 12, 4) || !safePosition(d.x, d.y))
            return;
        this.metrics.inputs++;
        if (p.dead)
            return;
        const x = Number(d.x), y = Number(d.y), elapsed = clamp((now - r.lastMove) / 1000, .05, .5), distance = Math.hypot(x - p.x, y - p.y), sailing = d.sailing === true;
        if (sailing !== p.sailing) {
            const nearWater = biomeAt(Math.floor(x / 16), Math.floor((y + 6) / 16), this.state.worldSeed);
            if (distance < 70 && ((sailing && [0, 1, 5].includes(nearWater)) || (!sailing && nearWater !== 0))) {
                if (sailing)
                    r.shore = { x: p.x, y: p.y };
                p.sailing = sailing;
            }
        }
        const nightStep = dayNightAt(this.state.worldTime).night && r.equipment.some(g => g?.effect === 'nightstep');
        if (distance > elapsed * Math.max(245, r.stats.speed * (nightStep ? 1.2 : 1) * 1.8) + 24) {
            this.correct(c, p, r, now);
            return;
        }
        const blocked = (sx: number, sy: number, tx: number, ty: number) => { const steps = Math.max(1, Math.ceil(Math.hypot(tx - sx, ty - sy) / 8)); for (let i = 1; i <= steps; i++) {
            const a = sx + (tx - sx) * i / steps, b = sy + (ty - sy) * i / steps;
            if (p.sailing) {
                if (![0, 1, 5].includes(biomeAt(Math.floor(a / 16), Math.floor((b + 6) / 16), this.state.worldSeed)))
                    return true;
            }
            else if (positionBlocked(this.state.worldSeed, a, b, sx, sy, this.deadNodes))
                return true;
        } return false; };
        let nx = p.x, ny = p.y;
        if (x !== p.x && !blocked(p.x, p.y, x, p.y))
            nx = x;
        if (y !== p.y && !blocked(nx, p.y, nx, y))
            ny = y;
        p.x = Math.round(nx * 4) / 4;
        p.y = Math.round(ny * 4) / 4;
        r.lastMove = now;
        r.lastSnapshot = now;
        if (Math.hypot(p.x - x, p.y - y) > 20)
            this.correct(c, p, r, now);
        p.face = d.face === -1 ? -1 : 1;
        p.phase = finite(d.phase) ? d.phase % 10000 : p.phase;
        p.moving = d.moving === true;
        p.activity = d.activity === 'fishing' ? 'fishing' : '';
    }
    private correct(c: Client, p: PlayerState, r: Runtime, now: number) { if (now - r.lastCorrection < 350)
        return; r.lastCorrection = now; c.send('player:correction', { x: p.x, y: p.y, hp: p.hp, positionSeq: p.positionSeq, sailing: p.sailing }); this.metrics.rejected++; }
    private attack(c: Client, d: Loose, x: number, y: number, radius = 0) { const p = this.state.players.get(c.sessionId), r = this.runtime.get(c.sessionId), now = Date.now(); if (!p || !r || !p.ready || p.dead || !p.connected || p.sailing || now - r.lastAttack < 400 || Math.hypot(p.x - x, p.y - y) > r.stats.range + radius + 12)
        return null; r.lastAttack = now; p.attackSeq++; p.attackDir = Math.atan2(y - (p.y - 6), x - p.x); this.broadcast('player:swung', { id: c.sessionId, seq: p.attackSeq, dir: p.attackDir }); return { p, r, damage: r.stats.atk }; }
    private sharedNode(n: WorldNode) { let s = this.nodeJournal.get(n.id); if (!s) {
        s = new SharedNode();
        s.id = n.id;
        s.kind = n.kind;
        s.x = n.x;
        s.y = n.y;
        s.hp = s.maxHp = n.hp;
        s.revision = 1;
        this.nodeJournal.set(n.id, s);
        const key = chunkKey(n.x, n.y), set = this.nodeChunks.get(key) || new Set<string>();
        set.add(n.id);
        this.nodeChunks.set(key, set);
    } this.state.nodes.set(n.id, s); return s; }
    private nodeHit(c: Client, raw: unknown) {
        const d = object(raw);
        if (!d || typeof d.id !== 'string' || !this.gate.allow(c.sessionId + ':combatInput', 8, 4))
            return;
        const n = findWorldNode(this.state.worldSeed, d.id);
        if (!n || !NODE_DROPS[n.kind] || n.kind !== d.kind)
            return;
        if (this.nodeJournal.get(n.id)?.dead)
            return;
        const hit = this.attack(c, d, n.x, n.y, 20);
        if (!hit)
            return;
        const s = this.sharedNode(n);
        const dmg = Math.min(s.hp, hit.damage);
        s.hp -= dmg;
        s.dead = s.hp <= 0;
        s.revision++;
        s.lastDamage = dmg;
        s.lastAction = 'hit';
        s.lastActorSessionId = c.sessionId;
        this.broadcast('world:node-change', { id: s.id, kind: s.kind, x: s.x, y: s.y, hp: s.hp, maxHp: s.maxHp, dead: s.dead, revision: s.revision, damage: dmg, actorId: c.sessionId, action: 'hit' });
        if (s.dead) {
            this.deadNodes.add(n.id);
            const info = NODE_DROPS[n.kind], rng = rngFor(`${this.state.worldSeed}:${n.id}:drop`);
            this.resource(`node:${n.id}:res`, info.res, n.x, n.y, n.kind === 'bush' ? 1 : 1 + Math.floor(rng() * 2));
            if (rng() < info.chance + hit.r.stats.luck * .004)
                this.equipment(`node:${n.id}:gear`, n.x + 12, n.y + 8, 'gather', 0, hit.r.stats.luck);
            this.reward(c.sessionId, `node:${n.id}`, { xp: info.xp, shard: ['iron', 'crystal'].includes(n.kind) ? tierAt(n.x, n.y) : 0 });
        }
    }
    private enemyHit(c: Client, raw: unknown) {
        const d = object(raw);
        if (!d || typeof d.id !== 'string' || !this.gate.allow(c.sessionId + ':combatInput', 8, 4))
            return;
        const e = this.enemies.get(d.id)?.entity;
        if (!e || e.dead || e.kind !== d.kind)
            return;
        const hit = this.attack(c, d, e.x, e.y, ENEMIES[e.kind].size + 8);
        if (!hit)
            return;
        const dmg = Math.min(e.hp, hit.damage);
        e.hp -= dmg;
        e.dead = e.hp <= 0;
        e.revision++;
        e.lastDamage = dmg;
        e.lastActorSessionId = c.sessionId;
        const rt = this.enemies.get(e.id)!;
        const dx = e.x - hit.p.x, dy = e.y - hit.p.y, len = Math.hypot(dx, dy) || 1;
        rt.kx = dx / len * 140;
        rt.ky = dy / len * 140;
        this.broadcast('world:enemy-change', { id: e.id, kind: e.kind, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, dead: e.dead, revision: e.revision, damage: dmg, actorId: c.sessionId });
        if (e.dead) {
            if (!e.id.startsWith('dark:')) this.deadEnemies.add(e.id);
            this.state.entities.delete(e.id);
            const info = ENEMIES[e.kind], rng = rngFor(`${this.state.worldSeed}:${e.id}:drop`);
            if (e.id.startsWith('dark:')) {
                this.resource(`enemy:${e.id}:gloom`, 'gloom', e.x, e.y, e.kind === 'ashbrute' ? 2 : 1);
                if (e.kind === 'gloomfang') this.resource(`enemy:${e.id}:fang`, 'nightFang', e.x + 6, e.y, 1);
                if (e.kind === 'ashbrute') this.resource(`enemy:${e.id}:core`, 'nightCore', e.x + 6, e.y, 1);
            }
            else if (rng() < info.chance)
                this.resource(`enemy:${e.id}:res`, info.res, e.x, e.y, 1 + Math.floor(rng() * info.max));
            if (rng() < .12 + hit.r.stats.luck * .005)
                this.equipment(`enemy:${e.id}:gear`, e.x + 10, e.y + 6, e.elite ? 'elite' : 'enemy', e.elite ? 2 : 0, hit.r.stats.luck);
            this.reward(c.sessionId, `enemy:${e.id}`, { xp: Math.round(info.xp * (1 + .25 * e.tier) * (e.elite ? 1.7 : 1)), quest: 'kill', kind: e.kind, shard: e.elite ? e.tier : 0 });
            if (e.id.startsWith('dark:')) {
                const key = chunkKey(e.homeX, e.homeY), ids = this.enemyChunks.get(key);
                ids?.delete(e.id);
                if (ids?.size === 0) this.enemyChunks.delete(key);
                this.enemies.delete(e.id);
                this.darkspawnIds.delete(e.id);
            }
        }
    }
    private playerAttack(c: Client, raw: unknown) { const d = object(raw); if (!d || typeof d.target !== 'string' || d.target === c.sessionId || !this.gate.allow(c.sessionId + ':combatInput', 8, 4))
        return; const target = this.state.players.get(d.target); if (!target || !target.ready || !target.connected || target.dead)
        return; const hit = this.attack(c, d, target.x, target.y, 12); if (hit)
        this.damage(d.target, hit.damage, hit.p.x, hit.p.y, c.sessionId); }
    private damage(id: string, amount: number, x: number, y: number, attacker: string, cooldownMs = 1000) { const p = this.state.players.get(id), r = this.runtime.get(id), now = Date.now(); if (!p || !r || p.dead || now < r.invulnerableUntil)
        return; r.invulnerableUntil = now + clamp(cooldownMs, 300, 1500); p.hp = Math.max(0, p.hp - amount); p.damageSeq++; this.broadcast('player:damaged', { id, hp: p.hp, damage: amount, x, y, attacker, seq: p.damageSeq }); if (p.hp === 0) {
        p.dead = true;
        p.moving = false;
        p.sailing = false;
        p.carrying = '';
        r.respawnAt = now + 1700;
    } }
    private heal(c: Client, raw: unknown) { const p = this.state.players.get(c.sessionId), r = this.runtime.get(c.sessionId), d = object(raw), now = Date.now(); if (!p || !r || !d || p.dead || now - r.lastHeal < 350 || !finite(d.amount))
        return; r.lastHeal = now; p.hp = Math.min(p.maxHp, p.hp + clamp(d.amount, 0, Math.max(20, Math.round(p.maxHp * .4)))); }
    private warp(c: Client, raw: unknown) { const p = this.state.players.get(c.sessionId), r = this.runtime.get(c.sessionId), d = object(raw); if (!p || !r || !d || p.dead || !safePosition(d.x, d.y) || !this.gate.allow(c.sessionId + ':warp', .5, 1))
        return; const x = Number(d.x), y = Number(d.y); const camp = Math.hypot(x - 256, y - 256) < 100, shore = r.shore && Math.hypot(x - r.shore.x, y - r.shore.y) < 64, ruin = [...this.nodeJournal.values()].some(n => n.kind === 'ruin' && n.looted && Math.hypot(n.x - x, n.y - y) < 80); if (!camp && !shore && !ruin)
        return; p.x = x; p.y = y; p.sailing = false; p.positionSeq++; r.lastMove = Date.now(); r.invulnerableUntil = Date.now() + 1200; this.interestSignature = ''; }
    private interact(c: Client, raw: unknown) {
        const p = this.state.players.get(c.sessionId), d = object(raw);
        if (!p || !p.ready || p.dead || !d || typeof d.id !== 'string' || !this.gate.allow(c.sessionId + ':interact', 4, 2))
            return;
        const n = findWorldNode(this.state.worldSeed, d.id);
        if (!n || !['cave', 'ruin'].includes(n.kind) || Math.hypot(p.x - n.x, p.y - n.y) > 128)
            return;
        const s = this.sharedNode(n);
        if (s.looted)
            return;
        if (n.island) {
            const i = n.island, key = i.id, rune = n.rune!;
            const runes: number[] = this.progress.runes[key] || (this.progress.runes[key] = []);
            if (rune >= 0) {
                if (runes.includes(rune))
                    return;
                if (i.variant === 0) {
                    if (rune !== [0, 1, 2].find(v => !runes.includes(v)))
                        return;
                    runes.push(rune);
                    s.looted = true;
                }
                else if (i.variant === 1) {
                    const values = this.progress.mirrors[key] || (this.progress.mirrors[key] = []), target = ((Math.round(Math.atan2((i.ty + .5) * 16 - n.y, (i.tx + .5) * 16 - n.x) / (Math.PI / 2)) % 4) + 4) % 4;
                    values[rune] = ((values[rune] ?? ((target + 2) % 4)) + 1) % 4;
                    if (values[rune] === target) {
                        runes.push(rune);
                        s.looted = true;
                    }
                }
                else {
                    const token = `${key}|${rune}`;
                    if ([...this.state.players.values()].some(v => v.carrying === token))
                        return;
                    p.carrying = token;
                }
            }
            else {
                if (runes.length < 3 || this.progress.claimed.includes(key))
                    return;
                this.progress.claimed.push(key);
                if (!this.progress.seeds.includes(i.variant))
                    this.progress.seeds.push(i.variant);
                s.looted = true;
                this.equipment(`island:${key}:gear`, n.x + 22, n.y + 20, 'island', 3);
                this.reward(c.sessionId, `island:${key}`, { xp: 25 + tierAt(n.x, n.y) * 12, quest: 'ruin', glass: 3 + (tierAt(n.x, n.y) >= 2 ? 1 : 0), shard: tierAt(n.x, n.y), shardCount: 3 });
            }
            s.revision++;
            this.syncProgress();
            return;
        }
        s.looted = true;
        s.revision++;
        s.lastAction = 'interact';
        s.lastActorSessionId = c.sessionId;
        if (n.kind === 'cave') {
            const rng = rngFor(`${this.state.worldSeed}:${n.id}:cave`), count = 2 + Math.floor(rng() * 2);
            this.resource(`cave:${n.id}:crystal`, 'crystal', n.x - 10, n.y + 8, count);
            this.resource(`cave:${n.id}:iron`, 'iron', n.x + 10, n.y + 8, count);
            this.equipment(`cave:${n.id}:gear`, n.x + 12, n.y + 16, 'cave', 2);
            for (let j = 0; j < 3 + Math.floor(rng() * 2); j++)
                this.addEnemy({ id: `${n.id}:bat:${j}`, kind: 'bat', x: n.x + (rng() - .5) * 32, y: n.y + (rng() - .5) * 24, hp: 4, tier: 0, elite: false, homeX: n.x, homeY: n.y });
        }
        else {
            this.resource(`ruin:${n.id}:crystal`, 'crystal', n.x, n.y + 8, 1);
            this.equipment(`ruin:${n.id}:gear`, n.x + 14, n.y + 12, 'ruin', 2);
        }
        this.reward(c.sessionId, `interact:${n.id}`, { xp: n.kind === 'cave' ? 18 : 25, quest: n.kind, shard: tierAt(n.x, n.y) });
    }
    private sanitizeLoot(raw: unknown): LootPayload | null { const d = object(raw); if (!d || typeof d.id !== 'string' || d.id.length > 180 || !safePosition(d.x, d.y))
        return null; const ttl = d.kind === 'resource' ? 45 : d.ttl === null ? null : clamp(Number(d.ttl) || 30, 1, 45); if (d.kind === 'resource' && RESOURCES.has(d.res))
        return { id: d.id, kind: 'resource', res: d.res, amount: clamp(Math.trunc(Number(d.amount) || 1), 1, 50), x: d.x, y: d.y, ttl }; if (d.kind === 'equipment') {
        const eq = sanitizeGear(d.eq);
        if (eq)
            return { id: d.id, kind: 'equipment', eq, x: d.x, y: d.y, ttl, star: d.star === true, ...(typeof d.ck === 'string' && Number.isInteger(d.idx) ? { ck: d.ck, idx: d.idx } : {}) };
    } return null; }
    private addLoot(item: LootPayload, owner: string) { if (this.removedLoot.has(item.id) || this.claimedLoot.has(item.id))
        return false; let s = this.lootJournal.get(item.id); if (s) {
        const oldKey = chunkKey(s.x, s.y);
        this.lootChunks.get(oldKey)?.delete(item.id);
    }
    else {
        s = new SharedLoot();
        s.id = item.id;
        s.ownerSessionId = owner;
        s.expiresAt = item.ttl === null ? 0 : Date.now() + item.ttl * 1000;
        this.lootJournal.set(item.id, s);
    } s.x = Math.round(item.x * 4) / 4; s.y = Math.round(item.y * 4) / 4; item = { ...item, x: s.x, y: s.y }; s.data = JSON.stringify(item); this.lootData.set(item.id, item); const key = chunkKey(s.x, s.y), set = this.lootChunks.get(key) || new Set<string>(); set.add(item.id); this.lootChunks.set(key, set); if (this.interest.has(key))
        this.state.loot.set(item.id, s); return true; }
    private resource(id: string, res: string, x: number, y: number, amount: number) { this.addLoot({ id, kind: 'resource', res, amount, x, y, ttl: 45 }, 'server'); }
    private equipment(id: string, x: number, y: number, source: string, min = 0, luck = 0, star = false) { this.addLoot({ id, kind: 'equipment', x, y, eq: makeGear(`${this.state.worldSeed}:${id}`, x, y, source, min, luck, biomeAt(Math.floor(x / 16), Math.floor(y / 16), this.state.worldSeed)), ttl: null, star }, 'server'); }
    private deleteLoot(id: string) { const s = this.lootJournal.get(id); if (s)
        this.lootChunks.get(chunkKey(s.x, s.y))?.delete(id); this.lootJournal.delete(id); this.lootData.delete(id); this.state.loot.delete(id); this.removedLoot.add(id); }
    private publishLoot(c: Client, raw: unknown) {
        const p = this.state.players.get(c.sessionId), d = object(raw);
        if (!p?.ready || !d || !Array.isArray(d.items) || d.items.length > 24 || !this.gate.allow(c.sessionId + ':publish', 10, 4))
            return;
        const accepted: string[] = [], rejected: string[] = [];
        for (const value of d.items) {
            const item = this.sanitizeLoot(value);
            if (!item)
                continue;
            const existing = this.lootJournal.get(item.id), owned = item.id.startsWith(`drop:${this.roomId}:${c.sessionId}:`);
            if (this.removedLoot.has(item.id) || this.claimedLoot.has(item.id)) {
                rejected.push(item.id);
                continue;
            }
            if (!owned && !existing) {
                rejected.push(item.id);
                continue;
            }
            if (Math.hypot(p.x - item.x, p.y - item.y) > 1024) {
                rejected.push(item.id);
                continue;
            }
            if (existing && existing.ownerSessionId !== c.sessionId) {
                const previous = this.lootData.get(item.id);
                if (!previous || item.kind !== 'equipment' || Math.hypot(p.x - existing.x, p.y - existing.y) > 112 || JSON.stringify(previous.eq) !== JSON.stringify(item.eq)) {
                    rejected.push(item.id);
                    continue;
                }
            }
            if (this.addLoot(item, existing?.ownerSessionId || c.sessionId))
                accepted.push(item.id);
            else
                rejected.push(item.id);
        }
        c.send('loot:published', { accepted, rejected });
    }
    private claimLoot(c: Client, raw: unknown) {
        const p = this.state.players.get(c.sessionId), r = this.runtime.get(c.sessionId), d = object(raw);
        if (!p?.ready || p.dead || !r || !d || typeof d.id !== 'string' || !this.gate.allow(c.sessionId + ':claim', 24, 24))
            return;
        const prior = this.claimedLoot.get(d.id);
        if (prior) {
            if (prior.winner === c.sessionId)
                c.send('loot:claimed', { id: d.id, claimant: c.sessionId, item: prior.item });
            else
                c.send('loot:denied', { id: d.id, removed: true });
            return;
        }
        const item = this.lootData.get(d.id);
        if (!item) {
            c.send('loot:denied', { id: d.id, removed: this.removedLoot.has(d.id) });
            return;
        }
        if (Math.hypot(p.x - item.x, p.y - item.y) > r.stats.pickup + 16) {
            c.send('loot:denied', { id: d.id, removed: false });
            return;
        }
        this.claimedLoot.set(d.id, { winner: c.sessionId, item });
        this.deleteLoot(d.id);
        if (item.kind === 'resource' && item.res && RESOURCES.has(item.res))
            r.resources[item.res] = Math.min(999999, (r.resources[item.res] || 0) + (item.amount || 1));
        const event = { id: d.id, claimant: c.sessionId, item };
        r.grants.set(d.id, event);
        this.broadcast('loot:claimed', event);
    }
    private removeOwnedLoot(_c: Client, _raw: unknown) { }
    private currentFireRadius(time = this.state.worldTime + this.timeBank) {
        return fireRadiusAt(this.progress.fireRadius, this.progress.fireUpdatedAt, time);
    }
    private craftNightGear(kind: 'duskward' | 'nightstep'): Gear {
        const base = kind === 'duskward' ? 'amulet' : 'boots';
        const opts = kind === 'duskward' ? [{ k: 'vit', v: 8 }, { k: 'regen', v: 2 }] : [{ k: 'spd', v: 12 }, { k: 'stam', v: 12 }];
        const gear = sanitizeGear({ base, opts, h1: stableSeed(`shadow:${kind}:a`), h2: stableSeed(`shadow:${kind}:b`), id: stableSeed(`shadow:${kind}`), tier: 1, power: 1.15, source: 'shadowcraft', effect: kind });
        if (!gear)
            throw Error('Invalid shadow gear recipe.');
        return gear;
    }
    private worldAction(c: Client, raw: unknown) {
        const p = this.state.players.get(c.sessionId), r = this.runtime.get(c.sessionId), d = object(raw);
        if (!p?.ready || p.dead || !r || !d || typeof d.requestId !== 'string' || d.requestId.length > 100 || !this.gate.allow(c.sessionId + ':action', 5, 5))
            return;
        const prior = r.actions.get(d.requestId);
        if (prior) {
            c.send('world:action-result', prior);
            return;
        }
        let result: Loose = { requestId: d.requestId, op: d.op, ok: false };
        const atCamp = Math.hypot(p.x - CAMP_X, p.y - CAMP_Y) < 120;
        if (d.op === 'plant' && atCamp && [0, 1, 2].includes(d.seed) && this.progress.seeds.includes(d.seed) && !this.progress.planted.includes(d.seed)) {
            this.progress.planted.push(d.seed);
            result.ok = true;
        }
        if (d.op === 'store' && atCamp && this.progress.stash.length < 12) {
            const eq = sanitizeGear(d.eq);
            if (eq) {
                this.progress.stash.push(eq);
                result = { ...result, ok: true, eq };
            }
        }
        if (d.op === 'withdraw' && atCamp && typeof d.key === 'string') {
            const index = this.progress.stash.findIndex((e: Gear) => `${e.id}:${e.h1}:${e.h2}` === d.key);
            if (index >= 0) {
                const [eq] = this.progress.stash.splice(index, 1);
                result = { ...result, ok: true, eq };
            }
        }
        if (d.op === 'stokeFire' && atCamp && (r.resources.wood || 0) >= FIRE_STOKE_COST) {
            const time = this.state.worldTime + this.timeBank;
            const radius = Math.min(FIRE_MAX_RADIUS, this.currentFireRadius(time) + FIRE_STOKE_GROWTH);
            r.resources.wood -= FIRE_STOKE_COST;
            this.progress.fireRadius = radius;
            this.progress.fireUpdatedAt = time;
            result = { ...result, ok: true, fireRadius: radius, fireUpdatedAt: time, wood: r.resources.wood, profileSeq: r.profileSeq };
        }
        if (d.op === 'craftDuskward' || d.op === 'craftNightstep') {
            const duskward = d.op === 'craftDuskward';
            const cost = duskward ? { gloom: 3, nightCore: 1 } : { gloom: 2, nightFang: 2 };
            if (Object.entries(cost).every(([key, count]) => (r.resources[key] || 0) >= count)) {
                for (const [key, count] of Object.entries(cost)) r.resources[key] -= count;
                const eq = this.craftNightGear(duskward ? 'duskward' : 'nightstep');
                result = { ...result, ok: true, eq, resources: { ...r.resources }, profileSeq: r.profileSeq };
            }
        }
        if (d.op === 'purchase' && typeof d.npc === 'string' && /^-?\d+,-?\d+:n$/.test(d.npc) && Number.isInteger(d.index) && d.index >= 0 && d.index < 10) {
            const m = /^(-?\d+),(-?\d+):n$/.exec(d.npc)!;
            const npc = npcForChunk(Number(m[1]), Number(m[2]), this.state.worldSeed);
            if (npc?.persona === 'trader' && Math.hypot(p.x - npc.x, p.y - npc.y) < 128) {
                const key = `${d.npc}:${d.index}`;
                if (!this.progress.sold[key]) {
                    this.progress.sold[key] = true;
                    result = { ...result, ok: true, npc: d.npc, index: d.index, item: { eq: sanitizeGear(d.item?.eq), price: object(d.item?.price) || {} } };
                }
            }
        }
        r.actions.set(d.requestId, result);
        if (r.actions.size > 256)
            r.actions.delete(r.actions.keys().next().value!);
        if (result.ok)
            this.syncProgress();
        c.send('world:action-result', result);
    }
    private addEnemy(spawn: {
        id: string;
        kind: string;
        x: number;
        y: number;
        hp: number;
        tier: number;
        elite: boolean;
        homeX: number;
        homeY: number;
    }) { if (this.deadEnemies.has(spawn.id))
        return; let rt = this.enemies.get(spawn.id); if (!rt) {
        const e = new SharedEntity();
        Object.assign(e, { ...spawn, maxHp: spawn.hp, revision: 1 });
        rt = { entity: e, wander: (stableSeed(spawn.id) % 628) / 100, turnAt: 0, kx: 0, ky: 0, lastAttackAt: 0 };
        this.enemies.set(e.id, rt);
        const key = chunkKey(e.homeX, e.homeY), set = this.enemyChunks.get(key) || new Set<string>();
        set.add(e.id);
        this.enemyChunks.set(key, set);
    } if (this.interest.has(chunkKey(rt.entity.x, rt.entity.y)))
        this.state.entities.set(spawn.id, rt.entity); }
    private removeDarkspawnAtDawn() {
        for (const id of this.darkspawnIds) {
            const rt = this.enemies.get(id);
            if (!rt) { this.darkspawnIds.delete(id); continue; }
            const e = rt.entity;
            e.dead = true;
            e.revision++;
            this.state.entities.delete(id);
            
            const key = chunkKey(e.homeX, e.homeY), ids = this.enemyChunks.get(key);
            ids?.delete(id);
            if (ids?.size === 0) this.enemyChunks.delete(key);
            this.enemies.delete(id);
            this.darkspawnIds.delete(id);
            this.broadcast('world:enemy-change', { id, kind: e.kind, x: e.x, y: e.y, hp: 0, maxHp: e.maxHp, dead: true, burned: true, revision: e.revision });
        }
    }
    private updateNightCycle(targets: [string, PlayerState][], now: number) {
        const phase = dayNightAt(this.state.worldTime);
        if (!phase.night) {
            this.removeDarkspawnAtDawn();
            this.nightIndex = -1;
            return;
        }
        if (this.nightIndex !== phase.nightIndex) {
            this.nightIndex = phase.nightIndex;
            this.darkspawnThisNight = 0;
            this.nextDarkspawnAt = now + 8000;
        }
        if (!targets.length || now < this.nextDarkspawnAt || this.darkspawnThisNight >= 6)
            return;
        const active = this.darkspawnIds.size;
        this.nextDarkspawnAt = now + 45000;
        if (active >= 6) return;
        const [targetId, target] = targets[this.darkspawnThisNight % targets.length];
        const spawnNo = ++this.darkspawnSequence;
        const rng = rngFor(`${this.state.worldSeed}:dark:${phase.nightIndex}:${spawnNo}:${targetId}`);
        const radius = this.currentFireRadius(this.state.worldTime);
        let x = 0, y = 0, found = false;
        for (let i = 0; i < 18; i++) {
            const angle = rng() * Math.PI * 2, distance = Math.max(320, radius + 28) + rng() * 70;
            x = target.x + Math.cos(angle) * distance;
            y = target.y + Math.sin(angle) * distance;
            if (Math.abs(x) > MAX_COORD || Math.abs(y) > MAX_COORD || biomeAt(Math.floor(x / 16), Math.floor(y / 16), this.state.worldSeed) === 0 || insideFirelight(x, y, radius + 16, CAMP_X, CAMP_Y))
                continue;
            found = true;
            break;
        }
        if (!found) return;
        const roll = rng(), kind = roll < .58 ? 'darkling' : roll < .9 ? 'gloomfang' : 'ashbrute', info = ENEMIES[kind];
        const tier = tierAt(x, y), id = `dark:${phase.nightIndex}:${spawnNo}`;
        this.addEnemy({ id, kind, x: Math.round(x * 4) / 4, y: Math.round(y * 4) / 4, hp: Math.round(info.hp * (1 + .2 * tier)), tier, elite: false, homeX: x, homeY: y });
        this.darkspawnIds.add(id);
        this.darkspawnThisNight++;
    }
    private refreshInterest(force = false) {
        const players = [...this.state.players.values()].filter(p => p.ready && p.connected && !p.dead);
        const signature = players.map(p => chunkKey(p.x, p.y)).sort().join('|');
        if (!force && signature === this.interestSignature)
            return;
        this.interestSignature = signature;
        const next = new Set<string>();
        for (const p of players) {
            const cx = Math.floor(p.x / 512), cy = Math.floor(p.y / 512);
            for (let y = cy - INTEREST_RADIUS; y <= cy + INTEREST_RADIUS; y++)
                for (let x = cx - INTEREST_RADIUS; x <= cx + INTEREST_RADIUS; x++)
                    next.add(`${x},${y}`);
        }
        this.interest = next;
        for (const key of next) {
            const [cx, cy] = key.split(',').map(Number);
            if (!this.visitedChunks.has(key)) {
                this.visitedChunks.add(key);
                for (const e of enemiesForChunk(cx, cy, this.state.worldSeed))
                    this.addEnemy(e);
                const loot = worldLootForChunk(cx, cy, this.state.worldSeed);
                if (loot && !this.lootJournal.has(loot.id))
                    this.equipment(loot.id, loot.x, loot.y, 'world');
            }
            for (const id of this.enemyChunks.get(key) || []) {
                const e = this.enemies.get(id)?.entity;
                if (e && !e.dead && !this.deadEnemies.has(id))
                    this.state.entities.set(id, e);
            }
            for (const id of this.nodeChunks.get(key) || []) {
                const n = this.nodeJournal.get(id);
                if (n)
                    this.state.nodes.set(id, n);
            }
            for (const id of this.lootChunks.get(key) || []) {
                const l = this.lootJournal.get(id);
                if (l)
                    this.state.loot.set(id, l);
            }
        }
        for (const [id, e] of this.state.entities)
            if (!next.has(chunkKey(e.homeX, e.homeY)) && !next.has(chunkKey(e.x, e.y)))
                this.state.entities.delete(id);
        for (const [id, n] of this.state.nodes)
            if (!next.has(chunkKey(n.x, n.y)))
                this.state.nodes.delete(id);
        for (const [id, l] of this.state.loot)
            if (!next.has(chunkKey(l.x, l.y)))
                this.state.loot.delete(id);
    }
    private tick(dt: number) {
        if (!this.state.started)
            return;
        const started = performance.now(), now = Date.now();
        this.timeBank += dt;
        this.pruneBank += dt;
        if (this.timeBank >= 1) {
            this.state.worldTime += this.timeBank;
            this.timeBank = 0;
        }
        for (const [id, p] of this.state.players) {
            const r = this.runtime.get(id);
            if (!r)
                continue;
            if (p.dead && now >= r.respawnAt) {
                p.x = 270;
                p.y = 270;
                p.hp = p.maxHp;
                p.dead = false;
                p.sailing = false;
                p.positionSeq++;
                r.lastMove = now;
                r.invulnerableUntil = now + 2000;
                this.interestSignature = '';
            }
            if (p.carrying && !p.dead) {
                const [key, runeText] = p.carrying.split('|'), i = findIsland(key, this.state.worldSeed);
                if (i) {
                    const x = (i.tx + .5) * 16, y = (i.ty + .5) * 16;
                    if (Math.hypot(p.x - x, p.y - y) < 28) {
                        const rune = Number(runeText), a = this.progress.runes[key] || (this.progress.runes[key] = []);
                        if (!a.includes(rune))
                            a.push(rune);
                        p.carrying = '';
                        for (const n of this.nodeJournal.values())
                            if (findWorldNode(this.state.worldSeed, n.id)?.island?.id === key && findWorldNode(this.state.worldSeed, n.id)?.rune === rune) {
                                n.looted = true;
                                n.revision++;
                            }
                        this.syncProgress();
                    }
                    else if (p.sailing || Math.hypot(p.x - x, p.y - y) > Math.max(i.rx, i.ry) * 16 + 60)
                        p.carrying = '';
                }
            }
        }
        this.refreshInterest();
        const targets = [...this.state.players.entries()].filter(([, p]) => p.ready && p.connected && !p.dead);
        this.updateNightCycle(targets, now);
        const fireRadius = this.currentFireRadius(this.state.worldTime);
        const night = dayNightAt(this.state.worldTime).night;
        for (const [id, e] of this.state.entities) {
            if (e.dead)
                continue;
            const rt = this.enemies.get(id);
            if (!rt)
                continue;
            const info = ENEMIES[e.kind];
            let target: [
                string,
                PlayerState
            ] | undefined, distance = Infinity;
            for (const entry of targets) {
                const d = Math.hypot(entry[1].x - e.x, entry[1].y - e.y);
                if (d < distance) {
                    target = entry;
                    distance = d;
                }
            }
            const aggro = !!target && distance < info.aggro * (e.aggroed ? 1.8 : 1) && !target[1].sailing;
            e.aggroed = aggro;
            e.targetSessionId = aggro ? target![0] : '';
            let vx = 0, vy = 0;
            const darkspawn = id.startsWith('dark:');
            const nightBoost = !darkspawn && nightBuffed(e.x, e.y, this.state.worldTime, fireRadius);
            const speed = info.speed * (1 + Math.min(.06, e.tier * .015)) * (nightBoost ? 1.35 : 1);
            if (aggro && distance > .5) {
                const dx = target![1].x - e.x, dy = target![1].y - e.y;
                vx = dx / distance * speed;
                vy = dy / distance * speed;
                if (e.kind === 'bat') {
                    const wob = Math.sin((this.state.worldTime + this.timeBank) * 7 + stableSeed(id) % 10) * 55;
                    vx += -dy / distance * wob;
                    vy += dx / distance * wob;
                }
                e.face = dx > 0 ? 1 : -1;
            }
            else {
                if (now >= rt.turnAt) {
                    const rng = rngFor(`${id}:${Math.floor(now / 2000)}`);
                    rt.wander = rng() * Math.PI * 2;
                    rt.turnAt = now + 1500 + rng() * 2000;
                }
                const homeDistance = Math.hypot(e.x - e.homeX, e.y - e.homeY);
                if (homeDistance > 180) {
                    rt.wander = Math.atan2(e.homeY - e.y, e.homeX - e.x);
                }
                vx = Math.cos(rt.wander) * speed * .6;
                vy = Math.sin(rt.wander) * speed * .6;
                if (Math.abs(vx) > 2)
                    e.face = vx > 0 ? 1 : -1;
            }
            let nx = e.x + (vx + rt.kx) * dt, ny = e.y + (vy + rt.ky) * dt;
            if (darkspawn) {
                const safe = constrainDarkspawn(nx, ny, fireRadius, info.size, CAMP_X, CAMP_Y);
                nx = safe.x;
                ny = safe.y;
            }
            rt.kx *= Math.max(0, 1 - 8 * dt);
            rt.ky *= Math.max(0, 1 - 8 * dt);
            if (darkspawn || e.kind === 'bat' || biomeAt(Math.floor(nx / 16), Math.floor(ny / 16), this.state.worldSeed) !== 0) {
                e.x = Math.round(nx * 4) / 4;
                e.y = Math.round(ny * 4) / 4;
                e.revision++;
            }
            else
                rt.turnAt = 0;
            const attackInterval = darkspawn ? 850 : nightBoost ? 650 : 1000;
            if (target && distance < info.size + 10 && !target[1].sailing && now - rt.lastAttackAt >= attackInterval) {
                rt.lastAttackAt = now;
                const ward = darkspawn && this.runtime.get(target[0])?.equipment.some(g => g?.effect === 'duskward') ? .7 : 1;
                this.damage(target[0], Math.round(info.dmg * (1 + .12 * e.tier) * (e.elite ? 1.25 : 1) * (nightBoost ? 1.5 : 1) * ward), e.x, e.y, id, attackInterval);
            }
        }
        if (targets.length && this.state.worldTime >= this.starAt && !Array.from(this.lootData.values()).some(l => l.star)) {
            const center = this.state.players.get(this.state.hostSessionId) || targets[0][1], rng = rngFor(`${this.state.worldSeed}:star:${++this.starSeq}`);
            for (let a = 0; a < 12; a++) {
                const angle = rng() * Math.PI * 2, d = 320 + rng() * 360, x = center.x + Math.cos(angle) * d, y = center.y + Math.sin(angle) * d;
                if (biomeAt(Math.floor(x / 16), Math.floor(y / 16), this.state.worldSeed) !== 0) {
                    this.equipment(`star:${this.starSeq}`, x, y, 'star', 3, 0, true);
                    break;
                }
            }
            this.starAt = this.state.worldTime + 120 + rng() * 80;
        }
        if (this.pruneBank >= 1) {
            this.pruneBank = 0;
            for (const [id, l] of this.lootJournal)
                if (l.expiresAt > 0 && l.expiresAt <= now) {
                    this.deleteLoot(id);
                    this.broadcast('loot:removed', { id });
                }
        }
        const ms = performance.now() - started;
        this.metrics.ticks++;
        this.metrics.totalMs += ms;
        this.metrics.maxMs = Math.max(this.metrics.maxMs, ms);
        this.metrics.entitiesPeak = Math.max(this.metrics.entitiesPeak, this.state.entities.size);
        this.metrics.lootPeak = Math.max(this.metrics.lootPeak, this.state.loot.size);
    }
}
export { CODE_RE, PLAYER_LIMIT, safeName };
