'use strict';

module.exports = function createRenderer(geometry, colors, glyphs) {
  var cachedKey, cachedAppearance, layout, rows, base, frame, protectedPixels;

  function square(value) { return value * value; }

  // Match the watch's integer pixel coverage for rounded strokes and dial marks.
  function covers(item, x, y) {
    var a = item[0], b = item[1], width = item[2], shape = item[3];
    var dx = x - a[0], dy = y - a[1], radius = Math.floor(width / 2);
    if (shape === 1) return Math.abs(dx) + Math.abs(dy) <= radius;
    if (shape === 2) return Math.max(Math.abs(dx), Math.abs(dy)) <= Math.floor((width * 181 + 256) / 512);
    if (shape === 3) return Math.max(Math.abs(dx), Math.abs(dy)) <= radius &&
      Math.min(Math.abs(dx), Math.abs(dy)) <= Math.floor(radius / 4);
    var vx = b[0] - a[0], vy = b[1] - a[1];
    var norm = square(vx) + square(vy);
    var along = dx * vx + dy * vy;
    if (along <= 0) return 4 * (square(dx) + square(dy)) <= square(width);
    if (along >= norm) return 4 * (square(x - b[0]) + square(y - b[1])) <= square(width);
    return 4 * square(dx * vy - dy * vx) <= square(width) * norm;
  }

  function mark(item, w, h, apply) {
    var radius = Math.floor((item[2] + 1) / 2);
    var a = item[0], b = item[1];
    var top = Math.max(0, Math.min(a[1], b[1]) - radius);
    var bottom = Math.min(h - 1, Math.max(a[1], b[1]) + radius);
    var left = Math.max(0, Math.min(a[0], b[0]) - radius);
    var right = Math.min(w - 1, Math.max(a[0], b[0]) + radius);
    for (var y = top; y <= bottom; ++y) for (var x = left; x <= right; ++x) {
      if (covers(item, x, y)) apply(y * w + x);
    }
  }

  function ink(data, index, rgb) {
    var i = index * 4;
    data[i] = rgb >> 16;
    data[i + 1] = rgb >> 8 & 255;
    data[i + 2] = rgb & 255;
    data[i + 3] = 255;
  }

  function glyphRows(label, font) {
    var rows = [];
    label.glyph.forEach(function(glyph, i) {
      var source = font[label.digit[i]];
      var stride = Math.ceil(source[0] / 8);
      for (var y = 0; y < glyph.h; ++y) {
        var sy = Math.floor((2 * y + 1) * source[1] / (2 * glyph.h));
        var x0 = -1;
        for (var x = 0; x <= glyph.w; ++x) {
          var sx = Math.floor((2 * x + 1) * source[0] / (2 * glyph.w));
          var ink = x < glyph.w && (source[3][sy * stride + (sx >> 3)] & (128 >> (sx & 7)));
          if (ink && x0 === -1) x0 = x;
          if (!ink && x0 !== -1) {
            rows.push([label.box.x + glyph.x + x0, label.box.y + glyph.y + y, x - x0]);
            x0 = -1;
          }
        }
      }
    });
    return rows;
  }

  function draw(canvas, profile, setting, time, clock24) {
    var w = profile.width, h = profile.height, span = Math.min(w, h);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    canvas.style.width = w + 'px';
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var use24 = setting.format === 2 || (setting.format === 0 && clock24 !== 0);
    var hour = time[0], minute = time[1], second = time[2];
    var key = [w, h, hour, minute, use24, setting.size, setting.placement, setting.weight,
      setting.horizontal, setting.vertical, setting.ticks, setting.tickStyle, setting.font].join(',');
    if (key !== cachedKey) {
      var metrics = glyphs.fonts[setting.font];
      layout = geometry.layout({
        width: w, height: h, round: profile.round, use24: use24, hour: hour, minute: minute,
        size: setting.size, placement: setting.placement, weight: setting.weight,
        horizontal: setting.horizontal, vertical: setting.vertical, ticks: setting.ticks,
        tickStyle: setting.tickStyle
      }, metrics);
      rows = layout.labels.map(function(label) { return glyphRows(label, metrics); });
      cachedKey = key;
    }
    var bg = profile.color ? setting.bg : (setting.mono ? 63 : 0);
    var hand = profile.color ? [setting.hour, setting.minute] : [63 - bg, 63 - bg];
    var digits = hand.map(function(color) { return colors.digits(bg, color); });
    var tick = profile.color ? colors.resolve(setting.tickColor, bg, hand[0], hand[1]) : hand[0];
    var sec = profile.color ? colors.resolve(setting.secondColor, bg, hand[0], hand[1]) : hand[0];
    var appearance = [key, bg, hand[0], hand[1], tick].join(',');
    if (appearance !== cachedAppearance) {
      base = ctx.createImageData(w, h);
      frame = ctx.createImageData(w, h);
      protectedPixels = new Uint8Array(w * h);
      var cx = Math.floor(w / 2), cy = Math.floor(h / 2);
      var bgRGB = colors.rgb(bg);
      for (var index = 0; index < w * h; ++index) ink(base.data, index, bgRGB);

      function staticMark(item, rgb) {
        mark(item, w, h, function(index) {
          ink(base.data, index, rgb);
          protectedPixels[index] = 1;
        });
      }
      layout.ticks.forEach(function(item) { staticMark(item, colors.rgb(tick)); });
      staticMark(layout.hands[1], colors.rgb(hand[1]));
      staticMark(layout.hands[0], colors.rgb(hand[0]));
      staticMark([[cx, cy], [cx, cy], 2 * geometry.pivotRadius(span), 0], bgRGB);
      rows.forEach(function(label) {
        label.forEach(function(row) {
          for (var y = row[1] - 1; y <= row[1] + 1; ++y) {
            var start = y * w + row[0] - 1, end = y * w + row[0] + row[2] + 1;
            protectedPixels.fill(1, start, end);
            if (layout.digitsInFront) {
              for (var index = start; index < end; ++index) ink(base.data, index, bgRGB);
            }
          }
        });
      });
      rows.forEach(function(label, i) {
        var rgb = colors.rgb(digits[i]);
        label.forEach(function(row) {
          for (var x = row[0]; x < row[0] + row[2]; ++x) ink(base.data, row[1] * w + x, rgb);
        });
      });
      cachedAppearance = appearance;
    }

    if (setting.seconds) {
      frame.data.set(base.data);
      var secondRGB = colors.rgb(sec);
      geometry.seconds(w, h, setting.secondStyle, second).forEach(function(item) {
        mark(item, w, h, function(index) {
          if (!protectedPixels[index]) ink(frame.data, index, secondRGB);
        });
      });
    }
    ctx.putImageData(setting.seconds ? frame : base, 0, 0);
    var labels = layout.labels.map(function(label) { return label.digit.join(''); });
    var description = profile.label + ', ' + labels.join(':');
    if (!use24) description += hour >= 12 ? ' PM' : ' AM';
    canvas.setAttribute('aria-label', description);
    return layout.em;
  }
  return draw;
};
