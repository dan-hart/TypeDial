#ifndef TYPEDIAL_GLYPHS_H
#define TYPEDIAL_GLYPHS_H

#include "layout.h"
#include <stddef.h>

// Largest dial: 260 px × 60% × two 42/64 em glyphs, spacing, and a one-pixel halo.
enum { TD_FONT_CAPACITY = 4096, TD_MASK_WIDTH = 216, TD_MASK_HEIGHT = 128, TD_MASK_STRIDE = TD_MASK_WIDTH / 8 };
typedef struct {
  TdGlyphMetric metric[TD_DIGITS];
  const uint8_t *rows[TD_DIGITS];
} TdFont;
typedef struct {
  TdRect bounds;
  uint8_t ink[TD_MASK_HEIGHT][TD_MASK_STRIDE];
  uint8_t halo[TD_MASK_HEIGHT][TD_MASK_STRIDE];
} TdMask;

bool td_font_read(TdFont *font, const uint8_t *data, size_t length);
bool td_make_mask(TdMask *mask, const TdFont *font, const TdLabel *label);
bool td_mask_pixel(const TdMask *mask, bool halo, int x, int y);

#endif
