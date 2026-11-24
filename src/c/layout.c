#include "layout.h"
#include "contract.h"

#include <stdlib.h>
#include <string.h>

static const uint16_t quarter_sine[181] = {
  0, 9, 18, 27, 36, 45, 54, 63, 71, 80, 89, 98,
  107, 116, 125, 134, 143, 151, 160, 169, 178, 187, 195, 204,
  213, 222, 230, 239, 248, 256, 265, 274, 282, 291, 299, 308,
  316, 325, 333, 342, 350, 359, 367, 375, 384, 392, 400, 408,
  416, 425, 433, 441, 449, 457, 465, 473, 481, 489, 496, 504,
  512, 520, 527, 535, 543, 550, 558, 565, 573, 580, 587, 595,
  602, 609, 616, 623, 630, 637, 644, 651, 658, 665, 672, 679,
  685, 692, 698, 705, 711, 718, 724, 730, 737, 743, 749, 755,
  761, 767, 773, 779, 784, 790, 796, 801, 807, 812, 818, 823,
  828, 834, 839, 844, 849, 854, 859, 864, 868, 873, 878, 882,
  887, 891, 896, 900, 904, 908, 912, 916, 920, 924, 928, 932,
  935, 939, 943, 946, 949, 953, 956, 959, 962, 965, 968, 971,
  974, 977, 979, 982, 984, 987, 989, 991, 994, 996, 998, 1000,
  1002, 1003, 1005, 1007, 1008, 1010, 1011, 1013, 1014, 1015, 1016, 1017,
  1018, 1019, 1020, 1021, 1022, 1022, 1023, 1023, 1023, 1024, 1024, 1024,
  1024,
};

static const int16_t hand_lengths[] = {270, 385};
static const int16_t hand_widths[][2] = {{63, 39}, {77, 52}};

typedef struct { uint8_t length, width, shape; } TickSpec;
static const struct { uint8_t count; TickSpec major, minor; } tick_styles[] = {
  {12, {48, 16, TD_STROKE}, {24, 8, TD_STROKE}},
  {4,  {60, 21, TD_STROKE}, {0, 0, TD_STROKE}},
  {8,  {60, 21, TD_STROKE}, {27, 12, TD_STROKE}},
  {12, {60, 21, TD_STROKE}, {14, 8, TD_STROKE}},
  {12, {0, 23, TD_STROKE}, {0, 13, TD_STROKE}},
  {12, {52, 17, TD_STROKE}, {0, 13, TD_STROKE}},
  {12, {0, 47, TD_DIAMOND}, {0, 13, TD_STROKE}},
  {12, {0, 43, TD_SQUARE}, {0, 13, TD_STROKE}},
  {12, {0, 46, TD_CROSS}, {0, 13, TD_STROKE}},
};

typedef struct { int16_t start, end, width; } SecondsSpec;
static const struct { uint8_t count; SecondsSpec marks[2]; } seconds_styles[] = {
  {1, {{0, 443, 12}}},
  {1, {{60, 400, 23}}},
  {2, {{0, 394, 11}, {394, 394, 45}}},
  {2, {{-90, 443, 12}, {-90, -90, 35}}},
};

static int min(int a, int b) { return a < b ? a : b; }
static int max(int a, int b) { return a > b ? a : b; }
static int32_t square(int v) { return (int32_t)v * v; }

int td_scale(int value, int permille) {
  int32_t product = (int32_t)value * permille;
  return (product + (product < 0 ? -500 : 500)) / 1000;
}

int td_scale_glyph(int size, int em) {
  return (size * em + 32) / 64;
}

int td_magnitude(const TdLayoutInput *in) { return min(in->width, in->height); }
int td_pivot_radius(int span) { return max(1, td_scale(span, 13)); }

static int sine(int turn) {
  turn %= 720;
  if (turn < 0) turn += 720;
  int sign = turn >= 360 ? -1 : 1;
  turn %= 360;
  return sign * quarter_sine[min(turn, 360 - turn)];
}

TdPoint td_direction(int turn) {
  return (TdPoint){sine(turn), -sine(turn + 180)};
}

static TdPoint radial(TdPoint center, TdPoint dir, int radius) {
  return (TdPoint){center.x + dir.x * radius / TD_TRIG,
                   center.y + dir.y * radius / TD_TRIG};
}

static void geometry(const TdLayoutInput *in, TdLayout *out, TdPoint dir[2]) {
  int span = td_magnitude(in);
  TdPoint center = {in->width / 2, in->height / 2};
  dir[0] = td_direction((in->hour % 12) * 60 + in->minute);
  dir[1] = td_direction(in->minute * 12);
  for (int i = 0; i < 2; ++i) {
    out->hands[i] = (TdMark){center, radial(center, dir[i], td_scale(span, hand_lengths[i])),
                             td_scale(span, hand_widths[in->weight][i]), TD_STROKE};
  }
  if (!in->ticks) return;
  int style = in->tick_style;
  int count = tick_styles[style].count;
  out->tick_count = count;
  for (int i = 0; i < count; ++i) {
    TickSpec spec = i % (count / 4) == 0 ? tick_styles[style].major : tick_styles[style].minor;
    TdPoint unit = td_direction(i * 720 / count);
    int radius = td_scale(span, 455);
    if (!in->round) {
      int x = unit.x ? td_scale(in->width, 455) * TD_TRIG / abs(unit.x) : TD_TRIG;
      int y = unit.y ? td_scale(in->height, 455) * TD_TRIG / abs(unit.y) : TD_TRIG;
      radius = min(x, y);
    }
    out->ticks[i] = (TdMark){radial(center, unit, radius),
                             radial(center, unit, radius - td_scale(span, spec.length)),
                             max(1, td_scale(span, spec.width)), spec.shape};
  }
}

uint8_t td_seconds(int width, int height, uint8_t style, uint8_t second, TdMark marks[2]) {
  TdPoint center = {width / 2, height / 2};
  TdPoint dir = td_direction(second * 12);
  int span = min(width, height);
  for (int i = 0; i < seconds_styles[style].count; ++i) {
    SecondsSpec spec = seconds_styles[style].marks[i];
    marks[i] = (TdMark){radial(center, dir, td_scale(span, spec.start)),
                        radial(center, dir, td_scale(span, spec.end)),
                        max(1, td_scale(span, spec.width)), TD_STROKE};
  }
  return seconds_styles[style].count;
}

bool td_mark_covers(TdMark mark, int x, int y) {
  int dx = x - mark.a.x, dy = y - mark.a.y;
  int radius = mark.width / 2;
  if (mark.shape == TD_DIAMOND) return abs(dx) + abs(dy) <= radius;
  if (mark.shape == TD_SQUARE) return max(abs(dx), abs(dy)) <= (mark.width * 181 + 256) / 512;
  if (mark.shape == TD_CROSS) return max(abs(dx), abs(dy)) <= radius &&
                                     min(abs(dx), abs(dy)) <= max(0, radius / 4);
  int vx = mark.b.x - mark.a.x, vy = mark.b.y - mark.a.y;
  int norm = square(vx) + square(vy), along = dx * vx + dy * vy;
  if (along <= 0) return 4 * (square(dx) + square(dy)) <= square(mark.width);
  if (along >= norm) return 4 * (square(x - mark.b.x) + square(y - mark.b.y)) <= square(mark.width);
  int cross = dx * vy - dy * vx;
  // Row spans bound cross before squaring. At 260 px the largest stroke stays
  // well below the int32 limit.
  return 4 * square(cross) <= square(mark.width) * norm;
}

void td_mark_span(TdMark mark, int width, int y, int *left, int *right) {
  TdPoint a = mark.a, b = mark.b;
  if (a.y > b.y) { a = mark.b; b = mark.a; }
  int radius = (mark.width + 1) / 2;
  int x0 = a.x, x1 = b.x;
  if (b.y != a.y) {
    int dy = b.y - a.y, dx = b.x - a.x;
    x0 += max(0, min(dy, y - radius - a.y)) * dx / dy;
    x1 = a.x + max(0, min(dy, y + radius - a.y)) * dx / dy;
  }
  *left = max(0, min(x0, x1) - radius);
  *right = min(width - 1, max(x0, x1) + radius);
}

bool td_mark_intersects(TdMark mark, TdRect box, int padding) {
  // Separating-axis test for a segment and a rectangle widened by its stroke radius.
  int margin = (mark.width + 1) / 2 + padding;
  int left = box.x - margin, right = box.x + box.w - 1 + margin;
  int top = box.y - margin, bottom = box.y + box.h - 1 + margin;
  if (max(mark.a.x, mark.b.x) < left || min(mark.a.x, mark.b.x) > right ||
      max(mark.a.y, mark.b.y) < top || min(mark.a.y, mark.b.y) > bottom) return false;
  int dx = mark.b.x - mark.a.x, dy = mark.b.y - mark.a.y;
  int cross2 = (left + right - 2 * mark.a.x) * dy - (top + bottom - 2 * mark.a.y) * dx;
  return abs(cross2) <= (right - left) * abs(dy) + (bottom - top) * abs(dx);
}

static bool unobstructed(const TdLayoutInput *in, const TdLayout *out, TdRect box, int gap) {
  if (in->round) {
    int xx = max(abs(box.x - in->width / 2), abs(box.x + box.w - 1 - in->width / 2));
    int yy = max(abs(box.y - in->height / 2), abs(box.y + box.h - 1 - in->height / 2));
    if (square(xx) + square(yy) > square(in->width / 2 - gap)) return false;
  }
  for (int i = 0; i < 2; ++i)
    if (td_mark_intersects(out->hands[i], box, 2)) return false;
  for (int i = 0; i < out->tick_count; ++i)
    if (td_mark_intersects(out->ticks[i], box, 2)) return false;
  return true;
}

static void label_metrics(TdLabel *label, unsigned int value, bool pad,
                          const TdGlyphMetric metrics[TD_DIGITS], int em) {
  label->count = (value >= 10 || pad) ? 2 : 1;
  label->digit[0] = label->count == 2 ? value / 10 : value;
  label->digit[1] = value % 10;
  int ascent = 0;
  for (int i = 0; i < label->count; ++i)
    ascent = max(ascent, td_scale_glyph(metrics[label->digit[i]].ascent, em));
  int x = 0, height = 0;
  for (int i = 0; i < label->count; ++i) {
    TdGlyphMetric metric = metrics[label->digit[i]];
    TdRect glyph = {x, ascent - td_scale_glyph(metric.ascent, em),
                    max(1, td_scale_glyph(metric.width, em)),
                    max(1, td_scale_glyph(metric.height, em))};
    label->glyph[i] = glyph;
    height = max(height, glyph.y + glyph.h);
    x += glyph.w;
    if (i + 1 < label->count) x += max(1, td_scale(em, 30));
  }
  label->box = (TdRect){0, 0, x, height};
}

// Keep the best two candidates in each screen region. A per-region cap preserves
// viable paired positions when the individual best positions overlap or reverse order.
enum { REGIONS = 8, PER_REGION = 2, CANDIDATES = REGIONS * REGIONS * PER_REGION };
typedef struct { int16_t x, y; int32_t cost; } Candidate;
static Candidate candidates[2][CANDIDATES];

static void scan(const TdLayoutInput *in, const TdLayout *out, const TdPoint dir[2],
                 int i, int gap, int crowding, int xshare) {
  Candidate *result = candidates[i];
  for (int j = 0; j < CANDIDATES; ++j) result[j].cost = INT32_MAX;
  int span = td_magnitude(in);
  int cx = in->width / 2, cy = in->height / 2;
  TdPoint unit = dir[i], normal = {-unit.y, unit.x};
  TdRect box = out->labels[i].box;
  int offset = (abs(normal.x) * box.w + abs(normal.y) * box.h) / (2 * TD_TRIG) +
               out->hands[i].width / 2 + gap;
  int xorder = in->horizontal ? -1 : 1, yorder = in->vertical ? -1 : 1;
  int read = -(normal.x * xorder * xshare + normal.y * yorder * (100 - xshare)) / TD_TRIG;
  int side = (i == 0 ? 1 : -1) * (100 - crowding + crowding * read / 100);
  int anchor = td_scale(span, in->placement ? (i == 0 ? 290 : 370) : (i == 0 ? 160 : 230));
  int aim_x = (unit.x * anchor + normal.x * offset * side / 100) / TD_TRIG;
  int aim_y = (unit.y * anchor + normal.y * offset * side / 100) / TD_TRIG;
  int step = max(3, (span + 22) / 44);
  int step_x = max(1, min(step, (in->width - box.w) / 20));
  int step_y = max(1, min(step, (in->height - box.h) / 20));
  for (box.y = gap; box.y + box.h <= in->height - gap; box.y += step_y) {
    for (box.x = gap; box.x + box.w <= in->width - gap; box.x += step_x) {
      int x = box.x + box.w / 2, y = box.y + box.h / 2;
      int dx = x - cx, dy = y - cy;
      int projection = (dx * unit.x + dy * unit.y) / TD_TRIG;
      int other = (dx * dir[1 - i].x + dy * dir[1 - i].y) / TD_TRIG;
      int side_distance = (dx * normal.x + dy * normal.y) / TD_TRIG;
      int side_error = max(0, offset * abs(side) / 100 - (side < 0 ? -side_distance : side_distance));
      int32_t cost = (in->placement ? 115 : 64) * (square(dx - aim_x) + square(dy - aim_y))
                     + (in->placement ? 3 : 24) * (square(dx) + square(dy))
                     + 280 * square(max(0, td_scale(span, 60) - projection))
                     + 150 * square(side_error) + 800 * square(max(0, other - projection));
      int region = (y * REGIONS / in->height) * REGIONS + x * REGIONS / in->width;
      Candidate *bin = result + region * PER_REGION;
      if (cost >= bin[PER_REGION - 1].cost || !unobstructed(in, out, box, gap)) continue;
      Candidate next = {box.x, box.y, cost};
      for (int j = 0; j < PER_REGION; ++j) {
        if (next.cost >= bin[j].cost) continue;
        Candidate previous = bin[j];
        bin[j] = next;
        next = previous;
      }
    }
  }
}

static bool pair(const TdLayoutInput *in, TdLayout *out, int gap, int crowding, int xshare) {
  TdRect a = out->labels[0].box, b = out->labels[1].box;
  int dx_min = td_scale(td_magnitude(in), 45 + 140 * crowding * xshare / 10000);
  int dy_min = td_scale(td_magnitude(in), 140 * crowding * (100 - xshare) / 10000);
  int xorder = in->horizontal ? -1 : 1, yorder = in->vertical ? -1 : 1;
  int32_t best = INT32_MAX;
  for (int i = 0; i < CANDIDATES; ++i) {
    Candidate ca = candidates[0][i];
    if (ca.cost >= best) continue;
    a.x = ca.x;
    a.y = ca.y;
    for (int j = 0; j < CANDIDATES; ++j) {
      Candidate cb = candidates[1][j];
      if (cb.cost >= best - ca.cost) continue;
      b.x = cb.x;
      b.y = cb.y;
      if (a.x + a.w + gap > b.x && b.x + b.w + gap > a.x &&
          a.y + a.h + gap > b.y && b.y + b.h + gap > a.y) continue;
      // Doubled centers preserve strict reading order for odd-width labels.
      int dx = (2 * (b.x - a.x) + b.w - a.w) * xorder;
      int dy = (2 * (b.y - a.y) + b.h - a.h) * yorder;
      if (!in->placement && (dx <= 0 || dy <= 0)) continue;
      int midx = (2 * a.x + a.w + 2 * b.x + b.w) / 4 - in->width / 2;
      int midy = (2 * a.y + a.h + 2 * b.y + b.h) / 4 - in->height / 2;
      int32_t cost = ca.cost + cb.cost + (in->placement ? 10 : 55) * (square(midx) + square(midy)) +
                     (in->placement ? 30 : 100) * (
                       (4 + 12 * crowding * xshare * xshare / 1000000) * square(max(0, 2 * dx_min - dx) / 2) +
                       (1 + 12 * crowding * (100 - xshare) * (100 - xshare) / 1000000) * square(max(0, 2 * dy_min - dy) / 2));
      if (cost >= best) continue;
      best = cost;
      out->labels[0].box = a;
      out->labels[1].box = b;
    }
  }
  return best != INT32_MAX;
}

bool td_layout(const TdLayoutInput *in, const TdGlyphMetric metrics[TD_DIGITS], TdLayout *out) {
  memset(out, 0, sizeof(*out));
  TdPoint dir[2];
  geometry(in, out, dir);
  int dot = (dir[0].x * dir[1].x + dir[0].y * dir[1].y) / TD_TRIG;
  int crowding = min(100, max(0, (dot - 840) * 100 / 143));
  int32_t x = square(dir[0].x + dir[1].x), y = square(dir[0].y + dir[1].y);
  int xshare = crowding ? (100 * y) / (x + y) : 50;
  int span = td_magnitude(in), gap = max(4, td_scale(span, 27));
  int hour = in->use_24h ? in->hour : (in->hour + 11) % 12 + 1;
  const uint16_t *sizes = in->round ? TD_ROUND_DIGIT_SIZES : TD_DIGIT_SIZES;
  for (int em = td_scale(span, sizes[in->size]); em >= td_scale(span, 120); --em) {
    label_metrics(&out->labels[0], hour, in->use_24h, metrics, em);
    label_metrics(&out->labels[1], in->minute, true, metrics, em);
    TdRect a = out->labels[0].box, b = out->labels[1].box;
    if (max(a.w, b.w) + 2 * gap > in->width || max(a.h, b.h) + 2 * gap > in->height ||
        (a.w + b.w + 3 * gap > in->width && a.h + b.h + 3 * gap > in->height)) continue;
    scan(in, out, dir, 0, gap, crowding, xshare);
    scan(in, out, dir, 1, gap, crowding, xshare);
    if (!pair(in, out, gap, crowding, xshare)) continue;
    out->em = em;
    return true;
  }
  return false;
}
