'use strict';
// CrazyGames SDK v3. The game also works as a standalone local/hosted build.
window.DrifterPlatform = (() => {
  let sdk = null, active = false, playing = false, dataEnabled = false, username = '';
  let muted = false, adMuted = false, locale = 'en', issue = '', environment = 'standalone';
  const memory = new Map();
  const nativeGet = key => { try { return localStorage.getItem(key); } catch { return memory.get(key) ?? null; } };
  const nativeSet = (key, value) => { memory.set(key, value); localStorage.setItem(key, value); };
  function applySettings(settings) {
    muted = !!settings?.muteAudio;
    window.dispatchEvent(new Event('drifter-platform-audio'));
  }
  function event(method) {
    if (!active) return false;
    try { sdk.game[method](); return true; } catch { return false; }
  }
  const ready = (async () => {
    const crazyGamesHost = /(^|\.)crazygames\.com$/i.test(location.hostname);
    if (location.protocol === 'file:' || /(^|\.)chatgpt\.site$/i.test(location.hostname) || (!crazyGamesHost && !window.CrazyGames?.SDK)) return;
    let timer;
    try {
      const available = (async () => {
        if (!window.CrazyGames?.SDK) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
            script.async = true; script.onload = resolve; script.onerror = reject;
            document.head.appendChild(script);
          });
        }
        const candidate = window.CrazyGames.SDK;
        await candidate.init();
        return candidate;
      })();
      sdk = await Promise.race([available, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('sdkTimeout')), 6000); })]);
      environment = sdk.environment;
      if (!['crazygames', 'local'].includes(environment)) return;
      active = true;
      locale = String(sdk.user?.systemInfo?.locale || 'en').toLowerCase();
      try {
        const user = await sdk.user?.getUser?.();
        username = String(user?.username || '').trim().slice(0, 20);
      } catch { /* Guests can still play and choose a nickname. */ }
      applySettings(sdk.game.settings);
      sdk.game.addSettingsChangeListener?.(applySettings);
      try {
        // Read before any writes. A missing cloud key is a new account save,
        // not permission to copy another account's local backup into it.
        sdk.data.getItem('drifter_save_v1');
        dataEnabled = true;
      } catch { issue = 'cloud'; }
    } catch { environment = 'unavailable'; }
    finally { clearTimeout(timer); }
  })();
  return {
    ready,
    get locale() { return locale; },
    get muted() { return muted || adMuted; },
    setAdMuted(value) {
      const next = !!value;
      if (adMuted === next) return;
      adMuted = next;
      window.dispatchEvent(new Event('drifter-platform-audio'));
    },
    get environment() { return environment; },
    get username() { return username; },
    get isCrazyGames() { return active && environment === 'crazygames'; },
    get isInstantMultiplayer() { return active && environment === 'crazygames' && !!sdk?.game?.isInstantMultiplayer; },
    get inviteParams() { try { return active && environment === 'crazygames' ? (sdk?.game?.inviteParams || null) : null; } catch { return null; } },
    get supportsInvites() { return !!(active && environment === 'crazygames' && sdk?.game?.inviteLink); },
    get storageIssue() { return issue; },
    get cloudEnabled() { return dataEnabled; },
    onJoinRoom(listener) {
      if (!active || environment !== 'crazygames' || typeof sdk?.game?.addJoinRoomListener !== 'function') return false;
      try { sdk.game.addJoinRoomListener(listener); return true; } catch { return false; }
    },
    updateRoom(details) {
      if (!active || environment !== 'crazygames' || typeof sdk?.game?.updateRoom !== 'function') return false;
      try { sdk.game.updateRoom(details); return true; } catch { return false; }
    },
    leftRoom() {
      if (!active || environment !== 'crazygames' || typeof sdk?.game?.leftRoom !== 'function') return false;
      try { sdk.game.leftRoom(); return true; } catch { return false; }
    },
    async inviteLink(params) {
      if (!active || environment !== 'crazygames' || typeof sdk?.game?.inviteLink !== 'function') return '';
      try { return String(await sdk.game.inviteLink(params) || ''); } catch { return ''; }
    },
    showInviteButton(params) {
      if (!active || environment !== 'crazygames' || typeof sdk?.game?.showInviteButton !== 'function') return false;
      try { Promise.resolve(sdk.game.showInviteButton(params)).catch(() => {}); return true; } catch { return false; }
    },
    hideInviteButton() {
      if (!active || environment !== 'crazygames' || typeof sdk?.game?.hideInviteButton !== 'function') return false;
      try { sdk.game.hideInviteButton(); return true; } catch { return false; }
    },
    storage: {
      getItem(key) { return dataEnabled ? sdk.data.getItem(key) : nativeGet(key); },
      setItem(key, value) {
        value = String(value);
        if (dataEnabled) {
          try { sdk.data.setItem(key, value); issue = ''; }
          catch (error) {
            issue = 'cloud';
            try { nativeSet(key, value); } catch { issue = 'unsaved'; }
            throw error;
          }
          // A local backup is useful for explicit export; cloud remains authoritative.
          try { nativeSet(key, value); } catch { /* SDK save succeeded. */ }
        } else {
          try { nativeSet(key, value); if (!active) issue = ''; }
          catch (error) { issue = 'unsaved'; throw error; }
        }
      },
      removeItem(key) {
        if (dataEnabled) sdk.data.removeItem(key);
        memory.delete(key);
        try { localStorage.removeItem(key); } catch { /* Session remains usable. */ }
      },
      backup(key) { return memory.get(key) ?? nativeGet(key); }
    },
    syncGameplay(value) {
      if (!active || playing === value) return;
      if (event(value ? 'gameplayStart' : 'gameplayStop')) playing = value;
    },
    celebrate() { event('happytime'); }
  };
})();
