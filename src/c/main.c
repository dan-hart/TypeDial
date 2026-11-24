#include <pebble.h>
#include <string.h>

#include "appearance.h"
#include "glyphs.h"
#include "render.h"
#include "settings.h"

enum { FIRST_SETTINGS_KEY = 1, APP_MESSAGE_BYTES = 128 };
enum { RESULT_OK, RESULT_INVALID, RESULT_STORAGE_ERROR };

static Window *window;
static Layer *face;
static GSize face_size;
static TimeUnits cadence;
static uint32_t last_transaction, last_reported_save, generation;
static uint8_t active_slot;
static uint8_t settings[TD_SETTINGS_LEN];
static TdFont font;
static uint8_t font_data[TD_FONT_CAPACITY];
static int loaded_font = -1;
static TdLayout layout;
static TdMask masks[2];
static TdColors colors;
static TdMark seconds[2];
static uint8_t seconds_count;
static int last_hour = -1, last_minute = -1;
static uint8_t geometry_key[9];
static bool prepared;

#ifdef PBL_PLATFORM_GABBRO
enum { WATCH_PROFILE = 2 };
#elif defined(PBL_PLATFORM_FLINT)
enum { WATCH_PROFILE = 1 };
#else
enum { WATCH_PROFILE = 0 };
#endif

static void draw(Layer *layer, GContext *ctx) {
  (void)layer;
  td_render_draw(ctx, layer_get_frame(window_get_root_layer(window)).origin, masks, colors,
                 seconds, seconds_count);
}

static bool select_font(uint8_t index) {
  if (loaded_font == index) return true;
  static const uint32_t font_ids[] = {
    RESOURCE_ID_FONT_0, RESOURCE_ID_FONT_1, RESOURCE_ID_FONT_2, RESOURCE_ID_FONT_3, RESOURCE_ID_FONT_4,
  };
  loaded_font = -1;
  ResHandle handle = resource_get_handle(font_ids[index]);
  size_t length = resource_size(handle);
  if (!length || length > sizeof(font_data) ||
      resource_load(handle, font_data, sizeof(font_data)) != length ||
      !td_font_read(&font, font_data, length)) return false;
  loaded_font = index;
  return true;
}

static bool static_colors_changed(TdColors next) {
  return colors.background != next.background ||
         colors.tick != next.tick || colors.hand[0] != next.hand[0] || colors.hand[1] != next.hand[1] ||
         colors.digit[0] != next.digit[0] || colors.digit[1] != next.digit[1];
}

static void refresh_minute(const struct tm *now) {
  bool use_24h = settings[TD_FORMAT] == 2 || (settings[TD_FORMAT] == 0 && clock_is_24h_style());
  bool ticks = settings[TD_TICKS] != 0;
  const uint8_t key[] = {now->tm_hour, now->tm_min, use_24h, settings[TD_FONT], settings[TD_SIZE],
                        settings[TD_PLACEMENT], settings[TD_WEIGHT],
                        settings[TD_HORIZONTAL] | (settings[TD_VERTICAL] << 1),
                        ticks ? 1 + settings[TD_TICK_STYLE] : 0};
  TdColors next = td_colors(settings, PBL_IF_COLOR_ELSE(true, false));
  bool layout_changed = !prepared || memcmp(key, geometry_key, sizeof(key)) != 0;
  if (layout_changed) {
    TdLayoutInput input = {
      .width = face_size.w, .height = face_size.h, .round = PBL_IF_ROUND_ELSE(true, false),
      .use_24h = use_24h, .hour = now->tm_hour, .minute = now->tm_min, .size = settings[TD_SIZE],
      .placement = settings[TD_PLACEMENT], .weight = settings[TD_WEIGHT], .horizontal = settings[TD_HORIZONTAL],
      .vertical = settings[TD_VERTICAL], .ticks = ticks, .tick_style = settings[TD_TICK_STYLE],
    };
    memset(masks, 0, sizeof(masks));
    if ((select_font(settings[TD_FONT]) || select_font(0)) && td_layout(&input, font.metric, &layout))
      for (int i = 0; i < 2; ++i) td_make_mask(&masks[i], &font, &layout.labels[i]);
    memcpy(geometry_key, key, sizeof(key));
  }
  if (layout_changed || static_colors_changed(next)) td_render_prepare(&layout, masks, next);
  colors = next;
  last_hour = now->tm_hour;
  last_minute = now->tm_min;
  prepared = true;
}

static void refresh_second(const struct tm *now) {
  seconds_count = settings[TD_SECONDS]
    ? td_seconds(face_size.w, face_size.h, settings[TD_SECOND_STYLE], now->tm_sec % 60, seconds)
    : 0;
}

static void tick(struct tm *now, TimeUnits changed) {
  (void)changed;
  if (!prepared || now->tm_hour != last_hour || now->tm_min != last_minute) refresh_minute(now);
  refresh_second(now);
  layer_mark_dirty(face);
}

static void apply(void) {
  TimeUnits next = settings[TD_SECONDS] ? SECOND_UNIT : MINUTE_UNIT;
  if (next != cadence) {
    if (cadence) tick_timer_service_unsubscribe();
    tick_timer_service_subscribe(next, tick);
    cadence = next;
  }
  time_t time_now = time(NULL);
  struct tm *now = localtime(&time_now);
  if (now) {
    refresh_minute(now);
    refresh_second(now);
    layer_mark_dirty(face);
  }
}

static void report(uint32_t transaction, uint8_t result) {
  DictionaryIterator *outbox;
  if (app_message_outbox_begin(&outbox) != APP_MSG_OK) return;
  dict_write_uint32(outbox, MESSAGE_KEY_Txn, transaction);
  dict_write_uint8(outbox, MESSAGE_KEY_Result, result);
  dict_write_uint8(outbox, MESSAGE_KEY_Profile, WATCH_PROFILE);
  dict_write_uint8(outbox, MESSAGE_KEY_Clock24, clock_is_24h_style());
  dict_write_data(outbox, MESSAGE_KEY_Report, settings, TD_SETTINGS_LEN);
  app_message_outbox_send();
}

static bool read_uint(const Tuple *field, uint32_t *value) {
  if (!field || (field->type != TUPLE_UINT && field->type != TUPLE_INT)) return false;
  switch (field->length) {
    case 1: *value = field->value->uint8; return true;
    case 2: *value = field->value->uint16; return true;
    case 4: *value = field->value->uint32; return true;
    default: return false;
  }
}

static uint8_t save(const Tuple *field, uint32_t transaction) {
  if (field->type != TUPLE_BYTE_ARRAY || !td_settings_valid(field->value->data, field->length))
    return RESULT_INVALID;
  if (memcmp(settings, field->value->data, TD_SETTINGS_LEN) == 0) {
    last_reported_save = transaction;
    return RESULT_OK;
  }
  if (transaction == last_transaction || transaction == last_reported_save) return RESULT_INVALID;
  uint8_t record[TD_SETTINGS_RECORD_LEN];
  uint8_t next_slot = active_slot ^ 1;
  td_settings_encode(record, field->value->data, transaction, generation + 1);
  if (persist_write_data(FIRST_SETTINGS_KEY + next_slot, record, sizeof(record)) != sizeof(record))
    return RESULT_STORAGE_ERROR;
  ++generation;
  active_slot = next_slot;
  memcpy(settings, field->value->data, TD_SETTINGS_LEN);
  last_transaction = last_reported_save = transaction;
  apply();
  return RESULT_OK;
}

static void inbox(DictionaryIterator *incoming, void *context) {
  (void)context;
  uint32_t transaction, request;
  if (!read_uint(dict_find(incoming, MESSAGE_KEY_Txn), &transaction) || !transaction) return;
  const Tuple *field = dict_find(incoming, MESSAGE_KEY_Settings);
  const Tuple *request_field = dict_find(incoming, MESSAGE_KEY_Request);
  if (field && request_field) report(transaction, RESULT_INVALID);
  else if (field) report(transaction, save(field, transaction));
  else if (read_uint(request_field, &request) && request == 1) report(transaction, RESULT_OK);
  else report(transaction, RESULT_INVALID);
}

static void load_settings(void) {
  bool recovered = false;
  memcpy(settings, TD_DEFAULTS, sizeof(settings));
  for (uint8_t slot = 0; slot < 2; ++slot) {
    uint32_t transaction, stored_generation;
    uint8_t record[TD_SETTINGS_RECORD_LEN], stored[TD_SETTINGS_LEN];
    int key = FIRST_SETTINGS_KEY + slot;
    int length = persist_get_size(key);
    if (length <= 0 || length > (int)sizeof(record) ||
        persist_read_data(key, record, length) != length ||
        !td_settings_decode(record, length, stored, &transaction, &stored_generation)) continue;
    if (recovered && !td_settings_newer(stored_generation, generation)) continue;
    memcpy(settings, stored, sizeof(settings));
    generation = stored_generation;
    last_transaction = transaction;
    active_slot = slot;
    recovered = true;
  }
}

int main(void) {
  load_settings();

  window = window_create();
  if (!window) return 1;
  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root);
  face_size = bounds.size;
  face = layer_create(bounds);
  if (!face || !td_render_init(face_size)) {
    if (face) layer_destroy(face);
    window_destroy(window);
    return 1;
  }
  layer_set_update_proc(face, draw);
  layer_add_child(root, face);
  apply();
  app_message_register_inbox_received(inbox);
  app_message_open(APP_MESSAGE_BYTES, APP_MESSAGE_BYTES);
  window_stack_push(window, false);
  app_event_loop();
  tick_timer_service_unsubscribe();
  app_message_deregister_callbacks();
  layer_destroy(face);
  td_render_deinit();
  window_destroy(window);
  return 0;
}
