import { loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/web-framework';

/* INTEGRATION README
 * Bundle this ES module with the installed @apps-in-toss/web-framework SDK.
 * It installs window.EmberTossRewarded; load rewarded.js as a classic script.
 * Set window.EMBER_CONFIG={adMode:'live',rewardedAdGroupId:'ait-ad-test-rewarded-id'}
 * only in a supported Toss QR-test environment. Never exercise production IDs
 * with automation. The default is the official rewarded TEST ID, not production.
 * SDK reference:
 * https://developers-apps-in-toss.toss.im/documentation/common/monetization/iaa/interstitial-rewarded-ad
 *
 * Every request strictly loads -> loaded -> shows. No polling, auto-retry, or
 * automatic next ad. 60s load / 90s show watchdogs release callbacks and return
 * false. Only userEarnedReward THEN dismissed returns true. Duplicate callbacks
 * cannot double-settle. Impression, click, show, dismiss alone never grant.
 * Known SDK limitation: Android Toss 5.255.0 may omit dismissed. We deliberately
 * withhold even a recorded reward on timeout rather than resume during an ad.
 * Abort/watchdog unregister listeners; SDK exposes no native-ad close API.
 * Therefore cancellation does NOT guarantee the native screen is closed. The
 * host must also pause gameplay while hidden/native ad UI remains foreground.
 * Real SDK device testing is still required; this file alone is not validation
 * of native lifecycle, network delivery, policy approval, or fraud resistance.
 */

const DEFAULT_AD_GROUP_ID = 'ait-ad-test-rewarded-id';
let inFlight = false;

function validAdGroupId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{2,159}$/.test(id)
    && !/placeholder|replace|your[-_]?ad/i.test(id);
}

function request({ adGroupId = DEFAULT_AD_GROUP_ID, signal } = {}) {
  if (inFlight) return Promise.resolve({ rewarded: false, reason: 'busy', mode: 'live' });
  if (!validAdGroupId(adGroupId)) return Promise.resolve({ rewarded: false, reason: 'invalid-ad-group-id', mode: 'live' });
  try {
    if (typeof loadFullScreenAd.isSupported !== 'function' || loadFullScreenAd.isSupported() !== true
        || typeof showFullScreenAd.isSupported !== 'function' || showFullScreenAd.isSupported() !== true) {
      return Promise.resolve({ rewarded: false, reason: 'unsupported', mode: 'live' });
    }
  } catch (_) { return Promise.resolve({ rewarded: false, reason: 'unsupported', mode: 'live' }); }
  if (signal && signal.aborted) return Promise.resolve({ rewarded: false, reason: 'cancelled', mode: 'live' });
  inFlight = true;
  return new Promise((resolve) => {
    let settled = false;
    let phase = 'loading';
    let earned = false;
    let watchdog;
    let removeLoad = null;
    const cleanups = [];
    const attach = (fn) => {
      if (typeof fn !== 'function') return;
      if (settled) { try { fn(); } catch (_) {} }
      else cleanups.push(fn);
    };
    const finish = (rewarded, reason) => {
      if (settled) return;
      settled = true;
      phase = 'finished'; // No ready state survives success, failure, or timeout.
      clearTimeout(watchdog);
      for (const cleanup of cleanups.splice(0)) { try { cleanup(); } catch (_) {} }
      inFlight = false;
      resolve({ rewarded: rewarded === true, reason, mode: 'live' });
    };
    const startShow = () => {
      if (settled || phase !== 'ready') return;
      phase = 'showing';
      if (removeLoad) { removeLoad(); removeLoad = null; }
      watchdog = setTimeout(() => finish(false, earned ? 'dismissal-timeout' : 'show-timeout'), 90000);
      try {
        attach(showFullScreenAd({
          options: { adGroupId },
          onEvent(event) {
            if (settled || phase !== 'showing' || !event) return;
            if (event.type === 'userEarnedReward') earned = true;
            else if (event.type === 'dismissed') finish(earned, earned ? 'completed' : 'dismissed');
            else if (event.type === 'failedToShow') finish(false, 'show-failed');
          },
          onError() { finish(false, 'show-error'); }
        }));
      } catch (_) { finish(false, 'show-error'); }
    };
    if (signal && typeof signal.addEventListener === 'function') {
      const abort = () => finish(false, 'cancelled');
      signal.addEventListener('abort', abort, { once: true });
      attach(() => signal.removeEventListener('abort', abort));
    }
    watchdog = setTimeout(() => finish(false, 'load-timeout'), 60000);
    try {
      let unregistered = false;
      const unregister = loadFullScreenAd({
        options: { adGroupId },
        onEvent(event) {
          if (settled || phase !== 'loading' || !event || event.type !== 'loaded') return;
          clearTimeout(watchdog);
          phase = 'ready';
          // Defer so a synchronous mock/native callback cannot race unregister.
          Promise.resolve().then(startShow);
        },
        onError() { finish(false, 'load-error'); }
      });
      removeLoad = () => {
        if (unregistered) return;
        unregistered = true;
        if (typeof unregister === 'function') { try { unregister(); } catch (_) {} }
      };
      attach(removeLoad);
    } catch (_) { finish(false, 'load-error'); }
  });
}

const adapter = Object.freeze({ request });
if (typeof window !== 'undefined') window.EmberTossRewarded = adapter;
export { adapter, request, DEFAULT_AD_GROUP_ID };
