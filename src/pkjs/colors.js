'use strict';

// The same palette indexes address the native two-bit RGB channels.
module.exports = function createColors() {
  function native(value) { return value === 64 ? 52 : value === 65 ? 0 : value; }
  function components(value) { return [value >> 4, value >> 2 & 3, value & 3]; }
  function rgb(value) {
    var c = components(native(value));
    return c[0] * 0x550000 + c[1] * 0x5500 + c[2] * 0x55;
  }
  function hex(value) { return '#' + ('000000' + rgb(value).toString(16)).slice(-6); }
  function fromRGB(value) { return ((value >> 22 & 3) << 4) | ((value >> 14 & 3) << 2) | (value >> 6 & 3); }

  function luminance(value) {
    var levels = [0, 0.09084171118, 0.40197777983, 1];
    var c = components(native(value));
    return Math.round(10000 * (levels[c[0]] * 0.2126 + levels[c[1]] * 0.7152 + levels[c[2]] * 0.0722));
  }

  function contrast(a, b) {
    var x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 500) / (Math.min(x, y) + 500);
  }
  function automatic(bg) {
    var index = 63, best = Infinity;
    for (var i = 0; i < 64; i++) {
      var ratio = Math.round(1000 * contrast(bg, i));
      var cost = Math.abs(ratio - 3800);
      if (ratio >= 3000 && cost < best) { best = cost; index = i; }
    }
    return index;
  }
  function resolve(value, bg, hour, minute) {
    if (value === 67) return hour;
    if (value === 68) return minute;
    return value === 66 ? automatic(bg) : value;
  }
  function digits(bg, hand) {
    if (contrast(bg, hand) >= 4.5) return hand;
    return contrast(bg, 63) > contrast(bg, 0) ? 63 : 0;
  }
  return { hex: hex, rgb: rgb, fromRGB: fromRGB, contrast: contrast, resolve: resolve, digits: digits };
};
