'use strict';

var contract = require('./contract.json');
var profiles = require('./profiles');
var storageKey = 'typedial.settings.v1';

function integer(value) {
  return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
}

function valid(settings) {
  return Array.isArray(settings) && settings.length === contract.keys.length &&
    settings[0] === contract.version && contract.max.every(function(maximum, i) {
      return integer(settings[i]) && settings[i] >= 0 && settings[i] <= maximum;
    });
}

function same(a, b) {
  return a && b && a.every(function(value, i) { return value === b[i]; });
}

function load(storage) {
  var state = { version: 1, records: {}, manualProfile: 'emery' };
  try {
    var json = JSON.parse(storage.getItem(storageKey));
    if (!json || !json.records || json.version !== 1) return state;
    if (profiles[json.manualProfile]) state.manualProfile = json.manualProfile;
    Object.keys(json.records).forEach(function(id) {
      var record = json.records[id];
      if (!record || !profiles[record.profile] || !/^(watch:|model:)/.test(id)) return;
      state.records[id] = {
        profile: record.profile,
        clock24: record.clock24 === 0 || record.clock24 === 1 ? record.clock24 : null,
        applied: valid(record.applied) ? record.applied : null,
        pending: valid(record.pending) ? record.pending : null
      };
    });
  } catch (error) {
    // Unavailable storage or malformed older records leave the defaults usable.
  }
  return state;
}

function modelKey(profile) {
  return 'model:' + profile;
}

module.exports = function createPhone(pebble, storage, clock) {
  var state = load(storage);
  var serial = clock.seed();
  var exchange;
  var storageUnavailable = false;

  function persist() {
    try {
      storage.setItem(storageKey, JSON.stringify(state));
      storageUnavailable = false;
    } catch (error) {
      storageUnavailable = true;
    }
  }

  function active() {
    var token, info;
    try { token = pebble.getWatchToken(); } catch (error) { /* unavailable during startup */ }
    try { info = pebble.getActiveWatchInfo(); } catch (error) { /* older or disconnected clients */ }

    var id = typeof token === 'string' && token.length ? 'watch:' + token : null;
    var current = info && profiles[info.platform] ? info.platform : null;
    if (id) {
      var cached = state.records[id];
      return { id: id, profile: current || (cached && cached.profile), reported: current };
    }
    if (current) return { id: modelKey(current), profile: current };
    return null;
  }

  function recordFor(id, profile) {
    var record = state.records[id];
    if (!record || record.profile !== profile) {
      record = { profile: profile, applied: null, pending: null, clock24: null };
      state.records[id] = record;
    }
    return record;
  }

  function open() {
    var watch = active();
    if (watch && !watch.profile) watch = null;
    var profile = watch ? watch.profile : state.manualProfile;
    var id = watch ? watch.id : modelKey(profile);
    var record = state.records[id] || {};
    var manual = !watch;
    var local = id.indexOf('model:') === 0;
    var choices = {};
    Object.keys(profiles).filter(function(name) { return profiles[name].supported; }).forEach(function(name) {
      var saved = state.records[modelKey(name)];
      choices[name] = saved && saved.pending ? saved.pending.slice() : contract.defaults.slice();
    });
    return {
      id: id,
      profile: profile,
      manual: manual,
      local: local,
      status: record.pending ? (local ? 'local' : 'pending') : record.applied ? 'applied' : 'default',
      settings: (record.pending || record.applied || contract.defaults).slice(),
      clock24: record.clock24,
      choices: choices,
      hasModelDraft: !local && !!(state.records[modelKey(profile)] && state.records[modelKey(profile)].pending),
      storageUnavailable: storageUnavailable
    };
  }

  function cancel() {
    if (exchange) {
      clock.clearTimeout(exchange.timer);
      exchange = null;
    }
  }

  function send(watch, attempts, settings) {
    cancel();
    serial = serial % 0x7fffffff + 1;
    var task = {
      watch: watch,
      attempts: attempts,
      settings: settings,
      txn: serial
    };
    exchange = task;

    function retry() {
      if (exchange !== task) return;
      cancel();
      var current = active();
      if (current && current.id === watch.id &&
          (!current.reported || current.reported === watch.profile) && attempts > 1) {
        // Start with a fresh snapshot each time. The previous write may have succeeded.
        send(current, attempts - 1, null);
      }
    }

    task.timer = clock.setTimeout(retry, 3500);
    try {
      pebble.sendAppMessage(settings ? { Txn: serial, Settings: settings } :
        { Txn: serial, Request: 1 }, function() {}, retry);
    } catch (error) {
      retry();
    }
  }

  function ready() {
    var watch = active();
    if (watch && watch.id.indexOf('watch:') === 0 && !exchange) {
      send(watch, 2, null);
    }
  }

  function save(session, profile, settings) {
    if (!session || !profiles[profile] || !profiles[profile].supported || !valid(settings) ||
        (!session.manual && session.profile !== profile)) return false;
    var id = session.manual ? modelKey(profile) : session.id;
    var record = recordFor(id, profile);
    if (!record.pending && same(record.applied, settings)) return true;
    record.pending = settings.slice();
    if (session.manual) state.manualProfile = profile;
    persist();

    var watch = active();
    if (watch && watch.id === id && (!watch.reported || watch.reported === profile) &&
        id.indexOf('watch:') === 0) {
      send(watch, 2, null);
    }
    return true;
  }

  function receive(message) {
    var task = exchange;
    if (!task || !message || message.Txn !== task.txn || !valid(message.Report) ||
        !integer(message.Result) || message.Result < 0 || message.Result > 2) return;
    var profile = Object.keys(profiles).filter(function(name) { return profiles[name].wire === message.Profile; })[0];
    var current = active();
    if (!profile || !current || current.id !== task.watch.id ||
        (current.reported && current.reported !== profile) ||
        (task.settings && task.watch.profile !== profile)) return;
    cancel();

    var record = recordFor(current.id, profile);
    record.applied = message.Report.slice();
    if (message.Clock24 === 0 || message.Clock24 === 1) record.clock24 = message.Clock24;
    if (same(record.pending, message.Report)) record.pending = null;
    persist();
    if (message.Result === 0 && !task.settings && record.pending) {
      send({ id: current.id, profile: profile }, task.attempts, record.pending.slice());
    }
  }

  return { open: open, ready: ready, save: save, receive: receive };
};
