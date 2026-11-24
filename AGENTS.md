# TypeDial repository guidance

## Design playground parity

Use [the offline playground](playground/index.html) when prototyping and reviewing any change to the watchface or its settings. Compare the affected behavior on PT2, Duo, and Round 2 with representative times, including 12- and 24-hour modes when relevant.

Keep the playground in parity with the current native watchface and offline Clay settings in the same change. Use the shared settings contract, device profiles, controls, renderer, and glyphs under `src/pkjs/`. When native geometry or rendering changes, update the shared preview and verify the corresponding behavior against the watch implementation. Keep comparisons and other playground tools in the playground.

Edit the playground template or controller and shared app sources, then run `make playground`. Commit the regenerated standalone `playground/index.html` with its sources. It must open directly from disk without network access or build setup. Before committing, run `make test-settings` to check the generated file and native-to-preview geometry. Set `TYPEDIAL_CHROME` to run the offline browser checks.
