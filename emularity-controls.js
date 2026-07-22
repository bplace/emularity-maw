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
 *     buttons:           { start, stop, restart, fullscreen }, // els or selectors
 *     splashTitle:       "Loading game archive",
 *     hasCustomCSS:      true,                // default true
 *     fullscreenElement: "#playfield"         // wrapper toggled for the FF fallback
 *   });
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
    this.fullscreenElement = resolve(options.fullscreenElement);
    this.onStateChange = options.onStateChange || null;

    var b = options.buttons || {};
    this.buttons = {
      start: resolve(b.start),
      stop: resolve(b.stop),
      restart: resolve(b.restart),
      fullscreen: resolve(b.fullscreen)
    };

    this.emulator = null;
    this.running = false;

    var self = this;
    this._bind(this.buttons.start, function () { self.start(); });
    this._bind(this.buttons.stop, function () { self.stop(); });
    this._bind(this.buttons.restart, function () { self.restart(); });
    this._bind(this.buttons.fullscreen, function () { self.requestFullScreen(); });

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
    if (this.onStateChange) {
      this.onStateChange(this.running ? "running" : "idle");
    }
  };

  EmulatorControls.prototype.isRunning = function () {
    return this.running;
  };

  EmulatorControls.prototype.start = function () {
    if (this.emulator) return this;
    var self = this;
    this.emulator = new Emulator(
      this.canvas,
      { before_run: function () { self.running = true; self._updateButtons(); } },
      this.createLoader()
    );
    // Boot straight into the game once downloaded — no "press any key" gate.
    this.emulator.start({ waitAfterDownloading: false, hasCustomCSS: this.hasCustomCSS });
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
    this.emulator = null;
    this.running = false;
    this._updateButtons();
    return this;
  };

  EmulatorControls.prototype.restart = function () {
    this.stop();
    this.start();
    return this;
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
