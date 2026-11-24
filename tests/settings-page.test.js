'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const child = require('node:child_process');
const Module = require('node:module');
const vm = require('node:vm');

const source = path.resolve(__dirname, '../src/pkjs/index.js');
const projectRequire = Module.createRequire(source);
const clayFile = path.resolve(__dirname, '../node_modules/@rebble/clay/src/js/index.js');

function start(platform, shell = 'ios') {
  const events = {};
  const sent = [];
  const store = new Map();
  let url;
  const context = vm.createContext({
    Pebble: {
      platform: shell,
      addEventListener: (event, callback) => (events[event] ||= []).push(callback),
      getAccountToken: () => 'private account',
      getWatchToken: () => 'private device',
      getActiveWatchInfo: () => ({ platform, firmware: { major: 4, minor: 9 } }),
      sendAppMessage: data => sent.push(data),
      openURL: value => { url = value; }
    },
    localStorage: { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) },
    console,
    setTimeout: () => 1,
    clearTimeout: () => {}
  });
  function evaluate(filename, require) {
    const module = { exports: {} };
    vm.runInContext('(function(module, exports, require) {' + fs.readFileSync(filename, 'utf8') + '\n})', context)
      (module, module.exports, require);
    return module.exports;
  }

  const Clay = evaluate(clayFile, name => name === 'message_keys' ? {} : projectRequire(name));
  evaluate(source, name => name === '@rebble/clay' ? Clay : projectRequire(name));
  const event = (name, data) => (events[name] || []).forEach(callback => callback(data));
  event('ready');
  event('showConfiguration');
  assert.ok(url.startsWith('data:text/html;charset=utf-8,'));
  const html = decodeURIComponent(url.slice(url.indexOf(',') + 1));
  return { html, sent, store, event };
}

test('generates offline Clay URLs for phones and the emulator and keeps identity private', () => {
  for (const shell of ['ios', 'android', 'pypkjs']) {
    const phone = start('emery', shell);
    assert.match(phone.html, /pebblejs:\/\/close#/);
    assert.doesNotMatch(phone.html, /private account|private device|clay\.pebble\.com/);
    assert.doesNotMatch(phone.html, /<(?:script|link)\b[^>]*(?:src|href)=["']https?:\/\//i);
    phone.event('webviewclosed', {});
    assert.equal(phone.sent.length, 1);
    assert.equal(phone.store.size, 0);
  }
});

const chrome = process.env.TYPEDIAL_CHROME;

for (const [platform, width, height, color] of [
  ['emery', 200, 228, true], ['flint', 144, 168, false], ['gabbro', 260, 260, true]
]) {
  test('offline Clay page renders ' + platform + ' and submits the visible draft', { skip: !chrome }, () => {
    const mobile = platform === 'flint' ? 'android' : 'ios';
    const phone = start(platform, mobile);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'typedial-settings-'));
    const testHtml = path.join(tmp, 'config.html');
    try {
      const script = `<script>
        window.addEventListener('DOMContentLoaded', function () {
          var check = function (condition, message) { if (!condition) throw Error(message); };
          try {
            var canvas = document.querySelector('canvas');
            var form = document.getElementById('main-form');
            check(document.documentElement.classList.contains('platform-${mobile}'), 'mobile Clay styles');
            check(document.querySelectorAll('canvas').length === 1, 'one preview');
            check(canvas.width === ${width} && canvas.height === ${height}, 'profile dimensions');
            check(document.querySelector('.td-palette').classList.contains('hide') === ${!color}, 'preset visibility');
            check(document.querySelectorAll('.component-color:not(.hide)').length === ${color ? 3 : 0}, 'color visibility');
            var dock = document.querySelector('.td-preview-dock');
            var save = form.querySelector('[type=submit]');
            check(dock.firstElementChild.contains(canvas) && dock.lastElementChild.contains(save),
              'preview directly above native Save');
            check(getComputedStyle(dock).position === 'sticky', 'sticky preview and Save');
            for (var offset of [0, 400]) {
              window.scrollTo(0, offset);
              var bounds = dock.getBoundingClientRect();
              check(bounds.top >= 0 && bounds.bottom <= window.innerHeight + 1, 'visible preview while scrolling');
            }
            var size = Array.from(document.querySelectorAll('.component-select')).find(
              function (item) { return item.textContent.includes('Digit size'); }).querySelector('select');
            check(size.options.length === 10 && size.options[9].textContent === 'Maximum +5', 'five larger sizes');
            size.value = '9';
            size.dispatchEvent(new Event('change', { bubbles: true }));
            var preview = Array.from(document.querySelectorAll('.component-select')).find(
              function (item) { return item.textContent.includes('Preview time'); });
            var select = preview.querySelector('select');
            select.value = '5';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            check(canvas.getAttribute('aria-label').includes('10:08'), '10:08 manual example');
            document.querySelector('.component-toggle input').click();
            check(Array.from(document.querySelectorAll('.component-slider:not(.hide)')).some(
              function (item) { return item.textContent.includes('Preview seconds'); }), 'manual seconds controls');
            if (${color}) {
              document.querySelector('.td-hour button').click();
              size.value = '0';
              size.dispatchEvent(new Event('change', { bubbles: true }));
              var pixels = canvas.getContext('2d').getImageData(0, 0, 20, 20).data;
              check(pixels.every(function (channel, i) { return channel === (i % 4 === 3 ? 255 : 0); }),
                'Ember uses a solid black background');
              size.value = '9';
              size.dispatchEvent(new Event('change', { bubbles: true }));
              var picker = document.querySelector('.component-color:not(.hide) .color-box[data-value="16733440"]');
              check(!!picker, 'native palette includes orange');
              picker.click();
              var details = document.querySelector('.td-swatches');
              details.open = true;
              details.dispatchEvent(new Event('toggle'));
              check(details.textContent.includes('Dark gray'), 'named background swatches');
            }
            var payload = document.querySelector('.td-preview').typedialSettings();
            check(payload.profile === '${platform}' && payload.settings[1] === 2 && payload.settings[3] === 9 && payload.settings[8] === 1,
              'correct save data');
            check(typeof form.querySelector('[type=submit]') !== 'undefined' &&
              !!form.querySelector('[type=submit]'), 'native Clay save button');
            document.body.setAttribute('data-result', 'pass');
            document.body.setAttribute('data-settings', JSON.stringify(payload.settings));
          } catch (error) { document.body.setAttribute('data-result', error.message); }
        });
      </script>`;
      fs.writeFileSync(testHtml, phone.html.replace('</body>', script + '</body>'));
      const out = child.execFileSync(chrome, ['--headless', '--disable-gpu', '--disable-background-networking',
        '--no-first-run', '--no-default-browser-check', '--host-resolver-rules=MAP * ~NOTFOUND',
        '--user-agent=' + (mobile === 'android' ? 'Mozilla/5.0 (Linux; Android 15)' : 'Mozilla/5.0 (iPhone)'),
        '--user-data-dir=' + path.join(tmp, 'chrome'), '--window-size=400,1000', '--dump-dom', 'file://' + testHtml],
      { encoding: 'utf8', maxBuffer: 1024 * 1024 * 3, timeout: 20000, stdio: ['ignore', 'pipe', 'ignore'] });
      const body = out.match(/<body[^>]*data-result="([^"]+)"/);
      assert.equal(body && body[1], 'pass');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
}
