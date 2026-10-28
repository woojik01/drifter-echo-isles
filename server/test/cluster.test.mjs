import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { after, before, test } from "node:test";
import { Client } from "@colyseus/sdk";

const workerPorts = [];
const workers = [];
const clients = [];
const rooms = [];
let gateway;
let gatewayPort;
let gatewayEndpoint;
let childOutput = "";
const secret = "cluster-integration-secret-at-least-32-chars";

async function freePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => listener.once("error", reject).listen(0, "127.0.0.1", resolve));
  const { port } = listener.address();
  await new Promise(resolve => listener.close(resolve));
  return port;
}

async function waitFor(check, message, timeoutMs = 12_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const result = await check();
    if (result) return result;
    await delay(40);
  }
  throw new Error(`${message} ${childOutput}`);
}

function startProcess(name, port, env) {
  const child = spawn(process.execPath, ["dist/index.js"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, PORT: String(port), DRIFTER_ALLOWED_ORIGINS: "*", ...env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", chunk => { childOutput += `[${name}] ${chunk.toString()}`; });
  child.stderr.on("data", chunk => { childOutput += `[${name}] ${chunk.toString()}`; });
  child.on("error", error => { childOutput += `[${name}] ${String(error)}`; });
  return child;
}

async function post(path, body) {
  const response = await fetch(`${gatewayEndpoint}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { response, data: await response.json() };
}

async function consume(reservation) {
  const client = new Client(gatewayEndpoint);
  clients.push(client);
  const room = await client.consumeSeatReservation(reservation);
  room.onMessage("party:member", () => {});
  room.onMessage("party:started", () => {});
  room.onMessage("party:ended", () => {});
  rooms.push(room);
  return room;
}

before(async () => {
  gatewayPort = await freePort();
  gatewayEndpoint = `http://127.0.0.1:${gatewayPort}`;
  for (let index = 1; index <= 2; index++) {
    const port = await freePort();
    workerPorts.push(port);
    workers.push(startProcess(`worker-${index}`, port, {
      DRIFTER_SERVICE_ROLE: "worker",
      DRIFTER_WORKER_INDEX: String(index),
      DRIFTER_INTERNAL_SECRET: secret,
      DRIFTER_GATEWAY_INTERNAL_HOST: `127.0.0.1:${gatewayPort}`,
      DRIFTER_PUBLIC_ADDRESS: `127.0.0.1:${port}`,
      DRIFTER_MAX_PLAYERS: "4",
    }));
  }
  gateway = startProcess("gateway", gatewayPort, {
    DRIFTER_SERVICE_ROLE: "gateway",
    DRIFTER_INTERNAL_SECRET: secret,
    DRIFTER_ALLOW_IN_MEMORY_ROUTING_STORE: "1",
    DRIFTER_WORKER_1_INTERNAL_HOST: `127.0.0.1:${workerPorts[0]}`,
    DRIFTER_WORKER_2_INTERNAL_HOST: `127.0.0.1:${workerPorts[1]}`,
  });
  try {
    await waitFor(async () => {
      try {
        const response = await fetch(`${gatewayEndpoint}/health`);
        return response.ok && (await response.json()).workers === 2;
      } catch { return false; }
    }, "Gateway did not start.");
    for (let index = 0; index < workers.length; index++) {
      await waitFor(async () => {
        try { return (await fetch(`http://127.0.0.1:${workerPorts[index]}/health`)).ok; }
        catch { return false; }
      }, `Worker ${index + 1} did not start.`);
    }
  } catch (error) {
    throw new Error(`${String(error)} ${childOutput}`);
  }
});

after(async () => {
  for (const client of clients) client.close?.();
  for (const child of [gateway, ...workers]) if (child && !child.killed) child.kill("SIGKILL");
});

test("gateway routes rooms to distinct workers and clears a disposed room code", async () => {
  const firstBody = { nickname: "Host one", worldSeed: 12345, requestId: crypto.randomUUID() };
  const firstCreated = await post("/api/rooms", firstBody);
  assert.equal(firstCreated.response.status, 201);
  assert.equal(firstCreated.data.reservation.publicAddress, `127.0.0.1:${workerPorts[0]}`);

  const duplicate = await post("/api/rooms", firstBody);
  assert.equal(duplicate.response.status, 200);
  assert.equal(duplicate.data.code, firstCreated.data.code);

  const secondCreated = await post("/api/rooms", { nickname: "Host two", worldSeed: 67890, requestId: crypto.randomUUID() });
  assert.equal(secondCreated.response.status, 201);
  assert.equal(secondCreated.data.reservation.publicAddress, `127.0.0.1:${workerPorts[1]}`);

  const unauthenticated = await fetch(`http://127.0.0.1:${workerPorts[0]}/internal/rooms/create`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roomCode: "ABCDEFGH" }),
  });
  assert.equal(unauthenticated.status, 401);

  const directMatchmake = await fetch(`http://127.0.0.1:${workerPorts[0]}/matchmake/create/drifter`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roomCode: "ABCDEFGH", nickname: "Bypass" }),
  });
  assert.equal(directMatchmake.ok, false, "Workers must reject public matchmaker calls without the gateway token.");

  const firstHost = await consume(firstCreated.data.reservation);
  const secondHost = await consume(secondCreated.data.reservation);
  firstHost.send("room:start");
  secondHost.send("room:start");
  await waitFor(() => firstHost.state?.started && secondHost.state?.started, "Rooms did not start.");

  const firstJoin = await post("/api/rooms/join", { code: firstCreated.data.code, nickname: "Guest one" });
  const secondJoin = await post("/api/rooms/join", { code: secondCreated.data.code, nickname: "Guest two" });
  assert.equal(firstJoin.response.status, 200);
  assert.equal(secondJoin.response.status, 200);
  assert.equal(firstJoin.data.reservation.publicAddress, `127.0.0.1:${workerPorts[0]}`);
  assert.equal(secondJoin.data.reservation.publicAddress, `127.0.0.1:${workerPorts[1]}`);
  const firstGuest = await consume(firstJoin.data.reservation);
  const secondGuest = await consume(secondJoin.data.reservation);
  await waitFor(() => firstHost.state.players.size === 2 && secondHost.state.players.size === 2, "A guest did not join its assigned worker.");
  assert.equal(firstGuest.state.worldSeed, 12345);
  assert.equal(secondGuest.state.worldSeed, 67890);

  await Promise.all([firstHost.leave(), secondHost.leave()]);
  await waitFor(async () => {
    const first = await post("/api/rooms/join", { code: firstCreated.data.code, nickname: "Late guest" });
    return first.response.status === 404;
  }, "Disposed room routes remained in the gateway.");
});

test("gateway restart recovers a live room code from its worker", async () => {
  const created = await post("/api/rooms", { nickname: "Surviving host", requestId: crypto.randomUUID() });
  assert.equal(created.response.status, 201);
  const host = await consume(created.data.reservation);
  const exited = new Promise(resolve => gateway.once("exit", resolve));
  gateway.kill("SIGKILL");
  await exited;
  gateway = startProcess("gateway-restarted", gatewayPort, {
    DRIFTER_SERVICE_ROLE: "gateway", DRIFTER_INTERNAL_SECRET: secret, DRIFTER_ALLOW_IN_MEMORY_ROUTING_STORE: "1",
    DRIFTER_WORKER_1_INTERNAL_HOST: `127.0.0.1:${workerPorts[0]}`,
    DRIFTER_WORKER_2_INTERNAL_HOST: `127.0.0.1:${workerPorts[1]}`,
  });
  await waitFor(async () => { try { return (await fetch(`${gatewayEndpoint}/health`)).ok; } catch { return false; } }, "Restarted gateway did not start.");
  const joined = await post("/api/rooms/join", { code: created.data.code, nickname: "After restart" });
  assert.equal(joined.response.status, 200);
  assert.equal(joined.data.reservation.roomId, host.roomId);
  const guest = await consume(joined.data.reservation);
  await waitFor(() => host.state?.players?.size === 2, "Recovered room did not accept the guest.");
  await guest.leave();
  await host.leave();
});

test("direct worker reconnect keeps the same host session", async () => {
  const created = await post("/api/rooms", { nickname: "Refresh host", requestId: crypto.randomUUID() });
  assert.equal(created.response.status, 201);
  const host = await consume(created.data.reservation);
  const token = host.reconnectionToken, sessionId = host.sessionId;
  await host.leave(false);
  const reconnectClient = new Client(`http://${created.data.reservation.publicAddress}`);
  clients.push(reconnectClient);
  const restored = await reconnectClient.reconnect(token);
  restored.onMessage("party:member", () => {});
  rooms.push(restored);
  assert.equal(restored.sessionId, sessionId);
  await restored.leave();
});
