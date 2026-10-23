# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`bplace/emularity-maw` — a fork of the Internet Archive's [Emularity](https://github.com/db48x/emularity) loader, maintained for myabandonware.com ("maw"). Emularity embeds Emscripten-compiled in-browser emulators (JSMESS/MAME, EM-DOSBox, SAE, VICE, PCE, NP2/xmil, vMac, Cloudpilot, v86, Ruffle) into a web page: it downloads the emulator engine plus the program/ROM/disk files, arranges them into a virtual filesystem, builds the right emulator arguments, and shows a splash/progress screen while doing it.

Within the wider `myabandonware.com` workspace (see `/Volumes/www/sites/maw/CLAUDE.md`), this repo is a dependency consumed by `www/` (the Laravel V4 front end) to power in-browser gameplay.

There is no build step, no package manager, and no test runner — everything ships as plain ES5 script files loaded directly by `<script>` tags.

## MAW branding (fork-specific)

This fork adds the myabandonware.com splash look, a real loading bar, and
optional playback controls. It stays app-agnostic — the download URL/token,
playstats, view templates, per-game screenshot, and app DOM live in the V4 app
(`www/`), not here. What is MAW-specific in this repo:

- **`emularity-maw.css`** — the theme. Styles the engine's `emularity-*` splash classes (branded logo spinning via `@keyframes spinner` on `.emularity-splash-image`, a `.emularity-splash-title` top bar) plus the new BEM `c-emulator` classes for the loading bar, controls, and fullscreen fallback. Activated by passing `hasCustomCSS: true` to `emulator.start(...)` (stock flag that makes the loader skip its inline styles). Splash styling was ported from V3's `www3` `game.scss`, retargeting V3's ID selectors to classes.
- **`logo/maw.png`** — the MAW logo, used as the default splash image. The theme draws the splash image in a fixed 456 × 92 box, the PNG's own size. A host's `splashImage` of another ratio keeps its shape only if it is an SVG; a bitmap stretches. The README explains how to change the box, so keep the two in step if you change the rule.
- **`loader.js` deltas from upstream** (search for `MAW:`):
  - `drawsplash()` defaults the splash image to `logo/maw.png`, resolved through `assetUrl()` against a `basePath` auto-detected from the URL `loader.js` was loaded from. This is what lets the host mount the fork under any prefix (V4 serves it from `/vendor/emularity/` while the page lives at `/game/…/play`) — a bare relative path would resolve against the page URL and 404. Overridable globally via `window.Emularity.setBasePath(...)` or per emulator with the `basePath` / `splashImage` options to `start()`.
  - `Emulator.setSplashTitle(title)` — sets the title-bar text after `start()`.
  - An **aggregate loading bar**: `_fetch_file` records each download in the `requests` array; `updateProgress()` sums them and drives `.c-emulator__progress*` (created in `setupSplash`, **only when `hasCustomCSS` is true** — stock users keep the per-file table unchanged).
  - `Emulator.stop()` — aborts in-flight XHRs and calls `runner.stop()`.
  - **Pause**: `Emulator.canPause()/isPaused()/pause()/resume()/togglePause()/setPause()`, delegating to `runner.pause(bool)`. Runners advertise support with a `canPause` flag — **only SAE sets it true**. `EmscriptenRunner.pause` is a no-op, and the sync EM-DOSBox build's main loop can be frozen (`Module.pauseMainLoop()`) but not restarted (its `resumeMainLoop` calls a scheduler that `pause` nulled), so DOSBox deliberately reports `canPause: false` rather than offering a one-way freeze. Note SAE applies pause/resume asynchronously — it sets a command its loop consumes on a later iteration, so `SAER.paused` lags the call.
  - **Save store** (search `MAW: savegame`): the OverlayFS writable layer (`deltaFS`, mirrored to IndexedDB under `fileSystemKey`) holds only what the game wrote, so it *is* the saves. The Emulator keeps it as `store` = `{ fs, overlay, keep, skip, drives, tree }`.
    - **Keys**: `BaseLoader.saveStore(gameId, hash)` → key `gameId@hash` plus `fileSystemFamily` `gameId@`. Without a per-game key every game shares the `"emularity"` store.
    - **Manifest** `/.emularity-store.json` in each store (written by `prepare_store` on every boot, after the zips mount): `key`, `lastBoot`, `keep` (mountFile copies) and `dirs` (the shipped layout from `list_tree`). It lets the static `Emularity.*` calls know what ships, and later versions remap paths.
    - **Migration**: first boot of a key with no manifest → `migrate_saves` copies the newest other family store (found with `indexedDB.databases()`) through `map_save_paths`, then deletes the old stores. `map_save_paths` is pure (no BrowserFS), so test it in Node by pulling it out of the file. Its rules, in order: shared shipped file names, parent folder, game root (`exe_root`: folder of the shallowest same-named `.exe` in both layouts), trailing folder names, else keep. Clashes with shipped files go to `/<drive>/OLDSAVES/`. Import of a zip whose manifest key differs uses the same mapping.
    - **Zip**: `make_zip` is a store-only writer with no dependency (folders as `{ dir: true }`); import reads zips with BrowserFS's `ZipFS`.
    - **Async writes**: AsyncMirror and OverlayFS's deletion log both write in the background. `when_flushed` and `settle` poll their private `_queue`/`_queueRunning`/`_deleteLogUpdatePending`; resets run only after `settle`, on a stopped game.
    - **API**: `emulator.exportSaves/importSaves/exportDisk/resetGameFiles/resetSaves`, `isFileSystemReady()`, callback `saves_migrated`; static `Emularity.storeKey/exportSaves/importSaves/resetGameFiles/resetSaves/downloadBlob`.
- **`emularity-controls.js`** — NEW, optional, exports `window.EmulatorControls`. Binds host-supplied Start/Stop/Restart/Fullscreen buttons to the emulator lifecycle. The host passes a `createLoader` factory (where V4 injects the download URL/token + exe) and button refs. Start boots after download (no "press any key"); Stop force-exits the runtime (`_emscripten_force_exit`) and swaps the canvas; Fullscreen is native with a Firefox CSS fallback (`.c-emulator--fullscreen`). Ported from V3 `start.js`, stripped of all app coupling (selects, playstats, ad-refresh, `body.dimmed`, sprite).
- **`example_maw.html`** — exercises the whole lot (branded splash, loading bar, boot-after-download, the lifecycle and save buttons, a `saveStore` keyed on the example zip's md5); use it to verify in a browser.

New classes use BEM under the `c-emulator` block; the engine-emitted
`emularity-*` classes are left as-is. Keep changes here app-agnostic — anything
tied to the game download, the app DOM, or per-game data belongs in `www/`.

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
