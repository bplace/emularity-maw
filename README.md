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
- **Stop** aborts any download, force-exits the runtime and swaps in a fresh canvas.
- **Restart** = stop + start. **Fullscreen** is native, with a Firefox CSS fallback.
- Buttons enable/disable by state (via `.c-emulator__control--disabled`); style them however you like with the `.c-emulator__control*` classes.

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
