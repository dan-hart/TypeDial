# TypeDial implementation prompt

Build **TypeDial**, a Pebble watchface that pairs analog hands with upright digital hour and minute numerals that follow their respective hands. Work in `TypeDial/`. Implement the watchface, offline settings, tests, and build instructions. Produce a local installable `.pbw` where the SDK is available.

## Reference and scope

Use the local prototype at `[local design prototype]` as the visual reference. Read its theme values, options, and geometry before writing the renderer. I want the settings to feel like the prototype, with one preview and only the controls that apply to the watch I’m configuring.

Use the native Pebble C SDK on the watch and bundled PebbleKit JS plus `@rebble/clay` for settings. Use SDK 4.33.1 or a verified newer stable version that supports the complete target matrix. Target Pebble Time 2 (`emery`), Pebble 2 Duo (`flint`), and Pebble Round 2 (`gabbro`). Verify watchface rendering and offline settings on all three platforms.

## Watchface behavior

- Draw a centered pivot, broad short hour hand, and longer minute hand. Show exact values in upright Atkinson Hyperlegible numerals. Keep the analog angles correct in both clock formats. The hour angle advances with the minute.
- Support system, 12-hour, and 24-hour formats. Use 24-hour as the initial selection to match the prototype. Preserve leading zeroes for minutes and for the hour in 24-hour mode.
- Keep **Near the center** and **Closer to the tips**. Near the center must enforce the configured horizontal and vertical reading order on the digit centers. The defaults put the hour to the left of and above the minute. Allow either axis to reverse independently. Tips placement should still prefer those directions while giving hand proximity more weight. Keep the digits in bounds and clear of each other, the hour and minute hands, and enabled dial marks. Reduce the effective font size only as needed and keep placement deterministic.
- Keep the optional seconds hand off by default, with needle, baton, lollipop, and counterweight styles. It has no numeral. Changing its position, visibility, style, or color must leave the hour and minute digit positions and sizes identical. Draw it behind the digits with a rounded, glyph-shaped clearance of roughly 1–2 native pixels. Keep the hand visible through open parts of glyphs where space allows. Use the actual background, including any pattern, in the clearance treatment.
- Keep optional ticks off by default. Carry forward all nine styles from the prototype. Include emphasized quarter hours, quarter hours with eighth-turn marks, quarter hours with small hour marks, and the diamond, square, and cross variants. Rim marks have no numerals.
- Keep Compact, Medium, Large, Extra large, and Maximum digit sizes, with Extra large as the default. Offer Bold and Heavy hand weights. Bundle Atkinson Hyperlegible Mono Bold and ExtraBold, Next Bold and Bold Italic, and Original Bold. Include the applicable font license notices and measure the footprint of any generated glyph assets. Provide both monochrome polarities.

## Offline settings in the Pebble app

- Open a bundled Clay configuration page through TypeDial’s settings gear in the Pebble mobile app. Use Clay’s Pebble-styled sections, lists, toggles, color controls, and save action. Build custom Clay components only where needed for the preview, named swatches, and grouped presets. Watchfaces do not receive Pebble button or touch events. Keep the watchface within the system’s normal input model.
- Show one preview for the active or selected watch, using supported watch metadata and a small on-watch capability handshake where necessary. Match its dimensions, dial shape, palette, and effective font sizes. Hide color-only controls on monochrome hardware and keep polarity, placement, font, tick, and seconds settings available where applicable. If the active watch cannot be identified, use a previously known profile or a clearly labeled manual choice. Preserve settings for other profiles. Keep the preview interactive, with live device-local time and manual examples for noon, midnight, 15:15, 23:59, and 10:08.
- Retain **Hour accent** and **Minute accent** preset groups for Ember, Glacier, Orchard, Sundial, Lagoon, Mulberry, Copper, and Porcelain. Preserve the current Ember default and the hour-accent option. Let the user edit the background and every hand and tick color after choosing a preset. Provide visible named swatches, automatic contrast, and match-hour/minute options where applicable. Use at least 4.5:1 for digits and 3:1 for secondary marks as design targets. Calculate contrast for the effective watch colors. Represent the `#FF6600` design accent honestly on the native Pebble palette and inspect the very dark gray treatment on target displays.
- Bundle all configuration assets and fonts. No hosted settings page, CDN, telemetry, account, or network dependency at runtime. The watchface must work independently of the phone after configuration. When changing settings, use only local phone-to-watch communication through AppMessage. Keep a versioned local record on the phone, scoped per watch, and persist validated settings on the watch. Distinguish drafts, pending transfer, and acknowledged application. Preserve the last accepted watch configuration on invalid messages or interrupted saves. Keep pending settings locally and allow a bounded retry or explicit resend when the watch is back. Treat the watch’s acknowledged snapshot as the applied state.

## Structure and power budget

- Separate the pure time/layout logic, rendering, settings schema and persistence, SDK lifecycle and messaging, and Clay UI. Make geometry testable on the host without Pebble headers where practical. Keep identifiers, limits, defaults, and themes in a canonical settings contract with a small generation or parity check for C and phone code. Share deterministic geometry fixtures between the watch and preview and document the preview’s fidelity.
- Use `TickTimerService` with `MINUTE_UNIT` by default. Subscribe to `SECOND_UNIT` only when the seconds hand is enabled. Switch cadence when accepted settings change. Recalculate hour/minute layout and digit masks only on time, geometry, or relevant settings changes. Seconds ticks should reuse them and update only the seconds rendering. Use bounded integer or fixed-point math, precomputed metrics, and measured clipping or dirty-region strategies appropriate to the SDK and hardware.
- Avoid millisecond timers, continuous animations, sensors, unnecessary Bluetooth traffic, per-tick heap allocation, and per-tick flash writes. Load only needed assets. Bound buffers and search work, especially on the Duo. Measure code and resource sizes and compare seconds-off and seconds-on redraws and CPU wakeups. Reserve battery-life claims for measurements on actual hardware.

## Acceptance and delivery

- Run through every minute of the day for each display class and reading direction. Cover both time formats, the bundled fonts, and the smallest and largest font settings. Test all 60 seconds for each style and compare digit positions and sizes against the seconds-off layout. Inspect the clearance around glyphs, preset contrast, and alignment when hands coincide.
- Test settings defaults and migration, bad or missing fields, cancel behavior, interrupted delivery, duplicate saves, and reopening after app or watch restart. Verify that color and monochrome previews expose the correct controls and that settings persist without Internet access. Do at least one end-to-end offline configuration test on each available mobile platform, with local watch connectivity still enabled.
- Run the host tests and `pebble build` for the full target matrix. Inspect emulator screenshots for Time 2, 2 Duo, and a round device at representative times. Report what was tested on the host, emulator, and actual watches. Include the artifact path, build instructions, validation commands, and any gaps.

## Pebble references

- [Hardware and language support](https://developer.repebble.com/guides/tools-and-resources/hardware-information/)
- [Building with coding agents and the current SDK](https://developer.repebble.com/guides/ai-agents/)
- [Offline configuration with Clay](https://developer.repebble.com/guides/user-interfaces/app-configuration/)
- [PebbleKit JS watch information and configuration](https://developer.repebble.com/docs/pebblekit-js/Pebble/)
- [Conserving battery life](https://developer.repebble.com/guides/best-practices/conserving-battery-life/)
