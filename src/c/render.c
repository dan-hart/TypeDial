#include "render.h"

#include <stdlib.h>
#include <string.h>

enum { BG, TICK, MINUTE_HAND, HOUR_HAND, PIVOT, HOUR_DIGIT, MINUTE_DIGIT };
static GBitmap *base;
static uint8_t *pixels;
static int stride;
static GSize screen;

#ifdef PBL_COLOR
static GColor color(uint8_t ink) { return (GColor){.argb = (uint8_t)(0xc0 | ink)}; }
#endif
static int min(int a, int b) { return a < b ? a : b; }
static int max(int a, int b) { return a > b ? a : b; }
static int32_t square(int v) { return (int32_t)v * v; }

bool td_render_init(GSize size) {
  screen = size;
  base = gbitmap_create_blank(size, PBL_IF_COLOR_ELSE(GBitmapFormat4BitPalette, GBitmapFormat1Bit));
  if (!base) return false;
  pixels = gbitmap_get_data(base);
  stride = gbitmap_get_bytes_per_row(base);
  return true;
}

void td_render_deinit(void) {
  if (base) gbitmap_destroy(base);
  base = NULL;
}

static void set_base_pixel(int x, int y, uint8_t index, TdColors colors) {
  uint8_t *row = pixels + y * stride;
#ifdef PBL_BW
  bool value = (index == BG || index == PIVOT) ? colors.background != 0 : colors.hand[0] != 0;
  uint8_t mask = 1 << (x & 7);
  if (value) row[x / 8] |= mask;
  else row[x / 8] &= ~mask;
#else
  (void)colors;
  int shift = (x & 1) ? 0 : 4;
  row[x / 2] = (row[x / 2] & ~(0xf << shift)) | (index << shift);
#endif
}

static bool can_overlay(int x, int y, TdColors colors) {
  const uint8_t *row = pixels + y * stride;
#ifdef PBL_BW
  return ((row[x / 8] >> (x & 7)) & 1) == (colors.background != 0);
#else
  (void)colors;
  int shift = (x & 1) ? 0 : 4;
  return ((row[x / 2] >> shift) & 0xf) == BG;
#endif
}

static void paint_mark(TdMark mark, uint8_t index, TdColors colors) {
  int radius = (mark.width + 1) / 2;
  int top = max(0, min(mark.a.y, mark.b.y) - radius);
  int bottom = min(screen.h - 1, max(mark.a.y, mark.b.y) + radius);
  for (int y = top; y <= bottom; ++y) {
    int left, right;
    td_mark_span(mark, screen.w, y, &left, &right);
    for (int x = left; x <= right; ++x)
      if (td_mark_covers(mark, x, y)) set_base_pixel(x, y, index, colors);
  }
}

void td_render_prepare(const TdLayout *layout, const TdMask masks[2], TdColors colors) {
  if (!base) return;
#ifdef PBL_BW
  memset(pixels, colors.background ? 0xff : 0, screen.h * stride);
#else
  GColor *palette = gbitmap_get_palette(base);
  palette[BG] = color(colors.background);
  palette[TICK] = color(colors.tick);
  palette[MINUTE_HAND] = color(colors.hand[1]);
  palette[HOUR_HAND] = color(colors.hand[0]);
  palette[PIVOT] = color(colors.background);
  palette[HOUR_DIGIT] = color(colors.digit[0]);
  palette[MINUTE_DIGIT] = color(colors.digit[1]);
  memset(pixels, 0, screen.h * stride);
#endif
  for (int i = 0; i < layout->tick_count; ++i) paint_mark(layout->ticks[i], TICK, colors);
  paint_mark(layout->hands[1], MINUTE_HAND, colors);
  paint_mark(layout->hands[0], HOUR_HAND, colors);
  TdPoint pivot = layout->hands[0].a;
  int diameter = 2 * td_pivot_radius(min(screen.w, screen.h));
  paint_mark((TdMark){pivot, pivot, diameter, TD_STROKE}, PIVOT, colors);
  for (int i = 0; i < 2; ++i) {
    TdRect box = masks[i].bounds;
    for (int y = box.y; y < box.y + box.h; ++y)
      for (int x = box.x; x < box.x + box.w; ++x)
        if (td_mask_pixel(&masks[i], false, x, y))
          set_base_pixel(x, y, i == 0 ? HOUR_DIGIT : MINUTE_DIGIT, colors);
        else if (layout->digits_in_front && td_mask_pixel(&masks[i], true, x, y))
          set_base_pixel(x, y, BG, colors);
  }
}

static void write_row_pixel(uint8_t *row, int x, uint8_t ink) {
#ifdef PBL_BW
  uint8_t mask = 1 << (x & 7);
  if (ink) row[x / 8] |= mask;
  else row[x / 8] &= ~mask;
#else
  row[x] = 0xc0 | ink;
#endif
}

void td_render_draw(GContext *ctx, GPoint origin, const TdMask masks[2],
                    TdColors colors, const TdMark seconds[2], uint8_t seconds_count) {
  if (!base) return;
  graphics_context_set_compositing_mode(ctx, GCompOpAssign);
  graphics_draw_bitmap_in_rect(ctx, base, GRect(0, 0, screen.w, screen.h));
  if (!seconds_count) return;

  GBitmap *frame = graphics_capture_frame_buffer(ctx);
  if (!frame) return;
  GRect bounds = gbitmap_get_bounds(frame);
  TdPoint pivot = {screen.w / 2, screen.h / 2};
  int32_t pivot_radius_squared = square(td_pivot_radius(min(screen.w, screen.h)));
  for (int i = 0; i < seconds_count; ++i) {
    TdMark mark = seconds[i];
    int radius = (mark.width + 1) / 2;
    int top = max(0, max(-origin.y, min(mark.a.y, mark.b.y) - radius));
    int bottom = min(screen.h - 1, min(bounds.size.h - 1 - origin.y, max(mark.a.y, mark.b.y) + radius));
    for (int y = top; y <= bottom; ++y) {
      GBitmapDataRowInfo row = gbitmap_get_data_row_info(frame, y + origin.y);
      int left, right;
      td_mark_span(mark, screen.w, y, &left, &right);
      left = max(left, row.min_x - origin.x);
      right = min(right, min(bounds.size.w - 1, row.max_x) - origin.x);
      for (int x = left; x <= right; ++x) {
        // The static dial is left intact wherever its existing ink or the rounded
        // dilation mask occludes the seconds hand.
        if (td_mark_covers(mark, x, y) && can_overlay(x, y, colors) &&
            !td_mask_pixel(&masks[0], true, x, y) && !td_mask_pixel(&masks[1], true, x, y)) {
          // The pivot hole sits above the seconds hand on both display modes.
          if (square(x - pivot.x) + square(y - pivot.y) > pivot_radius_squared)
            write_row_pixel(row.data, x + origin.x, colors.second);
        }
      }
    }
  }
  graphics_release_frame_buffer(ctx, frame);
}
