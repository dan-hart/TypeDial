#include "appearance.h"

static const uint16_t luminance[] = {
  0, 66, 290, 722, 650, 715, 940, 1372,
  2875, 2941, 3165, 3597, 7152, 7218, 7442, 7874,
  193, 259, 483, 915, 843, 908, 1133, 1565,
  3068, 3134, 3358, 3790, 7345, 7411, 7635, 8067,
  855, 920, 1145, 1577, 1504, 1570, 1795, 2226,
  3730, 3795, 4020, 4452, 8007, 8072, 8297, 8729,
  2126, 2192, 2416, 2848, 2776, 2841, 3066, 3498,
  5001, 5067, 5291, 5723, 9278, 9344, 9568, 10000,
};

static uint8_t native(uint8_t code) {
  if (code == TD_TANGERINE) return 52;
  if (code == TD_LEGACY_PATTERN_BG) return 0;
  return code;
}

static int contrast(uint8_t a, uint8_t b) {
  int x = luminance[a] + 500, y = luminance[b] + 500;
  int high = x > y ? x : y, low = x > y ? y : x;
  return (high * 1000 + low / 2) / low;
}

static uint8_t best_digit(uint8_t ink, uint8_t background) {
  int hi = luminance[ink] > luminance[background] ? luminance[ink] : luminance[background];
  int lo = luminance[ink] > luminance[background] ? luminance[background] : luminance[ink];
  if ((hi + 500) * 10 >= (lo + 500) * 45) return ink;
  return contrast(0, background) >= contrast(63, background) ? 0 : 63;
}

static uint8_t secondary(uint8_t code, const TdColors *colors) {
  if (code == TD_MATCH_HOUR) return colors->hand[0];
  if (code == TD_MATCH_MINUTE) return colors->hand[1];
  if (code != TD_AUTO) return native(code);
  int best_distance = 21000;
  uint8_t best = 63;
  for (int candidate = 0; candidate < 64; ++candidate) {
    int ratio = contrast(candidate, colors->background);
    int distance = ratio > 3800 ? ratio - 3800 : 3800 - ratio;
    if (ratio >= 3000 && distance < best_distance) {
      best_distance = distance;
      best = candidate;
    }
  }
  return best;
}

TdColors td_colors(const uint8_t settings[TD_SETTINGS_LEN], bool color) {
  if (!color) {
    uint8_t background = settings[TD_MONO] ? 63 : 0;
    uint8_t ink = 63 - background;
    return (TdColors){background, {ink, ink}, {ink, ink}, ink, ink};
  }
  TdColors colors = {
    .background = native(settings[TD_BG]),
    .hand = {native(settings[TD_HOUR]), native(settings[TD_MINUTE])},
  };
  for (int i = 0; i < 2; ++i) colors.digit[i] = best_digit(colors.hand[i], colors.background);
  colors.second = secondary(settings[TD_SECOND_COLOR], &colors);
  colors.tick = secondary(settings[TD_TICK_COLOR], &colors);
  return colors;
}
