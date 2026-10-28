import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";

// Execute the shipped game client through its public create/join methods.
// The DOM/game stubs leave all networking, retry logic and SDK handshakes intact.
export async function gameClient({ fetch, Client, endpoint = "http://127.0.0.1:2567", pollDelay = 15, source } = {}) {
  const elements = new Map();
  const storage = new Map();
  const timers = new Set();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      id, value: "QA player", textContent: "", hidden: false, disabled: false, style: {},
      classList: { toggle() {}, add() {}, remove() {} },
      setAttribute() {}, addEventListener() {}, focus() {},
      querySelector(selector) { return element(`${id} ${selector}`); },
    });
    return elements.get(id);
  }
  const noop = () => {};
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key), backup: noop,
  };
  // The v1.5.5 client wraps the SDK's createRoom method before connecting.
  // Test doubles for consumeSeatReservation still need to expose that SDK API.
  class TestClient extends Client {
    createRoom(...args) {
      return typeof super.createRoom === "function" ? super.createRoom(...args) : mockRoom();
    }
  }
  const context = {
    console, Map, Set, URL, Date, performance, crypto: webcrypto,
    AbortController, AbortSignal, fetch, localStorage,
    LANG: "en", state: "title", paused: false,
    player: { x: 268, y: 268 },
    document: { getElementById: element, body: { classList: { toggle() {} }, appendChild() {} }, createElement: () => element("coopWake") },
    DrifterPlatform: { storage: localStorage, isCrazyGames: false },
    Colyseus: { Client: TestClient }, DRIFTER_COOP_SERVER_URL: endpoint,
    addEventListener: noop, saveGame: noop, update: noop, tryAttack: noop,
    syncPaused: noop, applyLang: noop, releaseControls: noop,
    closeActionMenu: noop, closeInv: noop, endDialog: noop, closeMap: noop,
    togglePause: noop, toggleModal: noop,
    setTimeout(fn, ms, ...args) {
      const timer = setTimeout(() => { timers.delete(timer); fn(...args); }, ms < 6_000 ? Math.min(ms, pollDelay) : ms);
      timers.add(timer); return timer;
    },
    clearTimeout(timer) { timers.delete(timer); clearTimeout(timer); },
  };
  context.window = context;
  const path = source ?? new URL("../../../game-assets/multiplayer.js", import.meta.url);
  runInNewContext(await readFile(path, "utf8"), context, { filename: "multiplayer.js" });
  return {
    api: context.DrifterMultiplayer, element, storage,
    dispose() { for (const timer of timers) clearTimeout(timer); },
  };
}

export function mockRoom() {
  return {
    id: "test-room", roomId: "test-room", sessionId: "host", reconnectionToken: "test-reconnect-token",
    state: { roomCode: "ABCDEFGH", worldSeed: 12345, hostSessionId: "host", started: false, players: new Map([ ["host", { nickname: "QA player" }] ]) },
    onStateChange() {}, onMessage() {}, onDrop() {}, onReconnect() {}, onLeave() {}, async leave() {},
  };
}
