#ifndef TYPEDIAL_SETTINGS_H
#define TYPEDIAL_SETTINGS_H

#include "contract.h"
#include <stdbool.h>
#include <stddef.h>

enum { TD_SETTINGS_RECORD_LEN = TD_SETTINGS_LEN + 12 };

bool td_settings_valid(const uint8_t *settings, size_t length);
bool td_settings_decode(const uint8_t *record, size_t length, uint8_t settings[TD_SETTINGS_LEN],
                        uint32_t *transaction, uint32_t *generation);
bool td_settings_newer(uint32_t candidate, uint32_t current);
void td_settings_encode(uint8_t record[TD_SETTINGS_RECORD_LEN],
                        const uint8_t settings[TD_SETTINGS_LEN], uint32_t transaction, uint32_t generation);

#endif
