'use strict';

var profiles = require('./profiles');
var sizeLabels = require('./contract.json').digitSizes.map(function(size) { return size[0]; });

function select(id, label, labels, description) {
  return {
    type: 'select', id: id, label: label, description: description || '',
    options: labels.map(function(name, value) { return { label: name, value: String(value) }; })
  };
}

function color(id, label) { return { type: 'color', id: id, label: label, layout: 'COLOR', sunlight: false }; }

function slider(id, label, max, defaultValue) {
  return { type: 'slider', id: id, label: label, defaultValue: defaultValue,
    min: 0, max: max, step: 1, precision: 0 };
}

function toggle(id, label) { return { type: 'toggle', id: id, label: label }; }
function section(label, items) {
  return { type: 'section', items: [{ type: 'heading', defaultValue: label }].concat(items) };
}

module.exports = [
  { type: 'heading', defaultValue: 'TypeDial' },
  {
    type: 'select', id: 'profile', label: 'Preview watch',
    options: Object.keys(profiles).filter(function(key) { return profiles[key].supported; })
      .map(function(key) { return { label: profiles[key].label, value: key }; })
  },
  select('previewTime', 'Preview time', ['Live time', 'Noon', 'Midnight', '15:15', '23:59', '10:08', '21:36', 'Custom time']),
  slider('previewMinute', 'Minute of day', 1439, 1296),
  slider('previewSecond', 'Preview seconds', 59, 42),
  section('Time and typography', [
    select('format', 'Clock format', ['System', '12-hour', '24-hour']),
    select('font', 'Atkinson Hyperlegible', ['Mono Bold', 'Mono ExtraBold', 'Next Bold', 'Next Bold Italic', 'Original Bold']),
    select('size', 'Digit size', sizeLabels, 'Digits scale down at times when the hands and reading order leave less room.')
  ]),
  section('Placement and hands', [
    select('placement', 'Digits follow hands', ['Near the center', 'Closer to the tips']),
    select('horizontal', 'Horizontal order', ['Hour left of minute', 'Hour right of minute']),
    select('vertical', 'Vertical order', ['Hour above minute', 'Hour below minute']),
    select('weight', 'Hand weight', ['Bold', 'Heavy']),
    toggle('seconds', 'Show seconds hand'),
    select('secondStyle', 'Seconds style', ['Needle', 'Baton', 'Lollipop', 'Counterweight'])
  ]),
  section('Dial marks', [
    toggle('ticks', 'Show tick marks'),
    select('tickStyle', 'Tick style', [
      'Classic hashes', 'Quarter hours only', 'Quarter hours and eighth-turn marks', 'Quarter hours and small hour marks',
      'Dots', 'Hashes and dots', 'Diamonds and dots', 'Squares and dots', 'Crosses and dots'
    ])
  ]),
  section('Display colors', [
    select('mono', 'Monochrome polarity', ['Light on black', 'Dark on white']),
    { type: 'typedial-palette', id: 'palette' },
    color('bg', 'Background'),
    color('hour', 'Hour hand'),
    color('minute', 'Minute hand'),
    color('secondColor', 'Seconds hand'),
    color('tickColor', 'Tick marks'),
    { type: 'typedial-swatches', id: 'swatches' }
  ]),
  { type: 'section', items: [
    { type: 'typedial-preview', id: 'preview', messageKey: 'Settings' },
    { type: 'submit', defaultValue: 'Save' }
  ] }
];
