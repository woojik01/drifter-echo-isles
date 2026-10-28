# Party verification — v1.5.4

Checked 2026-10-24T10:24:41.820Z through the deployed gateway using two independent SDK clients and real WebSocket connections. Temporary QA rooms were left after checks.

- PASS gateway and game worker ready
- PASS create, join by code, shared seed and supported world version
- PASS expedition start, player profiles and shared night clock
- PASS movement synchronizes in both directions
- PASS server-owned enemies appear on both clients
- PASS harvest damage, destroyed tree and dropped resources synchronize
- PASS competing pickups yield one winner and remove loot for both clients
- PASS PvP damage and HP synchronize
- PASS campfire refueling is shared
- PASS connection loss is detected and original session reconnects
- PASS deliberate departure stops remote activity

Frontend checks also cover solo-to-party campfire state transfer, server-time-based night visibility, duplicate loot grant protection, and saved personal progress.

Limits: this is a functional smoke test, not a sustained concurrent-player load test. Browser UI input was covered by the existing simulated-input regression suites; no live multi-device browser session was recorded.
