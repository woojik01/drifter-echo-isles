'use strict';
(() => {
  const gameId = 'b2296dcb8238480f993960aabfb2bbb4';
  const params = new URLSearchParams(location.search);
  const distributionHost = /(^|\.)gamedistribution\.com$/i.test(location.hostname);
  const selfHostedFrame = params.has('GD_SDK_REFERRER_URL') || params.has('gd_sdk_referrer_url');
  const enabled = location.protocol !== 'file:' && !/(^|\.)crazygames\.com$/i.test(location.hostname) &&
    (distributionHost || selfHostedFrame || params.get('gdPreview') === '1');
  const debug = params.get('gdDebug') === '1';
  let sdkReady = false, state = enabled ? 'loading' : 'inactive';
  let pending = null, transition = null, watchdog = 0, readyTimer = 0;
  let lastError = '', lastAdResult = 'none';
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  function pause(value) {
    window.DrifterPlatform?.setAdMuted(value);
    window.dispatchEvent(new Event(value ? 'drifter-platform-ad-pause' : 'drifter-platform-ad-resume'));
  }
  function finish(result, error = '') {
    if (!pending) { pause(false); return; }
    const request = pending;
    pending = null;
    clearTimeout(watchdog);
    state = sdkReady ? 'ready' : state;
    lastAdResult = result;
    lastError = String(error?.message || error || '');
    pause(false);
    request.resolve(result);
  }
  function onEvent(event) {
    if (debug) console.info('[Drifter GD]', event?.name);
    switch (event?.name) {
      case 'SDK_READY':
        // Late READY remains usable after an earlier loading timeout.
        sdkReady = typeof window.gdsdk?.showAd === 'function';
        state = sdkReady ? 'ready' : 'sdk-missing';
        clearTimeout(readyTimer);
        resolveReady(sdkReady);
        break;
      case 'SDK_GAME_PAUSE':
        pause(true);
        if (pending) {
          clearTimeout(watchdog);
          // A playing video owns resume; never interrupt it with a timer.
        }
        break;
      case 'SDK_GAME_START':
        if (pending) finish('completed');
        else pause(false);
        break;
      case 'AD_ERROR':
      case 'AD_SDK_CANCELED':
        finish('unavailable', event?.message || event?.name);
        break;
      case 'SDK_ERROR':
        sdkReady = false;
        state = 'sdk-error';
        clearTimeout(readyTimer);
        resolveReady(false);
        finish('sdk-error', event?.message || event?.name);
        break;
    }
  }
  function showInterstitial(placement = 'break') {
    if (!enabled) return Promise.resolve('inactive');
    if (pending) return pending.promise;
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    pending = { promise, resolve, placement };
    // Pause synchronously, before a start/continue action can run.
    pause(true);
    (async () => {
      const available = sdkReady || await ready;
      if (!pending || pending.promise !== promise) return;
      if (!available || typeof window.gdsdk?.showAd !== 'function') {
        finish('sdk-unavailable', state);
        return;
      }
      state = 'requesting';
      watchdog = setTimeout(() => finish('request-timeout'), 12000);
      try {
        const request = window.gdsdk.showAd('interstitial');
        if (request && typeof request.then === 'function') {
          request.then(() => {
            if (pending?.promise === promise) finish('completed');
          }, error => {
            if (pending?.promise === promise) finish('unavailable', error);
          });
        }
      } catch (error) { finish('unavailable', error); }
    })();
    return promise;
  }
  window.DrifterGameDistribution = {
    ready,
    get state() { return state; },
    get configured() { return true; },
    get lastError() { return lastError; },
    get lastAdResult() { return lastAdResult; },
    showInterstitial,
    runAfterAd(action, placement) {
      if (transition) return transition;
      transition = showInterstitial(placement).then(action).finally(() => { transition = null; });
      return transition;
    }
  };
  if (!enabled) { resolveReady(false); return; }
  window.GD_OPTIONS = { gameId, debug, onEvent };
  const script = document.createElement('script');
  script.id = 'gamedistribution-jssdk';
  script.src = 'https://html5.api.gamedistribution.com/main.min.js';
  script.async = true;
  script.onerror = () => {
    state = 'sdk-load-error';
    clearTimeout(readyTimer);
    resolveReady(false);
    finish('sdk-unavailable', state);
  };
  readyTimer = setTimeout(() => {
    state = 'sdk-timeout';
    resolveReady(false);
  }, 8000);
  document.head.appendChild(script);
})();
