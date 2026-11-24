# TypeDial design and architecture

TypeDial pairs analog hands with exact numeric hour and minute values. Its native geometry is deterministic. **Near the center** respects the selected reading order, while **Closer to the tips** gives more weight to hand proximity. Digit sizing caps the requested size when the hands, dial marks, or screen edges leave less space.

| Area | Source | Responsibility |
| --- | --- | --- |
| Layout and rendering | [`src/c/`](../src/c) | Integer geometry, font masks, palette rendering, settings validation, and watch lifecycle |
| Phone settings | [`src/pkjs/`](../src/pkjs) | Bundled Clay controls, per-watch drafts, preview, and local delivery |
| Settings contract | [`contract.json`](../src/pkjs/contract.json) | Wire fields, defaults, bounds, legacy size mappings, and themes |
| Design playground | [`playground/`](../playground) | Offline design iteration and side-by-side comparison using the production JS preview |
| Tests | [`tests/`](../tests) | Native layout and seconds coverage, geometry parity, delivery, and offline browser checks |

The watch persists accepted settings. The phone keeps pending settings locally and distinguishes a queued save from an acknowledged watch snapshot. Configuration needs Bluetooth connectivity to apply a change and runs without an internet connection.

The watch subscribes to minute ticks by default. Enabling seconds switches to second ticks. The seconds renderer reuses the hour and minute layout and its glyph clearance masks, so the seconds hand can move without shifting or resizing either number.

The watch loads digit rasters from [`resources/`](../resources). To regenerate them and the matching preview data, install Pillow and use the OFL font files from [Google Fonts](https://github.com/google/fonts/tree/main/ofl). Supply the Mono variable font as `mono/regular.ttf`, the Next upright and italic variable fonts as `next/regular.ttf` and `next/italic.ttf`, and the original Bold font as `original/bold.ttf`. Then run `python3 tools/generate-glyphs.py path/to/font-sources` and `make playground`.
