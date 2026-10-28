# v1.5.4

- Night vision outside camp is limited to a 96-world-unit radius, with a soft edge. Campfire light retains its current radius. Dusk/dawn fade over 12 seconds.
- A cached half-resolution canvas applies darkness after the complete world frame, including party effects; HUD controls remain readable. Both solo and party use survivalNow(), which prefers the shared server clock.
- Starting a party from a solo save now preserves fireRadius and fireUpdatedAt alongside gameT.
- Real two-client party checks passed: creation/join/start, bidirectional movement, entities, harvesting, loot arbitration, PvP, refueling, reconnection and departure. See PARTY_QA_v1.5.4.md.
