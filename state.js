/* Local gameplay progress only. No money, purchases, or paid economy.
 * Recent 256 run IDs are retained: idempotency is bounded, not server-grade.
 * localStorage failures fall back to memory for this page lifetime only.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EmberStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var KEY = 'ember-defense.profile.v1';
  var LIMIT = 1000000000;
  var HISTORY = 256;
  var memory = null;
  var storageFailed = false;
  var fields = ['bestScore', 'bestWave', 'totalRuns', 'totalKills', 'totalWins', 'essence'];
  function integer(value) {
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.min(LIMIT, Math.max(0, Math.floor(value))) : 0;
  }
  function sanitize(value) {
    value = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var profile = { version: 1 };
    fields.forEach(function (name) { profile[name] = integer(value[name]); });
    profile.sound = typeof value.sound === 'boolean' ? value.sound : true;
    profile.reducedMotion = typeof value.reducedMotion === 'boolean' ? value.reducedMotion : false;
    return profile;
  }
  function validId(id) {
    return typeof id === 'string' && id.length > 0 && id.length <= 160 && id.trim() === id;
  }
  function envelope(value) {
    value = value && typeof value === 'object' ? value : {};
    var ids = Array.isArray(value.recentRunIds) ? value.recentRunIds.filter(validId) : [];
    return { profile: sanitize(value.profile || value), recentRunIds: Array.from(new Set(ids)).slice(-HISTORY) };
  }
  function read() {
    if (!storageFailed) {
      try {
        var stored = root.localStorage.getItem(KEY);
        if (stored !== null) {
          try { memory = envelope(JSON.parse(stored)); }
          catch (_) { memory = envelope(null); }
        } else if (!memory) memory = envelope(null);
      } catch (_) { storageFailed = true; }
    }
    if (!memory) memory = envelope(null);
    return envelope(memory);
  }
  function persist(value) {
    memory = envelope(value);
    if (!storageFailed) {
      try { root.localStorage.setItem(KEY, JSON.stringify(memory)); }
      catch (_) { storageFailed = true; }
    }
    return sanitize(memory.profile);
  }
  function loadProfile() { return read().profile; }
  function saveProfile(profile) {
    var data = read();
    // Partial settings writes preserve counters and hidden idempotency history.
    var update = profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : {};
    data.profile = sanitize(Object.assign({}, data.profile, update));
    return persist(data);
  }
  function finishRun(run) {
    var data = read();
    run = run && typeof run === 'object' ? run : {};
    if (!validId(run.runId) || data.recentRunIds.indexOf(run.runId) !== -1) return data.profile;
    var p = data.profile;
    p.bestScore = Math.max(p.bestScore, integer(run.score));
    p.bestWave = Math.max(p.bestWave, integer(run.wave));
    p.totalRuns = integer(p.totalRuns + 1);
    p.totalKills = integer(p.totalKills + integer(run.kills));
    p.totalWins = integer(p.totalWins + (run.win === true ? 1 : 0));
    p.essence = integer(p.essence + integer(run.essence));
    data.recentRunIds.push(run.runId);
    data.recentRunIds = data.recentRunIds.slice(-HISTORY);
    return persist(data);
  }
  return Object.freeze({ loadProfile: loadProfile, saveProfile: saveProfile, finishRun: finishRun, STORAGE_KEY: KEY });
});
