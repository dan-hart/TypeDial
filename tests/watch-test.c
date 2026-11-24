#include "appearance.h"
#include "glyphs.h"
#include "layout.h"
#include "settings.h"

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static const TdLayoutInput profiles[] = {
  {.width = 200, .height = 228},
  {.width = 144, .height = 168},
  {.width = 260, .height = 260, .round = true},
};
static uint8_t banks[5][TD_FONT_CAPACITY];
static TdFont fonts[5];
static unsigned long layout_count, reduced_count, seconds_count, fallback_count;
static unsigned long clipped_pixels[3], box_pixels[3];
static int max_scan[3];
static unsigned long cleared_pixels, open_pixels;

static void load_fonts(void) {
  for (int i = 0; i < 5; ++i) {
    char path[45];
    snprintf(path, sizeof(path), "resources/font-%d.bin", i);
    FILE *file = fopen(path, "rb");
    assert(file);
    size_t length = fread(banks[i], 1, sizeof(banks[i]), file);
    assert(!ferror(file) && feof(file));
    fclose(file);
    assert(td_font_read(&fonts[i], banks[i], length));
    assert(!td_font_read(&fonts[i], banks[i], length - 1));
    assert(td_font_read(&fonts[i], banks[i], length));
  }
}

static void verify_settings(void) {
  uint8_t record[TD_SETTINGS_RECORD_LEN], loaded[TD_SETTINGS_LEN];
  uint32_t transaction = 0, generation = 0;
  assert(TD_DEFAULTS[TD_SIZE] == 60 && TD_MAX[TD_SIZE] == 240);
  assert(td_settings_valid(TD_DEFAULTS, TD_SETTINGS_LEN));
  assert(!td_settings_valid(TD_DEFAULTS, TD_SETTINGS_LEN - 1));
  assert(!td_settings_valid(TD_DEFAULTS, TD_SETTINGS_LEN + 1));
  assert(td_settings_decode(TD_DEFAULTS, TD_SETTINGS_LEN, loaded, &transaction, &generation));
  assert(transaction == 0 && generation == 0 && !memcmp(loaded, TD_DEFAULTS, TD_SETTINGS_LEN));

  td_settings_encode(record, TD_DEFAULTS, 0xddaa1122u, 491);
  assert(td_settings_decode(record, sizeof(record), loaded, &transaction, &generation));
  assert(transaction == 0xddaa1122u && generation == 491 && !memcmp(TD_DEFAULTS, loaded, TD_SETTINGS_LEN));
  for (size_t i = 0; i < sizeof(record); ++i) {
    record[i] ^= 1;
    loaded[TD_FORMAT] = 1;
    assert(!td_settings_decode(record, sizeof(record), loaded, &transaction, &generation));
    assert(loaded[TD_FORMAT] == 1 && transaction == 0xddaa1122u && generation == 491);
    record[i] ^= 1;
  }
  for (int i = 0; i < TD_SETTINGS_LEN; ++i) {
    memcpy(loaded, TD_DEFAULTS, sizeof(loaded));
    loaded[i] = TD_MAX[i] + 1;
    assert(!td_settings_valid(loaded, TD_SETTINGS_LEN));
  }
  memcpy(loaded, TD_DEFAULTS, sizeof(loaded));
  loaded[TD_SIZE] = TD_MIN_POINT_SIZE - 1;
  assert(!td_settings_valid(loaded, sizeof(loaded)));
  loaded[TD_SIZE] = TD_MIN_POINT_SIZE;
  assert(td_settings_valid(loaded, sizeof(loaded)));
  assert(td_settings_newer(50, 49) && td_settings_newer(0, UINT32_MAX));
  assert(!td_settings_newer(49, 50) && !td_settings_newer(50, 50));
  TdColors default_inks = td_colors(TD_DEFAULTS, true);
  assert(default_inks.background == 0);
  assert(default_inks.hand[0] == 63 && default_inks.hand[1] == 52);
  assert(default_inks.digit[1] == 52);
  TdColors mono = td_colors(TD_DEFAULTS, false);
  assert(mono.background == 0 && mono.hand[0] == 63);
  memcpy(loaded, TD_DEFAULTS, sizeof(loaded));
  loaded[TD_MONO] = 1;
  loaded[TD_BG] = 63;
  loaded[TD_HOUR] = 63;
  loaded[TD_SECOND_COLOR] = TD_MATCH_MINUTE;
  loaded[TD_TICK_COLOR] = TD_AUTO;
  mono = td_colors(loaded, false);
  assert(mono.background == 63 && mono.hand[0] == 0);
  TdColors tuned = td_colors(loaded, true);
  assert(tuned.digit[0] == 0 && tuned.second == tuned.hand[1] && tuned.tick != tuned.background);

  loaded[TD_BG] = TD_LEGACY_PATTERN_BG;
  assert(td_settings_valid(loaded, sizeof(loaded)));
  assert(td_colors(loaded, true).background == 0);
  loaded[TD_BG] = 21;
  assert(td_colors(loaded, true).background == 21);

}

static void verify_layout(const TdLayoutInput *in, int font, TdLayout *result) {
  if (!td_layout(in, fonts[font].metric, result)) {
    fprintf(stderr, "Placement failed at %ux%u %02u:%02u format=%u font=%d size=%u placement=%u "
                    "horizontal=%u vertical=%u ticks=%u style=%u weight=%u\n",
            in->width, in->height, in->hour, in->minute, in->use_24h, font, in->size, in->placement,
            in->horizontal, in->vertical, in->ticks, in->tick_style, in->weight);
    exit(1);
  }
  ++layout_count;
  int requested = td_point_size(in);
  if (result->em < requested) ++reduced_count;
  if (result->em == td_scale(td_magnitude(in), 120)) ++fallback_count;
  assert(result->em <= requested);
  assert(result->digits_in_front == (in->size > TD_LARGE_PRINT_THRESHOLD));
  unsigned int hour = in->use_24h ? in->hour : (in->hour + 11) % 12 + 1;
  assert(result->labels[0].count == (in->use_24h || hour >= 10 ? 2 : 1));
  assert(result->labels[0].digit[0] == (result->labels[0].count == 2 ? hour / 10 : hour));
  assert(result->labels[0].digit[1] == hour % 10);
  assert(result->labels[1].count == 2);
  assert(result->labels[1].digit[0] == in->minute / 10 && result->labels[1].digit[1] == in->minute % 10);
  TdRect a = result->labels[0].box, b = result->labels[1].box;
  int gap = td_scale(td_magnitude(in), 27);
  if (gap < 4) gap = 4;
  assert(a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x ||
         a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y);
  if (!in->placement) {
    int dx = 2 * (b.x - a.x) + b.w - a.w;
    int dy = 2 * (b.y - a.y) + b.h - a.h;
    assert(in->horizontal ? dx < 0 : dx > 0);
    assert(in->vertical ? dy < 0 : dy > 0);
  }

  for (int i = 0; i < 2; ++i) {
    TdRect box = result->labels[i].box;
    assert(box.x >= gap && box.y >= gap && box.x + box.w <= in->width - gap &&
           box.y + box.h <= in->height - gap);
    if (in->round) {
      for (int corner = 0; corner < 4; ++corner) {
        int x = box.x + ((corner & 1) ? box.w - 1 : 0) - in->width / 2;
        int y = box.y + ((corner & 2) ? box.h - 1 : 0) - in->height / 2;
        int radius = in->width / 2 - gap;
        assert(x * x + y * y <= radius * radius);
      }
    }
    if (!result->digits_in_front) {
      for (int j = 0; j < 2; ++j) assert(!td_mark_intersects(result->hands[j], box, 2));
      for (int j = 0; j < result->tick_count; ++j) assert(!td_mark_intersects(result->ticks[j], box, 2));
    }
  }
}

static void verify_accessible_sizes(void) {
  static const int large_samples[] = {14 * 60 + 46, 14 * 60 + 45, 8 * 60 + 44};
  for (int p = 0; p < 3; ++p) {
    TdLayoutInput in = profiles[p];
    in.use_24h = true;
    in.hour = in.round ? 3 : 2;
    in.minute = in.round ? 15 : 45;
    int previous = 0;
    for (int size = 0; size < TD_LEGACY_SIZE_COUNT; ++size) {
      TdLayout legacy, points;
      in.size = size;
      int requested = td_point_size(&in);
      verify_layout(&in, 0, &legacy);
      in.size = requested;
      verify_layout(&in, 0, &points);
      if (requested <= TD_LARGE_PRINT_THRESHOLD) assert(!memcmp(&legacy, &points, sizeof(legacy)));
      else assert(points.em >= legacy.em);
      assert(points.em > previous);
      previous = points.em;
    }
    in.size = td_point_size(&in) - 1;
    TdLayout intermediate;
    verify_layout(&in, 0, &intermediate);
    assert(intermediate.em <= in.size && intermediate.em >= previous - 1);
    in.size = TD_LEGACY_SIZE_COUNT - 1;
    int old_limit = td_point_size(&in);
    in.hour = large_samples[p] / 60;
    in.minute = large_samples[p] % 60;
    in.size = TD_MAX[TD_SIZE];
    assert(td_point_size(&in) == 240);
    TdLayout largest;
    verify_layout(&in, 0, &largest);
    assert(largest.em > old_limit);
    TdMask mask;
    for (int i = 0; i < 2; ++i)
      assert(td_make_mask(&mask, &fonts[0], &largest.labels[i]));
  }
}

static void verify_large_print(void) {
  static const int times[] = {0, 608, 720, 915, 1005, 1439};
  TdLayoutInput in = profiles[0];
  in.use_24h = true;
  in.ticks = true;
  in.tick_style = 3;
  for (unsigned int i = 0; i < sizeof(times) / sizeof(times[0]); ++i) {
    TdLayout normal, large;
    in.hour = times[i] / 60;
    in.minute = times[i] % 60;
    in.size = 120;
    assert(td_layout(&in, fonts[3].metric, &normal));
    in.size = 240;
    assert(td_layout(&in, fonts[3].metric, &large));
    assert(large.em >= normal.em + 20);
  }
}

static void verify_minute_matrix(void) {
  for (int p = 0; p < 3; ++p) {
    TdLayoutInput in = profiles[p];
    for (int font = 0; font < 5; ++font) {
      for (int format = 0; format < 2; ++format) {
        in.use_24h = format != 0;
        for (int dir = 0; dir < 4; ++dir) {
          in.horizontal = dir & 1;
          in.vertical = dir >> 1;
          for (int endpoint = 0; endpoint < 2; ++endpoint) {
            in.size = TD_MAX[TD_SIZE] * endpoint;
            in.weight = endpoint;
            for (int minute = 0; minute < 1440; ++minute) {
              in.hour = minute / 60;
              in.minute = minute % 60;
              in.ticks = minute % 2;
              in.tick_style = minute % 9;
              TdLayout result;
              verify_layout(&in, font, &result);
            }
          }
        }
      }
    }
  }
}

static int min(int a, int b) { return a < b ? a : b; }
static int max(int a, int b) { return a > b ? a : b; }

static int check_scan(const TdLayoutInput *in, TdMark mark, const TdMask masks[2],
                      unsigned long *full, bool verify_bounds) {
  int radius = (mark.width + 1) / 2, scan = 0;
  int top = max(0, min(mark.a.y, mark.b.y) - radius);
  int bottom = min(in->height - 1, max(mark.a.y, mark.b.y) + radius);
  int box_left = max(0, min(mark.a.x, mark.b.x) - radius);
  int box_right = min(in->width - 1, max(mark.a.x, mark.b.x) + radius);
  *full += (bottom - top + 1) * (box_right - box_left + 1);
  for (int y = top; y <= bottom; ++y) {
    int left, right;
    td_mark_span(mark, in->width, y, &left, &right);
    int tested_width = right - left + 1;
    assert(tested_width > 0);
    scan += tested_width;
    if (verify_bounds) {
      for (int x = box_left; x < left; ++x) assert(!td_mark_covers(mark, x, y));
      for (int x = right + 1; x <= box_right; ++x) assert(!td_mark_covers(mark, x, y));
    }
    for (int i = 0; i < 2; ++i) {
      TdRect bounds = masks[i].bounds;
      if (y < bounds.y || y >= bounds.y + bounds.h) continue;
      for (int x = max(left, bounds.x); x <= min(right, bounds.x + bounds.w - 1); ++x) {
        if (!td_mark_covers(mark, x, y)) continue;
        if (td_mask_pixel(&masks[i], true, x, y)) {
          ++cleared_pixels;
        } else {
          assert(!td_mask_pixel(&masks[i], false, x, y));
          ++open_pixels;
        }
      }
    }
  }
  return scan;
}

static void verify_masks_and_seconds(void) {
  static const int times[] = {0, 1, 608, 720, 915, 1296, 1439};
  for (int p = 0; p < 3; ++p) {
    TdLayoutInput in = profiles[p];
    in.use_24h = true;
    for (int font = 0; font < 5; ++font) {
      for (int size = 0; size <= TD_LEGACY_SIZE_COUNT; ++size) {
        in.size = size == TD_LEGACY_SIZE_COUNT ? TD_MAX[TD_SIZE] : size;
        for (int t = 0; t < (int)(sizeof(times) / sizeof(times[0])); ++t) {
          in.hour = times[t] / 60;
          in.minute = times[t] % 60;
          in.placement = t % 2;
          in.weight = t % 2;
          in.ticks = true;
          in.tick_style = (t + size) % 9;
          TdLayout result, after;
          verify_layout(&in, font, &result);
          TdMask masks[2];
          for (int i = 0; i < 2; ++i) {
            TdMask *mask = &masks[i];
            assert(td_make_mask(mask, &fonts[font], &result.labels[i]));
            TdRect bounds = mask->bounds;
            int ink = 0, halo = 0, open = 0;
            for (int y = bounds.y; y < bounds.y + bounds.h; ++y) {
              for (int x = bounds.x; x < bounds.x + bounds.w; ++x) {
                int neighbors = 0;
                for (int dy = -1; dy <= 1; ++dy)
                  for (int dx = -1; dx <= 1; ++dx)
                    neighbors += td_mask_pixel(mask, false, x + dx, y + dy);
                bool original = td_mask_pixel(mask, false, x, y);
                bool dilation = td_mask_pixel(mask, true, x, y);
                assert(dilation == (neighbors > 0));
                ink += original;
                halo += dilation;
                open += !dilation;
              }
            }
            assert(ink > 0 && halo > ink && open > 0);
          }
          for (int style = 0; style < 4; ++style) {
            for (int second = 0; second < 60; ++second) {
              TdMark marks[2];
              uint8_t count = td_seconds(in.width, in.height, style, second, marks);
              assert(count == (style < 2 ? 1 : 2));
              assert(marks[0].width > 0);
              for (int i = 0; i < count; ++i) {
                assert(marks[i].a.x >= 0 && marks[i].a.x < in.width);
                assert(marks[i].a.y >= 0 && marks[i].a.y < in.height);
                assert(marks[i].b.x >= 0 && marks[i].b.x < in.width);
                assert(marks[i].b.y >= 0 && marks[i].b.y < in.height);
              }
              TdPoint center = {in.width / 2, in.height / 2};
              if (second == 0) assert(marks[0].b.x == center.x && marks[0].b.y < center.y);
              if (second == 15) assert(marks[0].b.y == center.y && marks[0].b.x > center.x);
              if (second == 30) assert(marks[0].b.x == center.x && marks[0].b.y > center.y);
              if (second == 45) assert(marks[0].b.y == center.y && marks[0].b.x < center.x);
              int scan = 0;
              for (int i = 0; i < count; ++i) {
                // Stroke bounds depend only on platform, style and second.
                bool verify_bounds = font == 0 && size == 0 && t == 0;
                scan += check_scan(&in, marks[i], masks, &box_pixels[p], verify_bounds);
              }
              clipped_pixels[p] += scan;
              max_scan[p] = max(max_scan[p], scan);
              ++seconds_count;
            }
          }
          assert(td_layout(&in, fonts[font].metric, &after));
          assert(result.em == after.em);
          for (int i = 0; i < 2; ++i) {
            TdRect a = result.labels[i].box, b = after.labels[i].box;
            assert(a.x == b.x && a.y == b.y && a.w == b.w && a.h == b.h);
          }
        }
      }
    }
  }
}

static void fixtures(void) {
  puts("profile,hour,minute,format,font,size,placement,horizontal,vertical,weight,ticks,tickStyle,em,hourX,hourY,hourW,hourH,minuteX,minuteY,minuteW,minuteH");
  static const int times[] = {0, 608, 720, 915, 1296, 1439};
  for (int p = 0; p < 3; ++p)
    for (int t = 0; t < (int)(sizeof(times) / sizeof(times[0])); ++t)
      for (int variant = 0; variant < TD_LEGACY_SIZE_COUNT + 3; ++variant) {
        TdLayoutInput in = profiles[p];
        int font = variant % 5;
        in.hour = times[t] / 60;
        in.minute = times[t] % 60;
        in.use_24h = !(variant % 2);
        static const uint8_t point_sizes[] = {TD_MIN_POINT_SIZE, 60, 240};
        in.size = variant < TD_LEGACY_SIZE_COUNT ? variant : point_sizes[variant - TD_LEGACY_SIZE_COUNT];
        in.placement = variant % 2;
        in.horizontal = t % 2;
        in.vertical = (t / 2) % 2;
        in.ticks = t != 0;
        in.tick_style = (t + variant) % 9;
        in.weight = t % 2;
        TdLayout result;
        verify_layout(&in, font, &result);
        TdRect a = result.labels[0].box, b = result.labels[1].box;
        printf("%d,%u,%u,%u,%d,%u,%u,%u,%u,%u,%u,%u,%u,%d,%d,%d,%d,%d,%d,%d,%d\n",
               p, in.hour, in.minute, in.use_24h ? 2 : 1, font, in.size, in.placement,
               in.horizontal, in.vertical, in.weight, in.ticks, in.tick_style, result.em,
               a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h);
      }
}

int main(int argc, char *argv[]) {
  load_fonts();
  if (argc == 2 && !strcmp(argv[1], "--fixtures")) {
    fixtures();
    return 0;
  }
  clock_t start = clock();
  verify_settings();
  verify_large_print();
  verify_accessible_sizes();
  verify_masks_and_seconds();
  if (argc != 2 || strcmp(argv[1], "--quick")) verify_minute_matrix();
  assert(cleared_pixels > 0 && open_pixels > 0);
  for (int p = 0; p < 3; ++p) {
    assert(clipped_pixels[p] < box_pixels[p]);
    printf("%ux%u seconds row clipping: %.1f%% fewer tested pixels than stroke rectangles, peak %d per frame.\n",
           profiles[p].width, profiles[p].height, 100.0 * (1 - (double)clipped_pixels[p] / box_pixels[p]), max_scan[p]);
  }
  printf("Verified %lu layouts (%lu reduced, %lu reached minimum) and %lu seconds frames in %.2f CPU seconds.\n",
         layout_count, reduced_count, fallback_count, seconds_count,
         (double)(clock() - start) / CLOCKS_PER_SEC);
  return 0;
}
