'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const contract = require('../src/pkjs/contract.json');
const createPhone = require('../src/pkjs/phone');
const defaults = contract.defaults;
const changed = defaults.slice();
changed[contract.keys.indexOf('seconds')] = 1;

function harness(storage) {
  let sent = [], timers = new Map(), nextTimer = 0;
  const watch = { id: 'watch-a', platform: 'emery' };
  const cache = storage || new Map();
  const pebble = {
    getWatchToken: () => watch.id,
    getActiveWatchInfo: () => ({ platform: watch.platform }),
    sendAppMessage: (payload, accept, reject) => sent.push({ payload, reject })
  };
  const phone = createPhone(pebble, {
    getItem: key => cache.get(key),
    setItem: (key, value) => cache.set(key, value)
  }, {
    setTimeout: cb => { timers.set(++nextTimer, cb); return nextTimer; },
    clearTimeout: id => timers.delete(id),
    seed: () => 23
  });
  function response(report, result = 0) {
    const request = sent.at(-1).payload;
    phone.receive({ Report: report, Txn: request.Txn, Profile: 0, Result: result, Clock24: 1 });
  }
  function timeout() {
    const [id, cb] = timers.entries().next().value;
    timers.delete(id);
    cb();
  }
  return { phone, sent, watch, cache, response, timeout };
}

test('keeps saves pending until the watch reports the exact applied snapshot', () => {
  const h = harness();
  h.phone.ready();
  h.response(defaults);
  const profile = h.phone.open();
  assert.equal(profile.status, 'applied');
  h.phone.save(profile, 'emery', changed);
  assert.equal(h.phone.open().status, 'pending');
  assert.equal(h.sent.at(-1).payload.Request, 1);
  h.response(defaults);
  assert.deepEqual(h.sent.at(-1).payload.Settings, changed);
  assert.equal(h.phone.open().status, 'pending');
  h.response(changed);
  assert.equal(h.phone.open().status, 'applied');
  assert.deepEqual(h.phone.open().settings, changed);
  const count = h.sent.length;
  h.phone.save(h.phone.open(), 'emery', changed);
  assert.equal(h.sent.length, count);
});

test('keeps interrupted delivery across restart and retries without overwriting another watch', () => {
  const h = harness();
  h.phone.save(h.phone.open(), 'emery', changed);
  h.timeout();
  h.timeout();
  assert.equal(h.sent.length, 2);
  const restarted = harness(h.cache);
  restarted.watch.id = 'watch-b';
  assert.equal(restarted.phone.open().status, 'default');
  restarted.phone.ready();
  restarted.response(defaults);
  assert.equal(restarted.sent.length, 1);
  restarted.watch.id = 'watch-a';
  assert.equal(restarted.phone.open().status, 'pending');
  restarted.phone.ready();
  restarted.response(defaults);
  assert.deepEqual(restarted.sent.at(-1).payload.Settings, changed);
  restarted.response(changed);
  assert.equal(restarted.phone.open().status, 'applied');
});

test('rejects invalid drafts, ignores cancellation and stale or switched-watch replies', () => {
  const h = harness();
  const session = h.phone.open();
  h.phone.save(session, 'emery', undefined);
  h.phone.save(session, 'emery', changed.slice(0,-1));
  assert.equal(h.sent.length, 0);
  h.phone.save(session, 'emery', changed);
  const txn = h.sent.at(-1).payload.Txn;
  h.phone.receive({ Report: defaults, Txn: txn + 1, Profile: 0, Result: 0, Clock24: 1 });
  assert.equal(h.sent.length, 1);
  h.watch.id = 'watch-b';
  h.response(defaults);
  assert.equal(h.phone.open().status, 'default');
  assert.equal(h.sent.length, 1);
  h.watch.id = 'watch-a';
  assert.equal(h.phone.open().status, 'pending');
});

test('manual configuration saves locally against the selected model only', () => {
  const h = harness();
  h.watch.id = '';
  h.watch.platform = undefined;
  h.phone.save(h.phone.open(), 'flint', changed);
  assert.equal(h.sent.length, 0);
  assert.equal(h.phone.open().profile, 'flint');
  assert.deepEqual(h.phone.open().settings, changed);
  h.watch.id = 'watch-a';
  h.watch.platform = 'emery';
  assert.deepEqual(h.phone.open().settings, defaults);
});

test('learns capability and system format from the watch when metadata is absent', () => {
  const h = harness();
  h.watch.platform = undefined;
  assert.equal(h.phone.open().manual, true);
  h.phone.ready();
  h.response(defaults);
  assert.equal(h.phone.open().manual, false);
  assert.equal(h.phone.open().clock24, 1);
  assert.equal(h.phone.open().profile, 'emery');
  assert.equal(h.phone.open().status, 'applied');
});

test('keeps the pending draft and the last valid watch snapshot on a persistence rejection', () => {
  const h = harness();
  h.phone.ready();
  h.response(defaults);
  h.phone.save(h.phone.open(), 'emery', changed);
  h.response(defaults);
  h.response(defaults, 2);
  assert.equal(h.phone.open().status, 'pending');
  assert.deepEqual(h.phone.open().settings, changed);
  const records = JSON.parse(h.cache.get('typedial.settings.v1')).records;
  assert.deepEqual(records['watch:watch-a'].applied, defaults);
  assert.deepEqual(records['watch:watch-a'].pending, changed);
});
