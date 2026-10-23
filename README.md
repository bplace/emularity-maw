# Welcome to the Emularity #
![Emularity](https://raw.githubusercontent.com/db48x/emularity/master/logo/emularity_light.png)

# Beta Warning #

The Emularity should be considered in beta. We welcome feedback and suggestions as we finish 1.0.

# Synopsis #

Emularity (also called "The Emularity") is a loader designed to be used with a family of in-browser emulation systems. It is meant to ease the use of in-browser-based javascript emulation by handling housekeeping functions, making it easy to embed emulators in your website, blogs, intranet or local filesystem. The components of each aspect of the software being emulated (including the .js emulator, the program files, and operating system) can be pulled from local filesystems or through URLs.

Emularity downloads the files you specify (with a progress screen that shows both emulator logos and what is being loaded), arranges them to form a filesystem, constructs the necessary arguments for the emulator, and handles transitions to and from full-screen mode.

The Emularity system has been used by millions of users at the [Internet Archive](https://archive.org).

# myabandonware.com branding #

This fork carries the [myabandonware.com](https://www.myabandonware.com) look for the splash screen:

* **`emularity-maw.css`** styles the splash — a branded logo that spins on its vertical axis, a top title bar, and a bottom progress bar. Include it and pass `hasCustomCSS: true` to `emulator.start(...)`, which tells the loader to skip its inline styles and use these classes instead:

  ```html
  <link rel="stylesheet" href="emularity-maw.css">
  ```
  ```js
  emulator.start({ waitAfterDownloading: false, hasCustomCSS: true });
  emulator.setSplashTitle("Loading game archive");
  ```
* **`logo/maw.png`** is the default splash image, so no logo config is needed. Its URL resolves against the path `loader.js` itself was loaded from, so mounting the fork under any prefix (e.g. `/vendor/emularity/`) just works — a page at `/game/doom/play` still finds the logo. Override with the `basePath` option if the guess is wrong, or replace the image outright with `splashImage`:

  ```js
  Emularity.setBasePath("/vendor/emularity/");   // global, or …
  emulator.start({ hasCustomCSS: true, basePath: "/vendor/emularity/" });
  emulator.start({ hasCustomCSS: true, splashImage: "/img/game-123.png" });
  ```
  Absolute paths and full URLs are used as-is. `Emularity.getBasePath()` reports the detected value.
* **Your own logo.** `splashImage` takes any image URL. The theme draws it in a fixed 456 × 92 px box, centred and spinning (`.emularity-splash-image`). An SVG keeps its shape in that box: the browser scales it to fit and leaves thin bands if its ratio differs. A PNG or JPEG of another ratio stretches, because the rule sets both width and height. So prefer an SVG, or give a bitmap the 456 × 92 ratio. For another size, override the rule in your own stylesheet, and keep the margins at minus half the width and height, which centre the logo:

  ```css
  .emularity-splash-image { width: 600px; height: 112px; margin-left: -300px; margin-top: -56px; }
  ```
* **`emulator.setSplashTitle(text)`** sets the title-bar text after `start()`.
* **A real loading bar.** In `hasCustomCSS` mode the loader tracks every download and drives a single fill bar with an "X / Y (NN%)" label (`.c-emulator__progress`). Stock mode is untouched — it keeps the per-file table.
* The splash element is appended to the canvas's parent, so give that parent `position: relative` for the overlay to sit over the canvas. The host may set a per-game screenshot as the splash background on the splash element itself.

## Controls (Start / Stop / Restart / Fullscreen)

`emularity-controls.js` is an optional helper (`window.EmulatorControls`) that
wires your own buttons to the emulator lifecycle. Load it after `loader.js`. The
host owns the button markup and supplies a `createLoader` factory — **that
factory is where the game download URL (with any token) and the exe are
injected, so none of that lives in this fork.**

```html
<link rel="stylesheet" href="emularity-maw.css">
<script src="es6-promise.js"></script>
<script src="browserfs.min.js"></script>
<script src="loader.js"></script>
<script src="emularity-controls.js"></script>
```
```js
new EmulatorControls({
  canvas: "#canvas",
  fullscreenElement: "#playfield",         // wrapper for the Firefox fullscreen fallback
  splashTitle: "Loading game archive",
  buttons: { start: "#start", stop: "#stop", restart: "#restart", fullscreen: "#fullscreen" },
  createLoader: function () {              // host injects the download URL + exe here
    return new DosBoxLoader(/* … */);
  }
});
```

- **Start** boots straight into the game after the download — no "press any key" gate.
- **Pause** freezes the emulation but keeps the session alive, unlike Stop. Only some engines can do this: the Amiga (SAE) can, the sync EM-DOSBox build cannot. Pass a `pause` button and it enables itself only when the running engine supports it, so you never get a Pause that quietly does nothing:

  ```js
  buttons: { start: "#start", pause: "#pause", stop: "#stop", … }
  ```
  Give the button `data-pause-label` / `data-resume-label` for its text to follow the state; it also gets `aria-pressed` and `c-emulator__control--active`. On the emulator itself: `canPause()`, `isPaused()`, `pause()`, `resume()`, `togglePause()`, `setPause(bool)`.
- **Stop** aborts any download, force-exits the runtime and swaps in a fresh canvas.
- **Restart** = stop + start. **Fullscreen** is native, with a Firefox CSS fallback.
- Buttons enable/disable by state (via `.c-emulator__control--disabled`); style them however you like with the `.c-emulator__control*` classes.

## Savegames, disk download and resets

The game sits in read-only zip mounts. Everything it writes, saves included,
goes to a separate layer that Emularity keeps in IndexedDB: the game's *save
store*. The controls can export that layer as a zip, import one back,
download the whole disk, and reset the store.

### One store per version of a game

Name the store with the game's id and a hash of its archive (V4: the file's
`md5`). Pass the same pair to the loader and to the controls:

```js
createLoader: function () {
  return new DosBoxLoader(DosBoxLoader.saveStore("maw-123", md5), /* … */);
},
gameId: "maw-123",
gameHash: md5,                 // same store, so the buttons work before Start
```

The store is named `maw-123@<md5>`. When the archive changes, its hash
changes, and the game boots on a fresh store. On that first boot the loader
brings the saves over from the old store (the newest one named `maw-123@…`),
then deletes the old stores. It fits each save's folder to the new layout:

1. A folder the old archive shipped goes where most of its files went (`C:\GAMES\DOOM` → `C:\DOOM`).
2. A folder the game made goes inside wherever its parent went (`C:\GAMES\DOOM\SAVES` → `C:\DOOM\SAVES`).
3. A folder inside the game's root goes to the same place inside the new root. The root is the folder of the shallowest `.exe` that both archives ship under the same name (case ignored). That is usually the game's own `.exe`, sometimes a helper like `DOS4GW.EXE`. If that name appears twice at that depth, or two names tie and point to different roots, this rule is skipped.
4. Else, the new folder whose name path ends the same way wins.
5. Else the file keeps its path. The player can move it from the DOS prompt.

A file that would cover a file the new archive ships, such as an edited
config, goes to `C:\OLDSAVES\<its old path>` instead. Nothing is lost. The
`onSavesMigrated(report)` option gets `{ from, count, moved, kept, parked }`,
so the host can tell the player.

Without a hash, a plain `DosBoxLoader.fileSystemKey("game-123")` and
`fileSystemKey: "game-123"` still work, without migration. Give every game a
store of its own: otherwise all games share the `"emularity"` store and their
saves mix.

Saves made before this release have no record of their layout, so they can't
be brought over. Migration needs `indexedDB.databases()` (Chrome 71, Safari
14, Firefox 126). Where it's missing, the game boots on a fresh store.

### The buttons

```js
savesFilename: "game-123-saves.zip",
diskFilename: "game-123-disk.zip",
buttons: { /* … */, exportSaves: "#export", importSaves: "#import",
           exportDisk: "#disk", resetGame: "#reset-game", resetSaves: "#reset-saves" },
onSavesError: function (err) { /* default: alert(err.message) */ },
onBeforeImport: function (file) { return confirm("Replace your saves?"); },
onBeforeReset: function (kind) { /* "game" or "saves"; default: confirm(...) */ }
```

- **Export saves** downloads what the player changed or made, with its folders (`c/DOOM/DOOMSAV0.DSG`). It works before Start, and reports "No saves found" if there are none.
- **Import saves** reads a zip made by Export. Files replace those of the same name. A zip from another version of the game carries that version's layout, so its saves are fitted to this one as in migration. A running game restarts to see them.
  A zip the player unzipped and zipped again still works. Import drops `__MACOSX/`, `._*` files, `.DS_Store` and `Thumbs.db`, and takes off a top folder that wraps everything (Finder's Compress adds one). A zip with nothing for this game's drives fails with "The zip holds no saves for this game", and nothing is written.
- **Download disk** zips the C: drive (and any other) as the game sees it: shipped files with the player's changes on top. It needs the game loaded, and builds the zip in memory, which is fine for floppy and hard-disk games but heavy for CD-sized ones. Zips stop at 4 GB.
- **Reset game files** puts every shipped file back, edited or deleted, and keeps every file the game made. A game that saves into a file it ships loses that save too.
- **Reset saves** deletes everything the player changed or made. The game is as shipped.

Resets stop a running game and start it again. Before Start, Reset game
files needs one earlier boot of this version, which records what it ships.

### Without the controls

On an emulator, once its files are loaded: `exportSaves()`, `exportDisk()`
→ `Promise<Blob>`; `importSaves(zip)` → `Promise<report>`; `resetGameFiles()`,
`resetSaves()` (call them after `stop()`, then boot a new emulator). Pass
`saves_migrated: function (report) {}` in the emulator's callbacks for the
migration report. With no emulator: `Emularity.exportSaves(key)`,
`Emularity.importSaves(key, zip)`, `Emularity.resetGameFiles(key)`,
`Emularity.resetSaves(key)`, with `key = Emularity.storeKey(gameId, hash)`.
`Emularity.downloadBlob(blob, filename)` saves a Blob. Don't use the
`Emularity.*` calls while a game on the same store runs: the game holds its
own copy of the files and won't see the change.

See `example_maw.html` for a full working page. The download URL for the game
file (and any token) is supplied by the host through `createLoader` /
`DosBoxLoader.fetchFile(...)` — it is not part of this fork.

# The Emulators #

Currently works with three emulators:

## MAME ##

[MAME](https://github.com/mamedev/mame) is a port of the Multiple Arcade Machine Emulator (MAME) projects to Javascript. MAME supports over a thousand different machines including game consoles, arcade machines and computer platforms.

## EM-DOSBox ##

[EM-DOSBox](https://github.com/dreamlayers/em-dosbox/) is a port of DosBox to Javascript. DOSBox emulates an IBM PC compatible running DOS. There are two versions of this emulator, dosbox.js (Standard EM-DOSBOX) and dosbox-sync.js (EM-DOSBOX with considerations for in-program execution of other programs).

## Scripted Amiga Emulator ##

[SAE](https://github.com/naTmeg/ScriptedAmigaEmulator) is a Javascript port of WinUAE by [naTmeg](https://github.com/naTmeg). It emulates most of the Amiga models that were released.

# Credits and Components #

Primary work on Emularity is by [Daniel Brooks](https://github.com/db48x), with contributions of code or concepts from [John Vilk](https://github.com/jvilk), Andre D, [Justin Kerk](https://github.com/DopefishJustin), [Vitorio Miliano](https://github.com/vitorio), and [Jason Scott](https://github.com/textfiles). Some of these contributions predate the Emularity git repository, unfortunately.

Emularity makes use of [BrowserFS](https://github.com/jvilk/BrowserFS) by [John Vilk](https://github.com/jvilk), an in-browser filesystem that emulates the Node JS filesystem API and supports storing and retrieving files from various backends.

It also utilizes [ES6-Promise](https://github.com/jakearchibald/es6-promise), a polyfill of the ES6 Promise API. Both are implemented and included without modification; consult these original repositories for information or verification.

# Some Open Issues #

* Documentation can be improved
* Splash Screen occasionally overflows canvas
* Progress bars can stand to be improved
* Should add browser-specific detections for unusual behaviors and volume/full-screen actions
* Handling of aspect ratios, and their interaction with full-screen mode
* Finish API for volume/mute/full-screen requests
