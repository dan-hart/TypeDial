HOST_FLAGS = -O2 -std=c11 -Wall -Wextra -Werror
WATCH_TEST = build/host/watch-test
WATCH_SOURCES = src/c/layout.c src/c/appearance.c src/c/glyphs.c src/c/settings.c

.PHONY: test test-quick test-settings

$(WATCH_TEST): tests/watch-test.c $(WATCH_SOURCES) $(wildcard src/c/*.h)
	mkdir -p build/host
	$(CC) $(HOST_FLAGS) -Isrc/c tests/watch-test.c $(WATCH_SOURCES) -o $@

test-settings: $(WATCH_TEST)
	python3 tools/generate-contract.py --check
	$(WATCH_TEST) --fixtures > build/host/settings-geometry.csv
	cmp tests/settings-geometry.csv build/host/settings-geometry.csv
	TYPEDIAL_GEOMETRY_FIXTURE=build/host/settings-geometry.csv node --test tests/settings*.test.js

test: test-settings
	$(WATCH_TEST)

test-quick: test-settings
	$(WATCH_TEST) --quick
