import { Client, Room } from "colyseus";
import { DrifterRoomState, PlayerState, SharedEntity, SharedLoot, SharedNode } from "./schema.js";
import { findWorldNode, NODE_HP, positionBlocked, WORLD_CHUNK_SIZE } from "./world.js";

const PLAYER_LIMIT = Math.max(2, Math.min(8, Number(process.env.DRIFTER_MAX_PLAYERS) || 4));
const MAX_COORD = 10_000_000;
const ENEMY_HP: Record<string, number> = { slime: 6, wolf: 10, golem: 20, spider: 8, bat: 4 };
const RESOURCE_TYPES = new Set(["wood", "stone", "iron", "crystal", "berry", "jelly", "fang", "core"]);
const ITEM_BASES = new Set(["pickaxe", "sword", "axe", "staff", "spear", "bow", "shield", "boots", "coat", "ring", "charm"]);
const ITEM_STATS = new Set(["atk", "spd", "vit", "stam", "regen", "range", "luck"]);
const NAME_RE = /^[^<>\u0000-\u001f]{1,20}$/;
const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;

type ClientOptions = { roomCode?: unknown; nickname?: unknown; role?: unknown };
type RoomOptions = { roomCode?: unknown; worldSeed?: unknown; maxPlayers?: unknown; x?: unknown; y?: unknown };
type PlayerRuntime = { lastMoveAt: number; lastSnapshotAt: number; lastHitAt: number; lastNodeHitAt: number; lastLootAt: number; lastEntityAt: number; moveSeq: number };
type Loose = Record<string, unknown>;

function object(value: unknown): Loose | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Loose : null;
}
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function safeName(value: unknown): string {
  const name = String(value ?? "Drifter").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 20);
  return name || "Drifter";
}
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function safePosition(x: unknown, y: unknown): x is number {
  return finite(x) && finite(y) && Math.abs(x) <= MAX_COORD && Math.abs(y as number) <= MAX_COORD;
}
function randomSeed() { return Math.floor(Math.random() * 2_147_483_646) + 1; }
function stableSeed(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) || 1;
}
function sanitizeGear(raw: unknown): object | null {
  const gear = object(raw); if (!gear || typeof gear.base !== "string" || !ITEM_BASES.has(gear.base) || !Array.isArray(gear.opts)) return null;
  const opts = gear.opts.slice(0, 3).flatMap(value => {
    const option = object(value);
    return option && typeof option.k === "string" && ITEM_STATS.has(option.k) && finite(option.v)
      ? [{ k: option.k, v: clamp(option.v, -100, 100) }] : [];
  });
  return {
    base: gear.base, opts, h1: clamp(Number(gear.h1) || 0, 0, 1_000_000_000), h2: clamp(Number(gear.h2) || 0, 0, 1_000_000_000),
    id: clamp(Number(gear.id) || 0, 0, 1_000_000_000), tier: clamp(Number(gear.tier) || 0, 0, 4),
    power: finite(gear.power) ? clamp(gear.power, 0, 100) : 1, origin: clamp(Number(gear.origin) || 0, 0, 100_000),
    source: typeof gear.source === "string" ? gear.source.slice(0, 24) : "field",
    ...(typeof gear.effect === "string" && /^[a-z0-9_-]{1,24}$/.test(gear.effect) ? { effect: gear.effect } : {}),
  };
}
function sanitizeLoot(raw: unknown): Loose | null {
  const item = object(raw); if (!item || typeof item.id !== "string" || item.id.length > 180 || !safePosition(item.x, item.y)) return null;
  const ttl = item.ttl === null ? null : finite(item.ttl) ? clamp(item.ttl, 0, 45) : null;
  if (item.kind === "resource" && typeof item.res === "string" && RESOURCE_TYPES.has(item.res)) {
    return { id: item.id, kind: "resource", res: item.res, x: item.x, y: item.y, vx: finite(item.vx) ? clamp(item.vx, -200, 200) : 0, vy: finite(item.vy) ? clamp(item.vy, -200, 200) : 0, ttl, star: false };
  }
  if (item.kind === "equipment") {
    const gear = sanitizeGear(item.eq); if (!gear) return null;
    return { id: item.id, kind: "equipment", eq: gear, x: item.x, y: item.y, ttl, star: item.star === true };
  }
  return null;
}

class RateGate {
  private events = new Map<string, number[]>();
  allow(key: string, intervalMs: number, limit: number, now = Date.now()) {
    const active = (this.events.get(key) ?? []).filter(time => now - time < intervalMs);
    if (active.length >= limit) { this.events.set(key, active); return false; }
    active.push(now); this.events.set(key, active);
    if (this.events.size > 4000) this.events.delete(this.events.keys().next().value!);
    return true;
  }
}

export class DrifterRoom extends Room<{ state: DrifterRoomState }> {
  maxClients = PLAYER_LIMIT;
  state = new DrifterRoomState();
  private roomCode = "";
  private runtime = new Map<string, PlayerRuntime>();
  private deadNodes = new Set<string>();
  private hitIds = new Set<string>();
  private gate = new RateGate();
  private entitySeenAt = new Map<string, number>();
  private hostX = 268;
  private hostY = 268;

  onCreate(options: RoomOptions) {
    this.roomCode = String(options.roomCode ?? "").toUpperCase();
    if (!CODE_RE.test(this.roomCode)) throw new Error("Invalid room code.");
    this.maxClients = clamp(Number(options.maxPlayers) || PLAYER_LIMIT, 2, 8);
    this.state.roomCode = this.roomCode;
    this.state.worldSeed = clamp(Math.trunc(Number(options.worldSeed) || randomSeed()), 1, 4_294_967_295);
    if (safePosition(options.x, options.y)) {
      this.hostX = clamp(options.x, -MAX_COORD, MAX_COORD);
      this.hostY = clamp(options.y as number, -MAX_COORD, MAX_COORD);
    }
    this.setPrivate(true);
    this.setPatchRate(50);
    this.onMessage("room:start", (client) => this.startRoom(client));
    this.onMessage("player:snapshot", (client, message) => this.playerSnapshot(client, message));
    this.onMessage("world:node-hit", (client, message) => this.nodeHit(client, message));
    this.onMessage("world:interact", (client, message) => this.worldInteract(client, message));
    this.onMessage("world:enemy-snapshot", (client, message) => this.enemySnapshot(client, message));
    this.onMessage("world:enemy-hit", (client, message) => this.enemyHit(client, message));
    this.onMessage("loot:upsert", (client, message) => this.upsertLoot(client, message));
    this.onMessage("loot:claim", (client, message) => this.claimLoot(client, message));
    this.onMessage("loot:remove", (client, message) => this.removeLoot(client, message));
    this.setSimulationInterval(() => this.pruneStale(), 1000);
  }

  async onAuth(_client: Client, options: ClientOptions) {
    const code = String(options.roomCode ?? "").toUpperCase();
    const name = safeName(options.nickname);
    if (code !== this.roomCode || !CODE_RE.test(code)) throw new Error("ROOM_CODE_INVALID");
    if (!NAME_RE.test(name)) throw new Error("NICKNAME_INVALID");
    if (this.state.players.size >= this.maxClients) throw new Error("ROOM_FULL");
    const role = options.role === "host" && !this.state.hostSessionId ? "host" : "guest";
    return { nickname: name, role };
  }

  onJoin(client: Client, options: ClientOptions, auth: { nickname?: string; role?: string }) {
    const player = new PlayerState();
    player.nickname = safeName(auth?.nickname ?? options.nickname);
    player.role = auth?.role === "host" && !this.state.hostSessionId ? "host" : "guest";
    if (player.role === "host") {
      this.state.hostSessionId = client.sessionId;
      player.x = this.hostX; player.y = this.hostY;
    } else if (this.state.started) {
      const host = this.state.players.get(this.state.hostSessionId);
      if (host) { player.x = host.x + 24; player.y = host.y + 24; }
    }
    this.state.players.set(client.sessionId, player);
    const now = Date.now();
    this.runtime.set(client.sessionId, { lastMoveAt: now, lastSnapshotAt: 0, lastHitAt: 0, lastNodeHitAt: 0, lastLootAt: 0, lastEntityAt: 0, moveSeq: 0 });
    this.broadcast("party:member", { action: "joined", nickname: player.nickname, role: player.role });
  }

  onDrop(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;
    this.allowReconnection(client, 30);
  }

  onReconnect(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = true;
  }

  onLeave(client: Client) {
    const wasHost = this.state.hostSessionId === client.sessionId;
    this.state.players.delete(client.sessionId);
    this.runtime.delete(client.sessionId);
    if (wasHost) {
      this.broadcast("party:ended", { reason: "host-left" });
      this.disconnect();
    } else {
      this.broadcast("party:member", { action: "left" });
    }
  }

  private startRoom(client: Client) {
    if (client.sessionId !== this.state.hostSessionId || this.state.started) return;
    this.state.started = true;
    this.broadcast("party:started", { worldSeed: this.state.worldSeed });
  }

  private playerSnapshot(client: Client, raw: unknown) {
    const player = this.state.players.get(client.sessionId), runtime = this.runtime.get(client.sessionId), data = object(raw);
    const now = Date.now();
    if (!player || !runtime || !this.state.started || !data || now - runtime.lastSnapshotAt < 70) return;
    runtime.lastSnapshotAt = now;
    if (!safePosition(data.x, data.y)) return;
    const x = clamp(data.x, -MAX_COORD, MAX_COORD), y = clamp(data.y as number, -MAX_COORD, MAX_COORD);
    const elapsed = clamp((now - runtime.lastMoveAt) / 1000, 0.05, 0.5);
    const distance = Math.hypot(x - player.x, y - player.y);
    if (distance > elapsed * 300 + 20) return;
    const dx = x - player.x, dy = y - player.y;
    const isBlocked = (sx: number, sy: number, tx: number, ty: number) => {
      const length = Math.hypot(tx - sx, ty - sy), steps = Math.max(1, Math.ceil(length / 6));
      for (let i = 1; i <= steps; i++) {
        const stepX = sx + (tx - sx) * i / steps, stepY = sy + (ty - sy) * i / steps;
        if (positionBlocked(this.state.worldSeed, stepX, stepY, sx, sy, this.deadNodes)) return true;
      }
      return false;
    };
    let nextX = player.x, nextY = player.y;
    if (dx && !isBlocked(player.x, player.y, x, player.y)) nextX = x;
    if (dy && !isBlocked(nextX, player.y, nextX, y)) nextY = y;
    player.x = nextX; player.y = nextY;
    runtime.lastMoveAt = now; runtime.moveSeq++;
    player.hp = clamp(finite(data.hp) ? data.hp : player.hp, 0, clamp(finite(data.maxHp) ? data.maxHp : player.maxHp, 1, 1000));
    player.maxHp = clamp(finite(data.maxHp) ? data.maxHp : player.maxHp, 1, 1000);
    player.level = Math.round(clamp(finite(data.level) ? data.level : player.level, 1, 999));
    player.face = data.face === -1 ? -1 : 1;
    player.phase = finite(data.phase) ? data.phase % 10000 : player.phase;
    player.moving = data.moving === true;
  }

  private nodeHit(client: Client, raw: unknown) {
    const player = this.state.players.get(client.sessionId), runtime = this.runtime.get(client.sessionId), data = object(raw);
    if (!player || !runtime || !this.state.started || !data || typeof data.id !== "string" || data.id.length > 160) return;
    const now = Date.now();
    if (!this.gate.allow(`${client.sessionId}:node`, 1000, 3, now) || now - runtime.lastNodeHitAt < 280) return;
    runtime.lastNodeHitAt = now;
    const node = findWorldNode(this.state.worldSeed, data.id);
    if (!node || node.kind !== data.kind || !["tree", "bush", "rock", "iron", "crystal"].includes(node.kind)) return;
    if (Math.hypot(player.x - node.x, player.y - node.y) > 112) return;
    let shared = this.state.nodes.get(node.id);
    if (!shared) {
      shared = new SharedNode(); shared.id = node.id; shared.kind = node.kind; shared.x = node.x; shared.y = node.y;
      shared.hp = node.hp; shared.maxHp = node.hp; this.state.nodes.set(node.id, shared);
    }
    if (shared.dead || shared.hp <= 0) return;
    const damage = Math.round(clamp(finite(data.damage) ? data.damage : 1, 1, 20));
    shared.hp = Math.max(0, shared.hp - damage);
    shared.dead = shared.hp <= 0;
    shared.revision++;
    shared.lastDamage = damage;
    shared.randomSeed = stableSeed(`${this.state.worldSeed}:${node.id}:${shared.revision}:${client.sessionId}`);
    shared.lastAction = "hit"; shared.lastActorSessionId = client.sessionId;
    if (shared.dead) this.deadNodes.add(node.id);
    this.broadcast("world:node-change", { id: shared.id, kind: shared.kind, hp: shared.hp, maxHp: shared.maxHp, dead: shared.dead, revision: shared.revision, damage, randomSeed: shared.randomSeed, actorId: client.sessionId });
  }

  private worldInteract(client: Client, raw: unknown) {
    const player = this.state.players.get(client.sessionId), runtime = this.runtime.get(client.sessionId), data = object(raw);
    if (!player || !runtime || !this.state.started || !data || typeof data.id !== "string" || data.id.length > 160) return;
    const now = Date.now();
    if (!this.gate.allow(`${client.sessionId}:interact`, 1000, 2, now)) return;
    const node = findWorldNode(this.state.worldSeed, data.id);
    if (!node || node.kind !== data.kind || !["cave", "ruin"].includes(node.kind)) return;
    if (Math.hypot(player.x - node.x, player.y - node.y) > 128) return;
    let shared = this.state.nodes.get(node.id);
    if (!shared) {
      shared = new SharedNode(); shared.id = node.id; shared.kind = node.kind; shared.x = node.x; shared.y = node.y;
      shared.hp = node.hp; shared.maxHp = node.hp; this.state.nodes.set(node.id, shared);
    }
    if (shared.looted || shared.dead) return;
    shared.looted = true; shared.dead = true; shared.hp = 0; shared.revision++;
    shared.lastAction = "interact"; shared.lastDamage = 0; shared.lastActorSessionId = client.sessionId;
    shared.randomSeed = stableSeed(`${this.state.worldSeed}:${node.id}:interact:${shared.revision}`);
    this.deadNodes.add(node.id);
    this.broadcast("world:node-change", { id: shared.id, kind: shared.kind, hp: 0, maxHp: shared.maxHp, dead: true, looted: true, revision: shared.revision, damage: 0, randomSeed: shared.randomSeed, actorId: client.sessionId, action: "interact" });
  }

  private enemySnapshot(client: Client, raw: unknown) {
    const runtime = this.runtime.get(client.sessionId), data = object(raw), list = data?.entities;
    const now = Date.now();
    if (!runtime || !this.state.started || !Array.isArray(list) || list.length > 32 || now - runtime.lastEntityAt < 400) return;
    runtime.lastEntityAt = now;
    for (const rawItem of list) {
      const item = object(rawItem);
      if (!item || typeof item.id !== "string" || item.id.length > 180 || typeof item.kind !== "string" || !ENEMY_HP[item.kind] || !safePosition(item.x, item.y)) continue;
      const id = item.id;
      if (!/^-?\d+,-?\d+:[a-z]+:-?\d+,-?\d+$/.test(id) && !/^-?\d+,-?\d+:cave:\d+:bat:\d+$/.test(id)) continue;
      const player = this.state.players.get(client.sessionId);
      if (!player || Math.hypot(player.x - (item.x as number), player.y - (item.y as number)) > WORLD_CHUNK_SIZE * 4) continue;
      const shared = this.state.entities.get(id) ?? new SharedEntity();
      if (this.state.entities.has(id) && shared.dead && item.dead !== true) continue;
      const previousSeenAt = this.entitySeenAt.get(id) ?? now;
      const speed = Math.hypot((item.x as number) - shared.x, (item.y as number) - shared.y);
      if (this.state.entities.has(id) && speed > (now - previousSeenAt) / 1000 * 420 + 44 && !shared.dead) continue;
      shared.id = id; shared.kind = item.kind; shared.x = item.x as number; shared.y = item.y as number;
      shared.maxHp = clamp(finite(item.maxHp) ? item.maxHp : ENEMY_HP[item.kind], ENEMY_HP[item.kind], 500);
      const reportedHp = clamp(finite(item.hp) ? item.hp : shared.hp || shared.maxHp, 0, shared.maxHp);
      shared.hp = this.state.entities.has(id) ? Math.min(shared.hp, reportedHp) : reportedHp;
      shared.dead = item.dead === true || shared.hp <= 0; shared.aggroed = item.aggroed === true;
      shared.face = item.face === -1 ? -1 : 1; shared.anim = finite(item.anim) ? item.anim % 10000 : shared.anim;
      shared.revision++; shared.lastDamage = 0; shared.lastActorSessionId = "";
      if (!this.state.entities.has(id)) this.state.entities.set(id, shared);
      this.entitySeenAt.set(id, now);
    }
  }

  private enemyHit(client: Client, raw: unknown) {
    const player = this.state.players.get(client.sessionId), runtime = this.runtime.get(client.sessionId), data = object(raw);
    if (!player || !runtime || !this.state.started || !data || typeof data.id !== "string" || data.id.length > 180) return;
    const now = Date.now();
    if (now - runtime.lastHitAt < 180 || !this.gate.allow(`${client.sessionId}:enemy`, 1000, 5, now)) return;
    runtime.lastHitAt = now;
    const enemy = this.state.entities.get(data.id);
    if (!enemy || enemy.dead || enemy.kind !== data.kind || Math.hypot(player.x - enemy.x, player.y - enemy.y) > 112) return;
    const damage = Math.round(clamp(finite(data.damage) ? data.damage : 1, 1, 35));
    enemy.hp = Math.max(0, enemy.hp - damage); enemy.dead = enemy.hp <= 0;
    enemy.revision++; enemy.lastDamage = damage;
    enemy.lastActorSessionId = client.sessionId;
    enemy.randomSeed = stableSeed(`${this.state.worldSeed}:${enemy.id}:${enemy.revision}:${client.sessionId}`);
    this.broadcast("world:enemy-change", { id: enemy.id, kind: enemy.kind, hp: enemy.hp, maxHp: enemy.maxHp, dead: enemy.dead, revision: enemy.revision, damage, randomSeed: enemy.randomSeed, actorId: client.sessionId });
  }

  private upsertLoot(client: Client, raw: unknown) {
    const player = this.state.players.get(client.sessionId), runtime = this.runtime.get(client.sessionId), data = object(raw);
    const now = Date.now();
    if (!player || !runtime || !this.state.started || !data || now - runtime.lastLootAt < 90 || this.state.loot.size >= 300) return;
    runtime.lastLootAt = now;
    const item = sanitizeLoot(data);
    if (!item || Math.hypot(player.x - (item.x as number), player.y - (item.y as number)) > WORLD_CHUNK_SIZE * 2) return;
    const id = String(item.id), existing = this.state.loot.get(id);
    if (existing) {
      if (existing.ownerSessionId !== client.sessionId) return;
      existing.x = item.x as number; existing.y = item.y as number; existing.data = JSON.stringify(item);
      existing.expiresAt = item.ttl === null ? 0 : now + Number(item.ttl) * 1000;
      this.broadcast("loot:upserted", { item });
      return;
    }
    const shared = new SharedLoot();
    shared.id = id; shared.ownerSessionId = client.sessionId;
    shared.x = item.x as number; shared.y = item.y as number; shared.data = JSON.stringify(item);
    shared.expiresAt = item.ttl === null ? 0 : now + Number(item.ttl) * 1000;
    this.state.loot.set(shared.id, shared);
    this.broadcast("loot:upserted", { item });
  }

  private claimLoot(client: Client, raw: unknown) {
    const player = this.state.players.get(client.sessionId), data = object(raw);
    if (!player || !data || typeof data.id !== "string" || data.id.length > 180 || !this.gate.allow(`${client.sessionId}:loot`, 1000, 8)) return;
    const item = this.state.loot.get(data.id);
    if (!item || Math.hypot(player.x - item.x, player.y - item.y) > 112) {
      client.send("loot:denied", { id: data.id }); return;
    }
    this.state.loot.delete(data.id);
    this.broadcast("loot:claimed", { id: data.id, claimant: client.sessionId });
  }

  private removeLoot(client: Client, raw: unknown) {
    const data = object(raw);
    if (!data || typeof data.id !== "string" || data.id.length > 180) return;
    const item = this.state.loot.get(data.id);
    if (!item || item.ownerSessionId !== client.sessionId) return;
    this.state.loot.delete(data.id);
    this.broadcast("loot:removed", { id: data.id });
  }

  private pruneStale() {
    if (!this.clients.length) return;
    const now = Date.now();
    for (const [id, seenAt] of this.entitySeenAt) {
      if (now - seenAt < 12_000) continue;
      this.entitySeenAt.delete(id); this.state.entities.delete(id);
    }
    for (const [id, item] of this.state.loot) {
      if (item.expiresAt > 0 && item.expiresAt <= now) {
        this.state.loot.delete(id); this.broadcast("loot:removed", { id });
      }
    }
  }
}

export { CODE_RE, PLAYER_LIMIT, safeName };
