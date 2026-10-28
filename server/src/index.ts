import { randomInt, randomUUID } from "node:crypto";
import cors from "cors";
import express, { type Request, type Response } from "express";
import { defineRoom, defineServer, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { DrifterRoom, CODE_RE, PLAYER_LIMIT, safeName } from "./DrifterRoom.js";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const createLimiter = new Map<string, number[]>();
const createRequests = new Map<string, { bodyHash: string; result: unknown; expiresAt: number }>();
const roomCodes = new Map<string, string>();

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
  res.status(status).json({ code, error: message });
}
const drifterRoom = defineRoom(DrifterRoom).filterBy(["roomCode"]);
drifterRoom.on("dispose", disposed => {
  for (const [code, roomId] of roomCodes) if (roomId === disposed.roomId) roomCodes.delete(code);
});
export const server = defineServer({
  transport: new WebSocketTransport({ pingInterval: 10_000 }),
  rooms: { drifter: drifterRoom },
  express: (app) => {
    app.set("trust proxy", 1);
    const configuredOrigins = process.env.DRIFTER_ALLOWED_ORIGINS?.split(",").map(value => value.trim()).filter(Boolean) ?? ["*"];
    app.use(cors({ origin: configuredOrigins.includes("*") ? "*" : configuredOrigins, methods: ["GET", "POST", "OPTIONS"], allowedHeaders: ["Content-Type"] }));
    app.use(express.json({ limit: "8kb" }));
    app.get("/health", (_req, res) => res.status(200).json({ ok: true, service: "drifter-colyseus", rooms: matchMaker.stats.local.roomCount }));

    app.post("/api/rooms", async (req, res) => {
      const ip = cleanIp(req);
      if (!allowRequest(createLimiter, `create:${ip}`, 8, 60_000)) return errorResponse(res, 429, "RATE_LIMITED", "잠시 후 다시 방을 만들어 주세요.");
      const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
      const nickname = safeName(body.nickname);
      const requestId = typeof body.requestId === "string" && /^[a-f0-9-]{16,80}$/i.test(body.requestId) ? body.requestId : randomUUID();
      const bodyHash = `${nickname}|${String(body.worldSeed ?? "new")}`;
      const cached = createRequests.get(requestId);
      if (cached && cached.expiresAt > Date.now()) {
        if (cached.bodyHash !== bodyHash) return errorResponse(res, 409, "REQUEST_CONFLICT", "요청이 이미 처리되었습니다. 다시 시도해 주세요.");
        return res.status(200).json(cached.result);
      }
      const requestedSeed = Number(body.worldSeed);
      const worldSeed = Number.isSafeInteger(requestedSeed) && requestedSeed > 0 && requestedSeed <= 4_294_967_295 ? requestedSeed : randomInt(1, 2_147_483_646);
      const x = typeof body.x === "number" && Number.isFinite(body.x) && Math.abs(body.x) <= 10_000_000 ? body.x : 268;
      const y = typeof body.y === "number" && Number.isFinite(body.y) && Math.abs(body.y) <= 10_000_000 ? body.y : 268;
      try {
        let roomCode = "", reservation: unknown;
        for (let attempt = 0; attempt < 6; attempt++) {
          roomCode = newCode();
          try {
            reservation = await matchMaker.create("drifter", { roomCode, worldSeed, nickname, role: "host", x, y });
            const seat = reservation as { roomId?: unknown; room?: { roomId?: unknown } };
            const roomId = String(seat?.roomId ?? seat?.room?.roomId ?? "");
            if (!roomId) throw new Error("Room creation did not return a room ID.");
            roomCodes.set(roomCode, roomId);
            break;
          }
          catch (error) { if (attempt === 5) throw error; }
        }
        const result = { code: roomCode, worldSeed, reservation };
        createRequests.set(requestId, { bodyHash, result, expiresAt: Date.now() + 30_000 });
        if (createRequests.size > 1000) createRequests.delete(createRequests.keys().next().value!);
        return res.status(201).json(result);
      } catch {
        return errorResponse(res, 503, "ROOM_CREATE_FAILED", "방을 만들지 못했습니다. 서버 연결을 확인하고 다시 시도해 주세요.");
      }
    });

    app.post("/api/rooms/join", async (req, res) => {
      const ip = cleanIp(req);
      if (!allowRequest(createLimiter, `join:${ip}`, 24, 60_000)) return errorResponse(res, 429, "RATE_LIMITED", "코드 확인 요청이 많습니다. 잠시 후 다시 시도해 주세요.");
      const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
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
    app.get("/", (_req, res) => res.type("text/plain").send("Drifter multiplayer server is running."));
  },
});

const port = Number(process.env.PORT) || 2567;
server.listen(port, "0.0.0.0");
console.info(`Drifter Colyseus server listening on port ${port}`);
