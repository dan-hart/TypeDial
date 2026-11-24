'use strict';

var Clay = require('@rebble/clay');
var createPhone = require('./phone');
var config = require('./config');
var components = require('./components');
var profiles = require('./profiles');
var contract = require('./contract.json');
var glyphs = require('./glyphs.json');
var createColors = require('./colors');
var createGeometry = require('./preview-geometry');
var createRenderer = require('./preview-renderer');
var page = require('./page');

var phone = createPhone(Pebble, localStorage, {
  seed: function() { return Math.floor(Math.random() * 0x7ffffffe); },
  setTimeout: setTimeout,
  clearTimeout: clearTimeout
});
var clay;
var session;

Pebble.addEventListener('ready', phone.ready);
Pebble.addEventListener('appmessage', function(event) { phone.receive(event.payload); });
Pebble.addEventListener('showConfiguration', function() {
  session = phone.open();
  if (!clay) {
    clay = new Clay(config, page, { autoHandleEvents: false });
    components.forEach(function(component) { clay.registerComponent(component); });
  }
  // Keep persistent drafts and identity on the phone. Clay's page needs only preview data.
  clay.meta = {
    userData: {
      session: {
        profile: session.profile, manual: session.manual, local: session.local,
        status: session.status, settings: session.settings, clock24: session.clock24,
        storageUnavailable: session.storageUnavailable, choices: session.choices,
        hasModelDraft: session.hasModelDraft
      },
      profiles: profiles, contract: contract, glyphs: glyphs,
      createGeometry: createGeometry, createRenderer: createRenderer, createColors: createColors
    }
  };
  var url = clay.generateUrl();
  if (Pebble.platform === 'pypkjs') {
    // Clay's legacy emulator proxy requires the Internet. Keep the emulator page local.
    var html = decodeURIComponent(url.slice(url.indexOf('#') + 1));
    url = Clay.encodeDataUri(html.replace('$$$RETURN_TO$$$', 'pebblejs://close#'));
  }
  Pebble.openURL(url);
});
Pebble.addEventListener('webviewclosed', function(event) {
  var savedSession = session;
  session = null;
  if (!event || !event.response || !savedSession) return;
  var result;
  try {
    var response = event.response;
    result = JSON.parse(response.charAt(0) === '{' ? response : decodeURIComponent(response));
  } catch (error) {
    return; // Cancellation and invalid responses cannot replace pending or applied settings.
  }
  var draft = result && result.Settings && result.Settings.value;
  if (draft && typeof draft === 'object') phone.save(savedSession, draft.profile, draft.settings);
});
