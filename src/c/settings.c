#include "settings.h"

#include <string.h>

bool td_settings_valid(const uint8_t *settings, size_t length) {
  if (length != TD_SETTINGS_LEN || settings[TD_SCHEMA] != TD_VERSION) return false;
  for (int i = 1; i < TD_SETTINGS_LEN; ++i)
    if (settings[i] > TD_MAX[i]) return false;
  // Legacy background code 65 remains valid only for the background.
  return settings[TD_SECOND_COLOR] != 65 && settings[TD_TICK_COLOR] != 65;
}

static uint32_t read_word(const uint8_t *bytes) {
  uint32_t value = 0;
  for (int i = 0; i < 4; ++i) value |= (uint32_t)bytes[i] << (8 * i);
  return value;
}

static void write_word(uint8_t *bytes, uint32_t value) {
  for (int i = 0; i < 4; ++i) bytes[i] = value >> (8 * i);
}

static uint32_t checksum(const uint8_t *record) {
  uint32_t hash = 2166136261u;
  for (int i = 0; i < TD_SETTINGS_RECORD_LEN - 4; ++i)
    hash = (hash ^ record[i]) * 16777619u;
  return hash;
}

void td_settings_encode(uint8_t record[TD_SETTINGS_RECORD_LEN],
                        const uint8_t settings[TD_SETTINGS_LEN], uint32_t transaction, uint32_t generation) {
  memcpy(record, settings, TD_SETTINGS_LEN);
  write_word(record + TD_SETTINGS_LEN, transaction);
  write_word(record + TD_SETTINGS_LEN + 4, generation);
  write_word(record + TD_SETTINGS_LEN + 8, checksum(record));
}

bool td_settings_decode(const uint8_t *record, size_t length, uint8_t settings[TD_SETTINGS_LEN],
                        uint32_t *transaction, uint32_t *generation) {
  if ((length != TD_SETTINGS_LEN && length != TD_SETTINGS_RECORD_LEN) ||
      !td_settings_valid(record, TD_SETTINGS_LEN)) return false;
  if (length == TD_SETTINGS_RECORD_LEN &&
      read_word(record + TD_SETTINGS_LEN + 8) != checksum(record)) return false;
  memcpy(settings, record, TD_SETTINGS_LEN);
  // A bare v1 snapshot remains readable if an earlier build stored it on its own.
  *transaction = length == TD_SETTINGS_RECORD_LEN ? read_word(record + TD_SETTINGS_LEN) : 0;
  *generation = length == TD_SETTINGS_RECORD_LEN ? read_word(record + TD_SETTINGS_LEN + 4) : 0;
  return true;
}

bool td_settings_newer(uint32_t candidate, uint32_t current) {
  uint32_t distance = candidate - current;
  return distance != 0 && distance < 0x80000000u;
}
