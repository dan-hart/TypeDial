    const root = document.getElementById('typedial-playground');
    const find = selector => root.querySelector(selector);
    const byId = id => find('#pht-' + id);
    const storageKey = 'typedial-playground.settings';
    const settings = Object.fromEntries(contract.keys.map((key, index) => [key, contract.defaults[index]]));
    const preview = { time: 1296, second: 42, live: false, compare: true, systemClock: '24', swatchRole: 'hour',
      sizeProfile: 'emery', sizes: {} };
    const roleKeys = ['bg', 'hour', 'minute', 'secondColor', 'tickColor'];
    const palette = contract.names.map((name, index) => index);
    const names = contract.names.concat(['Tangerine', 'Black', 'Automatic contrast', 'Match hour hand', 'Match minute hand']);
    const devices = Object.entries(profiles).filter(([, profile]) => profile.supported);
    const pad = value => String(value).padStart(2, '0');
    const fontSamples = ['PHTMono', 'PHTMonoXB', 'PHTNext', 'PHTItalic', 'PHTOriginal'];
    const fields = new Map();
    const presetButtons = [];
    const fontButtons = [];
    let liveMoment = new Date();
    let liveTimer;
    let storageAvailable = true;

    function element(tag, text, className) {
      const node = document.createElement(tag);
      if (text) node.textContent = text;
      if (className) node.className = className;
      return node;
    }

    function button(label, action) {
      const node = element('button', label);
      node.type = 'button';
      node.addEventListener('click', action);
      return node;
    }

    function choices(key) {
      if (key === 'bg') return palette;
      return (key === 'secondColor' || key === 'tickColor' ? [66, 67, 68, 64] : [64]).concat(palette);
    }

    function validSize(value) {
      return Number.isInteger(value) && value >= 0 &&
        (value < contract.legacyDigitScales.length ||
         (value >= contract.minPointSize && value <= contract.max[contract.keys.indexOf('size')]));
    }

    function restore() {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey));
        if (!saved) return;
        for (const control of controls) {
          const key = control.id;
          const value = saved.settings?.[key];
          if (key === 'size') {
            if (validSize(value)) settings.size = value;
            continue;
          }
          const allowed = control.options ? control.options.map(option => Number(option.value)) :
            control.type === 'color' ? choices(key) : [0, 1];
          if (allowed.includes(value)) settings[key] = value;
        }
        for (const key of ['time', 'second']) {
          const value = saved.preview?.[key];
          if (Number.isInteger(value) && value >= 0 && value <= Number(byId(key).max)) preview[key] = value;
        }
        for (const key of ['live', 'compare']) {
          if (typeof saved.preview?.[key] === 'boolean') preview[key] = saved.preview[key];
        }
        if (['12', '24'].includes(saved.preview?.systemClock)) preview.systemClock = saved.preview.systemClock;
        if (Object.hasOwn(profiles, saved.preview?.sizeProfile)) preview.sizeProfile = saved.preview.sizeProfile;
        for (const key of Object.keys(profiles)) {
          const size = saved.preview?.sizes?.[key];
          if (validSize(size)) preview.sizes[key] = size;
        }
        if (roleKeys.includes(saved.preview?.swatchRole)) preview.swatchRole = saved.preview.swatchRole;
      } catch {
        storageAvailable = false;
      }
    }

    function save() {
      if (!storageAvailable) return;
      try {
        localStorage.setItem(storageKey, JSON.stringify({ settings, preview }));
      } catch {
        storageAvailable = false;
      }
    }

    function changed() {
      renderSettings();
      renderFaces();
      save();
    }

    for (const control of controls) {
      const key = control.id;
      if (key === 'size') continue;
      if (key === 'font') {
        for (const option of control.options) {
          const value = Number(option.value);
          const node = button('', () => {
            settings.font = value;
            changed();
          });
          node.dataset.font = option.value;
          node.setAttribute('aria-label', control.label + ' ' + option.label);
          const sample = element('span', '09', 'sample');
          sample.style.fontFamily = fontSamples[value] || 'inherit';
          node.append(sample, option.label);
          find('[data-fonts]').append(node);
          fontButtons.push([node, value]);
        }
        continue;
      }

      let input = byId(key);
      if (control.type === 'color') {
        const label = element('label', control.label, 'field color-field');
        input = element('select');
        input.dataset.color = key;
        label.append(input, swatch(0));
        find('[data-colors]').append(label);
        byId('swatchRole').add(new Option(control.label, key));
      } else if (!input) {
        const label = element('label', control.label, 'field');
        input = element(control.type === 'select' ? 'select' : 'input');
        if (control.type === 'toggle') input.type = 'checkbox';
        label.append(input);
        find('.settings').append(label);
      }
      for (const option of control.options || []) input.add(new Option(option.label, option.value));
      if (control.description) input.title = control.description;
      input.addEventListener('change', () => {
        settings[key] = control.type === 'toggle' ? Number(input.checked) : Number(input.value);
        if (key === 'seconds') scheduleLivePreview();
        changed();
      });
      fields.set(key, input);
    }

    const sizeHost = byId('size');
    const sizeProfile = byId('sizeProfile');
    for (const [key, profile] of Object.entries(profiles)) {
      if (profile.supported) sizeProfile.add(new Option(profile.label, key));
    }
    sizeHost.innerHTML = pointStepperTemplate;
    const updatePointStepper = mountPointStepper(sizeHost, value => {
      preview.sizes[preview.sizeProfile] = value;
      renderFaces();
      save();
    });
    sizeProfile.addEventListener('change', () => {
      preview.sizeProfile = sizeProfile.value;
      changed();
    });

    function swatch(value) {
      const node = element('span', '', 'swatch');
      node.setAttribute('aria-hidden', 'true');
      node.style.backgroundColor = colors.hex(value);
      return node;
    }

    for (const accent of ['hour', 'minute']) {
      const container = find(`[data-palettes="${accent}"]`);
      for (const [name, bg, hour, minute, second, tick] of contract.themes) {
        const values = accent === 'hour' ? [bg, minute, hour, second, tick] : [bg, hour, minute, second, tick];
        const node = button(name, () => {
          roleKeys.forEach((key, index) => { settings[key] = values[index]; });
          changed();
        });
        node.setAttribute('aria-label', name + ', ' + accent + ' accent');
        const sample = element('span', '', 'palette-sample');
        for (const index of [0, 1, 2, 4]) {
          sample.append(swatch(colors.resolve(values[index], bg, values[1], values[2])));
        }
        node.append(sample);
        container.append(node);
        presetButtons.push([node, values]);
      }
    }

    function face(target, [profileKey, profile], format, sampleTime) {
      const figure = element('figure');
      const frame = element('div', '', profile.round ? 'case round' : 'case');
      const canvas = element('canvas');
      canvas.setAttribute('role', 'img');
      const caption = element('figcaption');
      frame.append(canvas);
      figure.append(frame, caption);
      target.append(figure);
      return { figure, canvas, caption, profileKey, profile, format, sampleTime, draw: createRenderer(geometry, colors, glyphs) };
    }

    const hero = devices.map(profile => face(find('[data-hero]'), profile));
    const vignettes = [608, 915, 0].map(time => face(find('[data-vignettes]'), devices[0], undefined, time));
    const gallery = devices.flatMap(device => {
      const [, profile] = device;
      const panel = element('article', '', 'model');
      const row = element('div', '', 'screen-row');
      panel.append(element('h3', profile.label),
        element('p', `${profile.width} × ${profile.height} · ${profile.color ? 'Color' : 'B/W'}`, 'quiet'), row);
      find('[data-gallery]').append(panel);
      return [face(row, device, 1), face(row, device, 2)];
    });

    const use24 = format => format === 2 || (format === 0 && preview.systemClock === '24');
    const currentMinute = () => preview.live ? liveMoment.getHours() * 60 + liveMoment.getMinutes() : preview.time;

    function timeText(time, format) {
      const hour = Math.floor(time / 60), minute = time % 60;
      if (use24(format)) return `${pad(hour)}:${pad(minute)}`;
      return `${hour % 12 || 12}:${pad(minute)} ${hour < 12 ? 'AM' : 'PM'}`;
    }

    function renderFaces(faces = [...hero, ...gallery, ...vignettes]) {
      for (const item of faces) {
        const format = item.format ?? settings.format;
        item.figure.hidden = !preview.compare && item.format !== undefined &&
          use24(item.format) !== use24(settings.format);
        if (item.figure.hidden) continue;
        const time = item.sampleTime ?? currentMinute();
        const second = preview.live && item.sampleTime === undefined ? liveMoment.getSeconds() : preview.second;
        const size = preview.sizes[item.profileKey] ?? settings.size;
        const fitted = item.draw(item.canvas, item.profile, { ...settings, format, size },
          [Math.floor(time / 60), time % 60, second], Number(preview.systemClock === '24'));
        item.caption.textContent = item.format !== undefined || item.sampleTime !== undefined ?
          timeText(time, format) : item.profile.label +
          (fitted < geometry.pointSize(item.profile, size) ? ` · ${fitted} pt fitted` : '');
      }
    }

    const roles = () => ['hour', 'minute', ...(settings.seconds ? ['secondColor'] : []),
      ...(settings.ticks ? ['tickColor'] : [])];
    const threshold = role => role === 'hour' || role === 'minute' ? 4.5 : 3;
    const resolved = (value, bg = settings.bg) => colors.resolve(value, bg, settings.hour, settings.minute);
    const contrast = (value, bg = settings.bg) => colors.contrast(bg, resolved(value, bg));
    const recommended = (value, role) => role === 'bg' ?
      roles().every(key => contrast(settings[key], value) >= threshold(key)) :
      contrast(value) >= threshold(role);
    const groupNames = ['Recommended contrast', 'Lower contrast'];

    function renderSwatches() {
      const roleSelect = byId('swatchRole');
      const available = ['bg', ...roles()];
      for (const option of roleSelect.options) option.disabled = !available.includes(option.value);
      if (!available.includes(preview.swatchRole)) preview.swatchRole = 'hour';
      roleSelect.value = preview.swatchRole;
      if (!find('[data-swatch-picker]').open) return;
      const role = preview.swatchRole;
      const groups = groupNames.map(title => {
        const section = element('section', '', 'swatch-group');
        const grid = element('div', '', 'swatch-grid');
        section.append(element('h3', title), grid);
        return { section, grid };
      });
      for (const value of choices(role)) {
        const node = button('', () => {
          settings[role] = value;
          changed();
          find(`[data-swatch="${value}"]`)?.focus();
        });
        node.dataset.swatch = value;
        node.setAttribute('aria-pressed', String(value === settings[role]));
        node.title = colors.hex(resolved(value)).toUpperCase();
        node.append(swatch(resolved(value)), names[value]);
        groups[recommended(value, role) ? 0 : 1].grid.append(node);
      }
      find('[data-swatch-groups]').replaceChildren(...groups.filter(group => group.grid.childElementCount)
        .map(group => group.section));
    }

    function renderTimeControls() {
      const time = currentMinute();
      const text = timeText(time, settings.format);
      byId('time').value = time;
      byId('time').disabled = preview.live;
      byId('time').setAttribute('aria-valuetext', text);
      byId('clock').textContent = text;
      byId('second').value = preview.second;
      byId('second-value').textContent = pad(preview.second);
      byId('seconds-control').hidden = !settings.seconds || preview.live;
      for (const node of root.querySelectorAll('[data-time]')) {
        node.disabled = preview.live;
        node.setAttribute('aria-pressed', String(!preview.live && Number(node.dataset.time) === time));
      }
    }

    function renderSettings() {
      for (const [key, input] of fields) {
        if (input.type === 'checkbox') input.checked = Boolean(settings[key]);
        else if (input.dataset.color) {
          const groups = groupNames.map(label => Object.assign(document.createElement('optgroup'), { label }));
          for (const value of choices(key)) {
            const label = value >= 66 ? names[value] : names[value] + ' · ' + colors.hex(value).toUpperCase();
            groups[recommended(value, key) ? 0 : 1].append(new Option(label, value));
          }
          input.replaceChildren(...groups.filter(group => group.childElementCount));
          input.value = settings[key];
          input.disabled = key !== 'bg' && !roles().includes(key);
          input.nextElementSibling.style.backgroundColor = colors.hex(resolved(settings[key]));
        } else input.value = settings[key];
      }
      sizeProfile.value = preview.sizeProfile;
      const profile = profiles[preview.sizeProfile];
      updatePointStepper(geometry.pointSize(profile, preview.sizes[preview.sizeProfile] ?? settings.size),
        geometry.pointSize(profile, 0), contract.max[contract.keys.indexOf('size')]);
      byId('system-control').hidden = settings.format !== 0;
      byId('systemClock').value = preview.systemClock;
      byId('live').checked = preview.live;
      byId('compare').checked = preview.compare;
      byId('secondStyle').disabled = !settings.seconds;
      byId('tickStyle').disabled = !settings.ticks;
      for (const [node, value] of fontButtons) node.setAttribute('aria-pressed', String(settings.font === value));
      for (const [node, values] of presetButtons) {
        node.setAttribute('aria-pressed', String(roleKeys.every((key, index) => settings[key] === values[index])));
      }
      renderTimeControls();
      renderSwatches();
      const issues = roles().filter(role => !recommended(settings[role], role));
      const details = roles().map(role => {
        const label = controls.find(control => control.id === role).label;
        const ratio = (Math.floor(contrast(settings[role]) * 100) / 100).toFixed(2);
        return label + ' ' + ratio + ':1';
      });
      const summary = find('[data-contrast]');
      summary.textContent = (issues.length ? 'Low contrast · ' : '') + details.join(' · ');
      summary.classList.toggle('problem', Boolean(issues.length));
      byId('fix').hidden = !issues.length;
    }

    function scheduleLivePreview() {
      clearTimeout(liveTimer);
      if (!preview.live || document.hidden) return;
      const interval = settings.seconds ? 1000 : 60000;
      liveTimer = setTimeout(updateLivePreview, interval - Date.now() % interval);
    }

    function updateLivePreview() {
      if (!preview.live) return;
      liveMoment = new Date();
      renderTimeControls();
      renderFaces([...hero, ...gallery]);
      scheduleLivePreview();
    }

    for (const node of root.querySelectorAll('[data-time]')) {
      node.addEventListener('click', () => {
        preview.time = Number(node.dataset.time);
        changed();
      });
    }
    for (const key of ['time', 'second']) {
      byId(key).addEventListener('input', event => {
        preview[key] = Number(event.target.value);
        renderTimeControls();
        renderFaces();
      });
      byId(key).addEventListener('change', save);
    }
    for (const key of ['live', 'compare', 'systemClock', 'swatchRole']) {
      byId(key).addEventListener('change', event => {
        const input = event.target;
        preview[key] = input.type === 'checkbox' ? input.checked : input.value;
        if (key === 'live') {
          liveMoment = new Date();
          scheduleLivePreview();
        }
        changed();
      });
    }
    byId('fix').addEventListener('click', () => {
      for (const role of roles()) {
        if (recommended(settings[role], role)) continue;
        const channels = value => [value >> 16, value >> 8 & 255, value & 255];
        const original = channels(colors.rgb(resolved(settings[role])));
        const distance = value => channels(colors.rgb(value)).reduce((sum, part, i) => sum + (part - original[i]) ** 2, 0);
        settings[role] = palette.filter(value => recommended(value, role)).sort((a, b) => distance(a) - distance(b))[0];
      }
      changed();
    });
    find('[data-swatch-picker]').addEventListener('toggle', renderSwatches);
    document.addEventListener('visibilitychange', updateLivePreview);
    restore();
    renderSettings();
    renderFaces();
    scheduleLivePreview();
