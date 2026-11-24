#ifndef TYPEDIAL_RENDER_H
#define TYPEDIAL_RENDER_H

#include <pebble.h>
#include "appearance.h"
#include "glyphs.h"

bool td_render_init(GSize size);
void td_render_deinit(void);
void td_render_prepare(const TdLayout *layout, const TdMask masks[2], TdColors colors);
void td_render_draw(GContext *ctx, GPoint origin, const TdMask masks[2],
                    TdColors colors, const TdMark seconds[2], uint8_t seconds_count);

#endif
