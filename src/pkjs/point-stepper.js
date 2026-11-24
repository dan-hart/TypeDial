'use strict';

module.exports = {
  template: '<div class="component td-point-stepper">' +
    '<label for="typedial-digit-size">Digit size</label>' +
    '<div class="td-point-controls">' +
    '<button type="button" data-step="-1" aria-label="Decrease digit size by 4 points">−</button>' +
    '<div class="td-point-value"><input id="typedial-digit-size" type="number" step="1" inputmode="numeric" ' +
    'aria-describedby="typedial-size-help" aria-label="Digit size in points"><span aria-hidden="true">pt</span></div>' +
    '<button type="button" data-step="1" aria-label="Increase digit size by 4 points">+</button>' +
    '</div><p id="typedial-size-help">Digits scale down when the hands and reading order leave less room.</p></div>',
  style: [
    '.td-point-stepper{padding:.7rem .75rem;}',
    '.td-point-stepper label{display:block;font-weight:600;}',
    '.td-point-stepper .td-point-controls{display:flex;gap:6px;align-items:center;margin:.35rem 0;}',
    '.td-point-stepper button,.td-point-stepper .td-point-value{font:inherit;color:inherit;background:transparent;',
    'border:1px solid currentColor;border-radius:6px;min-height:44px;}',
    '.td-point-stepper button{min-width:44px;font-size:1.25rem;}',
    '.td-point-stepper button:disabled{opacity:.45;}',
    '.td-point-stepper .td-point-value{display:flex;align-items:center;padding:0 6px;gap:3px;}',
    '.td-point-stepper input{color:inherit;background:transparent;border:0;font:inherit;font-size:1.2rem;text-align:right;width:7ch;',
    'min-height:42px;appearance:textfield;}',
    '.td-point-stepper input::-webkit-inner-spin-button{appearance:none;}',
    '.td-point-stepper p{margin:0;font-size:.85em;}'
  ].join(''),
  mount: function mountPointStepper(root, onChange) {
    var input = root.querySelector('input');
    var smaller = root.querySelector('[data-step="-1"]');
    var larger = root.querySelector('[data-step="1"]');
    var value;

    function set(next) {
      value = next;
      input.value = next;
      smaller.disabled = next <= Number(input.min);
      larger.disabled = next >= Number(input.max);
    }
    function commit(next) {
      var previous = value;
      set(isFinite(next) ? Math.min(Number(input.max), Math.max(Number(input.min), Math.round(next))) : value);
      if (value !== previous) onChange(value);
    }

    input.addEventListener('change', function() { commit(input.valueAsNumber); });
    input.addEventListener('keydown', function(event) {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      commit(input.valueAsNumber);
    });
    smaller.addEventListener('click', function() { commit(value - 4); });
    larger.addEventListener('click', function() { commit(value + 4); });
    return function update(next, minimum, maximum) {
      input.min = minimum;
      input.max = maximum;
      set(next);
    };
  }
};
