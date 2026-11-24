#ifndef TYPEDIAL_APPEARANCE_H
#define TYPEDIAL_APPEARANCE_H

#include "contract.h"
#include <stdbool.h>

enum { TD_TANGERINE = 64, TD_LEGACY_PATTERN_BG, TD_AUTO, TD_MATCH_HOUR, TD_MATCH_MINUTE };
typedef struct {
  uint8_t background, hand[2], digit[2], second, tick;
} TdColors;

TdColors td_colors(const uint8_t settings[TD_SETTINGS_LEN], bool color);

#endif
