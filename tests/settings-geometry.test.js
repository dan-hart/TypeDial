'use strict';

const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const profiles = require('../src/pkjs/profiles');
const glyphs = require('../src/pkjs/glyphs.json');
const contract = require('../src/pkjs/contract.json');
const geometry = require('../src/pkjs/preview-geometry')(contract.legacyDigitScales);
const colors = require('../src/pkjs/colors')();
const fixture = process.env.TYPEDIAL_GEOMETRY_FIXTURE || __dirname + '/settings-geometry.csv';

test('preview matches the native digit boxes and effective sizes', () => {
  const rows = fs.readFileSync(fixture, 'utf8').trim().split('\n').slice(1);
  assert.ok(rows.length >= 234);
  for (const row of rows) {
    const [profile, hour, minute, format, font, size, placement, horizontal, vertical,
      weight, ticks, tickStyle, em, ...positions] = row.split(',').map(Number);
    const input = {
      ...Object.values(profiles).find(p => p.wire === profile),
      hour, minute, use24: format === 2, size, placement, horizontal, vertical, weight, ticks, tickStyle
    };
    const out = geometry.layout(input, glyphs.fonts[font]);
    const boxes = out.labels.flatMap(({ box: { x, y, w, h } }) => [x, y, w, h]);
    assert.deepEqual([out.em, ...boxes], [em, ...positions], row);
  }
});

test('all preset digits and automatic secondary inks meet native contrast targets', () => {
  assert.equal(colors.hex(64), '#ff5500');
  assert.equal(colors.hex(65), '#000000');
  for (const [, bg, hour, minute] of contract.themes) {
    assert.ok(colors.contrast(bg, colors.digits(bg, hour)) >= 4.5);
    assert.ok(colors.contrast(bg, colors.digits(bg, minute)) >= 4.5);
    assert.ok(colors.contrast(bg, colors.resolve(66, bg, hour, minute)) >= 3);
  }
  for (let paletteIndex = 0; paletteIndex < 64; paletteIndex++) {
    assert.ok(colors.contrast(paletteIndex, colors.resolve(66, paletteIndex, 0, 63)) >= 3);
  }
});
