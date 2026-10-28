import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { after, before, test } from "node:test";
import { Client } from "@colyseus/sdk";
import { gameClient } from "./helpers/game-client.mjs";

const children = [];
let proxy, endpoint, workerEndpoint, wakeAt = Infinity, preReadyCreates = 0, healthProbes = 0, output = "";
async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
function start(port, env) {
  const child = spawn(process.execPath, ["dist/index.js"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, PORT: String(port), DRIFTER_INTERNAL_SECRET: "cold-start-test-secret-32-characters", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", data => { output += data.toString(); });
  child.stderr.on("data", data => { output += data.toString(); });
  children.push(child);
}
async function waitForHealth(url) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(`${url}/health`)).ok) return; } catch {}
    await delay(50);
  }
  throw new Error(`Service did not start. ${output}`);
}

before(async () => {
  const workerPort = await freePort(), gatewayPort = await freePort();
  workerEndpoint = `http://127.0.0.1:${workerPort}`;
  endpoint = `http://127.0.0.1:${gatewayPort}`;
  proxy = createServer(async (req, res) => {
    const isSecondNode = req.url.startsWith("/two/");
    const path = req.url.replace(/^\/(one|two)/, "");
    if (path === "/health") healthProbes++;
    if (isSecondNode || Date.now() < wakeAt) {
      if (req.method === "POST") preReadyCreates++;
      res.writeHead(502, { "content-type": "text/html" });
      return res.end("Game node is waking up");
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const response = await fetch(`${workerEndpoint}${path}`, {
      method: req.method,
      headers: req.headers,
      ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
    });
    res.writeHead(response.status, { "content-type": response.headers.get("content-type") ?? "application/json" });
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise(resolve => proxy.listen(0, "127.0.0.1", resolve));
  start(workerPort, {
    DRIFTER_SERVICE_ROLE: "worker", DRIFTER_WORKER_INDEX: "1", DRIFTER_PUBLIC_ADDRESS: `127.0.0.1:${workerPort}`,
    DRIFTER_GATEWAY_INTERNAL_HOST: endpoint,
  });
  start(gatewayPort, {
    DRIFTER_SERVICE_ROLE: "gateway", DRIFTER_ALLOW_IN_MEMORY_ROUTING_STORE: "1",
    DRIFTER_WORKER_1_INTERNAL_HOST: `http://127.0.0.1:${proxy.address().port}/one`,
    DRIFTER_WORKER_2_INTERNAL_HOST: `http://127.0.0.1:${proxy.address().port}/two`,
  });
  await Promise.all([waitForHealth(endpoint), waitForHealth(workerEndpoint)]);
});
after(async () => {
  for (const child of children) child.kill("SIGKILL");
  proxy?.closeAllConnections();
  if (proxy) await new Promise(resolve => proxy.close(resolve));
});

test("shipped client waits through a node startup longer than the old 5-second timeout, then creates and joins", { timeout: 25_000 }, async () => {
  const before = await fetch(`${endpoint}/api/ready`);
  assert.equal(before.status, 202);
  assert.equal((await before.json()).ready, false);
  const coldCreate = await fetch(`${endpoint}/api/rooms`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ nickname: "Cold host", requestId: crypto.randomUUID() }),
  });
  assert.equal(coldCreate.status, 503);
  assert.equal((await coldCreate.json()).code, "WORKERS_WAKING");
  assert.equal(preReadyCreates, 0, "A sleeping node must not receive a seat reservation POST.");
  wakeAt = Date.now() + 6_100;
  const game = await gameClient({ endpoint, Client, pollDelay: 100, fetch: (url, options) =>
    String(url) === "/api/coop-config" ? Promise.resolve(new Response("{}", { status: 404 })) : fetch(url, options),
  });
  try {
    const start = Date.now();
    assert.equal(await game.api.create(), true);
    assert.ok(Date.now() - start >= 6_000);
    assert.ok(healthProbes >= 2);
    assert.equal(game.api.isActive(), true);
    const ready = await (await fetch(`${endpoint}/api/ready`)).json();
    assert.equal(ready.workers, 2);
    assert.equal(ready.readyWorkers, 1, "One sleeping node must not block the available node.");
    const sleeping = await (await fetch(`${endpoint}/api/ready?worker=2`)).json();
    assert.equal(sleeping.ready, false, "Targeted readiness must not report a different node as ready.");
    // JOIN_ROOM and the initial schema state are separate WebSocket frames.
    for (let attempt = 0; attempt < 100 && !game.api.currentRoom()?.room_code; attempt++) await delay(10);
    const code = game.api.currentRoom().room_code;
    assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
    const joined = await fetch(`${endpoint}/api/rooms/join`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, nickname: "Guest" }),
    });
    assert.equal(joined.status, 200);
    const guest = await new Client(endpoint).consumeSeatReservation((await joined.json()).reservation);
    guest.onMessage("party:member", () => {});
    guest.onMessage("party:ended", () => {});
    await guest.leave();
    await game.api.leave();
    assert.equal(preReadyCreates, 0);
  } finally { await game.api.leave(); game.dispose(); }
});
