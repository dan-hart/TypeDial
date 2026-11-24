# TypeDial

TypeDial is a Pebble watchface with analog hands and exact digital hour and minute values. The upright Atkinson Hyperlegible digits move with their hands. The optional seconds hand passes behind the glyph outlines without moving the digits.

## Supported watches

| Watch | SDK platform | Display |
| --- | --- | --- |
| Pebble Time 2 | `emery` | 200 × 228, color |
| Pebble 2 Duo | `flint` | 144 × 168, monochrome |
| Pebble Round 2 | `gabbro` | 260 × 260, round color |

## Build and test

Use [Pebble Tool](https://developer.repebble.com/sdk/) 5.3.0 and Pebble SDK 4.33.1, or a newer toolchain that supports these three platforms. Node.js, Python 3, and a host C compiler are used for local checks.

```sh
pebble sdk install 4.33.1
npm ci
make test
pebble build
```

From the `TypeDial` checkout the installable bundle is `build/TypeDial.pbw`. To test Time 2 in the emulator, run the commands below. Replace `emery` with `flint` or `gabbro` for the other watches.

```sh
pebble install --emulator emery --vnc
pebble emu-set-time --emulator emery --vnc 10:08:00
pebble screenshot --emulator emery --vnc --no-open /tmp/typedial-emery.png
pebble emu-app-config --emulator emery --vnc
```

Set `TYPEDIAL_CHROME` to a Chromium executable when running `make test-settings` to exercise the offline Clay page and playground in headless Chromium. `make test-quick` runs a smaller watch geometry matrix.

## Settings

Open TypeDial’s gear in the Pebble mobile app. Settings use Pebble's bundled Clay controls and show one preview for the connected watch. The Duo shows monochrome polarity. The Time 2 and Round 2 show named color swatches and hour- and minute-accent presets. Change the preview time without changing the time on the watch. Set digit size with the 1 pt stepper or enter a size directly. The permitted range depends on the watch, and digits scale down when a time needs more room.

The settings page and all preview assets are bundled. Saving uses local AppMessage delivery to the watch. The settings UI distinguishes an applied configuration from a change waiting for the watch, and the watch keeps its last accepted settings when disconnected. Seconds are disabled by default. Turning them on increases display updates from once a minute to once a second.

## Design playground

Open [playground/index.html](playground/index.html) directly in Safari or another browser. It works offline and keeps your selections in browser storage when available. Use the time slider, live mode, and 12/24-hour gallery to compare PT2, Duo, and Round 2 without installing a build. Choose a watch in the digit-size control to adjust that model independently.

The playground uses the phone preview's renderer, glyphs, palette, device profiles, and settings controls. Run `make playground` to update the standalone page after edits, then `make test-settings` to check that it matches its sources and that the preview geometry matches native layouts.

## Source layout

- `src/c/` contains native clock geometry, glyph handling, rendering, the watch lifecycle, and settings delivery.
- `src/pkjs/` contains phone storage and delivery, Clay configuration, and the device preview.
- `src/pkjs/contract.json` defines the settings wire format, bounds, defaults, and presets. Regenerate `src/c/contract.h` with `python3 tools/generate-contract.py` after contract edits.
- `resources/` contains the licensed digit rasters loaded by the watch. The preview uses the same rasters. License notices are in `licenses/`.

The glyph generator expects the OFL-released files from [Google Fonts](https://github.com/google/fonts/tree/main/ofl) and Pillow. Supply the Mono variable font as `mono/regular.ttf`, Next variable upright and italic fonts as `next/regular.ttf` and `next/italic.ttf`, and the original Bold static font as `original/bold.ttf`. Then run `python3 tools/generate-glyphs.py path/to/font-sources`.
