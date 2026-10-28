import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { after, before, test } from "node:test";
import { Client } from "@colyseus/sdk";

let child;
let endpoint;
let childOutput = "";
const clients = [];
const rooms = [];

async function freePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => listener.once("error", reject).listen(0, "127.0.0.1", resolve));
  const { port } = listener.address();
  await new Promise(resolve => listener.close(resolve));
  return port;
}

async function waitFor(check, message, timeoutMs = 8000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const result = await check();
    if (result) return result;
    await delay(30);
  }
  throw new Error(message);
}

async function jsonPost(path, body) {
  const response = await fetch(`${endpoint}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { response, data: await response.json() };
}

async function consume(reservation) {
  const client = new Client(endpoint);
  clients.push(client);
  const room = await client.consumeSeatReservation(reservation);
  for (const type of ["party:member", "party:started", "party:ended", "world:node-change", "world:enemy-change", "loot:upserted", "loot:claimed", "loot:removed", "loot:denied"]) room.onMessage(type, () => {});
  rooms.push(room);
  return room;
}

before(async () => {
  const port = await freePort();
  endpoint = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["dist/index.js"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, PORT: String(port), DRIFTER_MAX_PLAYERS: "4", DRIFTER_ALLOWED_ORIGINS: "*" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", chunk => { childOutput += chunk.toString(); });
  child.stderr.on("data", chunk => { childOutput += chunk.toString(); });
  child.on("error", error => { childOutput += String(error); });
  try {
    await waitFor(async () => {
      try { return (await fetch(`${endpoint}/health`)).ok; } catch { return false; }
    }, "Colyseus server did not start.", 15000);
  } catch { throw new Error(`Colyseus server did not start. ${childOutput}`); }
});

after(async () => {
  await Promise.allSettled(rooms.map(room => room.leave()));
  for (const client of clients) client.close?.();
  if (child && !child.killed) child.kill();
});

test("room code joins, shared seed/state, loot arbitration, and four-player limit", async () => {
  const created = await jsonPost("/api/rooms", { nickname: "Host", worldSeed: 1234567, x: 440, y: 192, requestId: crypto.randomUUID() });
  assert.equal(created.response.status, 201);
  assert.match(created.data.code, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(created.data.worldSeed, 1234567);
  const host = await consume(created.data.reservation);
  await waitFor(() => host.state?.players?.size === 1, "Host did not join.");
  assert.equal(host.state.players.get(host.sessionId).role, "host");
  assert.equal(host.state.players.get(host.sessionId).x, 440);

  host.send("room:start");
  await waitFor(() => host.state?.started === true, "Host start did not reach shared state.");

  const joined = [];
  for (const nickname of ["Guest one", "Guest two", "Guest three"]) {
    const result = await jsonPost("/api/rooms/join", { code: created.data.code.toLowerCase(), nickname });
    assert.equal(result.response.status, 200);
    joined.push(await consume(result.data.reservation));
  }
  const [guest, guestTwo, guestThree] = joined;
  await Promise.all(joined.map(room => waitFor(() => room.state?.players?.size === 4, "Room state did not reach four players.")));
  for (const room of [host, ...joined]) {
    assert.equal(room.state.worldSeed, 1234567);
    assert.equal(room.state.started, true);
  }

  const full = await jsonPost("/api/rooms/join", { code: created.data.code, nickname: "Overflow" });
  assert.equal(full.response.status, 409);
  assert.equal(full.data.code, "ROOM_FULL");

  // The authored camp tree uses id 0,0:8001 in both the browser world and server validator.
  guest.send("world:node-hit", { id: "0,0:8001", kind: "tree", damage: 1 });
  await waitFor(() => host.state.nodes.get("0,0:8001")?.hp === 3, "Node damage did not synchronize to the host.");
  await waitFor(() => guestTwo.state.nodes.get("0,0:8001")?.hp === 3, "Node damage did not synchronize to the third client.");

  host.send("world:enemy-snapshot", { entities: [{ id: "0,0:slime:55,24", kind: "slime", x: 440, y: 192, hp: 6, maxHp: 6, dead: false, aggroed: true }] });
  await waitFor(() => guest.state.entities.get("0,0:slime:55,24")?.hp === 6, "Enemy state did not reach a second client.");
  guest.send("world:enemy-hit", { id: "0,0:slime:55,24", kind: "slime", damage: 2 });
  await waitFor(() => host.state.entities.get("0,0:slime:55,24")?.hp === 4, "Enemy damage did not synchronize to the host.");
  await waitFor(() => guestThree.state.entities.get("0,0:slime:55,24")?.hp === 4, "Enemy damage did not synchronize to the fourth client.");

  host.send("loot:upsert", { id: "integration-loot", kind: "resource", res: "wood", x: 440, y: 192, vx: 0, vy: 0, ttl: null });
  await waitFor(() => guest.state.loot.has("integration-loot"), "Loot did not synchronize to a guest.");
  const winners = [];
  host.onMessage("loot:claimed", data => { if (data.id === "integration-loot") winners.push(data.claimant); });
  host.send("loot:claim", { id: "integration-loot" });
  guest.send("loot:claim", { id: "integration-loot" });
  await waitFor(() => winners.length > 0, "Loot claim was not resolved.");
  await delay(150);
  assert.equal(winners.length, 1, "A shared loot item must have only one winner.");
  await waitFor(() => !guestThree.state.loot.has("integration-loot"), "Claimed loot remained in shared state.");
});

