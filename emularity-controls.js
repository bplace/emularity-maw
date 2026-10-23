/*
 * emularity-controls.js — optional Start / Stop / Restart / Fullscreen controls
 * for the MAW-branded Emularity splash.
 *
 * App-agnostic: the host supplies the button elements and a createLoader()
 * factory — that factory is where the host injects the game download URL/token
 * and the exe to run, so none of that lives in this fork. Load this file after
 * loader.js; it depends on the global `Emulator` constructor.
 *
 *   new EmulatorControls({
 *     canvas:            "#canvas",           // element or selector
 *     createLoader:      function () { ... }, // returns a DosBoxLoader (etc.)
 *     buttons:           { start, stop, restart, fullscreen, pause }, // els or selectors
 *     splashTitle:       "Loading game archive",
 *     hasCustomCSS:      true,                // default true
 *     fullscreenElement: "#playfield",        // wrapper toggled for the FF fallback
 *     basePath:          "/vendor/emularity/",// where the fork's assets are served
 *     splashImage:       "/img/game-123.png", // replaces the default MAW logo
 *     gameId:            "maw-123",           // with gameHash: the save store,
 *     gameHash:          "9e10…",             // as the loader's saveStore(gameId, hash)
 *     savesFilename:     "game-123-saves.zip",
 *     diskFilename:      "game-123-disk.zip",
 *     onSavesError:      function (err) { ... },
 *     onSavesMigrated:   function (report) { ... },
 *     onBeforeImport:    function (file) { return confirm("Replace saves?"); },
 *     onBeforeReset:     function (kind) { return confirm(...); } // "game" or "saves"
 *   });
 *
 * basePath is only needed if the auto-detection is wrong: by default the fork's
 * own assets (the splash logo) resolve against the URL loader.js was loaded
 * from, so mounting the fork under any prefix just works.
 *
 * The pause button is optional and stays disabled unless the running engine can
 * really freeze and resume (SAE can; the sync EM-DOSBox build cannot). Give it
 * data-pause-label / data-resume-label to have its text follow the state.
 *
 * The save buttons are optional too: exportSaves, importSaves, exportDisk,
 * resetGame and resetSaves. Export downloads the saves as a zip; import reads
 * one from a file picker back into the save store. exportDisk downloads the
 * whole disk (shipped files plus the player's changes) and needs the game
 * loaded. resetGame puts the shipped files back but keeps files the game
 * made; resetSaves deletes everything the player changed. Import and resets
 * restart a running game. When no game has run on the page they work on the
 * IndexedDB store named by gameId + gameHash (or a plain fileSystemKey), so
 * give the loader the same store (DosBoxLoader.saveStore(gameId, hash)).
 */
(function () {
  "use strict";

  function resolve(elOrSelector) {
    if (!elOrSelector) return null;
    if (typeof elOrSelector === "string") return document.querySelector(elOrSelector);
    return elOrSelector;
  }

  function isFirefox() {
    return /firefox/i.test(navigator.userAgent);
  }

  // Force-terminate the Emscripten runtime, however this build exposes it.
  function forceExitRuntime() {
    var fn = null;
    if (typeof window !== "undefined" && window._emscripten_force_exit) {
      fn = window._emscripten_force_exit;
    } else if (typeof Module !== "undefined" && Module && Module._emscripten_force_exit) {
      fn = Module._emscripten_force_exit;
    } else if (typeof _emscripten_force_exit !== "undefined") {
      fn = _emscripten_force_exit;
    }
    if (fn) {
      try { fn(1); } catch (e) {}
    }
  }

  function EmulatorControls(options) {
    options = options || {};
    if (typeof options.createLoader !== "function") {
      throw new Error("EmulatorControls: options.createLoader (a function) is required");
    }
    this.createLoader = options.createLoader;
    this.canvas = resolve(options.canvas);
    if (!this.canvas) {
      throw new Error("EmulatorControls: options.canvas not found");
    }
    this.splashTitle = options.splashTitle || null;
    this.hasCustomCSS = options.hasCustomCSS !== false; // default true
    // Where the fork's assets are served from, and an optional replacement for
    // the splash logo. Omit basePath to use the path loader.js was loaded from.
    this.basePath = options.basePath;
    this.splashImage = options.splashImage;
    this.fullscreenElement = resolve(options.fullscreenElement);
    this.onStateChange = options.onStateChange || null;
    this.fileSystemKey = options.gameId ? Emularity.storeKey(options.gameId, options.gameHash)
                                        : options.fileSystemKey;
    this.savesFilename = options.savesFilename || "saves.zip";
    this.diskFilename = options.diskFilename || "disk.zip";
    this.onSavesError = options.onSavesError || function (err) {
      window.alert(err && err.message ? err.message : String(err));
    };
    this.onSavesMigrated = options.onSavesMigrated || null;
    this.onBeforeImport = options.onBeforeImport || null;
    this.onBeforeReset = options.onBeforeReset || function (kind) {
      return window.confirm(kind === "game"
        ? "Put the game files back as they were shipped? Files the game made, like saves, stay. A save kept inside a shipped file is reset too."
        : "Delete all your saves and changes for this game? This can't be undone.");
    };

    var b = options.buttons || {};
    this.buttons = {
      start: resolve(b.start),
      stop: resolve(b.stop),
      restart: resolve(b.restart),
      fullscreen: resolve(b.fullscreen),
      pause: resolve(b.pause),
      exportSaves: resolve(b.exportSaves),
      importSaves: resolve(b.importSaves),
      exportDisk: resolve(b.exportDisk),
      resetGame: resolve(b.resetGame),
      resetSaves: resolve(b.resetSaves)
    };

    this.emulator = null;
    // The last stopped emulator: its save store stays usable, and knows
    // what the game ships even before a manifest exists.
    this._lastEmulator = null;
    this.running = false;

    var self = this;
    this._bind(this.buttons.start, function () { self.start(); });
    this._bind(this.buttons.stop, function () { self.stop(); });
    this._bind(this.buttons.restart, function () { self.restart(); });
    this._bind(this.buttons.fullscreen, function () { self.requestFullScreen(); });
    this._bind(this.buttons.pause, function () { self.togglePause(); });
    this._bind(this.buttons.exportSaves, function () { self.exportSaves(); });
    this._bind(this.buttons.importSaves, function () { self._pickSavesFile(); });
    this._bind(this.buttons.exportDisk, function () { self.exportDisk(); });
    this._bind(this.buttons.resetGame, function () { self._confirmReset("game"); });
    this._bind(this.buttons.resetSaves, function () { self._confirmReset("saves"); });

    // Ctrl+Escape leaves the Firefox CSS-fallback fullscreen.
    this._fsKeyHandler = function (e) {
      if (e.key === "Escape" && e.ctrlKey) {
        self._exitCssFullscreen();
      }
    };

    this._updateButtons();
  }

  EmulatorControls.prototype._bind = function (el, fn) {
    if (!el) return;
    el.addEventListener("click", function (e) {
      if (e && e.preventDefault) e.preventDefault();
      if (el.classList.contains("c-emulator__control--disabled")) return;
      fn();
    });
  };

  EmulatorControls.prototype._enable = function (el, on) {
    if (!el) return;
    if (on) el.classList.remove("c-emulator__control--disabled");
    else el.classList.add("c-emulator__control--disabled");
  };

  EmulatorControls.prototype._updateButtons = function () {
    this._enable(this.buttons.start, !this.running);
    this._enable(this.buttons.stop, this.running);
    this._enable(this.buttons.restart, this.running);
    this._enable(this.buttons.fullscreen, this.running);
    this._enable(this.buttons.exportSaves, !this._savesBusy);
    this._enable(this.buttons.importSaves, !this._savesBusy);
    this._enable(this.buttons.resetGame, !this._savesBusy);
    this._enable(this.buttons.resetSaves, !this._savesBusy);
    var loaded = this._loadedEmulator();
    this._enable(this.buttons.exportDisk, !this._savesBusy && !!loaded);
    // Pause is offered only when the running engine can actually freeze.
    var paused = this.isPaused();
    this._enable(this.buttons.pause, this.running && this.canPause());
    if (this.buttons.pause) {
      this.buttons.pause.setAttribute("aria-pressed", paused ? "true" : "false");
      if (paused) this.buttons.pause.classList.add("c-emulator__control--active");
      else this.buttons.pause.classList.remove("c-emulator__control--active");
      // Optional labels, so the host controls the wording (and the language).
      var label = this.buttons.pause.getAttribute(paused ? "data-resume-label" : "data-pause-label");
      if (label) this.buttons.pause.textContent = label;
    }
    if (this.onStateChange) {
      this.onStateChange(this.running ? (paused ? "paused" : "running") : "idle");
    }
  };

  EmulatorControls.prototype.isRunning = function () {
    return this.running;
  };

  // True only once an engine that can really freeze is up (SAE can; the sync
  // EM-DOSBox build cannot). Until then the Pause button stays disabled.
  EmulatorControls.prototype.canPause = function () {
    return !!(this.emulator && this.emulator.canPause());
  };

  EmulatorControls.prototype.isPaused = function () {
    return !!(this.emulator && this.emulator.isPaused());
  };

  EmulatorControls.prototype.pause = function () { return this.setPause(true); };
  EmulatorControls.prototype.resume = function () { return this.setPause(false); };
  EmulatorControls.prototype.togglePause = function () { return this.setPause(!this.isPaused()); };

  EmulatorControls.prototype.setPause = function (state) {
    if (!this.canPause()) return this;
    this.emulator.setPause(state);
    this._updateButtons();
    return this;
  };

  EmulatorControls.prototype.start = function () {
    if (this.emulator) return this;
    var self = this;
    this.emulator = new Emulator(
      this.canvas,
      { before_run: function () { self.running = true; self._updateButtons(); },
        saves_migrated: function (report) {
          if (self.onSavesMigrated) self.onSavesMigrated(report);
        } },
      this.createLoader()
    );
    // Boot straight into the game once downloaded — no "press any key" gate.
    this.emulator.start({ waitAfterDownloading: false,
                          hasCustomCSS: this.hasCustomCSS,
                          basePath: this.basePath,
                          splashImage: this.splashImage });
    if (this.splashTitle) {
      this.emulator.setSplashTitle(this.splashTitle);
    }
    // Stop/Restart are usable as soon as loading begins; `running` also flips in
    // the before_run callback once the engine is actually up.
    this.running = true;
    this._updateButtons();
    return this;
  };

  EmulatorControls.prototype.stop = function () {
    if (this.emulator) {
      try { this.emulator.mute(); } catch (e) {}
      try { this.emulator.stop(); } catch (e) {} // abort downloads + runner.stop()
    }
    // The running Emscripten engine is bound to the current canvas + GL context;
    // force-exit the runtime and swap in a fresh canvas so a later Start binds
    // cleanly (mirrors MAW V3).
    forceExitRuntime();
    this._swapCanvas();
    this._exitCssFullscreen();
    if (this.emulator) this._lastEmulator = this.emulator;
    this.emulator = null;
    this.running = false;
    this._updateButtons();
    return this;
  };

  EmulatorControls.prototype.restart = function () {
    this.stop();
    // Some engines tear down asynchronously (e.g. SAE is a global singleton
    // whose stop() quits on a later frame), so an immediate start() can hit an
    // "already running" guard. Defer the restart briefly. Harmless for engines
    // whose teardown is synchronous (DOSBox) — just a short blank.
    var self = this;
    setTimeout(function () { self.start(); }, 300);
    return this;
  };

  // The emulator whose files are loaded, running or stopped, if any.
  EmulatorControls.prototype._loadedEmulator = function () {
    var emu = this.emulator || this._lastEmulator;
    return emu && emu.isFileSystemReady() ? emu : null;
  };

  // Downloads the saves as a zip. Resolves with the Blob, or rejects (after
  // onSavesError) with e.g. "No saves found".
  EmulatorControls.prototype.exportSaves = function () {
    var self = this,
        emu = this._loadedEmulator(),
        saves = emu ? emu.exportSaves() : Emularity.exportSaves(this.fileSystemKey);
    return this._savesTask(saves.then(function (blob) {
      Emularity.downloadBlob(blob, self.savesFilename);
      return blob;
    }));
  };

  // Writes a zip (File, Blob or ArrayBuffer) into the save store, and
  // resolves with the loader's report. A running game restarts to see it.
  EmulatorControls.prototype.importSaves = function (zip) {
    var self = this,
        wasRunning = !!this.emulator,
        emu = this._loadedEmulator(),
        task = emu ? emu.importSaves(zip) : Emularity.importSaves(this.fileSystemKey, zip);
    return this._savesTask(task.then(function (report) {
      if (wasRunning) self.restart();
      return report;
    }));
  };

  // Downloads the whole disk as the game sees it. Needs the game loaded.
  EmulatorControls.prototype.exportDisk = function () {
    var self = this,
        emu = this._loadedEmulator(),
        disk = emu ? emu.exportDisk()
                   : Promise.reject(new Error("Start the game first"));
    return this._savesTask(disk.then(function (blob) {
      Emularity.downloadBlob(blob, self.diskFilename);
      return blob;
    }));
  };

  // Puts the shipped files back, keeping files the game made.
  EmulatorControls.prototype.resetGameFiles = function () {
    return this._reset("resetGameFiles");
  };

  // Deletes everything the player changed or made.
  EmulatorControls.prototype.resetSaves = function () {
    return this._reset("resetSaves");
  };

  // A reset edits the store under the game, so the game stops first and
  // starts again afterwards if it was running.
  EmulatorControls.prototype._reset = function (method) {
    var self = this,
        wasRunning = !!this.emulator;
    if (wasRunning) this.stop();
    var emu = this._loadedEmulator(),
        task = emu ? emu[method]() : Emularity[method](this.fileSystemKey);
    return this._savesTask(task.then(function (count) {
      if (wasRunning) setTimeout(function () { self.start(); }, 300);
      return count;
    }));
  };

  EmulatorControls.prototype._confirmReset = function (kind) {
    if (this.onBeforeReset && this.onBeforeReset(kind) === false) return;
    var task = kind === "game" ? this.resetGameFiles() : this.resetSaves();
    task.catch(function () {}); // already reported
  };

  EmulatorControls.prototype._savesTask = function (promise) {
    var self = this;
    this._savesBusy = true;
    this._updateButtons();
    return promise.then(function (result) {
      self._savesBusy = false;
      self._updateButtons();
      return result;
    }, function (err) {
      self._savesBusy = false;
      self._updateButtons();
      self.onSavesError(err);
      throw err;
    });
  };

  EmulatorControls.prototype._pickSavesFile = function () {
    var self = this,
        input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,application/zip";
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (!file) return;
      if (self.onBeforeImport && self.onBeforeImport(file) === false) return;
      self.importSaves(file).catch(function () {}); // already reported
    });
    input.click();
  };

  EmulatorControls.prototype._swapCanvas = function () {
    var old = this.canvas;
    var parent = old.parentNode;
    if (!parent) return;
    // Drop any splash the previous run appended alongside the canvas.
    var splashes = parent.querySelectorAll(".emularity-splash-screen");
    for (var i = 0; i < splashes.length; i++) {
      splashes[i].parentNode.removeChild(splashes[i]);
    }
    var fresh = document.createElement("canvas");
    fresh.id = old.id;
    fresh.className = old.className;
    if (old.getAttribute("style")) {
      fresh.setAttribute("style", old.getAttribute("style"));
    }
    parent.replaceChild(fresh, old);
    this.canvas = fresh;
  };

  EmulatorControls.prototype.requestFullScreen = function () {
    if (!this.running) return this;
    if (isFirefox() && this.fullscreenElement) {
      this._toggleCssFullscreen();
    } else if (this.emulator) {
      this.emulator.requestFullScreen();
    }
    return this;
  };

  EmulatorControls.prototype._toggleCssFullscreen = function () {
    if (!this.fullscreenElement) return;
    if (this.fullscreenElement.classList.contains("c-emulator--fullscreen")) {
      this._exitCssFullscreen();
    } else {
      this.fullscreenElement.classList.add("c-emulator--fullscreen");
      if (this.buttons.fullscreen) {
        this.buttons.fullscreen.classList.add("c-emulator__control--active");
      }
      window.addEventListener("keydown", this._fsKeyHandler);
    }
  };

  EmulatorControls.prototype._exitCssFullscreen = function () {
    if (this.fullscreenElement && this.fullscreenElement.classList.contains("c-emulator--fullscreen")) {
      this.fullscreenElement.classList.remove("c-emulator--fullscreen");
      if (this.buttons.fullscreen) {
        this.buttons.fullscreen.classList.remove("c-emulator__control--active");
      }
      window.removeEventListener("keydown", this._fsKeyHandler);
    }
  };

  window.EmulatorControls = EmulatorControls;
})();
