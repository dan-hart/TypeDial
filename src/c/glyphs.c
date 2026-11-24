#include "glyphs.h"

#include <string.h>

bool td_font_read(TdFont *font, const uint8_t *data, size_t length) {
  if (length == 0 || data[0] != 64) return false;
  size_t offset = 1;
  for (int i = 0; i < TD_DIGITS; ++i) {
    if (length - offset < 3) return false;
    TdGlyphMetric metric = {data[offset], data[offset + 1], data[offset + 2]};
    offset += 3;
    if (!metric.width || !metric.height || metric.width > 64 || metric.height > 64 ||
        metric.ascent > metric.height) return false;
    size_t bytes = ((metric.width + 7) / 8) * metric.height;
    if (length - offset < bytes) return false;
    font->metric[i] = metric;
    font->rows[i] = data + offset;
    offset += bytes;
  }
  return offset == length;
}

static bool get_bit(const uint8_t *row, int x) {
  return row[x / 8] & (0x80 >> (x % 8));
}

static void set_bit(uint8_t *row, int x) {
  row[x / 8] |= 0x80 >> (x % 8);
}

bool td_make_mask(TdMask *mask, const TdFont *font, const TdLabel *label) {
  memset(mask, 0, sizeof(*mask));
  if (label->box.w + 2 > TD_MASK_WIDTH || label->box.h + 2 > TD_MASK_HEIGHT) return false;
  mask->bounds = (TdRect){label->box.x - 1, label->box.y - 1, label->box.w + 2, label->box.h + 2};
  for (int i = 0; i < label->count; ++i) {
    TdRect rect = label->glyph[i];
    TdGlyphMetric metric = font->metric[label->digit[i]];
    const uint8_t *source = font->rows[label->digit[i]];
    int stride = (metric.width + 7) / 8;
    for (int y = 0; y < rect.h; ++y) {
      int sy = (2 * y + 1) * metric.height / (2 * rect.h);
      const uint8_t *row = source + sy * stride;
      for (int x = 0; x < rect.w; ++x) {
        int sx = (2 * x + 1) * metric.width / (2 * rect.w);
        if (!get_bit(row, sx)) continue;
        int dx = rect.x + x + 1, dy = rect.y + y + 1;
        set_bit(mask->ink[dy], dx);
        // A one-pixel diagonal clearance follows corners at a radius of about 1.4 px.
        for (int j = dy - 1; j <= dy + 1; ++j)
          for (int k = dx - 1; k <= dx + 1; ++k) set_bit(mask->halo[j], k);
      }
    }
  }
  return true;
}

bool td_mask_pixel(const TdMask *mask, bool halo, int x, int y) {
  x -= mask->bounds.x;
  y -= mask->bounds.y;
  if (x < 0 || x >= mask->bounds.w || y < 0 || y >= mask->bounds.h) return false;
  return get_bit(halo ? mask->halo[y] : mask->ink[y], x);
}
