'use strict';

// Clay runs this function inside its bundled web view. All dependencies arrive in userData.
module.exports = function configurePage() {
  var clay = this;
  var data = clay.meta.userData;
  var session = data.session, profiles = data.profiles, contract = data.contract;
  var colors = data.createColors();
  var render = data.createRenderer(data.createGeometry(contract.digitSizes), colors, data.glyphs);
  var controls = {}, draft, model = session.profile, timer, updating;
  var presets = [];
  var colorKeys = ['bg', 'hour', 'minute', 'secondColor', 'tickColor'];
  var roleLabels = ['Background', 'Hour hand', 'Minute hand', 'Seconds hand', 'Tick marks'];
  var names = contract.names.concat(['Tangerine', 'Black', 'Automatic contrast', 'Match hour hand', 'Match minute hand']);
  var draftByModel = {};
  var preview, canvas, colorsPanel, swatchGroups, swatchRole;
  var doc = document;

  function element(tag, text, className) {
    var node = doc.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function button(text, action) {
    var node = element('button', text);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }
  function visible(control, show) { controls[control][show ? 'show' : 'hide'](); }
  function root(control) { return controls[control].$element[0]; }
  function resolved(value, role, current) {
    return role === 'bg' ? value : colors.resolve(value, current.bg, current.hour, current.minute);
  }
  function swatch(value) {
    var node = element('span', '', 'td-dot');
    node.setAttribute('aria-hidden', 'true');
    node.style.backgroundColor = colors.hex(value);
    return node;
  }
  function asArray() {
    return contract.keys.map(function(key) { return draft[key]; });
  }
  function useSettings(values) {
    draft = {};
    contract.keys.forEach(function(key, i) { draft[key] = values[i]; });
    if (draft.bg === 65) draft.bg = 0; // Translate the retired patterned background.
    sync();
  }
  function sync() {
    updating = true;
    contract.keys.slice(1).forEach(function(key) {
      var value = colorKeys.indexOf(key) < 0 ? draft[key] : colors.rgb(resolved(draft[key], key, draft));
      controls[key].set(value);
    });
    updating = false;
    updatePage();
  }

  function addPresets(group, title, accentHour) {
    group.appendChild(element('h3', title));
    var grid = element('div', '', 'td-grid');
    contract.themes.forEach(function(theme) {
      var values = [theme[1], theme[accentHour ? 3 : 2], theme[accentHour ? 2 : 3], theme[4], theme[5]];
      var paletteButton = button(theme[0], function() {
        colorKeys.forEach(function(role, i) { draft[role] = values[i]; });
        sync();
      });
      paletteButton.setAttribute('aria-label', theme[0] + ', ' + title.toLowerCase());
      var chips = element('span', '', 'td-chip');
      [values[0], values[1], values[2], values[4]].forEach(function(value) { chips.appendChild(swatch(value)); });
      paletteButton.appendChild(chips);
      grid.appendChild(paletteButton);
      presets.push([paletteButton, values]);
    });
    group.appendChild(grid);
  }

  function availableRoles() {
    return [true, true, true, draft.seconds, draft.ticks];
  }
  function updateSwatches() {
    var contrast = colorsPanel.querySelector('.td-contrast');
    var role = swatchRole.value || 'bg';
    var index = colorKeys.indexOf(role);
    var secondary = index >= 3;
    var current = draft[role];
    var ratio = colors.contrast(draft.bg, resolved(current, role, draft));
    var summaries = [
      names[current],
      role === 'bg' ? colors.hex(current).toUpperCase() :
        (Math.floor(ratio * 100) / 100).toFixed(2) + ':1 against the background.'
    ];
    if (role !== 'bg' && !secondary && ratio < 4.5) summaries.push('Digits use automatic contrast.');
    if (role !== 'bg' && secondary && ratio < 3) summaries.push('Below the 3:1 target.');
    contrast.textContent = summaries.join(' · ');
    if (!colorsPanel.open) return;
    swatchGroups.textContent = '';

    var groups = ['Recommended contrast', 'Lower contrast'].map(function(name) {
      var wrapper = element('section');
      wrapper.appendChild(element('h3', name));
      var grid = element('div', '', 'td-grid');
      wrapper.appendChild(grid);
      swatchGroups.appendChild(wrapper);
      return grid;
    });
    var specials = role === 'bg' ? [] : secondary ? [66, 67, 68, 64] : [64];
    var valueOptions = specials.concat(contract.names.map(function(name, i) { return i; }));
    valueOptions.forEach(function(value) {
      var good;
      if (role === 'bg') {
        good = colorKeys.slice(1).every(function(key, i) {
          return !availableRoles()[i + 1] || colors.contrast(value, resolved(draft[key], key, {
            bg: value, hour: draft.hour, minute: draft.minute
          })) >= (i < 2 ? 4.5 : 3);
        });
      } else {
        good = colors.contrast(draft.bg, resolved(value, role, draft)) >= (secondary ? 3 : 4.5);
      }
      var label = value === 64 ? 'Tangerine · #FF5500' : names[value];
      var node = button(label, function() { draft[role] = value; sync(); });
      node.setAttribute('aria-pressed', String(current === value));
      node.appendChild(swatch(resolved(value, role, draft)));
      groups[good ? 0 : 1].appendChild(node);
    });
    groups.forEach(function(grid) { grid.parentNode.hidden = !grid.children.length; });
  }

  function updateTime() {
    clearTimeout(timer);
    var selection = Number(controls.previewTime.get());
    var now = new Date();
    var samples = [null, 720, 0, 915, 1439, 608, 1296];
    var minuteOfDay = selection === 7 ? controls.previewMinute.get() : samples[selection];
    var time = selection === 0 ? [now.getHours(), now.getMinutes(), now.getSeconds()] :
      [Math.floor(minuteOfDay / 60), minuteOfDay % 60, controls.previewSecond.get()];
    visible('previewMinute', selection === 7);
    visible('previewSecond', selection !== 0 && draft.seconds);
    controls.previewMinute.$manipulatorTarget[0].setAttribute('aria-valuetext',
      ('0' + time[0]).slice(-2) + ':' + ('0' + time[1]).slice(-2));
    var system = model === session.profile ? session.clock24 : null;
    render(canvas, profiles[model], draft, time, system);
    var clock = draft.format === 2 || (draft.format === 0 && system !== 0) ?
      ('0' + time[0]).slice(-2) + ':' + ('0' + time[1]).slice(-2) :
      (time[0] % 12 || 12) + ':' + ('0' + time[1]).slice(-2) + (time[0] >= 12 ? ' PM' : ' AM');
    preview.querySelector('.td-time').textContent = clock;
    if (selection === 0) {
      var delay = draft.seconds ? 1000 - now.getMilliseconds() :
        60000 - now.getSeconds() * 1000 - now.getMilliseconds();
      timer = setTimeout(updateTime, delay + 8);
    }
  }

  function updatePage() {
    var profile = profiles[model];
    preview.querySelector('.td-case').classList.toggle('round', profile.round);
    visible('mono', !profile.color);
    visible('palette', profile.color);
    visible('swatches', profile.color);
    var allowed = availableRoles();
    colorKeys.forEach(function(role, i) {
      visible(role, profile.color && allowed[i]);
      swatchRole.options[i].disabled = !allowed[i];
    });
    if (swatchRole.selectedIndex < 0 || !allowed[swatchRole.selectedIndex]) swatchRole.selectedIndex = 0;
    visible('secondStyle', draft.seconds);
    visible('tickStyle', draft.ticks);
    presets.forEach(function(item) {
      item[0].setAttribute('aria-pressed', String(colorKeys.every(function(role, i) {
        return draft[role] === item[1][i];
      })));
    });
    preview.querySelector('.td-model').textContent = profile.label + ' · ' + profile.width + ' × ' +
      profile.height + (profile.color ? ' · Color' : ' · Monochrome');
    var status = session.status;
    var note = session.local ? (status === 'local' ? 'Stored on this phone for the selected model.' :
      'Save a local draft for this model.') :
      status === 'pending' ? 'Waiting for the watch. Save to resend.' :
      status === 'applied' ? 'Watch settings confirmed.' : 'Save to apply these settings.';
    if (session.storageUnavailable) note = 'Phone storage is unavailable. Keep the Pebble app open while saving.';
    if (draft.format === 0 && (session.clock24 === null || session.clock24 === undefined || model !== session.profile)) {
      note += ' System format previews in 24-hour time until the watch reports its preference.';
    }
    preview.querySelector('.td-status').textContent = note;
    if (profile.color) updateSwatches();
    updateTime();
  }

  clay.on(clay.EVENTS.AFTER_BUILD, function() {
    clay.getAllItems().forEach(function(item) { if (item.id) controls[item.id] = item; });
    preview = root('preview');
    preview.parentNode.classList.add('td-preview-dock');
    canvas = preview.querySelector('canvas');
    colorsPanel = root('swatches');
    swatchGroups = colorsPanel.querySelector('.td-swatch-groups');
    swatchRole = colorsPanel.querySelector('.td-role');
    colorKeys.forEach(function(role, i) {
      var option = element('option', roleLabels[i]);
      option.value = role;
      swatchRole.appendChild(option);
    });
    swatchRole.addEventListener('change', updateSwatches);
    colorsPanel.addEventListener('toggle', updateSwatches);
    addPresets(root('palette').querySelector('.td-hour'), 'Hour accent', true);
    addPresets(root('palette').querySelector('.td-minute'), 'Minute accent', false);
    preview.typedialSettings = function() { return { profile: model, settings: asArray() }; };

    if (session.hasModelDraft) {
      preview.querySelector('.td-preview-info').appendChild(button('Use saved model settings', function() {
        useSettings(session.choices[model]);
      }));
    }
    controls.profile.set(model);
    visible('profile', session.manual);
    controls.previewTime.set(0);
    controls.profile.on('change', function() {
      draftByModel[model] = asArray();
      model = controls.profile.get();
      useSettings(draftByModel[model] || session.choices[model] || contract.defaults);
    });
    controls.previewTime.on('change', updateTime);
    controls.previewMinute.on('change input', updateTime);
    controls.previewSecond.on('change input', updateTime);
    contract.keys.slice(1).forEach(function(key) {
      controls[key].on('change', function() {
        if (updating) return;
        var value = controls[key].get();
        draft[key] = colorKeys.indexOf(key) < 0 ? Number(value) : colors.fromRGB(value);
        if (colorKeys.indexOf(key) < 0) updatePage();
        else sync();
      });
    });
    useSettings(session.settings);
  });
};
