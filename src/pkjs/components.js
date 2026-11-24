'use strict';

var pointStepper = require('./point-stepper');

var noValue = {
  get: function() { return ''; },
  set: function() {},
  hide: function() { this.$element[0].classList.add('hide'); },
  show: function() { this.$element[0].classList.remove('hide'); }
};

module.exports = [{
  name: 'typedial-point-stepper',
  template: pointStepper.template,
  style: pointStepper.style,
  manipulator: noValue
}, {
  name: 'typedial-preview',
  template: '<div class="td-preview"><div class="td-case"><canvas role="img"></canvas></div><div class="td-preview-info"><p class="td-model"></p><output class="td-time"></output><p class="td-status" role="status"></p></div></div>',
  style: [
    '.td-preview-dock{position:sticky;bottom:0;z-index:1;background:#262823;border-top:1px solid #62655a;}',
    '.td-preview{display:flex;align-items:center;justify-content:center;gap:.75rem;padding:.45rem .75rem .25rem;}',
    '.td-preview-info{min-width:0;max-width:24rem;}',
    '.td-case{display:inline-flex;flex:none;padding:4px;background:#262823;border:1px solid #62655a;',
    'border-radius:15px;box-shadow:0 4px 8px #0002,inset 0 0 0 2px #ffffff0d;}',
    '.td-case.round,.td-case.round canvas{border-radius:50%;}',
    '.td-preview canvas{display:block;max-width:min(112px,24vw,22vh);max-height:25vh;object-fit:contain;height:auto;image-rendering:pixelated;}',
    '.td-preview .td-model{margin:0 0 .2rem;color:#fff;}',
    '.td-preview .td-time,.td-preview .td-status{color:#ccd0d6;font-size:.9rem;margin:0;}',
    '.td-preview .td-time{display:block;font-variant-numeric:tabular-nums;}'
  ].join(''),
  manipulator: {
    get: function() { return this.$element[0].typedialSettings(); },
    set: function() {}
  }
}, {
  name: 'typedial-palette',
  template: '<div class="td-palette"><div class="td-hour"></div><div class="td-minute"></div></div>',
  style: [
    '.td-palette{padding:.35rem .75rem .75rem;}',
    '.td-palette h3{font-size:.95rem;margin:.65rem 0 .45rem;}',
    '.td-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.35rem;}',
    '.td-grid button{display:flex;align-items:center;min-height:44px;gap:.35rem;',
    'width:100%;text-align:left;color:#f4f4f4;background:#22272d;border:1px solid #66717c;',
    'border-radius:5px;padding:.28rem .38rem;font:inherit;font-size:.82rem;line-height:1.15;}',
    '.td-grid button[aria-pressed="true"]{border:2px solid #ff8350;padding:.22rem .32rem;}',
    '.td-chip{display:flex;margin-left:auto;gap:2px;align-items:center;}',
    '.td-dot{width:9px;height:9px;display:inline-block;border-radius:50%;border:1px solid #777;}'
  ].join(''),
  manipulator: noValue
}, {
  name: 'typedial-swatches',
  template: '<details class="td-swatches"><summary>Named swatches and contrast</summary>' +
    '<label>Color role<select class="td-role"></select></label><p class="td-contrast" role="status"></p>' +
    '<div class="td-swatch-groups"></div></details>',
  style: [
    '.td-swatches{padding:.7rem .75rem 1rem;}',
    '.td-swatches summary{cursor:pointer;min-height:32px;}',
    '.td-swatches label{padding:.25rem 0;}',
    '.td-swatches .td-role{max-width:65%;font:inherit;font-size:.85rem;background:#2d343b;color:#fff;}',
    '.td-swatches h3{font-size:.95rem;margin:.65rem 0 .35rem;}',
    '.td-swatches .td-dot{flex:none;width:13px;height:13px;}',
    '.td-swatches .td-contrast{font-size:.85rem;margin:.35rem 0;color:#e8e8e8;}'
  ].join(''),
  manipulator: noValue
}];
