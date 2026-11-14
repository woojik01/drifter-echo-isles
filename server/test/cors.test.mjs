import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

const allowed = [
  "https://woojik01.github.io",
  "https://drifter-echo-isles.perkyspice3.chatgpt.site",
  "https://drifter-development.perkyspice3.chatgpt.site",
];
const denied = "https://untrusted.invalid";

for (const role of ["single", "worker", "gateway"]) {
  test(`${role} applies the origin allowlist to health, API and Colyseus preflights`, { timeout: 15_000 }, async () => {
    const listener = createServer();
    await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
    const port = listener.address().port;
    await new Promise(resolve => listener.close(resolve));
    const endpoint = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ["dist/index.js"], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: { ...process.env, PORT: String(port), DRIFTER_SERVICE_ROLE: role,
        DRIFTER_ALLOWED_ORIGINS: allowed.join(","), DRIFTER_INTERNAL_SECRET: "cors-test-secret",
        DRIFTER_PUBLIC_ADDRESS: `127.0.0.1:${port}`, DRIFTER_WORKER_INDEX: "1",
        DRIFTER_ALLOW_IN_MEMORY_ROUTING_STORE: "1", DRIFTER_WORKER_1_INTERNAL_HOST: endpoint,
        REDIS_URL: "", DRIFTER_GATEWAY_INTERNAL_HOST: "",
      },
      stdio: "ignore",
    });
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try { if ((await fetch(endpoint + "/health")).ok) { ready = true; break; } } catch {}
        await delay(50);
      }
      assert.equal(ready, true, `${role} did not start`);
      for (const origin of [...allowed, denied]) {
        const health = await fetch(endpoint + "/health", { headers: { Origin: origin } });
        assert.equal(health.status, 200);
        if (origin === denied) assert.equal(health.headers.get("access-control-allow-origin"), null);
        else assert.equal(health.headers.get("access-control-allow-origin"), origin);
        for (const path of ["/health", "/api/rooms", "/matchmake/reconnect/drifter"]) {
          const response = await fetch(endpoint + path, { method: "OPTIONS", headers: {
            Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type",
          } });
          assert.equal(response.status, 204);
          if (origin === denied) assert.equal(response.headers.get("access-control-allow-origin"), null, `${role} ${path} reflects untrusted origin`);
          else assert.equal(response.headers.get("access-control-allow-origin"), origin);
          assert.match(response.headers.get("vary") ?? "", /Origin/i);
        }
      }
    } finally {
      const exited = new Promise(resolve => child.once("exit", resolve));
      child.kill("SIGKILL");
      await exited;
    }
  });
}
