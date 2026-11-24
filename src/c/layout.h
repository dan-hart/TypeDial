#ifndef TYPEDIAL_LAYOUT_H
#define TYPEDIAL_LAYOUT_H

#include <stdbool.h>
#include <stdint.h>

enum { TD_DIGITS = 10, TD_MAX_TICKS = 12, TD_TRIG = 1024 };
enum { TD_STROKE, TD_DIAMOND, TD_SQUARE, TD_CROSS };
typedef struct { int16_t x, y; } TdPoint;
typedef struct { int16_t x, y, w, h; } TdRect;
typedef struct { TdPoint a, b; uint8_t width, shape; } TdMark;
typedef struct { uint8_t width, height, ascent; } TdGlyphMetric;
typedef struct {
  TdRect box;
  TdRect glyph[2];
  uint8_t digit[2], count;
} TdLabel;
typedef struct {
  int16_t width, height;
  bool round, use_24h;
  uint8_t hour, minute;
  uint8_t size, placement, weight, horizontal, vertical;
  bool ticks;
  uint8_t tick_style;
} TdLayoutInput;
typedef struct {
  TdMark hands[2], ticks[TD_MAX_TICKS];
  TdLabel labels[2];
  uint8_t tick_count, em;
} TdLayout;

TdPoint td_direction(int turn);
int td_scale(int value, int permille);
int td_scale_glyph(int size, int em);
int td_magnitude(const TdLayoutInput *in);
int td_pivot_radius(int span);
bool td_mark_covers(TdMark mark, int x, int y);
void td_mark_span(TdMark mark, int width, int y, int *left, int *right);
bool td_mark_intersects(TdMark mark, TdRect box, int padding);
int td_point_size(const TdLayoutInput *in);
bool td_layout(const TdLayoutInput *in, const TdGlyphMetric metrics[TD_DIGITS], TdLayout *out);
uint8_t td_seconds(int width, int height, uint8_t style, uint8_t second, TdMark marks[2]);

#endif
