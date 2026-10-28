import { createServer as createHttpServer } from "node:http";
import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import cors from "cors";
import express, { type Application, type Request, type Response } from "express";
import { defineRoom, defineServer, matchMaker, type RegisteredHandler } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { DrifterRoom, CODE_RE, safeName } from "./DrifterRoom.js";
import { MemoryRoutingStore, RedisRoutingStore, type RoutingStore } from "./routingStore.js";

type ServiceRole = "single" | "gateway" | "worker";
type WorkerConfig = { index: number; baseUrl: string };
type RoomRoute = { workerIndex: number; roomId: string; createdAt: number };
type CreateRequest = { roomCode: string; nickname: string; worldSeed: number; x: number; y: number };
type SeatReservation = Awaited<ReturnType<typeof matchMaker.create>>;

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const createLimiter = new Map<string, number[]>();
const createRequests = new Map<string, { bodyHash: string; result: unknown; expiresAt: number }>();
const roomCodes = new Map<string, string>();
const CREATE_CACHE_TTL_MS = 30_000;
const CREATE_LOCK_TTL_MS = 20_000;
const ROOM_ROUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ROOM_CODE_PREFIX = "drifter:room:";
const CREATE_CACHE_PREFIX = "drifter:create:";
const CREATE_LOCK_PREFIX = "drifter:create-lock:";

function readServiceRole(): ServiceRole {
  const value = process.env.DRIFTER_SERVICE_ROLE ?? "single";
  if (value === "single" || value === "gateway" || value === "worker") return value;
  throw new Error(`Invalid DRIFTER_SERVICE_ROLE: ${value}`);
}

function cleanIp(req: Request) {
  return String(req.ip || "unknown").slice(0, 80);
}

function allowRequest(store: Map<string, number[]>, key: string, limit: number, windowMs: number) {
  const now = Date.now(), active = (store.get(key) ?? []).filter(at => now - at < windowMs);
  if (active.length >= limit) { store.set(key, active); return false; }
  active.push(now); store.set(key, active);
  if (store.size > 3000) store.delete(store.keys().next().value!);
  return true;
}

function newCode() {
  let code = "";
  for (let i = 0; i < 8; i++) code += alphabet[randomInt(alphabet.length)];
  return code;
}

function errorResponse(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ code, error: message });
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function isInternalRequest(req: Request) {
  const expected = process.env.DRIFTER_INTERNAL_SECRET ?? "";
  const header = req.headers.authorization ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  return safeEqual(expected, supplied);
}

function corsOrigins() {
  return process.env.DRIFTER_ALLOWED_ORIGINS?.split(",").map(value => value.trim()).filter(Boolean) ?? ["*"];
}

function configureCommon(app: Application) {
  app.set("trust proxy", 1);
  const configuredOrigins = corsOrigins();
  app.use(cors({ origin: configuredOrigins.includes("*") ? "*" : configuredOrigins, methods: ["GET", "POST", "OPTIONS"], allowedHeaders: ["Content-Type"] }));
  app.use(express.json({ limit: "8kb" }));
}

function registerHealthAndRoot(app: Application, role: ServiceRole, store?: RoutingStore, workerCount = 0) {
  app.get("/health", async (_req, res) => {
    if (role === "gateway" && store) {
      try {
        await store.ping();
        return res.status(200).json({ ok: true, service: "drifter-gateway", workers: workerCount });
      } catch {
        return res.status(503).json({ ok: false, service: "drifter-gateway", error: "routing store unavailable" });
      }
    }
    return res.status(200).json({
      ok: true,
      service: role === "worker" ? "drifter-node" : "drifter-colyseus",
      rooms: matchMaker.stats.local.roomCount,
    });
  });
  app.get("/", (_req, res) => res.type("text/plain").send(role === "gateway" ? "Drifter room gateway is running." : "Drifter multiplayer server is running."));
}

function normalizeCreateRequest(body: Record<string, unknown>, roomCode: string): CreateRequest {
  const requestedSeed = Number(body.worldSeed);
  const worldSeed = Number.isSafeInteger(requestedSeed) && requestedSeed > 0 && requestedSeed <= 4_294_967_295 ? requestedSeed : randomInt(1, 2_147_483_646);
  const x = typeof body.x === "number" && Number.isFinite(body.x) && Math.abs(body.x) <= 10_000_000 ? body.x : 268;
  const y = typeof body.y === "number" && Number.isFinite(body.y) && Math.abs(body.y) <= 10_000_000 ? body.y : 268;
  return { roomCode, worldSeed, nickname: safeName(body.nickname), x, y };
}

function requestBody(req: Request) {
  return req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {};
}

function registerSingleApi(app: Application) {
  app.post("/api/rooms", async (req, res) => {
    const ip = cleanIp(req);
    if (!allowRequest(createLimiter, `create:${ip}`, 8, 60_000)) return errorResponse(res, 429, "RATE_LIMITED", "잠시 후 다시 방을 만들어 주세요.");
    const body = requestBody(req);
    const nickname = safeName(body.nickname);
    const requestId = typeof body.requestId === "string" && /^[a-f0-9-]{16,80}$/i.test(body.requestId) ? body.requestId : randomUUID();
    const bodyHash = `${nickname}|${String(body.worldSeed ?? "new")}`;
    const cached = createRequests.get(requestId);
    if (cached && cached.expiresAt > Date.now()) {
      if (cached.bodyHash !== bodyHash) return errorResponse(res, 409, "REQUEST_CONFLICT", "요청이 이미 처리되었습니다. 다시 시도해 주세요.");
      return res.status(200).json(cached.result);
    }
    const request = normalizeCreateRequest({ ...body, nickname }, "");
    try {
      let roomCode = "", reservation: SeatReservation | undefined;
      for (let attempt = 0; attempt < 6; attempt++) {
        roomCode = newCode();
        try {
          reservation = await matchMaker.create("drifter", { ...request, roomCode, role: "host" });
          roomCodes.set(roomCode, reservation.roomId);
          break;
        } catch (error) { if (attempt === 5) throw error; }
      }
      if (!reservation) throw new Error("Room creation did not return a seat reservation.");
      const result = { code: roomCode, worldSeed: request.worldSeed, reservation };
      createRequests.set(requestId, { bodyHash, result, expiresAt: Date.now() + CREATE_CACHE_TTL_MS });
      if (createRequests.size > 1000) createRequests.delete(createRequests.keys().next().value!);
      return res.status(201).json(result);
    } catch {
      return errorResponse(res, 503, "ROOM_CREATE_FAILED", "방을 만들지 못했습니다. 서버 연결을 확인하고 다시 시도해 주세요.");
    }
  });

  app.post("/api/rooms/join", async (req, res) => {
    const ip = cleanIp(req);
    if (!allowRequest(createLimiter, `join:${ip}`, 24, 60_000)) return errorResponse(res, 429, "RATE_LIMITED", "코드 확인 요청이 많습니다. 잠시 후 다시 시도해 주세요.");
    const body = requestBody(req);
    const roomCode = String(body.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    if (!CODE_RE.test(roomCode)) return errorResponse(res, 400, "ROOM_CODE_INVALID", "방 코드를 8자리로 입력해 주세요.");
    const nickname = safeName(body.nickname);
    try {
      const roomId = roomCodes.get(roomCode);
      if (!roomId) return errorResponse(res, 404, "ROOM_NOT_FOUND", "방을 찾지 못했습니다. 코드가 맞는지 확인해 주세요.");
      let listing;
      try { listing = await matchMaker.getRoomById(roomId); }
      catch { roomCodes.delete(roomCode); return errorResponse(res, 404, "ROOM_NOT_FOUND", "방을 찾지 못했습니다. 방장이 나갔을 수 있습니다."); }
      if (!listing) { roomCodes.delete(roomCode); return errorResponse(res, 404, "ROOM_NOT_FOUND", "방을 찾지 못했습니다. 방장이 나갔을 수 있습니다."); }
      if (listing.locked || listing.clients >= listing.maxClients) return errorResponse(res, 409, "ROOM_FULL", "방이 가득 찼거나 종료되었습니다.");
      const reservation = await matchMaker.joinById(roomId, { roomCode, nickname, role: "guest" });
      return res.status(200).json({ code: roomCode, reservation });
    } catch (error) {
      const message = String((error as Error)?.message || "").toLowerCase();
      if (message.includes("full") || message.includes("capacity")) return errorResponse(res, 409, "ROOM_FULL", "방이 가득 찼습니다.");
      if (message.includes("not found") || message.includes("not available")) return errorResponse(res, 404, "ROOM_NOT_FOUND", "방을 찾지 못했습니다. 방장이 나갔을 수 있습니다.");
      return errorResponse(res, 503, "ROOM_JOIN_FAILED", "방에 참가하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  });

  app.all("/api/*path", (_req, res) => errorResponse(res, 404, "NOT_FOUND", "요청한 주소를 찾지 못했습니다."));
}

function configuredWorkers(): WorkerConfig[] {
  const workerIndexes = Object.keys(process.env)
    .map(key => /^DRIFTER_WORKER_(\d+)_INTERNAL_HOST$/.exec(key))
    .filter((match): match is RegExpExecArray => !!match)
    .map(match => Number(match[1]))
    .sort((a, b) => a - b);
  const workers = workerIndexes.map(index => {
    const host = process.env[`DRIFTER_WORKER_${index}_INTERNAL_HOST`]?.trim();
    if (!host) throw new Error(`DRIFTER_WORKER_${index}_INTERNAL_HOST is empty.`);
    const baseUrl = /^[a-z][a-z\d+.-]*:\/\//i.test(host) ? host : `http://${host}`;
    const parsed = new URL(baseUrl);
    if (!new Set(["http:", "https:"]).has(parsed.protocol)) throw new Error(`Worker ${index} must use HTTP or HTTPS.`);
    return { index, baseUrl: baseUrl.replace(/\/+$/, "") };
  });
  if (!workers.length) throw new Error("Gateway needs at least one DRIFTER_WORKER_N_INTERNAL_HOST setting.");
  return workers;
}

function parseRoute(value: string | null): RoomRoute | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<RoomRoute>;
    return Number.isInteger(parsed.workerIndex) && typeof parsed.roomId === "string" && parsed.roomId.length > 0 && typeof parsed.createdAt === "number"
      ? parsed as RoomRoute : null;
  } catch { return null; }
}

async function callWorker(worker: WorkerConfig, path: string, body: unknown, secret: string) {
  const response = await fetch(`${worker.baseUrl}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  });
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  return { status: response.status, data };
}

function workerReadiness(workers: WorkerConfig[]) {
  const cached = new Map<number, { ready: boolean; expiresAt: number }>();
  const pending = new Map<number, Promise<boolean>>();

  function probe(worker: WorkerConfig): Promise<boolean> {
    const previous = cached.get(worker.index);
    if (previous && previous.expiresAt > Date.now()) return Promise.resolve(previous.ready);
    const existing = pending.get(worker.index);
    if (existing) return existing;
    const check = (async () => {
      let ready = false;
      try {
        // GET wakes a sleeping Free service without reserving a player seat.
        const response = await fetch(`${worker.baseUrl}/health`, {
          signal: AbortSignal.timeout(3_000),
          headers: { accept: "application/json" },
        });
        const health = await response.json().catch(() => null) as { ok?: boolean } | null;
        ready = response.ok && health?.ok === true;
      } catch { /* A sleeping/unavailable node will be checked on the next user request. */ }
      cached.set(worker.index, { ready, expiresAt: Date.now() + 1_000 });
      pending.delete(worker.index);
      return ready;
    })();
    pending.set(worker.index, check);
    return check;
  }

  return {
    async readyWorkers() {
      const ready = await Promise.all(workers.map(probe));
      return workers.filter((_worker, index) => ready[index]);
    },
    probe,
    invalidate(index: number) { cached.delete(index); },
  };
}

function registerGatewayApi(app: Application, store: RoutingStore, workers: WorkerConfig[], secret: string) {
  const routeKey = (code: string) => `${ROOM_CODE_PREFIX}${code}`;
  const readiness = workerReadiness(workers);

  // This endpoint is polled only while a player is connecting, never by a keep-alive job.
  // Keep /health independent so sleeping game nodes don't restart a healthy gateway.
  app.get("/api/ready", async (req, res) => {
    const requested = req.query.worker;
    const worker = requested === undefined ? undefined : workers.find(value => String(value.index) === requested);
    if (requested !== undefined && !worker) return errorResponse(res, 400, "WORKER_INVALID", "게임 서버를 찾지 못했습니다.");
    const available = worker ? (await readiness.probe(worker) ? [worker] : []) : await readiness.readyWorkers();
    // Render-to-Render requests don't always wake a sleeping Free web service.
    // Publish only these already-public HTTPS origins so the connecting player can
    // request /health directly. Never expose private/internal service addresses.
    const wakeUrls = (worker ? [worker] : workers).flatMap(value => {
      const url = new URL(value.baseUrl);
      return url.protocol === "https:" && url.hostname.endsWith(".onrender.com") && !url.username && !url.password && !url.port
        ? [url.origin] : [];
    });
    res.set("Cache-Control", "no-store");
    if (!available.length) res.set("Retry-After", "2");
    return res.status(available.length ? 200 : 202).json({
      ok: true, ready: available.length > 0, workers: workers.length, readyWorkers: available.length, wakeUrls,
    });
  });

  function wakingResponse(res: Response, workerIndex?: number) {
    res.set("Retry-After", "2");
    return res.status(503).json({
      code: "WORKERS_WAKING", error: "게임 서버를 깨우고 있습니다. 잠시 기다려 주세요.",
      ...(workerIndex === undefined ? {} : { workerIndex }),
    });
  }

  async function allowDistributedRequest(kind: "create" | "join", ip: string, limit: number) {
    const windowMs = 60_000;
    const bucket = Math.floor(Date.now() / windowMs);
    const key = `drifter:rate:${kind}:${ip}:${bucket}`;
    return await store.increment(key, windowMs * 2) <= limit;
  }

  async function cachedCreate(requestId: string, bodyHash: string) {
    const raw = await store.get(`${CREATE_CACHE_PREFIX}${requestId}`);
    if (!raw) return { status: "missing" as const };
    try {
      const cached = JSON.parse(raw) as { bodyHash?: unknown; result?: unknown };
      if (cached.bodyHash !== bodyHash) return { status: "conflict" as const };
      return { status: "found" as const, result: cached.result };
    } catch { return { status: "missing" as const }; }
  }

  app.post("/api/rooms", async (req, res) => {
    const ip = cleanIp(req);
    try {
      if (!await allowDistributedRequest("create", ip, 8)) return errorResponse(res, 429, "RATE_LIMITED", "잠시 후 다시 방을 만들어 주세요.");
      const body = requestBody(req);
      const nickname = safeName(body.nickname);
      const requestId = typeof body.requestId === "string" && /^[a-f0-9-]{16,80}$/i.test(body.requestId) ? body.requestId : randomUUID();
      const bodyHash = `${nickname}|${String(body.worldSeed ?? "new")}`;
      const cached = await cachedCreate(requestId, bodyHash);
      if (cached.status === "conflict") return errorResponse(res, 409, "REQUEST_CONFLICT", "요청이 이미 처리되었습니다. 다시 시도해 주세요.");
      if (cached.status === "found") return res.status(200).json(cached.result);

      const availableWorkers = await readiness.readyWorkers();
      if (!availableWorkers.length) return wakingResponse(res);

      const lockKey = `${CREATE_LOCK_PREFIX}${requestId}`;
      const lockToken = randomUUID();
      if (!await store.set(lockKey, lockToken, CREATE_LOCK_TTL_MS, true)) {
        for (let attempt = 0; attempt < 15; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 100));
          const concurrent = await cachedCreate(requestId, bodyHash);
          if (concurrent.status === "conflict") return errorResponse(res, 409, "REQUEST_CONFLICT", "요청이 이미 처리되었습니다. 다시 시도해 주세요.");
          if (concurrent.status === "found") return res.status(200).json(concurrent.result);
        }
        return errorResponse(res, 409, "REQUEST_IN_PROGRESS", "방을 만들고 있습니다. 잠시 후 다시 시도해 주세요.");
      }

      try {
        const next = await store.increment("drifter:worker-cursor", 365 * 24 * 60 * 60 * 1000);
        const startAt = (next - 1) % availableWorkers.length;
        let lastError: unknown;
        for (let offset = 0; offset < availableWorkers.length; offset++) {
          const worker = availableWorkers[(startAt + offset) % availableWorkers.length];
          let code = "";
          const reservationMarker = randomUUID();
          for (let attempt = 0; attempt < 6; attempt++) {
            code = newCode();
            if (await store.set(routeKey(code), JSON.stringify({ creating: reservationMarker }), ROOM_ROUTE_TTL_MS, true)) break;
            code = "";
          }
          if (!code) throw new Error("Could not allocate a unique room code.");
          const routeReservation = await store.get(routeKey(code));
          try {
            const createRequest = normalizeCreateRequest({ ...body, nickname }, code);
            const workerResult = await callWorker(worker, "/internal/rooms/create", createRequest, secret);
            if (workerResult.status >= 400) {
              if (workerResult.status < 500) {
                await store.deleteIfValue(routeKey(code), routeReservation ?? "");
                const error = workerResult.data ?? {};
                return errorResponse(res, workerResult.status, String(error.code ?? "ROOM_CREATE_FAILED"), String(error.error ?? "방을 만들지 못했습니다."));
              }
              readiness.invalidate(worker.index);
              lastError = new Error(`Worker ${worker.index} returned ${workerResult.status}.`);
              await store.deleteIfValue(routeKey(code), routeReservation ?? "");
              continue;
            }
            const reservation = workerResult.data?.reservation as SeatReservation | undefined;
            const roomId = String(workerResult.data?.roomId ?? reservation?.roomId ?? "");
            if (!reservation || !roomId) throw new Error(`Worker ${worker.index} returned an invalid seat reservation.`);
            const result = { code, worldSeed: createRequest.worldSeed, reservation };
            const route: RoomRoute = { workerIndex: worker.index, roomId, createdAt: Date.now() };
            await store.set(routeKey(code), JSON.stringify(route), ROOM_ROUTE_TTL_MS);
            await store.set(`${CREATE_CACHE_PREFIX}${requestId}`, JSON.stringify({ bodyHash, result }), CREATE_CACHE_TTL_MS);
            return res.status(201).json(result);
          } catch (error) {
            readiness.invalidate(worker.index);
            lastError = error;
            await store.deleteIfValue(routeKey(code), routeReservation ?? "");
          }
        }
        console.error("Drifter gateway could not create a room on any worker.", lastError);
        return wakingResponse(res);
      } finally {
        await store.deleteIfValue(lockKey, lockToken);
      }
    } catch (error) {
      console.error("Drifter gateway create request failed.", error);
      return errorResponse(res, 503, "ROUTING_STORE_UNAVAILABLE", "방 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  });

  app.post("/api/rooms/join", async (req, res) => {
    const ip = cleanIp(req);
    try {
      if (!await allowDistributedRequest("join", ip, 24)) return errorResponse(res, 429, "RATE_LIMITED", "코드 확인 요청이 많습니다. 잠시 후 다시 시도해 주세요.");
      const body = requestBody(req);
      const code = String(body.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
      if (!CODE_RE.test(code)) return errorResponse(res, 400, "ROOM_CODE_INVALID", "방 코드를 8자리로 입력해 주세요.");
      let rawRoute = await store.get(routeKey(code));
      let route = parseRoute(rawRoute);
      if (!route) {
        if (rawRoute) await store.deleteIfValue(routeKey(code), rawRoute);
        // A Free gateway can sleep while players remain connected directly to a node.
        // Recover its volatile route from the node that still owns the live room.
        const available = await readiness.readyWorkers();
        if (!available.length) return wakingResponse(res);
        const found = await Promise.all(available.map(async worker => {
          try {
            const result = await callWorker(worker, "/internal/rooms/lookup", { roomCode: code }, secret);
            const roomId = result.data?.roomId;
            return result.status === 200 && typeof roomId === "string" && roomId
              ? { workerIndex: worker.index, roomId, createdAt: Date.now() } : null;
          } catch { return null; }
        }));
        route = found.find((value): value is RoomRoute => value !== null) ?? null;
        if (!route) return errorResponse(res, 404, "ROOM_NOT_FOUND", "방을 찾지 못했습니다. 코드가 맞는지 확인해 주세요.");
        rawRoute = JSON.stringify(route);
        await store.set(routeKey(code), rawRoute, ROOM_ROUTE_TTL_MS);
      }
      const worker = workers.find(value => value.index === route.workerIndex);
      if (!worker) {
        await store.deleteIfValue(routeKey(code), rawRoute ?? "");
        return errorResponse(res, 503, "ROOM_WORKER_UNAVAILABLE", "방 서버를 찾지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
      if (!await readiness.probe(worker)) return wakingResponse(res, worker.index);
      const result = await callWorker(worker, "/internal/rooms/join", {
        roomCode: code,
        roomId: route.roomId,
        nickname: safeName(body.nickname),
      }, secret);
      if (result.status >= 400) {
        if (result.status >= 500) {
          readiness.invalidate(worker.index);
          return wakingResponse(res, worker.index);
        }
        if (result.status === 404) await store.deleteIfValue(routeKey(code), rawRoute ?? "");
        const error = result.data ?? {};
        return errorResponse(res, result.status, String(error.code ?? "ROOM_JOIN_FAILED"), String(error.error ?? "방에 참가하지 못했습니다."));
      }
      await store.set(routeKey(code), JSON.stringify({ ...route, createdAt: route.createdAt }), ROOM_ROUTE_TTL_MS);
      return res.status(200).json({ code, reservation: result.data?.reservation });
    } catch (error) {
      console.error("Drifter gateway join request failed.", error);
      return errorResponse(res, 503, "ROOM_JOIN_FAILED", "방에 참가하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  });

  app.post("/internal/rooms/disposed", async (req, res) => {
    if (!isInternalRequest(req)) return errorResponse(res, 401, "UNAUTHORIZED", "인증이 필요합니다.");
    const body = requestBody(req);
    const code = String(body.roomCode ?? "").toUpperCase();
    const workerIndex = Number(body.workerIndex);
    const roomId = typeof body.roomId === "string" ? body.roomId : "";
    if (!CODE_RE.test(code) || !Number.isInteger(workerIndex) || !roomId) return errorResponse(res, 400, "INVALID_DISPOSE_EVENT", "방 종료 정보가 올바르지 않습니다.");
    const raw = await store.get(routeKey(code));
    const route = parseRoute(raw);
    if (route?.workerIndex === workerIndex && route.roomId === roomId && raw) await store.deleteIfValue(routeKey(code), raw);
    return res.status(204).end();
  });

  app.all("/api/*path", (_req, res) => errorResponse(res, 404, "NOT_FOUND", "요청한 주소를 찾지 못했습니다."));
  app.all("/internal/*path", (_req, res) => errorResponse(res, 404, "NOT_FOUND", "요청한 주소를 찾지 못했습니다."));
}

function registerWorkerApi(app: Application, workerIndex: number, secret: string, roomType: RegisteredHandler<DrifterRoom>) {
  const disposedCallback = process.env.DRIFTER_GATEWAY_INTERNAL_HOST?.trim();
  const gatewayBaseUrl = disposedCallback
    ? (/^[a-z][a-z\d+.-]*:\/\//i.test(disposedCallback) ? disposedCallback : `http://${disposedCallback}`).replace(/\/+$/, "")
    : "";
  const callbackUrl = gatewayBaseUrl ? `${gatewayBaseUrl}/internal/rooms/disposed` : "";

  app.post("/internal/rooms/create", async (req, res) => {
    if (!isInternalRequest(req)) return errorResponse(res, 401, "UNAUTHORIZED", "인증이 필요합니다.");
    const body = requestBody(req);
    const code = String(body.roomCode ?? "").toUpperCase();
    if (!CODE_RE.test(code)) return errorResponse(res, 400, "ROOM_CODE_INVALID", "방 코드가 올바르지 않습니다.");
    const createRequest = normalizeCreateRequest(body, code);
    try {
      const reservation = await matchMaker.create("drifter", { ...createRequest, role: "host", internalToken: secret });
      roomCodes.set(code, reservation.roomId);
      return res.status(201).json({ roomId: reservation.roomId, reservation });
    } catch (error) {
      console.error(`Drifter worker ${workerIndex} room creation failed.`, error);
      return errorResponse(res, 503, "ROOM_CREATE_FAILED", "방을 만들지 못했습니다.");
    }
  });

  app.post("/internal/rooms/lookup", async (req, res) => {
    if (!isInternalRequest(req)) return errorResponse(res, 401, "UNAUTHORIZED", "인증이 필요합니다.");
    const code = String(requestBody(req).roomCode ?? "").toUpperCase();
    if (!CODE_RE.test(code)) return errorResponse(res, 400, "ROOM_CODE_INVALID", "방 코드가 올바르지 않습니다.");
    const roomId = roomCodes.get(code);
    if (!roomId) return errorResponse(res, 404, "ROOM_NOT_FOUND", "방을 찾지 못했습니다.");
    try {
      if (await matchMaker.getRoomById(roomId)) return res.status(200).json({ roomId });
    } catch { /* The room finished while the gateway was recovering its route. */ }
    if (roomCodes.get(code) === roomId) roomCodes.delete(code);
    return errorResponse(res, 404, "ROOM_NOT_FOUND", "방을 찾지 못했습니다.");
  });

  app.post("/internal/rooms/join", async (req, res) => {
    if (!isInternalRequest(req)) return errorResponse(res, 401, "UNAUTHORIZED", "인증이 필요합니다.");
    const body = requestBody(req);
    const code = String(body.roomCode ?? "").toUpperCase();
    const roomId = typeof body.roomId === "string" ? body.roomId : "";
    if (!CODE_RE.test(code) || !roomId) return errorResponse(res, 400, "ROOM_JOIN_INVALID", "방 정보가 올바르지 않습니다.");
    try {
      const listing = await matchMaker.getRoomById(roomId);
      if (!listing) return errorResponse(res, 404, "ROOM_NOT_FOUND", "방을 찾지 못했습니다. 방장이 나갔을 수 있습니다.");
      if (listing.locked || listing.clients >= listing.maxClients) return errorResponse(res, 409, "ROOM_FULL", "방이 가득 찼거나 종료되었습니다.");
      const reservation = await matchMaker.joinById(roomId, {
        roomCode: code,
        nickname: safeName(body.nickname),
        role: "guest",
        internalToken: secret,
      });
      return res.status(200).json({ reservation });
    } catch (error) {
      const message = String((error as Error)?.message || "").toLowerCase();
      if (message.includes("full") || message.includes("capacity")) return errorResponse(res, 409, "ROOM_FULL", "방이 가득 찼습니다.");
      if (message.includes("not found") || message.includes("not available")) return errorResponse(res, 404, "ROOM_NOT_FOUND", "방을 찾지 못했습니다. 방장이 나갔을 수 있습니다.");
      return errorResponse(res, 503, "ROOM_JOIN_FAILED", "방에 참가하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  });

  app.all("/api/*path", (_req, res) => errorResponse(res, 404, "NOT_FOUND", "요청한 주소를 찾지 못했습니다."));
  app.all("/internal/*path", (_req, res) => errorResponse(res, 404, "NOT_FOUND", "요청한 주소를 찾지 못했습니다."));

  roomType.on("dispose", disposed => {
      const code = String((disposed as unknown as { roomCode?: unknown }).roomCode ?? "");
      if (!CODE_RE.test(code)) return;
      if (roomCodes.get(code) === disposed.roomId) roomCodes.delete(code);
      if (!callbackUrl) return;
      void fetch(callbackUrl, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        body: JSON.stringify({ roomCode: code, roomId: disposed.roomId, workerIndex }),
        signal: AbortSignal.timeout(3_000),
      }).catch(error => console.warn("Could not clear disposed room route.", error));
  });
}

function publicAddress() {
  const candidate = process.env.DRIFTER_PUBLIC_ADDRESS ?? process.env.RENDER_EXTERNAL_HOSTNAME ?? process.env.RENDER_EXTERNAL_URL;
  if (!candidate) return undefined;
  if (/^https?:\/\//i.test(candidate)) return new URL(candidate).host;
  return candidate.replace(/^wss?:\/\//i, "").replace(/\/$/, "");
}

async function start() {
  const role = readServiceRole();
  const port = Number(process.env.PORT) || 2567;

  if (role === "gateway") {
    const secret = process.env.DRIFTER_INTERNAL_SECRET ?? "";
    if (!secret) throw new Error("DRIFTER_INTERNAL_SECRET is required in gateway mode.");
    const workers = configuredWorkers();
    const store = process.env.REDIS_URL
      ? new RedisRoutingStore(process.env.REDIS_URL)
      : process.env.DRIFTER_ALLOW_IN_MEMORY_ROUTING_STORE === "1"
        ? new MemoryRoutingStore()
        : null;
    if (!store) throw new Error("REDIS_URL is required in gateway mode.");
    await store.ping();
    const app = express();
    configureCommon(app);
    registerHealthAndRoot(app, role, store, workers.length);
    registerGatewayApi(app, store, workers, secret);
    createHttpServer(app).listen(port, "0.0.0.0", () => console.info(`Drifter gateway listening on port ${port} with ${workers.length} worker(s).`));
    return;
  }

  const workerIndex = Number(process.env.DRIFTER_WORKER_INDEX ?? "1");
  const secret = process.env.DRIFTER_INTERNAL_SECRET ?? "";
  if (role === "worker" && !secret) throw new Error("DRIFTER_INTERNAL_SECRET is required in worker mode.");
  if (role === "worker" && !publicAddress()) throw new Error("DRIFTER_PUBLIC_ADDRESS or RENDER_EXTERNAL_HOSTNAME is required in worker mode.");
  if (role === "worker" && (!Number.isInteger(workerIndex) || workerIndex < 1)) throw new Error("DRIFTER_WORKER_INDEX must be a positive integer.");

  const drifterRoom = defineRoom(DrifterRoom).filterBy(["roomCode"]);
  if (role === "single") {
    drifterRoom.on("dispose", disposed => {
      for (const [code, roomId] of roomCodes) if (roomId === disposed.roomId) roomCodes.delete(code);
    });
  }
  const server = defineServer({
    publicAddress: role === "worker" ? publicAddress() : publicAddress(),
    transport: new WebSocketTransport({ pingInterval: 10_000, maxPayload: 256 * 1024 }),
    rooms: { drifter: drifterRoom },
    express: app => {
      configureCommon(app);
      registerHealthAndRoot(app, role);
      if (role === "single") registerSingleApi(app);
      else registerWorkerApi(app, workerIndex, secret, drifterRoom);
    },
  });
  await server.listen(port, "0.0.0.0");
  console.info(`Drifter ${role} service listening on port ${port}`);
}

void start().catch(error => {
  console.error("Drifter service failed to start.", error);
  process.exitCode = 1;
});
