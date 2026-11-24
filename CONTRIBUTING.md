# Contributing to TypeDial

Use the [design playground](playground/index.html) to explore face and settings changes. For layout feedback, include the watch model, sample time, clock format, digit size, font, and reading order. For settings delivery issues, include the Pebble app platform and whether the phone showed the changes as pending or applied. Screenshots and small reproducible examples help.

## Run the checks

Install Node.js 24, Python 3, Make, and a C compiler. Install the pinned packages and run the host tests:

```sh
npm ci
make test
```

Set `TYPEDIAL_CHROME` to a Chrome or Chromium executable to include the offline phone settings and playground browser tests:

```sh
TYPEDIAL_CHROME="$(command -v google-chrome)" make test
```

Use the corresponding executable path on macOS or other systems. `make test-quick` skips the exhaustive minute sweep.

## Change the face or settings

1. Review the change in the playground on Time 2, 2 Duo, and Round 2. Check the relevant clock formats, reading directions, and representative times such as noon, 15:15, and 23:59.
2. Keep the native renderer and phone preview in sync. Run `python3 tools/generate-contract.py` after editing the settings contract and `make playground` after changing preview code, settings, or playground sources.
3. If geometry changes, review the new native-to-preview fixtures. Regenerate them with `make build/host/watch-test` followed by `build/host/watch-test --fixtures > tests/settings-geometry.csv`.
4. For visible rendering changes, build the Pebble bundle and check the actual watch or emulator. Install and test the offline settings when the change affects delivery.

```sh
pebble build
pebble install --emulator emery --vnc build/TypeDial.pbw
pebble emu-set-time --emulator emery --vnc 10:08:00
pebble screenshot --emulator emery --vnc --no-open /tmp/typedial-emery.png
pebble emu-app-config --emulator emery --vnc
```

Replace `emery` with `flint` or `gabbro` to check the other watches. Include the tests run and any screenshots in the pull request. The [architecture notes](docs/design.md) describe what lives on the watch, on the phone, and in the playground.
