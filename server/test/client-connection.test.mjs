import assert from "node:assert/strict";
import { test } from "node:test";
import { gameClient, mockRoom } from "./helpers/game-client.mjs";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const config = () => json({}, 404);
const source = process.env.DRIFTER_CLIENT_TEST_SOURCE;

test("game create waits for game nodes after the gateway is awake", async () => {
  let probes = 0, reservations = 0, connections = 0;
  const client = await gameClient({ source, Client: class {
    async consumeSeatReservation() { connections++; return mockRoom(); }
  }, fetch: async url => {
    const path = String(url);
    if (path === "/api/coop-config") return config();
    if (path.endsWith("/health")) return json({ ok: true, service: "drifter-gateway", workers: 2 });
    if (path.endsWith("/api/ready")) return json({ ok: true, ready: ++probes >= 3 }, probes >= 3 ? 200 : 202);
    if (path.endsWith("/api/rooms")) {
      reservations++;
      if (probes < 3) return json({ code: "ROOM_CREATE_FAILED", error: "node asleep" }, 503);
      return json({ code: "ABCDEFGH", reservation: {} }, 201);
    }
    throw new Error(`Unexpected request ${url}`);
  }});
  try {
    assert.equal(await client.api.create(), true);
    assert.equal(probes, 3);
    assert.equal(reservations, 1, "A seat must only be reserved once the node is ready.");
    assert.equal(connections, 1);
    assert.equal(client.element("coopRoomCode").textContent, "ABCDEFGH");
  } finally { client.dispose(); }
});

test("cancel aborts a pending readiness request and restores the create button", async () => {
  let healthStarted;
  const started = new Promise(resolve => { healthStarted = resolve; });
  let aborted = false, reservations = 0;
  const client = await gameClient({ source, Client: class {}, fetch: async (url, options) => {
    if (String(url) === "/api/coop-config") return config();
    if (String(url).endsWith("/api/rooms")) { reservations++; return json({}, 503); }
    healthStarted();
    return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => {
      aborted = true; reject(new DOMException("Aborted", "AbortError"));
    }, { once: true }));
  }});
  try {
    const creating = client.api.create();
    await started;
    client.element("coopWake [data-wake-cancel]").onclick();
    assert.equal(await creating, false);
    assert.equal(aborted, true);
    assert.equal(reservations, 0);
    assert.equal(client.element("coopCreate").disabled, false);
    assert.equal(client.element("coopWake").style.display, "none");
    assert.match(client.element("coopStatusText").textContent, /cancelled/);
  } finally { client.dispose(); }
});

test("transient worker wake retries keep the same request ID; permanent join errors do not retry", async () => {
  const payloads = []; let joins = 0;
  const client = await gameClient({ source, Client: class {
    async consumeSeatReservation() { return mockRoom(); }
  }, fetch: async (url, options) => {
    const path = String(url);
    if (path === "/api/coop-config") return config();
    if (path.endsWith("/health")) return json({ ok: true, service: "drifter-gateway" });
    if (path.endsWith("/api/ready")) return json({ ok: true, ready: true });
    if (path.endsWith("/api/rooms/join")) { joins++; return json({ code: "ROOM_NOT_FOUND", error: "room missing" }, 404); }
    payloads.push(JSON.parse(options.body));
    return payloads.length === 1 ? json({ code: "WORKERS_WAKING" }, 503) : json({ code: "ABCDEFGH", reservation: {} }, 201);
  }});
  try {
    assert.equal(await client.api.join("ABCDEFGH"), false);
    assert.equal(joins, 1);
    assert.equal(await client.api.create(), true);
    assert.equal(payloads.length, 2);
    assert.equal(payloads[0].requestId, payloads[1].requestId);
  } finally { client.dispose(); }
});

test("join waits for its assigned node even when another node is ready", async () => {
  let targetProbes = 0, joinCalls = 0;
  const client = await gameClient({ source, Client: class {
    async consumeSeatReservation() { return mockRoom(); }
  }, fetch: async url => {
    const path = String(url);
    if (path === "/api/coop-config") return config();
    if (path.endsWith("/health")) return json({ ok: true, service: "drifter-gateway" });
    if (path.endsWith("/api/ready?worker=2")) return json({ ok: true, ready: ++targetProbes >= 3 }, targetProbes >= 3 ? 200 : 202);
    if (path.endsWith("/api/ready")) return json({ ok: true, ready: true });
    if (path.endsWith("/api/rooms/join")) {
      joinCalls++;
      return targetProbes < 3 ? json({ code: "WORKERS_WAKING", workerIndex: 2 }, 503) : json({ code: "ABCDEFGH", reservation: {} });
    }
    throw new Error(`Unexpected ${url}`);
  }});
  try {
    assert.equal(await client.api.join("ABCDEFGH"), true);
    assert.equal(joinCalls, 2);
    assert.equal(targetProbes, 3);
  } finally { client.dispose(); }
});

test("refresh reconnect uses the saved game node, without waiting for the gateway", async () => {
  const endpoint = "https://node-two.example.test";
  const reconnects = [], requests = [];
  const client = await gameClient({ source, Client: class {
    constructor(url) { this.url = url; }
    async reconnect(token) { reconnects.push({ endpoint: this.url, token }); return mockRoom(); }
  }, fetch: async url => {
    requests.push(String(url));
    assert.equal(String(url), endpoint + "/health");
    return json({ ok: true, service: "drifter-node" });
  }});
  client.storage.set("drifter_colyseus_active_v120", JSON.stringify({ endpoint, token: "saved-token", code: "ABCDEFGH", expiresAt: Date.now() + 10000 }));
  try {
    await client.api.open();
    assert.equal(client.api.isActive(), true);
    assert.deepEqual(reconnects, [{ endpoint, token: "saved-token" }]);
    assert.equal(requests.length, 1);
    assert.equal(JSON.parse(client.storage.get("drifter_colyseus_active_v120")).endpoint, endpoint);
  } finally { await client.api.leave(); client.dispose(); }
});

test("player-side public health request wakes a Render node when gateway probes cannot", async () => {
  let awake = false, directProbes = 0, reservations = 0;
  const node = "https://game-node.onrender.com";
  const client = await gameClient({ source, Client: class {
    async consumeSeatReservation() { return mockRoom(); }
  }, fetch: async url => {
    const path = String(url);
    if (path === "/api/coop-config") return config();
    if (path === node + "/health") { directProbes++; awake = true; return json({ ok: true, service: "drifter-node" }); }
    if (path.endsWith("/health")) return json({ ok: true, service: "drifter-gateway" });
    if (path.endsWith("/api/ready")) return json({ ok: true, ready: awake, wakeUrls: [node, "http://internal-node:10000", "https://other.example.test"] }, awake ? 200 : 202);
    if (path.endsWith("/api/rooms")) { reservations++; assert.equal(awake, true); return json({ code: "ABCDEFGH", reservation: {} }, 201); }
    throw new Error(`Unexpected URL ${url}`);
  }});
  try {
    assert.equal(await client.api.create(), true);
    assert.equal(directProbes, 1);
    assert.equal(reservations, 1);
  } finally { client.dispose(); }
});

test("explicit leave disables reconnect and closes a socket when the leave acknowledgement stalls", async () => {
  const target = mockRoom(); let closedWith;
  target.reconnection = { enabled: true };
  target.connection = { isOpen: true, close(code) { closedWith = code; this.isOpen = false; } };
  target.leave = () => { assert.equal(target.reconnection.enabled, false); return new Promise(() => {}); };
  const client = await gameClient({ source, Client: class {
    async consumeSeatReservation() { return target; }
  }, fetch: async url => String(url) === "/api/coop-config" ? config() : String(url).endsWith("/health")
    ? json({ ok: true, service: "drifter-colyseus" }) : json({ code: "ABCDEFGH", reservation: {} }, 201),
  });
  try {
    assert.equal(await client.api.create(), true);
    await client.api.leave();
    assert.equal(closedWith, 4000);
    assert.equal(client.api.isActive(), false);
    assert.equal(client.api.currentRoom(), null);
    assert.equal(client.element("coopCreate").disabled, false);
  } finally { client.dispose(); }
});
