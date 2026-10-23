/* Classic-script UMD. Configure BEFORE use:
 * window.EMBER_CONFIG = {adMode:'demo', rewardedAdGroupId:'ait-ad-test-rewarded-id'}.
 * Demo never calls an ad network. Live never falls back to demo.
 * cancel()/AbortSignal cancel the request, not a native SDK ad already on screen.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EmberAds = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var active = null;
  var sequence = 0;
  function config() { return root.EMBER_CONFIG || root.EmberConfig || {}; }
  function getMode() { return config().adMode === 'live' ? 'live' : 'demo'; }
  function requestRewarded(options) {
    options = options || {};
    var mode = getMode();
    if (active) return Promise.resolve({ rewarded: false, reason: 'busy', mode: mode });
    return new Promise(function (resolve) {
      var done = false;
      var cleanup = [];
      var signal = options.signal;
      var controller = typeof root.AbortController === 'function' ? new root.AbortController() : null;
      function finish(rewarded, reason) {
        if (done) return;
        done = true;
        cleanup.forEach(function (fn) { try { fn(); } catch (_) {} });
        if (controller) controller.abort();
        active = null;
        resolve({ rewarded: rewarded === true, reason: reason, mode: mode });
      }
      active = { finish: finish };
      if (signal && signal.aborted) { finish(false, 'cancelled'); return; }
      if (signal && typeof signal.addEventListener === 'function') {
        var abort = function () { finish(false, 'cancelled'); };
        signal.addEventListener('abort', abort, { once: true });
        cleanup.push(function () { signal.removeEventListener('abort', abort); });
      }
      var watchdog = root.setTimeout(function () { finish(false, 'timeout'); }, mode === 'live' ? 155000 : 120000);
      cleanup.push(function () { root.clearTimeout(watchdog); });
      if (mode === 'live') {
        var adapter = root.EmberTossRewarded;
        if (!adapter || typeof adapter.request !== 'function') { finish(false, 'adapter-unavailable'); return; }
        try {
          Promise.resolve(adapter.request({
            adGroupId: config().rewardedAdGroupId || 'ait-ad-test-rewarded-id',
            signal: controller ? controller.signal : signal
          })).then(function (result) {
            finish(!!result && result.rewarded === true,
              result && typeof result.reason === 'string' ? result.reason : 'not-rewarded');
          }, function () { finish(false, 'adapter-error'); });
        } catch (_) { finish(false, 'adapter-error'); }
        return;
      }
      var doc = root.document;
      if (!doc || !doc.body || typeof doc.createElement !== 'function') { finish(false, 'dom-unavailable'); return; }
      var previousFocus = doc.activeElement;
      var overlay = doc.createElement('div');
      var card = doc.createElement('div');
      var title = doc.createElement('h2');
      var description = doc.createElement('p');
      var status = doc.createElement('p');
      var cancel = doc.createElement('button');
      var id = 'ember-test-ad-' + (++sequence);
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(7,12,22,.92);padding:20px;color:#fff;box-sizing:border-box';
      card.style.cssText = 'max-width:420px;width:100%;padding:26px;border:1px solid #8497ad;border-radius:20px;background:#152235;text-align:center;font-family:system-ui,sans-serif';
      title.id = id;
      title.textContent = '테스트 광고 · 실제 광고 아님';
      title.style.cssText = 'font-size:20px;line-height:1.5;margin:0 0 16px;color:#fff';
      description.textContent = '광고 연동 전 체험용 화면입니다. 화면을 보고 있는 4초가 지나면 테스트 보상을 받습니다.';
      description.style.cssText = 'font-size:15px;line-height:1.6;color:#e0e8f3';
      description.id = id + '-description';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.setAttribute('aria-atomic', 'true');
      cancel.type = 'button';
      cancel.textContent = '취소하고 돌아가기';
      cancel.style.cssText = 'min-height:48px;padding:12px 22px;border:2px solid #fff;border-radius:10px;background:#fff;color:#152235;font-size:16px;font-weight:700;cursor:pointer';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-labelledby', id);
      card.setAttribute('aria-describedby', description.id);
      card.appendChild(title); card.appendChild(description); card.appendChild(status); card.appendChild(cancel);
      overlay.appendChild(card);
      doc.body.appendChild(overlay);
      // Inert the background while preserving pre-existing inert state.
      var siblings = Array.from(doc.body.children).filter(function (node) { return node !== overlay; });
      var inertBefore = siblings.map(function (node) { return node.inert; });
      siblings.forEach(function (node) { node.inert = true; });
      function onCancel() { finish(false, 'cancelled'); }
      function onBackdrop(event) { if (event.target === overlay) finish(false, 'dismissed'); }
      function onKey(event) {
        if (event.key === 'Escape') { event.preventDefault(); finish(false, 'cancelled'); }
        if (event.key === 'Tab') { event.preventDefault(); cancel.focus(); }
      }
      function onFocus(event) { if (!card.contains(event.target)) cancel.focus(); }
      cancel.addEventListener('click', onCancel);
      overlay.addEventListener('click', onBackdrop);
      doc.addEventListener('keydown', onKey, true);
      doc.addEventListener('focusin', onFocus, true);
      cancel.focus();
      cleanup.push(function () {
        cancel.removeEventListener('click', onCancel);
        overlay.removeEventListener('click', onBackdrop);
        doc.removeEventListener('keydown', onKey, true);
        doc.removeEventListener('focusin', onFocus, true);
        overlay.remove();
        siblings.forEach(function (node, index) { node.inert = inertBefore[index]; });
        if (previousFocus && typeof previousFocus.focus === 'function' && previousFocus.isConnected) previousFocus.focus();
      });
      var remaining = 4000;
      var now = function () { return root.performance && typeof root.performance.now === 'function' ? root.performance.now() : Date.now(); };
      var lastTime = now();
      var lastSeconds = -1;
      function render() {
        var seconds = Math.max(0, Math.ceil(remaining / 1000));
        status.textContent = doc.hidden ? '일시정지 · 화면으로 돌아오면 계속됩니다.' : seconds + '초 남음';
        if (lastSeconds !== seconds) {
          lastSeconds = seconds;
          if (typeof options.onTick === 'function') { try { options.onTick(seconds); } catch (_) {} }
        }
      }
      function visibility() { lastTime = now(); render(); }
      doc.addEventListener('visibilitychange', visibility);
      var interval = root.setInterval(function () {
        if (!overlay.isConnected) { finish(false, 'dismissed'); return; }
        var current = now();
        if (!doc.hidden) remaining -= Math.max(0, current - lastTime);
        lastTime = current;
        render();
        if (remaining <= 0 && !doc.hidden) finish(true, 'completed');
      }, 100);
      cleanup.push(function () { root.clearInterval(interval); doc.removeEventListener('visibilitychange', visibility); });
      if (typeof root.addEventListener === 'function') {
        var pagehide = function () { finish(false, 'dismissed'); };
        root.addEventListener('pagehide', pagehide, { once: true });
        cleanup.push(function () { root.removeEventListener('pagehide', pagehide); });
      }
      render();
    });
  }
  function cancel() { if (active) active.finish(false, 'cancelled'); }
  return Object.freeze({ getMode: getMode, requestRewarded: requestRewarded, cancel: cancel });
});
