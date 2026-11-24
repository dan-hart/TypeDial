'use strict';

// Integer port of src/c/layout.c. Keep truncation at the same operations as in C.
module.exports = function createGeometry(legacyScales) {
  var square = function(value) { return value * value; };
  var trunc = function(value) { return value < 0 ? Math.ceil(value) : Math.floor(value); };
  var abs = Math.abs, min = Math.min, max = Math.max;
  var handLengths = [270, 385];
  var handWidths = [[63, 39], [77, 52]];
  var tickStyles = [
    [12, [48, 16, 0], [24, 8, 0]],
    [4, [60, 21, 0], [0, 0, 0]],
    [8, [60, 21, 0], [27, 12, 0]],
    [12, [60, 21, 0], [14, 8, 0]],
    [12, [0, 23, 0], [0, 13, 0]],
    [12, [52, 17, 0], [0, 13, 0]],
    [12, [0, 47, 1], [0, 13, 0]],
    [12, [0, 43, 2], [0, 13, 0]],
    [12, [0, 46, 3], [0, 13, 0]]
  ];
  var secondStyles = [
    [[0, 443, 12]], [[60, 400, 23]], [[0, 394, 11], [394, 394, 45]],
    [[-90, 443, 12], [-90, -90, 35]]
  ];
  var regions = 8;
  var perRegion = 2;
  var quarterSine = [];
  for (var i = 0; i <= 180; ++i) quarterSine.push(Math.round(1024 * Math.sin(i * Math.PI / 360)));

  function scale(value, permille) {
    var product = value * permille;
    return trunc((product + (product < 0 ? -500 : 500)) / 1000);
  }
  function pointSize(profile, value) {
    var span = min(profile.width, profile.height), column = profile.round ? 1 : 0;
    if (value < legacyScales.length) return scale(span, legacyScales[value][column]);
    return min(scale(span, legacyScales[legacyScales.length - 1][column]), max(scale(span, legacyScales[0][column]), value));
  }

  function scaleGlyph(size, em) { return trunc((size * em + 32) / 64); }
  function sine(turn) {
    turn = (turn % 720 + 720) % 720;
    var sign = turn >= 360 ? -1 : 1;
    turn %= 360;
    return sign * quarterSine[min(turn, 360 - turn)];
  }
  function direction(turn) { return [sine(turn), -sine(turn + 180)]; }
  function radial(cx, cy, dir, radius) {
    return [cx + trunc(dir[0] * radius / 1024), cy + trunc(dir[1] * radius / 1024)];
  }

  function marks(input, dir) {
    var span = min(input.width, input.height);
    var cx = trunc(input.width / 2), cy = trunc(input.height / 2);
    var hands = dir.map(function(unit, i) {
      return [[cx, cy], radial(cx, cy, unit, scale(span, handLengths[i])),
        scale(span, handWidths[input.weight][i]), 0];
    });
    var ticks = [];
    if (!input.ticks) return { hands: hands, ticks: ticks };
    var style = tickStyles[input.tickStyle];
    var count = style[0];
    for (var i = 0; i < count; ++i) {
      var spec = style[i % (count / 4) === 0 ? 1 : 2];
      var unit = direction(i * 720 / count);
      var radius = scale(span, 455);
      if (!input.round) {
        var x = unit[0] ? trunc(scale(input.width, 455) * 1024 / abs(unit[0])) : 1024;
        var y = unit[1] ? trunc(scale(input.height, 455) * 1024 / abs(unit[1])) : 1024;
        radius = min(x, y);
      }
      ticks.push([radial(cx, cy, unit, radius), radial(cx, cy, unit, radius - scale(span, spec[0])),
        max(1, scale(span, spec[1])), spec[2]]);
    }
    return { hands: hands, ticks: ticks };
  }
  function seconds(width, height, style, second) {
    var cx = trunc(width / 2), cy = trunc(height / 2), span = min(width, height);
    var dir = direction(second * 12);
    return secondStyles[style].map(function(spec) {
      return [radial(cx, cy, dir, scale(span, spec[0])),
        radial(cx, cy, dir, scale(span, spec[1])), max(1, scale(span, spec[2])), 0];
    });
  }
  function intersects(mark, box) {
    var margin = trunc((mark[2] + 1) / 2) + 2;
    var left = box.x - margin, right = box.x + box.w - 1 + margin;
    var top = box.y - margin, bottom = box.y + box.h - 1 + margin;
    var a = mark[0], b = mark[1];
    if (max(a[0], b[0]) < left || min(a[0], b[0]) > right ||
        max(a[1], b[1]) < top || min(a[1], b[1]) > bottom) return false;
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var cross2 = (left + right - 2 * a[0]) * dy - (top + bottom - 2 * a[1]) * dx;
    return abs(cross2) <= (right - left) * abs(dy) + (bottom - top) * abs(dx);
  }
  function unobstructed(input, out, box, gap) {
    if (input.round) {
      var cx = trunc(input.width / 2), cy = trunc(input.height / 2);
      var xx = max(abs(box.x - cx), abs(box.x + box.w - 1 - cx));
      var yy = max(abs(box.y - cy), abs(box.y + box.h - 1 - cy));
      if (square(xx) + square(yy) > square(cx - gap)) return false;
    }
    return !out.hands.some(function(mark) { return intersects(mark, box); }) &&
      !out.ticks.some(function(mark) { return intersects(mark, box); });
  }
  function labelMetrics(value, pad, metrics, em) {
    var digit = value >= 10 || pad ? [trunc(value / 10), value % 10] : [value % 10];
    var ascent = max.apply(null, digit.map(function(index) { return scaleGlyph(metrics[index][2], em); }));
    var x = 0, height = 0;
    var glyph = digit.map(function(index, i) {
      var metric = metrics[index];
      var rect = {
        x: x, y: ascent - scaleGlyph(metric[2], em),
        w: max(1, scaleGlyph(metric[0], em)), h: max(1, scaleGlyph(metric[1], em))
      };
      height = max(height, rect.y + rect.h);
      x += rect.w;
      if (i + 1 < digit.length) x += max(1, scale(em, 30));
      return rect;
    });
    return { box: { x: 0, y: 0, w: x, h: height }, glyph: glyph, digit: digit };
  }
  function scan(input, out, dir, i, gap, crowding, xshare) {
    var result = [];
    for (var region = 0; region < regions * regions; region++) result.push([]);
    var span = min(input.width, input.height);
    var cx = trunc(input.width / 2), cy = trunc(input.height / 2);
    var unit = dir[i], normal = [-unit[1], unit[0]];
    var label = out.labels[i].box;
    var box = { x: 0, y: 0, w: label.w, h: label.h };
    var offset = trunc((abs(normal[0]) * box.w + abs(normal[1]) * box.h) / 2048) +
      trunc(out.hands[i][2] / 2) + gap;
    var xorder = input.horizontal ? -1 : 1, yorder = input.vertical ? -1 : 1;
    var read = trunc(-(normal[0] * xorder * xshare + normal[1] * yorder * (100 - xshare)) / 1024);
    var side = (i === 0 ? 1 : -1) * (100 - crowding + trunc(crowding * read / 100));
    var anchor = scale(span, (input.placement ? [290, 370] : [160, 230])[i]);
    var aimX = trunc((unit[0] * anchor + trunc(normal[0] * offset * side / 100)) / 1024);
    var aimY = trunc((unit[1] * anchor + trunc(normal[1] * offset * side / 100)) / 1024);
    var step = max(3, trunc((span + 22) / 44));
    var stepX = max(1, min(step, trunc((input.width - box.w) / 20)));
    var stepY = max(1, min(step, trunc((input.height - box.h) / 20)));
    var projectionMin = scale(span, 60);
    for (box.y = gap; box.y + box.h <= input.height - gap; box.y += stepY) {
      for (box.x = gap; box.x + box.w <= input.width - gap; box.x += stepX) {
        var x = box.x + trunc(box.w / 2), y = box.y + trunc(box.h / 2);
        var dx = x - cx, dy = y - cy;
        var projection = trunc((dx * unit[0] + dy * unit[1]) / 1024);
        var other = trunc((dx * dir[1 - i][0] + dy * dir[1 - i][1]) / 1024);
        var sideDistance = trunc((dx * normal[0] + dy * normal[1]) / 1024);
        var sideError = max(0, trunc(offset * abs(side) / 100) - (side < 0 ? -sideDistance : sideDistance));
        var cost = (input.placement ? 115 : 64) * (square(dx - aimX) + square(dy - aimY)) +
          (input.placement ? 3 : 24) * (square(dx) + square(dy)) +
          280 * square(max(0, projectionMin - projection)) +
          150 * square(sideError) + 800 * square(max(0, other - projection));
        var bin = result[trunc(y * regions / input.height) * regions + trunc(x * regions / input.width)];
        if ((bin.length === perRegion && cost >= bin[perRegion - 1].cost) || !unobstructed(input, out, box, gap)) continue;
        var next = { x: box.x, y: box.y, cost: cost };
        var position = 0;
        while (position < bin.length && cost >= bin[position].cost) ++position;
        bin.splice(position, 0, next);
        if (bin.length > perRegion) bin.pop();
      }
    }
    return [].concat.apply([], result);
  }
  function pair(input, out, candidates, gap, crowding, xshare) {
    var a = out.labels[0].box, b = out.labels[1].box;
    var span = min(input.width, input.height);
    var dxMin = scale(span, 45 + trunc(140 * crowding * xshare / 10000));
    var dyMin = scale(span, trunc(140 * crowding * (100 - xshare) / 10000));
    var xorder = input.horizontal ? -1 : 1, yorder = input.vertical ? -1 : 1;
    var best = Infinity;
    var bestA, bestB;
    candidates[0].forEach(function(ca) {
      if (ca.cost >= best) return;
      candidates[1].forEach(function(cb) {
        if (cb.cost >= best - ca.cost) return;
        if (ca.x + a.w + gap > cb.x && cb.x + b.w + gap > ca.x &&
            ca.y + a.h + gap > cb.y && cb.y + b.h + gap > ca.y) return;
        var dx = (2 * (cb.x - ca.x) + b.w - a.w) * xorder;
        var dy = (2 * (cb.y - ca.y) + b.h - a.h) * yorder;
        if (!input.placement && (dx <= 0 || dy <= 0)) return;
        var midx = trunc((2 * ca.x + a.w + 2 * cb.x + b.w) / 4) - trunc(input.width / 2);
        var midy = trunc((2 * ca.y + a.h + 2 * cb.y + b.h) / 4) - trunc(input.height / 2);
        var cost = ca.cost + cb.cost + (input.placement ? 10 : 55) * (square(midx) + square(midy)) +
          (input.placement ? 30 : 100) * (
            (4 + trunc(12 * crowding * xshare * xshare / 1000000)) * square(trunc(max(0, 2 * dxMin - dx) / 2)) +
            (1 + trunc(12 * crowding * (100 - xshare) * (100 - xshare) / 1000000)) *
              square(trunc(max(0, 2 * dyMin - dy) / 2)));
        if (cost >= best) return;
        best = cost;
        bestA = ca;
        bestB = cb;
      });
    });
    if (!bestA) return false;
    a.x = bestA.x;
    a.y = bestA.y;
    b.x = bestB.x;
    b.y = bestB.y;
    return true;
  }
  function layout(input, metrics) {
    var dir = [direction(input.hour % 12 * 60 + input.minute), direction(input.minute * 12)];
    var out = marks(input, dir);
    var dot = trunc((dir[0][0] * dir[1][0] + dir[0][1] * dir[1][1]) / 1024);
    var crowding = min(100, max(0, trunc((dot - 840) * 100 / 143)));
    var x = square(dir[0][0] + dir[1][0]), y = square(dir[0][1] + dir[1][1]);
    var xshare = crowding ? trunc(100 * y / (x + y)) : 50;
    var span = min(input.width, input.height), gap = max(4, scale(span, 27));
    var hour = input.use24 ? input.hour : (input.hour + 11) % 12 + 1;
    for (var em = pointSize(input, input.size); em >= scale(span, 120); --em) {
      out.labels = [labelMetrics(hour, input.use24, metrics, em), labelMetrics(input.minute, true, metrics, em)];
      var a = out.labels[0].box, b = out.labels[1].box;
      if (max(a.w, b.w) + 2 * gap > input.width || max(a.h, b.h) + 2 * gap > input.height ||
          (a.w + b.w + 3 * gap > input.width && a.h + b.h + 3 * gap > input.height)) continue;
      var candidates = [scan(input, out, dir, 0, gap, crowding, xshare),
        scan(input, out, dir, 1, gap, crowding, xshare)];
      if (!pair(input, out, candidates, gap, crowding, xshare)) continue;
      out.em = em;
      return out;
    }
    out.labels = [];
    out.em = 0;
    return out;
  }
  return { layout: layout, pointSize: pointSize, seconds: seconds, pivotRadius: function(span) { return max(1, scale(span, 13)); } };
};
