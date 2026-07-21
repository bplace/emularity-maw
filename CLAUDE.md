# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`bplace/emularity-maw` — a fork of the Internet Archive's [Emularity](https://github.com/db48x/emularity) loader, maintained for myabandonware.com ("maw"). Emularity embeds Emscripten-compiled in-browser emulators (JSMESS/MAME, EM-DOSBox, SAE, VICE, PCE, NP2/xmil, vMac, Cloudpilot, v86, Ruffle) into a web page: it downloads the emulator engine plus the program/ROM/disk files, arranges them into a virtual filesystem, builds the right emulator arguments, and shows a splash/progress screen while doing it.

Within the wider `myabandonware.com` workspace (see `/Volumes/www/sites/maw/CLAUDE.md`), this repo is a dependency consumed by `www/` (the Laravel V4 front end) to power in-browser gameplay.

There is no build step, no package manager, and no test runner — everything ships as plain ES5 script files loaded directly by `<script>` tags.

## Working in this repo

- All of the logic lives in **`loader.js`** (~2600 lines), a single IIFE. There is no bundler; edit this file directly.
- Style: ES5 (`var`, function expressions, `.prototype`), 2-space indentation — see `.dir-locals.el` / the `js-indent-level: 2` footer comment in `loader.js`. Match existing formatting exactly; this file is hand-indented, not run through a formatter.
- Public API is exported at the bottom of the IIFE via `window.X = X` assignments (`IALoader`, `DosBoxLoader`, `MAMELoader`, `SAELoader`, `PCELoader`, `VICELoader`, `NP2Loader`, `V86Loader`, `RuffleLoader`, `CloudpilotLoader`, `Emulator`, plus deprecated aliases `JSMESSLoader`/`JSMAMELoader` for `MAMELoader`). Adding a new loader/runner means defining it inside the IIFE *and* adding its export line here.
- `browserfs.min.js` and `es6-promise.js` are vendored, unmodified third-party dependencies — don't hand-edit them.
- `emulators/` holds prebuilt engine assets consumed at runtime (JSMESS per-driver `.cfg` files, gzipped EM-DOSBox JS/mem blobs) — data, not source.

## No automated tests — manual verification only

There is no test suite. Verify changes by loading one of the `example_*.html` files (or a page from `www/`) in a real browser and confirming the game boots. `testcases.md` lists known-good Internet Archive items to smoke-test against per subsystem (arcade/MAME performance, console sound, Apple II, EM-DOSBox). After any change to `loader.js`, actually load a page and watch it run — this is a browser runtime library; nothing here can be validated by static analysis alone.

Each `example_<emulator>.html` shows the minimal standalone usage for one loader (script load order matters: `es6-promise.js`, then `browserfs.min.js`, then `loader.js`, then inline config).

## Architecture

Three layers, all defined in `loader.js`:

1. **Loader configs** (`BaseLoader` and its per-emulator subclasses: `MAMELoader`/`JSMESSLoader`, `DosBoxLoader`, `PC98DosBoxLoader`, `VICELoader`, `SAELoader`, `PCELoader`, `NP2Loader`, `vMacLoader`, `CloudpilotLoader`, `V86Loader`, `RuffleLoader`). Each is a constructor whose static methods (e.g. `MAMELoader.driver(...)`, `SAELoader.rom(...)`) return partial config objects; the constructor does `Array.prototype.reduce.call(arguments, extend)` to merge them into one config. Subtyping is done via `.__proto__ = ParentLoader` (e.g. `PC98DosBoxLoader.__proto__ = DosBoxLoader`, `vMacLoader.__proto__ = NP2Loader`), not classical prototypal inheritance on instances.
2. **Runners** (`EmscriptenRunner` and subclasses `PC98DosBoxRunner`, `NP2Runner`, `MAMERunner`, `SAERunner`, `RuffleRunner`, `CloudpilotRunner`, `V86Runner`, built via `Object.create(EmscriptenRunner.prototype)`). A runner wraps the actual compiled/native-JS emulator and exposes the uniform runtime surface: `start`, `pause`, `stop`, `mute`, `unmute`, `onStarted`, `onReset`, `requestFullScreen`.
3. **`Emulator`** — the top-level orchestrator. Constructed with a canvas, optional callbacks, and either a loader config or a function returning a `Promise` of one. Owns the splash screen/progress UI, file downloading (through BrowserFS, with an IndexedDB cache layer), and dispatch to the correct Runner once files are ready. `emulator.start(...)` kicks everything off.

**`IALoader`** sits above all of this: given an Internet Archive item identifier, it fetches the item's `_meta.xml` and `_files.xml` (via `cors.archive.org` — see `get_cors_url`/`get_meta_url`/`get_files_url`/`get_js_url` around loader.js:715-756) plus emulator engine metadata, inspects the `<emulator>` module-name prefix (`dosbox`, `sae-`, `pce-`, `vice`, `np2-`, `ruffle-`, `xmil-`, `vmac-`, `cloudpilot-`, `v86`, else falls through to MAME/JSMESS), and auto-builds the right Loader config from that metadata. This is the code path exercised when embedding directly from archive.org identifiers, as in `example_ia.html`.

When adding support for a new emulator engine, the pattern to follow is consistent across the existing ones: add a `*Loader` (config builder) + `*Runner` (or reuse `EmscriptenRunner`) pair, wire a new branch into `IALoader`'s module-prefix dispatch and its `images` logo map, add a `get_<engine>_files` helper alongside the existing ones, export the new Loader on `window`, and add an `example_<engine>.html`.
