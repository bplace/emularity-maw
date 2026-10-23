/**  The Emularity; easily embed emulators
  *  Copyright © 2014-2016 Daniel Brooks <db48x@db48x.net>, Jason
  *  Scott <jscott@archive.org>, Grant Galitz <grantgalitz@gmail.com>,
  *  John Vilk <jvilk@cs.umass.edu>, and Tracey Jaquith <tracey@archive.org>
  *
  *  This program is free software: you can redistribute it and/or modify
  *  it under the terms of the GNU General Public License as published by
  *  the Free Software Foundation, either version 3 of the License, or
  *  (at your option) any later version.
  *
  *  This program is distributed in the hope that it will be useful,
  *  but WITHOUT ANY WARRANTY; without even the implied warranty of
  *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  *  GNU General Public License for more details.
  *
  *  You should have received a copy of the GNU General Public License
  *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
  */

var Module = null;

(function (Promise) {
   // MAW: where this fork's own assets (logo/, emulators/) live. Auto-detected
   // from the URL loader.js itself was loaded from, so the host can mount the
   // fork anywhere (e.g. /vendor/emularity/) and the defaults still resolve —
   // a bare relative path would otherwise resolve against the page URL.
   // Override at runtime with Emularity.setBasePath("/vendor/emularity/"), or
   // per emulator with the basePath option to start().
   var basePath = (function () {
     var script = document.currentScript;
     if (!script) {
       var scripts = document.getElementsByTagName('script');
       for (var i = scripts.length - 1; i >= 0; i--) {
         if (scripts[i].src && /(^|\/)loader\.js(\?|#|$)/.test(scripts[i].src)) {
           script = scripts[i];
           break;
         }
       }
     }
     return script && script.src ? script.src.replace(/[^\/]*$/, '') : '';
   })();

   // Join the base path with a fork-relative asset path. Absolute URLs and
   // absolute paths are passed through untouched.
   function assetUrl(path, override) {
     if (/^([a-z]+:)?\/\//i.test(path) || path.charAt(0) == '/') {
       return path;
     }
     var base = typeof override === 'string' ? override : basePath;
     if (base && base.charAt(base.length - 1) != '/') {
       base += '/';
     }
     return base + path;
   }

   var Emularity = {
     getBasePath: function () { return basePath; },
     setBasePath: function (path) {
       basePath = typeof path === 'string' ? path : '';
       return this;
     },
     assetUrl: assetUrl,
     // MAW: a save store name for one version of a game. Stores sharing the
     // "<gameId>@" start are versions of one game; see BaseLoader.saveStore.
     storeKey: function (gameId, hash) {
       return gameId + '@' + (hash || 'unversioned');
     }
   };

   /**
    * IALoader
    */
   function IALoader(canvas, game, callbacks, scale) {
     // IA actually gives us an object here, and we really ought to be
     // looking things up from it instead.
     if (typeof game !== 'string') {
       game = game.toString();
     }
     if (!callbacks || typeof callbacks !== 'object') {
       callbacks = { before_emulator: updateLogo,
                     before_run: callbacks };
     } else {
       if (typeof callbacks.before_emulator === 'function') {
         var func = callbacks.before_emulator;
         callbacks.before_emulator = function () {
                                       updateLogo();
                                       func();
                                     };
       } else {
         callbacks.before_emulator = updateLogo;
       }
     }

     function img(src) {
       var img = new Image();
       img.src = src;
       return img;
     }

     // yea, this is a hack
     var images;
     if (/archive\.org$/.test(document.location.hostname)) {
       images = { ia: img("/images/ialogo.png"),
                  mame: img("/images/mame.png"),
                  mess: img("/images/mame.png"),
                  dosbox: img("/images/dosbox.png"),
                  sae: img("/images/sae.png"),
                  pce: img("/images/pce.png"),
                  vice: img("/images/vice.svg"),
                  np2: img("/images/nekop2.gif"),
                  xmil: img("/images/xmillenium_logo.jpg"),
                  vmac: img("/images/vmac.png"),
                  ruffle: img("/images/ruffle.png"),
                  cloudpilot: img("/images/cloudpilot.png"),
                  v86: img("/images/v86.png"),
                };
     } else {
       images = { ia: img("other_logos/ia-logo-150x150.png"),
                  mame: img("other_logos/mame.png"),
                  mess: img("other_logos/mame.png"),
                  dosbox: img("other_logos/dosbox.png"),
                  sae: img("other_logos/sae.png"),
                  pce: img("other_logos/pce.png"),
                  vice: img("other_logos/vice.svg"),
                  np2: img("other_logos/nekop2.gif"),
                  xmil: img("other_logos/xmillenium_logo.jpg"),
                  vmac: img("other_logos/vmac.png"),
                  ruffle: img("other_logos/ruffle.png"),
                  cloudpilot: img("other_logos/cloudpilot.png"),
                  v86: img("other_logos/v86.png"),
                };
     }

     function updateLogo() {
       if (emulator_logo) {
         emulator.setSplashImage(emulator_logo);
       }
     }

     var SAMPLE_RATE = (function () {
                          var audio_ctx = window.AudioContext || window.webkitAudioContext || false;
                          if (!audio_ctx) {
                            return false;
                          }
                          var sample = new audio_ctx;
                          return sample.sampleRate.toString();
                        }());

     var metadata, filelist, module, modulecfg, config_args, emulator_logo,
         emulator = new Emulator(canvas).setSplashImage(images.ia)
                                        .setLoad(loadFiles)
                                        .setCallbacks(callbacks);

     var cfgr;
     function loadFiles(fetch_file, splash) {
       splash.setTitle("Downloading game metadata...");
       return new Promise(function (resolve, reject) {
                            var loading = fetch_file('Game Metadata',
                                                     get_meta_url(game),
                                                     'document');
                            loading.then(function (data) {
                                           metadata = data;
                                           splash.setTitle("Downloading game filelist...");
                                           return fetch_file('Game File List',
                                                             get_files_url(game),
                                                             'document', true);
                                         },
                                         function () {
                                           splash.setTitle("Failed to download IA item metadata!");
                                           splash.failed_loading = true;
                                           reject(1);
                                         })
                                   .then(function (data) {
                                           if (splash.failed_loading) {
                                             return null;
                                           }
                                           filelist = data;
                                           splash.setTitle("Downloading emulator metadata...");
                                           module = metadata.getElementsByTagName("emulator")
                                                            .item(0)
                                                            .textContent;
                                           return fetch_file('Emulator Metadata',
                                                             get_emulator_config_url(module),
                                                             'text', true);
                                         },
                                         function () {
                                           if (splash.failed_loading) {
                                             return;
                                           }
                                           splash.setTitle("Failed to download file list!");
                                           splash.failed_loading = true;
                                           reject(2);
                                         })
                                   .then(function (data) {
                                           if (splash.failed_loading) {
                                             return null;
                                           }

                                           modulecfg = JSON.parse(data);
                                           var get_files;

                                           if (module && module.indexOf("dosbox") === 0) {
                                             emulator_logo = images.dosbox;
                                             cfgr = DosBoxLoader;
                                             get_files = get_dosbox_files;
                                           }
                                           else if (module && module.indexOf("sae-") === 0) {
                                             emulator_logo = images.sae;
                                             cfgr = SAELoader;
                                             get_files = get_sae_files;
                                           }
                                           else if (module && module.indexOf("pce-") === 0) {
                                             emulator_logo = images.pce;
                                             cfgr = PCELoader;
                                             get_files = get_pce_files;
                                           }
                                           else if (module && module.indexOf("vice") === 0) {
                                             emulator_logo = images.vice;
                                             cfgr = VICELoader;
                                             get_files = get_vice_files;
                                           }
                                           else if (module && module.indexOf("np2-") === 0) {
                                             emulator_logo = images.np2;
                                             cfgr = NP2Loader;
                                             get_files = get_np2_files;
                                           }
                                           else if (module && module.indexOf("ruffle-") === 0) {
                                             emulator_logo = images.ruffle;
                                             cfgr = RuffleLoader;
                                             get_files = get_ruffle_files;
                                           }
                                           else if (module && module.indexOf("xmil-") === 0) {
                                             emulator_logo = images.xmil;
                                             cfgr = NP2Loader;
                                             get_files = get_xmil_files;
                                           }
                                           else if (module && module.indexOf("vmac-") === 0) {
                                             emulator_logo = images.vmac;
                                             cfgr = vMacLoader;
                                             get_files = get_vmac_files;
                                           }
                                           else if (module && module.indexOf("cloudpilot-") === 0) {
                                             emulator_logo = images.cloudpilot;
                                             cfgr = CloudpilotLoader;
                                             get_files = get_cloudpilot_files;
                                           }
                                           else if (module && module.indexOf("v86") === 0) {
                                             emulator_logo = images.v86;
                                             cfgr = V86Loader;
                                             get_files = get_v86_files;
                                           }
                                           else if (module) {
                                             emulator_logo = images.mame;
                                             cfgr = MAMELoader;
                                             get_files = get_mame_files;
                                           }
                                           else {
                                             throw new Error("Unknown module type "+ module +"; cannot configure the emulator.");
                                           }

                                           var wantsWASM = modulecfg.wasm_filename && 'WebAssembly' in window;
                                           var nr = modulecfg['native_resolution'];
                                           config_args = [cfgr.emulatorJS(get_js_url(wantsWASM ? modulecfg.wasmjs_filename : modulecfg.js_filename)),
                                                          cfgr.emulatorWASM(wantsWASM && get_js_url(modulecfg.wasm_filename)),
                                                          cfgr.locateAdditionalEmulatorJS(locateAdditionalJS),
                                                          cfgr.fileSystemKey(game),
                                                          cfgr.nativeResolution(nr[0], nr[1]),
                                                          cfgr.aspectRatio(nr[0] / nr[1]),
                                                          cfgr.scale(scale || modulecfg.scale || 2),
                                                          cfgr.sampleRate(SAMPLE_RATE)];

                                           if ('keepAspect' in cfgr) {
                                             config_args.push(cfgr.keepAspect(modulecfg.keepAspect));
                                           }

                                           if (/archive\.org$/.test(document.location.hostname)) {
                                             config_args.push(cfgr.muted(document.cookie.indexOf('unmute=1') < 0)) // we're muted, unless cookie 'unmute' is set
                                           }

                                           var emulator_start_item = metadata.getElementsByTagName("emulator_start").item(0);
                                           if (module && module.indexOf("dosbox") === 0) {
                                             config_args.push(cfgr.startExe(metadata.getElementsByTagName("emulator_start")
                                                                                    .item(0)
                                                                                    .textContent));
                                           } else if (module && module.indexOf("vice") === 0) {
                                             var vice_fliplist = [ metadata.getElementsByTagName("vice_drive_8_fliplist").item(0),
                                                                   metadata.getElementsByTagName("vice_drive_9_fliplist").item(0),
                                                                   metadata.getElementsByTagName("vice_drive_10_fliplist").item(0),
                                                                   metadata.getElementsByTagName("vice_drive_11_fliplist").item(0) ];
                                             if (emulator_start_item) {
                                               config_args.push(cfgr.autoLoad(emulator_start_item.textContent));
                                             }
                                             var fliplists = [];
                                             vice_fliplist.forEach(function (fliplist_meta) {
                                                                     if(!fliplist_meta) {
                                                                       fliplists.push(null);
                                                                     } else {
                                                                       fliplists.push(fliplist_meta.textContent.split(";"));
                                                                     }
                                                                   });
                                             config_args.push(cfgr.fliplist(fliplists));
                                             config_args.push(cfgr.extraArgs(modulecfg.extra_args));
                                           } else if (module && module.indexOf("sae-") === 0) {
                                             config_args.push(cfgr.model(modulecfg.driver),
                                                              cfgr.rom(modulecfg.bios_filenames));
                                           } else if (module && (module.indexOf("np2-") == 0 ||
                                                                 module.indexOf("xmil-") == 0 ||
                                                                 module.indexOf("vmac-") == 0)) {
                                             if (!emulator_start_item) {
                                               throw new Exception("Error: this item does not have an 'emulator_start' metadata value; I don't know what to run.");
                                             }
                                             config_args.push(cfgr.autoLoad('/emulator/'+ emulator_start_item.textContent),
                                                              cfgr.extraArgs(modulecfg.extra_args));
                                           } else if (module && module.indexOf("pce-") === 0) {
                                             config_args.push(cfgr.model(modulecfg.driver),
                                                              cfgr.extraArgs(modulecfg.extra_args));
                                           } else if (module && module.indexOf("cloudpilot-") === 0) { // Cloudpilot
                                             config_args.push(cfgr.roms(modulecfg.bios_filenames));
                                           } else if (module && module.indexOf("ruffle-") === 0) {
                                             modulecfg.config = modulecfg.config || {};
                                             modulecfg.config.base = get_cors_url(game);
                                           } else if (module && module.indexOf("v86") === 0) {
                                             config_args.push(cfgr.memorySize(modulecfg.memory_size),
                                                              cfgr.vgaMemorySize(modulecfg.vga_memory_size),
                                                              cfgr.acpi(modulecfg.acpi),
                                                              cfgr.bootOrder(modulecfg.boot_order));
                                           } else if (module) { // MAME
                                             config_args.push(cfgr.driver(modulecfg.driver),
                                                              cfgr.extraArgs(modulecfg.extra_args));
                                             if (emulator_start_item) {
                                               config_args.push(cfgr.autoboot(emulator_start_item.textContent));
                                             }
                                           }

                                           splash.setTitle("Downloading game data...");
                                           return Promise.all(get_files(cfgr, metadata, modulecfg, filelist));
                                         },
                                         function () {
                                           if (splash.failed_loading) {
                                             return;
                                           }
                                           splash.setTitle("Failed to download emulator metadata!");
                                           splash.failed_loading = true;
                                           reject(2);
                                         })
                                   .then(function (game_files) {
                                           if (splash.failed_loading) {
                                             return;
                                           }
                                           updateLogo();
                                           resolve(cfgr.apply(null, extend(config_args, game_files)));
                                         },
                                         function (e) {
                                           if (splash.failed_loading) {
                                             return;
                                           }
                                           splash.setTitle("Failed to configure emulator!");
                                           splash.failed_loading = true;
                                           reject(3);
                                         });
                          });
     }

     function locateAdditionalJS(filename) {
       if ("file_locations" in modulecfg && filename in modulecfg.file_locations) {
         return get_js_url(modulecfg.file_locations[filename]);
       }
       return get_js_url(filename);
     }

     function get_dosbox_files(cfgr, metadata, modulecfg, filelist) {
       var default_drive = "c", // pick any drive letter as a default
           drives = {}, files = [],
           meta = dict_from_xml(metadata);
       if (game && game.endsWith(".zip")) {
         drives[default_drive] = game;
       }
       files_with_ext_from_filelist(filelist, meta.emulator_ext).forEach(function (file, i) {
                                                                           drives[default_drive] = file.name;
                                                                         });
       meta_props_matching(meta, /^dosbox_drive_([a-zA-Z])$/).forEach(function (result) {
                                                                        var key = result[0], match = result[1];
                                                                        drives[match[1]] = meta[key];
                                                                      });
       var mounts = Object.keys(drives),
           len = mounts.length;
       mounts.forEach(function (drive, i) {
                        var title = "Game File ("+ (i+1) +" of "+ len +")",
                            filename = drives[drive],
                            url = (filename.includes("/")) ? get_zip_url(filename)
                                                           : get_zip_url(filename, get_item_name(game));
                            if (filename.toLowerCase().endsWith(".zip")) {
                              files.push(cfgr.mountZip(drive,
                                                       cfgr.fetchFile(title, url)));
                            } else {
                              files.push(cfgr.mountFile('/'+ filename,
                                                        cfgr.fetchFile(title, url)));
                            }
                      });
       return files;
     }

     function get_vice_files(cfgr, metadata, modulecfg, filelist) {
       var default_drive = "8",
           drives = {}, files = [], wanted_files = [],
           meta = dict_from_xml(metadata);
       files_with_ext_from_filelist(filelist, meta.emulator_ext).forEach(function (file, i) {
                                                                           wanted_files.push(file.name);
                                                                         });
       files_with_ext_from_filelist(filelist, "conf").forEach(function (file, i) {
                                                                           wanted_files.push(file.name);
                                                                         });
       meta_props_matching(meta, /^vice_drive_([89])$/).forEach(function (result) {
                                                                  var key = result[0], match = result[1];
                                                                  drives[match[1]] = meta[key];
                                                                });

       var len = wanted_files.length;
       wanted_files.forEach(function (file, i) {
                              var title = "Game File ("+ (i+1) +" of "+ len +")",
                                  filename = file,
                                  url = (filename.includes("/")) ? get_zip_url(filename)
                                                                 : get_zip_url(filename, get_item_name(game));
                              if (filename.toLowerCase().endsWith(".zip") && false) { // TODO: Enable and fix zip support.
                                files.push(cfgr.mountZip("", // TODO: This is a hack, no drive actually applicable here
                                                         cfgr.fetchFile(title, url)));
                              } else {
                                //TODO: ensure vice_drive_8 and vice_drive_9 actually function.
                                files.push(cfgr.mountFile('/'+ filename,
                                                          cfgr.fetchFile(title, url)));
                              }
                            });
       return files;
     }

     function get_mame_files(cfgr, metadata, modulecfg, filelist) {
       var files = [],
           bios_files = modulecfg['bios_filenames'],
           already_fetched_urls = [];
       bios_files.forEach(function (fname, i) {
                            if (fname) {
                              var title = "Bios File ("+ (i+1) +" of "+ bios_files.length +")";
                              var url = get_bios_url(fname);
                              files.push(cfgr.mountFile('/'+ fname,
                                                        cfgr.fetchFile(title, url)));
                              already_fetched_urls.push(url);
                            }
                          });

       var meta = dict_from_xml(metadata),
           peripherals = {},
           game_files_counter = {};
       files_with_ext_from_filelist(filelist, meta.emulator_ext).forEach(function (file, i) {
                                                                           game_files_counter[file.name] = 1;
                                                                           if (modulecfg.peripherals && modulecfg.peripherals[i]) {
                                                                             peripherals[modulecfg.peripherals[i]] = file.name;
                                                                           }
                                                                         });
       meta_props_matching(meta, /^mame_peripheral_([a-zA-Z0-9]+)$/).forEach(function (result) {
                                                                               var key = result[0], match = result[1];
                                                                               peripherals[match[1]] = meta[key];
                                                                               game_files_counter[meta[key]] = 1;
                                                                             });

       var game_files = Object.keys(game_files_counter),
           len = game_files.length;
       game_files.forEach(function (filename, i) {
                            var title = "Game File ("+ (i+1) +" of "+ len +")",
                                url = (filename.includes("/")) ? get_zip_url(filename)
                                                               : get_zip_url(filename, get_item_name(game));
                            files.push(cfgr.mountFile('/'+ filename,
                                                      cfgr.fetchFile(title, url)));
                            already_fetched_urls.push(url);
                          });

       // add on game drive (.chd) files, if any
       // chd files must go into a subdir named after the driver for mame to find them
       var drive_files = files_with_ext_from_filelist(filelist, 'chd');  // maybe 'chd' should be meta.drive_ext?
       len = drive_files.length;
       drive_files.forEach(function (file, i) {
                             var title = "Game Drive ("+ (i+1) +" of "+ len +")";
                             var url = (file.name.includes("/")) ? get_zip_url(file.name)
                                                                 : get_zip_url(file.name, get_item_name(game));
                             if (!already_fetched_urls.includes(url)) {
                               files.push(cfgr.mountFile(modulecfg.driver + '/' + file.name,
                                                         cfgr.fetchFile(title, url)));
                             }
                           });

       Object.keys(peripherals).forEach(function (periph) {
                                          files.push(cfgr.peripheral(periph,                // we're not pushing a 'file' here,
                                                                     peripherals[periph])); // but that's ok
                                        });

       files.push(cfgr.mountFile('/'+ modulecfg['driver'] + '.cfg',
                                 cfgr.fetchOptionalFile("CFG File",
                                                        get_other_emulator_config_url(module))));
       return files;
     }

     function get_sae_files(cfgr, metadata, modulecfg, filelist) {
       var files = [],
           bios_files = modulecfg['bios_filenames'];
       bios_files.forEach(function (fname, i) {
                            if (fname) {
                              var title = "Bios File ("+ (i+1) +" of "+ bios_files.length +")";
                              files.push(cfgr.mountFile('/'+ fname,
                                                        cfgr.fetchFile(title,
                                                                       get_bios_url(fname))));
                            }
                          });

       var meta = dict_from_xml(metadata),
           game_files = files_with_ext_from_filelist(filelist, meta.emulator_ext);
       game_files.forEach(function (file, i) {
                            if (file) {
                              var title = "Game File ("+ (i+1) +" of "+ game_files.length +")",
                                  url = (file.name.includes("/")) ? get_zip_url(file.name)
                                                                  : get_zip_url(file.name, get_item_name(game));
                              files.push(cfgr.mountFile('/'+ file.name,
                                                        cfgr.fetchFile(title, url)));
                              files.push(cfgr.floppy(0,             // we're not pushing a file here
                                                     file.name));   // but that's ok
                            }
                          });
       files.push(cfgr.mountFile('/'+ modulecfg['driver'] + '.cfg',
                                 cfgr.fetchOptionalFile("Config File",
                                                        get_other_emulator_config_url(module))));
       return files;
     }

     function get_ruffle_files(cfgr, metadata, modulecfg, filelist) {
       window.RufflePlayer = window.RufflePlayer || {};
       window.RufflePlayer.config = modulecfg.config;
       var files = [];
       var meta = dict_from_xml(metadata);
       var game_files = files_with_ext_from_filelist(filelist, meta.emulator_ext);

       if (game_files.length > 0) {
         var file = game_files[0]; // only allow one .swf file to be loaded
         var title = 'Downloading Game File';
         var url = (file.name.includes('/')) ? get_zip_url(file.name)
                                             : get_zip_url(file.name, get_item_name(game));
         files.push(cfgr.mountFile('/' + file.name, cfgr.fetchFile(title, url)));
         files.push(cfgr.swf_file_name('/' + file.name));
       }
       return files;
    }

     function get_pce_files(cfgr, metadata, modulecfg, filelist) {
       var files = [],
           bios_files = modulecfg['bios_filenames'];
       bios_files.forEach(function (fname, i) {
                            if (fname) {
                              var title = "ROM File ("+ (i+1) +" of "+ bios_files.length +")";
                              files.push(cfgr.mountFile('/'+ fname,
                                                        cfgr.fetchFile(title,
                                                                       get_bios_url(fname))));
                            }
                          });

       var meta = dict_from_xml(metadata),
           game_files_counter = {};
       files_with_ext_from_filelist(filelist, meta.emulator_ext).forEach(function (file, i) {
                                                                           if (modulecfg.peripherals && modulecfg.peripherals[i]) {
                                                                             game_files_counter[file.name] = modulecfg.peripherals[i];
                                                                           }
                                                                         });
       meta_props_matching(meta, /^pce_drive_([a-zA-Z0-9]+)$/).forEach(function (result) {
                                                                         var key = result[0], periph = result[1][1];
                                                                         game_files_counter[meta[key]] = periph;
                                                                       });

       var game_files = Object.keys(game_files_counter),
           len = game_files.length;
       game_files.forEach(function (filename, i) {
                            var title = "Game File ("+ (i+1) +" of "+ len +")",
                                ext = filename.match(/\.([^.]*)$/)[1],
                                url = (filename.includes("/")) ? get_zip_url(filename)
                                                               : get_zip_url(filename, get_item_name(game));
                            files.push(cfgr.mountFile('/'+ game_files_counter[filename] +'.'+ ext,
                                                      cfgr.fetchFile(title, url)));
                          });

       files.push(cfgr.mountFile('/pce-'+ modulecfg['driver'] + '.cfg',
                                 cfgr.fetchOptionalFile("Config File",
                                                        get_other_emulator_config_url("pce-"+ modulecfg['driver']))));
       return files;
     }

     // TODO(db48x): get_{np2,xmil,vmac}_files are even more
     // duplicative than the rest; time to factor this a lot
     function get_np2_files(cfgr, metadata, modulecfg, filelist) {
       var files = [],
           bios_files = modulecfg['bios_filenames'];
       bios_files.forEach(function (fname, i) {
                            if (fname) {
                              var title = "ROM File ("+ (i+1) +" of "+ bios_files.length +")",
                                  mounter = (fname.endsWith(".zip")) ? cfgr.mountZip
                                                                     : cfgr.mountFile;
                              files.push(mounter('np2',
                                                 cfgr.fetchFile(title, get_bios_url(fname))));
                            }
                          });
       var meta = dict_from_xml(metadata),
           peripherals = {},
           game_files_counter = {};
       files_with_ext_from_filelist(filelist, meta.emulator_ext).forEach(function (file, i) {
                                                                           game_files_counter[file.name] = 1;
                                                                         });

       var game_files = Object.keys(game_files_counter),
           len = game_files.length;
       game_files.forEach(function (filename, i) {
                            var title = "Game File ("+ (i+1) +" of "+ len +")",
                                url = (filename.includes("/")) ? get_zip_url(filename)
                                                               : get_zip_url(filename, get_item_name(game));
                            files.push(cfgr.mountFile('/'+ filename,
                                                      cfgr.fetchFile(title, url)));
                          });
       return files;
     }

     function get_xmil_files(cfgr, metadata, modulecfg, filelist) {
       var files = [],
           bios_files = modulecfg['bios_filenames'];
       bios_files.forEach(function (fname, i) {
                            if (fname) {
                              var title = "ROM File ("+ (i+1) +" of "+ bios_files.length +")",
                                  mounter = (fname.endsWith(".zip")) ? cfgr.mountZip
                                                                     : cfgr.mountFile;
                              files.push(mounter('xmil',
                                                 cfgr.fetchFile(title, get_bios_url(fname))));
                            }
                          });
       var meta = dict_from_xml(metadata),
           peripherals = {},
           game_files_counter = {};
       files_with_ext_from_filelist(filelist, meta.emulator_ext).forEach(function (file, i) {
                                                                           game_files_counter[file.name] = 1;
                                                                         });

       var game_files = Object.keys(game_files_counter),
           len = game_files.length;
       game_files.forEach(function (filename, i) {
                            var title = "Game File ("+ (i+1) +" of "+ len +")",
                                url = (filename.includes("/")) ? get_zip_url(filename)
                                                               : get_zip_url(filename, get_item_name(game));
                            files.push(cfgr.mountFile('/'+ filename,
                                                      cfgr.fetchFile(title, url)));
                          });
       return files;
     }

     function get_vmac_files(cfgr, metadata, modulecfg, filelist) {
       var files = [],
           bios_files = modulecfg['bios_filenames'];
       bios_files.forEach(function (fname, i) {
                            if (fname) {
                              var title = "ROM File ("+ (i+1) +" of "+ bios_files.length +")",
                                  mounter = (fname.endsWith(".zip")) ? cfgr.mountZip
                                                                     : cfgr.mountFile;
                              files.push(mounter('minivmac',
                                                 cfgr.fetchFile(title, get_bios_url(fname))));
                            }
                          });
       var meta = dict_from_xml(metadata),
           peripherals = {},
           game_files_counter = {};
       files_with_ext_from_filelist(filelist, meta.emulator_ext).forEach(function (file, i) {
                                                                           game_files_counter[file.name] = 1;
                                                                         });
       meta_props_matching(meta, /^vmac_drive_([0-9]+)$/).forEach(function (result) {
                                                                    var key = result[0], periph = result[1][1];
                                                                    game_files_counter[meta[key]] = periph;
                                                                  });

       var game_files = Object.keys(game_files_counter),
           len = game_files.length;
       game_files.forEach(function (filename, i) {
                            var title = "Disk Image ("+ (i+1) +" of "+ len +")",
                                url = (filename.includes("/")) ? get_zip_url(filename)
                                                               : get_zip_url(filename, get_item_name(game));
                            files.push(cfgr.mountFile('/'+ filename,
                                                      cfgr.fetchFile(title, url)));
                          });
       return files;
     }

     function get_cloudpilot_files(cfgr, metadata, modulecfg, filelist) {
       var files = [];
       bios_files = modulecfg['bios_filenames'];
       bios_files.forEach(function (fname, i) {
                            if (fname) {
                              var title = "Bios File ("+ (i+1) +" of "+ bios_files.length +")";
                              files.push(cfgr.mountFile('/'+ fname,
                                                        cfgr.fetchFile(title,
                                                                       get_bios_url(fname))));
                            }
                          });
       var meta = dict_from_xml(metadata);
       var game_files = files_with_ext_from_filelist(filelist, meta.emulator_ext);
       var len = game_files.length;
       if (game_files.length > 0) {
         var file = game_files[0]; // only allow one .swf file to be loaded
         var title = 'Downloading Game File';
         var url = (file.name.includes('/')) ? get_zip_url(file.name)
                                             : get_zip_url(file.name, get_item_name(game));
         files.push(cfgr.mountFile('/' + file.name, cfgr.fetchFile(title, url)));
         files.push(cfgr.prc(file.name));
       }
       return files;
    }

     function get_v86_files(cfgr, metadata, modulecfg, filelist) {
       var files = [];

       if (modulecfg['bios_filename']) {
         files.push(cfgr.mountFile('/' + modulecfg['bios_filename'], cfgr.fetchFile("BIOS File", get_bios_url(modulecfg['bios_filename']))));
         files.push(cfgr.bios(modulecfg['bios_filename']));
       }
       if (modulecfg['vga_bios_filename']) {
         files.push(cfgr.mountFile('/' + modulecfg['vga_bios_filename'], cfgr.fetchFile("VGA BIOS File", get_bios_url(modulecfg['vga_bios_filename']))));
         files.push(cfgr.vgaBios(modulecfg['vga_bios_filename']));
       }

       var meta = dict_from_xml(metadata),
           game_files_counter = {};
       files_with_ext_from_filelist(filelist, meta.emulator_ext).forEach(function (file, i) {
                                                                           if (modulecfg.peripherals && modulecfg.peripherals[i]) {
                                                                             game_files_counter[file.name] = modulecfg.peripherals[i];
                                                                           }
                                                                         });
       meta_props_matching(meta, /^v86_drive_([a-zA-Z0-9]+)$/).forEach(function (result) {
                                                                         var key = result[0], periph = result[1][1];
                                                                         game_files_counter[meta[key]] = periph;
                                                                       });

       var game_files = Object.keys(game_files_counter),
           len = game_files.length;
       game_files.forEach(function (filename, i) {
                            var title = "Game File ("+ (i+1) +" of "+ len +")",
                                ext = filename.match(/\.([^.]*)$/)[1],
                                url = (filename.includes("/")) ? get_zip_url(filename)
                                                               : get_zip_url(filename, get_item_name(game)),
                                periph = game_files_counter[filename],
                                path = '/' + periph + '.' + ext,
                                periph_cfg = {};
                            periph_cfg[periph] = {"path": path};
                            files.push(cfgr.mountFile(path,
                                                      cfgr.fetchFile(title, url)));
                            files.push(periph_cfg);
                          });

      return files;
     }

     var get_item_name = function (game_path) {
       return game_path.split('/').shift();
     };

     var get_game_name = function (game_path) {
       return game_path.split('/').pop();
     };

     // NOTE: deliberately use cors.archive.org since this will 302 rewrite to iaXXXXX.us.archive.org/XX/items/...
     // and need to keep that "artificial" extra domain-ish name to avoid CORS issues with IE/Safari  (tracey@archive)
     var get_cors_url = function(item, path) {
       return '//cors.archive.org/cors/' + item + (path ? '/' + path : '');
     }

     var get_emulator_config_url = function (module) {
       return get_cors_url('emularity_engine_v1', module + '.json');
     };

     var get_other_emulator_config_url = function (module) {
       return get_cors_url('emularity_config_v1', module + '.cfg');
     };

     var get_meta_url = function (game_path) {
       var path = game_path.split('/');
       return get_cors_url(path[0], path[0] + "_meta.xml");
     };

     var get_files_url = function (game_path) {
       var path = game_path.split('/');
       return get_cors_url(path[0], path[0] +"_files.xml");
     };

     var get_zip_url = function (game_path, item_path) {
       if (item_path) {
         return get_cors_url(item_path, game_path);
       }
       return get_cors_url(game_path);
     };

     var get_js_url = function (js_filename) {
       return get_cors_url('emularity_engine_v1', js_filename);
     };

     var get_bios_url = function (bios_filename) {
       return get_cors_url('emularity_bios_v1', bios_filename);
     };

     function mountat (drive) {
       return function (data) {
         return { drive: drive,
                  mountpoint: "/" + drive,
                  data: data
                };
       };
     }

     return emulator;
   }

   /**
    * BaseLoader
    */
   function BaseLoader() {
     return Array.prototype.reduce.call(arguments, extend);
   }

   BaseLoader.canvas = function (id) {
     var elem = id instanceof Element ? id : document.getElementById(id);
     return { canvas: elem };
   };

   BaseLoader.emulatorJS = function (url) {
     return { emulatorJS: url };
   };

   BaseLoader.emulatorWASM = function (url) {
     return { emulatorWASM: url };
   };

   BaseLoader.locateAdditionalEmulatorJS = function (func) {
     return { locateAdditionalJS: func };
   };

   BaseLoader.fileSystemKey = function (key) {
     return { fileSystemKey: key };
   };

   // MAW: one save store per version of a game (hash: e.g. the archive's
   // md5). When the hash changes, the first boot brings the saves over from
   // the old store, fitted to the new layout, and deletes it.
   BaseLoader.saveStore = function (gameId, hash) {
     return { fileSystemKey: Emularity.storeKey(gameId, hash),
              fileSystemFamily: gameId + '@' };
   };

   BaseLoader.nativeResolution = function (width, height) {
     if (typeof width !== 'number' || typeof height !== 'number')
       throw new Error("Width and height must be numbers");
     return { nativeResolution: { width: Math.floor(width), height: Math.floor(height) } };
   };

   BaseLoader.aspectRatio = function (ratio) {
     if (typeof ratio !== 'number')
       throw new Error("Aspect ratio must be a number");
     return { aspectRatio: ratio };
   };

   BaseLoader.scale = function (scale) {
     return { scale: scale };
   };

   BaseLoader.sampleRate = function (rate) {
     return { sample_rate: rate };
   };

   BaseLoader.muted = function (muted) {
     return { muted: muted };
   };

   BaseLoader.mountZip = function (drive, file) {
     return { files: [{ drive: drive,
                        mountpoint: "/" + drive,
                        file: file
                      }] };
   };

   BaseLoader.mountFile = function (filename, file) {
     return { files: [{ mountpoint: filename,
                        file: file
                      }] };
   };

   BaseLoader.fetchFile = function (title, url) {
     return { title: title, url: url, optional: false };
   };

   BaseLoader.fetchOptionalFile = function (title, url) {
     return { title: title, url: url, optional: true };
   };

   BaseLoader.localFile = function (title, data) {
     return { title: title, data: data };
   };

   /**
    * DosBoxLoader
    */
   function DosBoxLoader() {
     var config = Array.prototype.reduce.call(arguments, extend);
     config.emulator_arguments = build_dosbox_arguments(config.emulatorStart, config.files, config.extra_dosbox_args);
     config.runner = EmscriptenRunner;
     return config;
   }
   DosBoxLoader.__proto__ = BaseLoader;

   DosBoxLoader.startExe = function (path) {
     return { emulatorStart: path };
   };

   DosBoxLoader.extraArgs = function (args) {
     return { extra_dosbox_args: args };
   };

   DosBoxLoader.mountZip = function (drive, file, drive_type) {
     //  driver type: hdd, floppy, cdrom
     return { files: [{ drive: drive,
                        mountpoint: "/" + drive,
                        file: file,
                        drive_type: drive_type || "hdd",
                      }] };
   };

   /**
    * PC98DosBoxLoader
    */
   function PC98DosBoxLoader() {
    var config = Array.prototype.reduce.call(arguments, extend);
    config.emulator_arguments = build_dosbox_arguments(config.emulatorStart, config.files, config.extra_dosbox_args);
    config.runner = PC98DosBoxRunner;
    return config;
  }
  PC98DosBoxLoader.__proto__ = DosBoxLoader;

   /**
    * MAMELoader
    */
   function MAMELoader() {
     var config = Array.prototype.reduce.call(arguments, extend);
     config.emulator_arguments = build_mame_arguments(config.muted, config.mame_driver,
                                                      config.nativeResolution, config.sample_rate,
                                                      config.peripheral, config.autoboot,
                                                      config.extra_mame_args, config.keep_aspect,
                                                      config.scale);
     config.runner = MAMERunner;
     return config;
   }
   MAMELoader.__proto__ = BaseLoader;

   MAMELoader.driver = function (driver) {
     return { mame_driver: driver };
   };

   MAMELoader.peripheral = function (peripheral, game) {
     var p = {};
     p[peripheral] = [game];
     return { peripheral: p };
   };

   MAMELoader.keepAspect = function (keep) {
     return { keep_aspect: !!keep };
   };

   MAMELoader.extraArgs = function (args) {
     return { extra_mame_args: args };
   };

   MAMELoader.autoboot = function (path) {
    return { autoboot: path };
   };

   /**
    * VICELoader
    */
    function VICELoader() {
      var config = Array.prototype.reduce.call(arguments, extend);
      if (config.fliplist) {
          VICELoader._create_fliplist_file(config.files, config.fliplist);
      }
      config.emulator_arguments = build_vice_arguments(config.emulatorStart, config.files, config.fliplist, config.extra_vice_args);
      config.runner = EmscriptenRunner;
      return config;
    }
    VICELoader.__proto__ = BaseLoader;

    VICELoader.autoLoad = function (path) {
     return { emulatorStart: path };
    };
    VICELoader.extraArgs = function (args) {
      return { extra_vice_args: args };
    };
    VICELoader.fliplist = function(fliplist) {
        return { fliplist: fliplist };
    };
    VICELoader._create_fliplist_file = function(files, fliplists) {
       var fliplist = "# Vice fliplist file\n\n";
       fliplists.forEach(function(drive_fliplist, i) {
           if(drive_fliplist) {
               drive_fliplist = drive_fliplist.reverse();
               fliplist += "UNIT " + (i + 8).toString() + "\n";
               drive_fliplist.forEach(function(disk_image) {
                   fliplist += "/emulator/" + disk_image + "\n";
               });
           }
       });
       files.push(VICELoader.mountFile('/metadata_fliplist.vfl', VICELoader.localFile("Fliplist", fliplist)).files[0]);
    };

   /**
    * SAELoader
    */

   function SAELoader() {
     var config = Array.prototype.reduce.call(arguments, extend);
     config.runner = SAERunner;
     return config;
   }
   SAELoader.__proto__ = BaseLoader;

   SAELoader.model = function (model) {
     return { amigaModel: model };
   };

   SAELoader.fastMemory = function (megabytes) {
     return { fast_memory: megabytes << 20 };
   };

   SAELoader.rom = function (filenames) {
     if (typeof filenames == "string")
       filenames = [filenames];
     return { rom: filenames[0], extRom: filenames[1] };
   };

   SAELoader.floppy = function (index, filename) {
     var f = {};
     f[index] = filename;
     return { floppy: f };
   };

   SAELoader.ntsc = function (v) {
     return { ntsc: !!v };
   };

   /**
    * PCELoader
    */

   function PCELoader() {
     var config = Array.prototype.reduce.call(arguments, extend);
     config.emulator_arguments = ["-c", "/emulator/pce-"+ config.pceModel +".cfg"];
     if (config.extra_pce_args && config.extra_pce_args.length > 0) {
       config.emulator_arguments = config.emulator_arguments.concat(config.extra_pce_args);
     }
     config.runner = EmscriptenRunner;
     return config;
   }
   PCELoader.__proto__ = BaseLoader;

   PCELoader.model = function (model) {
     return { pceModel: model };
   };

   PCELoader.extraArgs = function (args) {
     return { extra_pce_args: args };
   };

   /**
    * RuffleLoader
    */
   function RuffleLoader () {
     var config = Array.prototype.reduce.call(arguments, extend);
     config.runner = RuffleRunner;
     return config;
   }

   RuffleLoader.__proto__ = BaseLoader;

   RuffleLoader.swf_file_name = function (file_name) {
     return { swf_file_name: file_name };
   };

   /**
    * NP2Loader
    * for the NEC PC-9800
    *
    * TODO(db48x): Supposedly NP2, xmil, and Mini vMac were all by the
    * same author? Looking at it again I’m not so sure. Anyway, they
    * were all super simple to configure so this code is largely
    * shared between them.
    */
   function NP2Loader() {
     var config = Array.prototype.reduce.call(arguments, extend);
     if (!config.emulatorStart) {
       throw new Error("You must specify an autoLoad value in order to start this emulator. Try the name of the disk image.");
     }
     config.emulator_arguments = build_np2_arguments(config.emulatorStart, config.files, config.extra_np2_args);
     config.runner = NP2Runner;
     return config;
   }
   NP2Loader.__proto__ = BaseLoader;

   NP2Loader.autoLoad = function (path) {
     return { emulatorStart: path };
   };
   NP2Loader.extraArgs = function (args) {
     return { extra_np2_args: args };
   };

   /**
    * vMacLoader
    * early Mac computers on 680x0
    */
   function vMacLoader() {
     var config = Array.prototype.reduce.call(arguments, extend);
     if (!config.emulatorStart) {
       throw new Error("You must specify an autoLoad value in order to start this emulator. Try the name of the disk image.");
     }
     config.emulator_arguments = build_vmac_arguments(config.emulatorStart, config.files, config.extra_np2_args);
     config.runner = NP2Runner;
     return config;
   }
   vMacLoader.__proto__ = NP2Loader;

   /**
    * CloudpiltLoader
    */
   function CloudpilotLoader() {
     var config = Array.prototype.reduce.call(arguments, extend);
     config.runner = CloudpilotRunner;
     return config;
   }
   CloudpilotLoader.roms = function (filenames) {
     if (typeof filenames == "string") {
       filenames = [filenames];
     }
     var roms = {};
     // Assume one .bin file (Palm BIOS ROM), and one .img file (freshly booted session image).
     roms.bios = filenames.find((f) => f.match(/\.bin$/i));
     roms.session = filenames.find((f) => f.match(/\.img$/i));
     return roms;
   };
   CloudpilotLoader.prc = function (filename) {
     return { prc: filename };
   };
   CloudpilotLoader.__proto__ = BaseLoader;

   /**
    * V86Loader
    */
   function V86Loader() {
     var config = Array.prototype.reduce.call(arguments, extend);
     config.memory_size = config.memory_size || 32;
     config.vga_memory_size = config.vga_memory_size || 2;
     config.boot_order = config.boot_order || 0x213;
     config.runner = V86Runner;
     return config;
   }
   V86Loader.__proto__ = BaseLoader;

   V86Loader.bios = function (filename) {
     return {"bios": {"path": filename}};
   };

   V86Loader.vgaBios = function (filename) {
     return {"vga_bios": {"path": filename}};
   };

   V86Loader.fda = function (filename) {
     return {"fda": {"path": filename}};
   };

   V86Loader.fdb = function (filename) {
     return {"fdb": {"path": filename}};
   };

   V86Loader.hda = function (filename) {
     return {"hda": {"path": filename}};
   };

   V86Loader.hdb = function (filename) {
     return {"hda": {"path": filename}};
   };

   V86Loader.cdrom = function (filename) {
     return {"cdrom": {"path": filename}};
   };

   V86Loader.bootOrder = function (order) {
     return {"boot_order": order};
   };

   V86Loader.acpi = function (enabled) {
     return {"acpi": !!enabled};
   };

   V86Loader.memorySize = function (amount) {
     return {"memory_size": amount};
   };

   V86Loader.vgaMemorySize = function (amount) {
     return {"vga_memory_size": amount};
   };

   var build_mame_arguments = function (muted, driver, native_resolution, sample_rate, peripheral, autoboot, extra_args, keepaspect, scale) {
     scale = scale || 1;
     var args = [driver,
                 '-verbose',
                 '-rompath', 'emulator',
                 '-window',
                 keepaspect ? '-keepaspect' : '-nokeepaspect'];

     if (native_resolution && "width" in native_resolution && "height" in native_resolution) {
       args.push('-resolution', [native_resolution.width * scale, native_resolution.height * scale].join('x'));
     }

     if (sample_rate) {
       args.push('-samplerate', sample_rate);
     }

     if (autoboot) {
       args.push('-autoboot_command', autoboot+'\\n', '-autoboot_delay', '2');
     }

     if (extra_args) {
       args = args.concat(extra_args);
     }

     if (peripheral) {
       for (var p in peripheral) {
         if (Object.prototype.propertyIsEnumerable.call(peripheral, p)) {
           args.push('-' + p,
                     '/emulator/'+ (peripheral[p][0].replace(/\//g,'_')));
         }
       }
     }

     return args;
   };

   var build_dosbox_arguments = function (emulator_start, files, extra_args) {
     var args = ['-conf', '/emulator/dosbox.conf'];

     var len = files.length;
     for (var i = 0; i < len; i++) {
       if ('drive' in files[i]) {
        //  See also https://www.dosbox.com/wiki/MOUNT
         if(files[i].drive_type==='hdd'){
          args.push('-c', 'mount '+ files[i].drive +' /emulator'+ files[i].mountpoint);
         }
         else if(files[i].drive_type==='floppy'){
          args.push('-c', 'mount '+ files[i].drive +' /emulator'+ files[i].mountpoint + ' -t floppy');
         }
         else if(files[i].drive_type==='cdrom'){
          args.push('-c', 'mount '+ files[i].drive +' /emulator'+ files[i].mountpoint + ' -t cdrom');
         }
       }
     }

     if (extra_args) {
       args = args.concat(extra_args);
     }

     var path = emulator_start.split(/\\|\//); // I have LTS already
     args.push('-c', /^[a-zA-Z]:$/.test(path[0]) ? path.shift() : 'c:');
     var prog = path.pop();
     if (path && path.length)
       args.push('-c', 'cd '+ path.join('/'));
     args.push('-c', prog);

     return args;
   };

   var build_vice_arguments = function (emulator_start, files, fliplist, extra_args) {
     var args = emulator_start ? ["-autostart", "/emulator/" + emulator_start] : [];
     if (fliplist[0] || fliplist[1] || fliplist[2] || fliplist[3]) {
       args = args.concat(["-flipname", "/emulator/metadata_fliplist.vfl"]);
     }
     if (extra_args) {
       args = args.concat(extra_args);
     }
     return args;
   };

   var build_np2_arguments = function (emulator_start, files, extra_args) {
     var args = emulator_start ? [emulator_start] : [];
     if (extra_args) {
       args = args.concat(extra_args);
     }
     return args;
   };

   var build_vmac_arguments = function (emulator_start, files, extra_args) {
     var args = files.map((f) => '/emulator' + f.mountpoint)
                     .filter((f) => f != emulator_start && f != '/emulator/minivmac');
     if (emulator_start) {
       args.unshift(emulator_start);
     }
     if (extra_args) {
       args = args.concat(extra_args);
     }
     return args;
   };

   /*
    * EmscriptenRunner
    */
   function EmscriptenRunner(canvas, game_data) {
     var self = this;
     this._canvas = canvas;
     this._hooks = { start: [], reset: [] };
     // This is somewhat wrong, because our Emscripten-based emulators
     // are currently compiled to start immediately when their js file
     // is loaded.
     Module = { arguments: game_data.emulator_arguments,
                screenIsReadOnly: true,
                print: function (text) { console.log(text); },
                printErr: function (text) { console.log(text); },
                canvas: canvas,
                noInitialRun: false,
                locateFile: game_data.locateAdditionalJS,
                wasmBinary: game_data.wasmBinary,
                preInit: function () {
                           // Re-initialize BFS to just use the writable in-memory storage.
                           BrowserFS.initialize(game_data.fs);
                           var BFS = new BrowserFS.EmscriptenFS();
                           // Mount the file system into Emscripten.
                           FS.mkdir('/emulator');
                           FS.mount(BFS, {root: '/'}, '/emulator');
                         },
                preRun: [function () {
                            self._hooks.start.forEach(function (f) {
                                                        //try {
                                                          f && f();
                                                        //} catch(x) {
                                                        //  console.warn(x);
                                                        //}
                                                      });
                          }]
              };
   }

   EmscriptenRunner.prototype.start = function () {
   };

   // MAW: engines advertise whether they can really freeze and resume. This one
   // cannot: pause() is a no-op here, and the sync EM-DOSBox build's main loop
   // can be frozen but not restarted. Emulator.pause() checks this so callers
   // never get a pause that silently does nothing (or cannot be undone).
   EmscriptenRunner.prototype.canPause = false;
   EmscriptenRunner.prototype.pause = function () {
   };

   EmscriptenRunner.prototype.stop = function () {
   };

   EmscriptenRunner.prototype.mute = function () {
     try {
       if (!SDL_PauseAudio)
         SDL_PauseAudio = Module.cwrap('SDL_PauseAudio', '', ['number']);
       SDL_PauseAudio(true);
     } catch (x) {
       console.log("Unable to change audio state:", x);
     }
   };

   EmscriptenRunner.prototype.unmute = function () {
     try {
       if (!SDL_PauseAudio)
         SDL_PauseAudio = Module.cwrap('SDL_PauseAudio', '', ['number']);
       SDL_PauseAudio(false);
     } catch (x) {
       console.log("Unable to change audio state:", x);
     }
   };

   EmscriptenRunner.prototype.onStarted = function (func) {
     this._hooks.start.push(func);
   };

   EmscriptenRunner.prototype.onReset = function (func) {
     this._hooks.reset.push(func);
   };

   EmscriptenRunner.prototype.requestFullScreen = function () {
     this._canvas.requestFullscreen();
   };

   /*
    * PC98DosBoxRunner
    */
   function PC98DosBoxRunner() {
     return EmscriptenRunner.apply(this, arguments);
   }
   PC98DosBoxRunner.prototype = Object.create(EmscriptenRunner.prototype);
   PC98DosBoxRunner.prototype.start = function () {
     FS.symlink('/emulator/y/FONT.ROM', '/FONT.ROM');
     FS.symlink('/emulator/y/2608_bd.wav', '/2608_bd.wav');
     FS.symlink('/emulator/y/2608_hh.wav', '/2608_hh.wav');
     FS.symlink('/emulator/y/2608_sd.wav', '/2608_sd.wav');
     FS.symlink('/emulator/y/2608_rim.wav', '/2608_rim.wav');
     FS.symlink('/emulator/y/2608_tom.wav', '/2608_tom.wav');
     FS.symlink('/emulator/y/2608_top.wav', '/2608_top.wav');
   };

   /*
   * NP2Runner
   */
   function NP2Runner() {
     return EmscriptenRunner.apply(this, arguments);
   }
   NP2Runner.prototype = Object.create(EmscriptenRunner.prototype);
   NP2Runner.prototype.start = function () {
     try {
       var configFile = FS.readFile('/emulator/np2.cfg');
       FS.writeFile('/emulator/np2/np2.cfg', configFile);
     } catch (ex) {
       //If the user config file not found, NP2 will use default settings
       console.log(ex);
     }
   };

   /*
    * MAMERunner
    */
   function MAMERunner() {
     return EmscriptenRunner.apply(this, arguments);
   }
   MAMERunner.prototype = Object.create(EmscriptenRunner.prototype,
                                        { mute: { value: function () {
                                                           var machine = Module.__ZN15running_machine30emscripten_get_running_machineEv();
                                                           var soundmgr = Module.__ZN15running_machine20emscripten_get_soundEv(machine);
                                                           Module.__ZN13sound_manager4muteEbh(soundmgr, true, 0x02); // MUTE_REASON_UI
                                                         },
                                                },
                                          unmute: { value: function () {
                                                             var machine = Module.__ZN15running_machine30emscripten_get_running_machineEv();
                                                             var soundmgr = Module.__ZN15running_machine20emscripten_get_soundEv(machine);
                                                             Module.__ZN13sound_manager4muteEbh(soundmgr, false, 0x02); // MUTE_REASON_UI
                                                           },
                                                  },
                                        });

   /*
    * SAERunner
    */
   function SAERunner(canvas, game_data) {
     this._sae = new ScriptedAmigaEmulator();
     this._cfg = this._sae.getConfig();
     this._canvas = canvas;

     var model = null;
     switch (game_data.amigaModel) {
       case "A500": model = SAEC_Model_A500; break;
       case "A500P": model = SAEC_Model_A500P; break;
       case "A600": model = SAEC_Model_A600; break;
       case "A1000": model = SAEC_Model_A1000; break;
       case "A1200": model = SAEC_Model_A1200; break;
       case "A2000": model = SAEC_Model_A2000; break;
       case "A3000": model = SAEC_Model_A3000; break;
       case "A4000": model = SAEC_Model_A4000; break;
       case "A4000T": model = SAEC_Model_A4000T; break;
       /*  future. do not use. cd-emulation is not implemented yet.
       case "CDTV": model = SAEC_Model_CDTV; break;
       case "CD32": model = SAEC_Model_CD32; break; */
     }
     this._sae.setModel(model, 0);
     this._cfg.memory.z2FastSize = game_data.fastMemory || 2 << 20;
     this._cfg.floppy.speed = SAEC_Config_Floppy_Speed_Turbo;
     this._cfg.video.id = canvas.getAttribute("id");

     if (game_data.nativeResolution && game_data.nativeResolution.height == 360 && game_data.nativeResolution.width == 284)
     {
       this._cfg.video.hresolution = SAEC_Config_Video_HResolution_LoRes;
       this._cfg.video.vresolution = SAEC_Config_Video_VResolution_NonDouble;
       this._cfg.video.size_win.width = SAEC_Video_DEF_AMIGA_WIDTH; /* 360 */
       this._cfg.video.size_win.height = SAEC_Video_DEF_AMIGA_HEIGHT; /* 284 */
     }
     else if (game_data.nativeResolution && game_data.nativeResolution.height == 1440 && game_data.nativeResolution.width == 568)
     {
       this._cfg.video.hresolution = SAEC_Config_Video_HResolution_SuperHiRes;
       this._cfg.video.vresolution = SAEC_Config_Video_VResolution_Double;
       this._cfg.video.size_win.width = SAEC_Video_DEF_AMIGA_WIDTH << 2; /* 1440 */
       this._cfg.video.size_win.height = SAEC_Video_DEF_AMIGA_HEIGHT << 1; /* 568 */
     }
     else
     {
       this._cfg.video.hresolution = SAEC_Config_Video_HResolution_HiRes;
       this._cfg.video.vresolution = SAEC_Config_Video_VResolution_Double;
       this._cfg.video.size_win.width = SAEC_Video_DEF_AMIGA_WIDTH << 1; /* 720 */
       this._cfg.video.size_win.height = SAEC_Video_DEF_AMIGA_HEIGHT << 1; /* 568 */
     }

     this._cfg.memory.rom.name = game_data.rom;
     this._cfg.memory.rom.data = game_data.fs.readFileSync('/'+game_data.rom, null, flag_r);
     this._cfg.memory.rom.size = this._cfg.memory.rom.data.length;

     if (game_data.extRom) {
       this._cfg.memory.extRom.name = game_data.extRom;
       this._cfg.memory.extRom.data = game_data.fs.readFileSync('/'+game_data.extRom, null, flag_r);
       this._cfg.memory.extRom.size = this._cfg.memory.extRom.data.length;
     }

     for (var i = 0; i < Object.keys(game_data.floppy).length; i++) {
       this._cfg.floppy.drive[i].file.name = game_data.floppy[i];
       this._cfg.floppy.drive[i].file.data = game_data.fs.readFileSync('/' + game_data.floppy[i], null, flag_r);
       this._cfg.floppy.drive[i].file.size = this._cfg.floppy.drive[i].file.data.length;
     }
   }

   SAERunner.prototype.start = function () {
     var err = this._sae.start();
   };

   // MAW: the engine's pause() is a toggle — pause(true) freezes, pause(false)
   // resumes. Calling it with no argument (as this did) could only ever resume.
   SAERunner.prototype.canPause = true;
   SAERunner.prototype.pause = function (state) {
     this._sae.pause(state === undefined ? true : !!state);
   };

   SAERunner.prototype.stop = function () {
     this._sae.stop();
   };

   SAERunner.prototype.mute = function () {
     var err = this._sae.mute(true);
     if (err) {
       console.warn("unable to mute; SAE error number", err);
     }
   };

   SAERunner.prototype.unmute = function () {
     var err = this._sae.mute(false);
     if (err) {
       console.warn("unable to unmute; SAE error number", err);
     }
   };

   SAERunner.prototype.onStarted = function (func) {
     this._cfg.hook.event.started = func;
   };

   SAERunner.prototype.onReset = function (func) {
     this._cfg.hook.event.reseted = func;
   };

   SAERunner.prototype.requestFullScreen = function () {
     getfullscreenenabler().call(this._canvas);
   };

   /*
    * V86Runner
    */
   function V86Runner(canvas, game_data) {
     // v86 needs a specific DOM structure instead of a canvas
     var screenContainerOuterElt = document.createElement("div");
     screenContainerOuterElt.id = canvas.id;
     screenContainerOuterElt.classList = canvas.classList;
     screenContainerOuterElt.style = canvas.style;

     var screenContainerInnerElt = document.createElement("div");
     screenContainerInnerElt.classList = ["emularity-v86-screen-container"];
     screenContainerInnerElt.style = "display:flex;justify-content:center;align-items:center;background-color:#000;";

     var textDivElt = document.createElement("div");
     textDivElt.classList = ["emularity-v86-screen-text"];
     textDivElt.style = "font-size:14px;font-family:monospace;line-height:14px;white-space:pre;";
     var canvasElt = document.createElement("canvas");
     canvasElt.classList = ["emularity-v86-screen-canvas"];
     canvasElt.style = "display:none;";

     screenContainerInnerElt.appendChild(textDivElt);
     screenContainerInnerElt.appendChild(canvasElt);
     screenContainerOuterElt.appendChild(screenContainerInnerElt);
     canvas.parentNode.replaceChild(screenContainerOuterElt, canvas);

     var cfg = {};
     cfg.screen_container = screenContainerInnerElt;
     cfg.memory_size = Math.floor(game_data.memory_size * 1024 * 1024);
     cfg.vga_memory_size = Math.floor(game_data.vga_memory_size * 1024 * 1024);
     cfg.acpi = game_data.acpi;
     cfg.boot_order = game_data.boot_order;

     cfg.autostart = true;
     cfg.wasm_fn = env => {
       return new Promise(async resolve => {
         const wasm = await WebAssembly.instantiate(game_data.wasmBinary, env);
         resolve(wasm.instance.exports);
       });
     };

     ["bios", "vga_bios", "fda", "fdb", "cdrom", "hda", "hdb"].forEach(key => {
       if (game_data[key] && game_data[key]["path"]) {
         cfg[key] = { buffer: game_data.fs.readFileSync('/' + game_data[key]["path"], null, flag_r).buffer, };
       }
     });

     var emu = new V86Starter(cfg);
     this._emulator = emu;
     this.ready = null;

     if (game_data["scale"]) {
       emu.screen_set_scale(game_data["scale"], game_data["scale"]);
     }

     screenContainerInnerElt.addEventListener('click',
                                              function (e) {
                                                emu.lock_mouse();
                                              });
   }

   V86Runner.prototype.start = function () {
     this._emulator.run();
   };

   V86Runner.prototype.pause = function () {
     this._emulator.stop();
   };

   V86Runner.prototype.stop = function () {
     this._emulator.stop();
   };

   V86Runner.prototype.mute = function () {
     if (this._emulator.is_muted) {
       this._emulator.speaker_adapter.mixer.set_volume(1, undefined);
       this._emulator.is_muted = false;
     }
   };

   V86Runner.prototype.unmute = function () {
     if (!this._emulator.is_muted) {
       this._emulator.speaker_adapter.mixer.set_volume(0, undefined);
       this._emulator.is_muted = true;
     }
   };

   V86Runner.prototype.onStarted = function (func) {
     this._emulator.add_listener("emulator-started", func);
   };

   V86Runner.prototype.onReset = function (func) {
     // not supported
   };

   V86Runner.prototype.requestFullScreen = function () {
     getfullscreenenabler().call(this._canvas);
   };

   /*
    * RuffleRunner
    */
   function RuffleRunner(canvas, game_data) {
     if (!game_data.swf_file_name) {
       let url = game_data.files[0].file.url;
       game_data.swf_file_name = url.slice(url.lastIndexOf('/'));
     }
     // read game data from file system
     let gamedata = game_data.fs.readFileSync(game_data.swf_file_name, null, flag_r);
     this.ready = null;

     let ruffle = RufflePlayer.newest();
     let player = ruffle.createPlayer();
     player.addEventListener('loadedmetadata', () => {
       player.style.width = player.metadata.width + "px";
       player.style.height = player.metadata.height + "px";
     });
     this._player = player;

     // copy atributes of canvas to player div
     for (let el of canvas.attributes){
       player.setAttribute(el.localName, el.nodeValue);
     }

     canvas.parentElement.replaceChild(player, canvas);
     player.load({ data: gamedata,
                   swfFileName: game_data.swf_file_name.replace('/', ''),
                   splashScreen: false
                 })
           .then(() => {
                   this.ready(); // clear screen
                 });
   }

   RuffleRunner.prototype.requestFullScreen = function () {
     this._player.enterFullscreen();
   };

   RuffleRunner.prototype.onReset =  function (func) {
   };

   RuffleRunner.prototype.start =  function (func) {
   };

   RuffleRunner.prototype.onStarted =  function (func) {
     this.ready = func;
   };

   RuffleRunner.prototype.mute = function() {
     this._player.volume = 0;
   };

   RuffleRunner.prototype.unmute = function() {
     this._player.volume = 1;
   };

   /*
    * CloudpilotRunner
    */
   function CloudpilotRunner(canvas, game_data) {
     // Assume we have one of each: *.bin (BIOS ROM), *.img (session image), *.prc (app database)
     if (game_data.bios) {
       this._biosFile = game_data.fs.readFileSync("/" + game_data.bios, null, flag_r);
     }
     if (game_data.session) {
       this._sessionFile = game_data.fs.readFileSync("/" + game_data.session, null, flag_r);
     }
     if (game_data.prc) {
       if (game_data.prc.match(/\.zip$/i)) {
         this._prcZip = game_data.fs.readFileSync("/" + game_data.prc, null, flag_r);
         this._prcFileName = game_data.prc.replace(/\.zip$/i, '.prc');
       } else {
         this._prcFile = game_data.fs.readFileSync("/" + game_data.prc, null, flag_r);
       }
     }
     this._canvas = canvas;
   }

   CloudpilotRunner.prototype.onReset =  function (func) {
   };

   CloudpilotRunner.prototype.start =  function (func) {
     var runner = this;
     cloudpilot.createEmulator()
               .then(function(emulator) {
                       emulator
                         .setCanvas(runner._canvas)
                         .bindInput(runner._canvas, runner._canvas);

                         if (runner._sessionFile && runner._prcFile) {
                           // Load booted image and install app.
                           emulator
                             .loadSession(runner._sessionFile)
                             .installAndLaunchDatabase(runner._prcFile);
                         } else if (runner._sessionFile && runner._prcZip) {
                           // Load booted image and install app.
                           emulator
                             .loadSession(runner._sessionFile)
                             .installFromZipfileAndLaunch(runner._prcZip, runner._prcFileName);
                         } else if (runner._biosFile) {
                           // Missing app .prc; load initial BIOS directly (Palm setup process).
                           emulator.loadRom(runner._biosFile);
                         }
                       emulator.resume();
                       runner._canvas.tabIndex = 0;
                       runner._canvas.style.outline = 0;
                       runner._canvas.focus();
                       runner._emulator = emulator;
                    });
   };

   CloudpilotRunner.prototype.onStarted =  function (func) {
     func();
   };

   CloudpilotRunner.prototype.mute = function() {
     if (this._emulator) {
       this._emulator.setVolume(0);
     }
   };

   CloudpilotRunner.prototype.unmute = function() {
     if (this._emulator) {
       if (!this._emulator.isAudioInitialized()) {
         this._emulator.initializeAudio();
       }
       this._emulator.setVolume(1);
     }
   };

   CloudpilotRunner.prototype.requestFullScreen = function () {
     getfullscreenenabler().call(this._canvas);
   };

   /**
    * Emulator
    */
   function Emulator(canvas, callbacks, loadFiles) {
     if (typeof callbacks !== 'object') {
       callbacks = { before_emulator: null,
                     before_run: callbacks };
     }
     var js_url;
     var requests = [];
     var drawloadingtimer;
     // TODO: Have an enum value that communicates the current state of the emulator, e.g. 'initializing', 'loading', 'running'.
     var has_started = false;
     var loading = false;
     var defaultSplashColors = { foreground: 'white',
                                 background: 'black',
                                 failure: 'red' };
     var splash = { loading_text: "",
                    spinning: true,
                    finished_loading: false,
                    colors: defaultSplashColors,
                    table: null,
                    splashimg: new Image() };

     var runner;

     var muted = false;
     var paused = false;

     // MAW: this game's save store, set once start() has built the file
     // system: fs is the writable layer (the saves), overlay what the game
     // sees, keep/skip the files in fs that aren't saves, drives the mounted
     // drive folders, tree the shipped layout (once the zips are mounted).
     var store = null;

     function ready_store() {
       return store && store.tree ? Promise.resolve(store)
                                  : Promise.reject(new Error("The game's file system is not ready yet"));
     }

     this.isFileSystemReady = function () { return !!(store && store.tree); };

     // MAW: the saves as a .zip Blob. Works while running and after stop().
     this.exportSaves = function () {
       return ready_store().then(export_saves);
     };

     // MAW: writes a zip from exportSaves() back into the save store, fitting
     // paths to this archive if the zip came from another version. Resolves
     // with { count, moved, kept, parked }. The running game won't notice
     // (DOSBox caches directories), so restart it.
     this.importSaves = function (zip) {
       return ready_store().then(function (s) { return import_saves(s, zip); });
     };

     // MAW: the game's disk (shipped files plus the player's changes) as a
     // .zip Blob.
     this.exportDisk = function () {
       return ready_store().then(export_disk);
     };

     // MAW: puts the shipped files back, keeping files the game made. Call it
     // after stop(), then boot a new Emulator.
     this.resetGameFiles = function () {
       return ready_store().then(function (s) {
         return settle(s).then(function () { return reset_game_files(s); });
       });
     };

     // MAW: deletes everything the player changed or made. Call it after
     // stop(), then boot a new Emulator.
     this.resetSaves = function () {
       return ready_store().then(function (s) {
         return settle(s).then(function () { return reset_saves(s); });
       });
     };

     // MAW: freeze the emulation in place, keeping the session alive (unlike
     // stop(), which tears it down). Only engines that advertise canPause can
     // do this — canPause() reports whether it is available, so a host can hide
     // or disable its Pause control instead of offering one that does nothing.
     this.canPause = function () { return !!(runner && runner.canPause); };
     this.isPaused = function () { return paused; };
     this.pause = function () { return this.setPause(true); };
     this.resume = function () { return this.setPause(false); };
     this.togglePause = function () { return this.setPause(!paused); };
     this.setPause = function (state) {
       state = !!state;
       if (!this.canPause() || state === paused) {
         return this;
       }
       runner.pause(state);
       paused = state;
       return this;
     };

     var SDL_PauseAudio;
     this.isMuted = function () { return muted; };
     this.mute = function () { return this.setMute(true); };
     this.unmute = function () { return this.setMute(false); };
     this.toggleMute = function () { return this.setMute(!muted); };
     this.setMute = function (state) {
       muted = state;
       if (runner) {
         if (state) {
           runner.mute();
         } else {
           runner.unmute();
         }
       }
       else {
         try {
           if (!SDL_PauseAudio)
             SDL_PauseAudio = Module.cwrap('SDL_PauseAudio', '', ['number']);
           SDL_PauseAudio(state);
         } catch (x) {
           console.log("Unable to change audio state:", x);
         }
       }
       return this;
     };

     // This is the bare minimum that will allow gamepads to work. If
     // we don't listen for them then the browser won't tell us about
     // them.
     // TODO: add hooks so that some kind of UI can be displayed.
     window.addEventListener("gamepadconnected",
                             function (e) {
                               console.log("Gamepad connected at index %d: %s. %d buttons, %d axes.",
                                           e.gamepad.index, e.gamepad.id,
                                           e.gamepad.buttons.length, e.gamepad.axes.length);
                             });

     window.addEventListener("gamepaddisconnected",
                             function (e) {
                               console.log("Gamepad disconnected from index %d: %s",
                                           e.gamepad.index, e.gamepad.id);
                             });

     var css_resolution, aspectRatio;
     // right off the bat we set the canvas's inner dimensions to
     // whatever it's current css dimensions are; this isn't likely to be
     // the same size that dosbox/jsmame will set it to, but it avoids
     // the case where the size was left at the default 300x150
     if (!canvas.hasAttribute("width")) {
       var style = getComputedStyle(canvas);
       canvas.width = parseInt(style.width, 10);
       canvas.height = parseInt(style.height, 10);
     }

     this.setScale = function(_scale) {
       console.warn("setScale method is deprecated; use the BaseLoader.scale method instead");
       return this;
     };

     this.setSplashImage = function(_splashimg) {
       if (_splashimg) {
         if (_splashimg instanceof Image) {
           if (splash.splashimg.parentNode) {
             splash.splashimg.src = _splashimg.src;
           } else {
             splash.splashimg = _splashimg;
           }
         } else {
           splash.splashimg.src = _splashimg;
         }
       }
       return this;
     };

     this.setCSSResolution = function(_resolution) {
       css_resolution = _resolution;
       return this;
     };

     this.setAspectRatio = function(_aspectRatio) {
       aspectRatio = _aspectRatio;
       return this;
     };

     this.setCallbacks = function(_callbacks) {
       if (typeof _callbacks !== 'object') {
         callbacks = { before_emulator: null,
                       before_run: _callbacks };
       } else {
         callbacks = _callbacks;
       }
       return this;
     };

     this.setSplashColors = function (colors) {
       splash.colors = colors;
       return this;
     };

     // MAW: lets the host set the splash title text (e.g. "Loading game
     // archive") after start(). splash.setTitle is defined further down.
     this.setSplashTitle = function (title) {
       splash.setTitle(title);
       return this;
     };

     // MAW: aborts any in-flight downloads and asks the runner to stop. Heavy
     // teardown of an Emscripten engine (force-exit + canvas swap) is the
     // caller's job — see EmulatorControls. Safe to call before start().
     this.stop = function () {
       for (var i = 0; i < requests.length; i++) {
         if (requests[i] && requests[i].xhr) {
           try { requests[i].xhr.abort(); } catch (e) {}
         }
       }
       if (runner) {
         try { runner.stop(); } catch (e) {}
       }
       paused = false;
       return this;
     };

     this.setLoad = function (loadFunc) {
       loadFiles = loadFunc;
       return this;
     };

     var start = function (options) {
       if (has_started)
         return false;
       has_started = true;
       var defaultOptions = { waitAfterDownloading: false,
                              hasCustomCSS: false,
                              // MAW: where the fork's own assets live, and an
                              // outright replacement for the splash logo. Both
                              // default to the auto-detected base path.
                              basePath: undefined,
                              splashImage: undefined };
       if (typeof options !== 'object') {
         options = defaultOptions;
       } else {
         options.__proto__ = defaultOptions;
       }

       var k, c, game_data;
       setupSplash(canvas, splash, options);
       drawsplash(options);

       var loading;

       if (typeof loadFiles === 'function') {
         loading = loadFiles(fetch_file, splash);
       } else {
         loading = Promise.resolve(loadFiles);
       }
       loading.then(function (_game_data) {
                      return new Promise(function(resolve, reject) {
                        var storeKey = "fileSystemKey" in _game_data ? _game_data.fileSystemKey
                                                                     : "emularity";
                        var InMemoryFS = BrowserFS.FileSystem.InMemory;
                        InMemoryFS.Create(function (e, inMemory) {
                          // If the browser supports IndexedDB storage, mirror writes to that storage
                          // for persistence purposes.
                          if (BrowserFS.FileSystem.IndexedDB.isAvailable()) {
                            var AsyncMirrorFS = BrowserFS.FileSystem.AsyncMirror,
                                IndexedDBFS = BrowserFS.FileSystem.IndexedDB;
                            IndexedDBFS.Create({ storeName: storeKey },
                                               function(e, idbfs) {
                                                 if (e) {
                                                   finish(e, inMemory);
                                                 } else {
                                                   AsyncMirrorFS.Create({ sync: inMemory, async: idbfs },
                                                                        finish);
                                                 }
                                               });
                          } else {
                            finish(e, inMemory);
                          }
                        });

                        function finish(e, deltaFS) {
                          game_data = _game_data;

                          // Any file system writes to MountableFileSystem will be written to the
                          // deltaFS, letting us mount read-only zip files into the MountableFileSystem
                          // while being able to "write" to them.
                          var MountableFS = BrowserFS.FileSystem.MountableFileSystem,
                              OverlayFS = BrowserFS.FileSystem.OverlayFS,
                              ZipFS = BrowserFS.FileSystem.ZipFS,
                              Buffer = BrowserFS.BFSRequire('buffer').Buffer;
                          MountableFS.Create(function (e, mountable) {
                            OverlayFS.Create({ readable: mountable
                                             , writable: deltaFS
                                             },
                                             function (e, fs) {
                                               if (e) {
                                                 console.error("Failed to initialize the OverlayFS:", e);
                                                 reject();
                                               } else {
                                                 game_data.fs = fs;
                                                 store = { fs: deltaFS,
                                                           overlay: fs,
                                                           keep: game_data.files
                                                                          .filter(function (f) { return f && f.file && !f.drive && f.mountpoint; })
                                                                          .map(function (f) { return f.mountpoint[0] != '/' ? '/'+ f.mountpoint : f.mountpoint; }),
                                                           drives: game_data.files
                                                                            .filter(function (f) { return f && f.file && f.drive; })
                                                                            .map(function (f) { return f.drive.toLowerCase(); }),
                                                           tree: null };
                                                 store.skip = SAVES_SKIP.concat(store.keep);
                                                 function fetch(file) {
                                                   var isCached = 'cached' in file && file.cached,
                                                       hasData = 'data' in file && file.data !== null && typeof file.data !== 'undefined';
                                                   if (isCached || hasData) {
                                                     return cached_file(file.title, file.data);
                                                   } else {
                                                     return fetch_file(file.title, file.url, 'arraybuffer', file.optional);
                                                   }
                                                 }
                                                 function mountat(drive) {
                                                   return function (data) {
                                                     if (data !== null) {
                                                       drive = drive.toLowerCase();
                                                       var mountpoint = '/'+ drive;
                                                       // Mount into RO MFS.
                                                       return new Promise(function (resolve, reject) {
                                                         return new ZipFS.Create({ zipData: new Buffer(data) },
                                                                                 function (e, fs) {
                                                                                   if (e) {
                                                                                     reject();
                                                                                   } else {
                                                                                     mountable.mount(mountpoint, fs);
                                                                                     resolve();
                                                                                   }
                                                                                 });
                                                       });
                                                     }
                                                   };
                                                 }
                                                 function saveat(filename) {
                                                   return function (data) {
                                                     if (data !== null) {
                                                       if (deltaFS.existsSync(filename)) {
                                                         return;
                                                       }
                                                       if (filename.includes('/', 1)) {
                                                         var parts = filename.substring(1).split('/');
                                                         for (var i = 1; i < parts.length; i++) {
                                                           var path = '/'+ parts.slice(0, i).join('/');
                                                           if (!deltaFS.existsSync(path)) {
                                                             deltaFS.mkdirSync(path, 0777);
                                                           }
                                                         }
                                                       }
                                                       deltaFS.writeFileSync(filename, new Buffer(data), null, flag_w, 0644);
                                                     }
                                                   };
                                                 }
                                                 var promises = game_data.files
                                                                         .map(function (f) {
                                                                                if (f && f.file) {
                                                                                  if (f.drive) {
                                                                                    return fetch(f.file).then(mountat(f.drive));
                                                                                  } else if (f.mountpoint) {
                                                                                    var path = f.mountpoint[0] != '/' ? '/'+ f.mountpoint : f.mountpoint;
                                                                                    f.file.cached = deltaFS.existsSync(path);
                                                                                    return fetch(f.file).then(saveat(path));
                                                                                  }
                                                                                }
                                                                                return null;
                                                                              });
                                                 // this is kinda wrong; it really only applies when we're loading something created by Emscripten
                                                 if ('emulatorWASM' in game_data && game_data.emulatorWASM && 'WebAssembly' in window) {
                                                   promises.push(fetch({ title: "WASM Binary", url: game_data.emulatorWASM }).then(function (data) { game_data.wasmBinary = data; }));
                                                 }
                                                 Promise.all(promises)
                                                        .then(function () {
                                                                // MAW: what the archive ships, then any saves
                                                                // from an older version of the game.
                                                                store.tree = list_tree(mountable);
                                                                return prepare_store(store, storeKey, game_data.fileSystemFamily);
                                                              })
                                                        .then(function (report) {
                                                                if (report && callbacks && typeof callbacks.saves_migrated === 'function') {
                                                                  try {
                                                                    callbacks.saves_migrated(report);
                                                                  } catch (x) {
                                                                    console.log(x);
                                                                  }
                                                                }
                                                              })
                                                        .then(resolve, reject);
                                               }
                                             });
                          });
                        }
                      });
                    })
              .then(function (game_files) {
                      if (!game_data || splash.failed_loading) {
                        return null;
                      }
                      if (options.waitAfterDownloading) {
                        return new Promise(function (resolve, reject) {
                                             splash.setTitle("Press any key to continue...");
                                             splash.spinning = false;

                                             // stashes these event listeners so that we can remove them after
                                             window.addEventListener('keypress', k = keyevent(resolve));
                                             canvas.addEventListener('click', c = resolve);
                                             splash.splashElt.addEventListener('click', c);
                                           });
                      }
                      return Promise.resolve();
                    },
                    function () {
                      if (splash.failed_loading) {
                        return;
                      }
                      splash.setTitle("Failed to download game data!");
                      splash.failed_loading = true;
                    })
              .then(function () {
                      if (!game_data || splash.failed_loading) {
                        return null;
                      }
                      splash.spinning = true;
                      window.removeEventListener('keypress', k);
                      canvas.removeEventListener('click', c);
                      splash.splashElt.removeEventListener('click', c);

                      // Don't let arrow, pg up/down, home, end affect page position
                      blockSomeKeys();
                      setupFullScreen();
                      disableRightClickContextMenu(canvas);

                      // Emscripten doesn't use the proper prefixed functions for fullscreen requests,
                      // so let's map the prefixed versions to the correct function.
                      canvas.requestPointerLock = getpointerlockenabler();

                      moveConfigToRoot(game_data.fs);

                      if (callbacks && callbacks.before_emulator) {
                        try {
                          callbacks.before_emulator();
                        } catch (x) {
                          console.log(x);
                        }
                      }

                      var emscriptenRunner = false;
                      if ("runner" in game_data) {
                        emscriptenRunner = game_data.runner == EmscriptenRunner || game_data.runner.prototype instanceof EmscriptenRunner;
                        if (emscriptenRunner) {
                          // this is a stupid hack. Emscripten-based
                          // apps currently need the runner to be set
                          // up first, then we can attach the
                          // script. The others have to do it the
                          // other way around.
                          runner = setup_runner();
                        }
                      }

                      if (game_data.emulatorJS) {
                        splash.setTitle("Launching Emulator");
                        // MAW: non-Emscripten engines (e.g. SAE) are singletons
                        // reused across restarts — re-injecting their script
                        // re-declares its top-level const/let and throws. Reuse
                        // the already-loaded script. Emscripten engines must
                        // re-run to re-instantiate Module, so never reuse those.
                        return attach_script(game_data.emulatorJS, !emscriptenRunner);
                      } else {
                        splash.setTitle("Non-system disk or disk error");
                      }
                      return null;
                    },
                    function () {
                      if (!game_data || splash.failed_loading) {
                        return null;
                      }
                      splash.setTitle("Invalid media, track 0 bad or unusable");
                      splash.failed_loading = true;
                    })
              .then(function () {
                      if (!game_data || splash.failed_loading) {
                        return null;
                      }
                      if ("runner" in game_data) {
                        if (!runner) {
                          runner = setup_runner();
                        }
                        runner.start();
                      }
                    });

       function setup_runner() {
         var runner = new game_data.runner(canvas, game_data);
         resizeCanvas(canvas, game_data.scale, game_data.nativeResolution, game_data.aspectRatio);
         runner.onStarted(function () {
                            splash.finished_loading = true;
                            splash.hide();
                            setTimeout(function() {
                                         if (muted) {
                                           runner.mute();
                                         }
                                         if (callbacks && callbacks.before_run) {
                                           callbacks.before_run();
                                         }
                                       },
                                       0);
                          });
         runner.onReset(function () {
                          if (muted) {
                            runner.mute();
                          }
                        });
         return runner;
       }

       return this;
     };
     this.start = start;

     var formatSize = function (event) {
       if (event.lengthComputable)
         return "("+ (event.total ? (event.loaded / event.total * 100).toFixed(0)
                                  : "100") +
                "%; "+ formatBytes(event.loaded) +
                " of "+ formatBytes(event.total) +")";
       return "("+ formatBytes(event.loaded) +")";
     };

     var formatBytes = function (bytes, base10) {
         if (bytes === 0)
           return "0 B";
         var unit = base10 ? 1000 : 1024,
             units = base10 ? ["B", "kB","MB","GB","TB","PB","EB","ZB","YB"]
                            : ["B", "KiB","MiB","GiB","TiB","PiB","EiB","ZiB","YiB"],
             exp = parseInt((Math.log(bytes) / Math.log(unit))),
             size = bytes / Math.pow(unit, exp);
         return size.toFixed(1) +' '+ units[exp];
     };

     var fetch_file = function (title, url, rt, optional) {
       return _fetch_file(title, url, rt, optional, false);
     };

     var cached_file = function (title, data) {
       return _fetch_file(title, data, null, false, true);
     };

     var _fetch_file = function (title, url, rt, optional, cached) {
       var needsCSS = splash.table.dataset.hasCustomCSS == "false";
       var row = addRow(splash.table);
       var titleCell = row[0], statusCell = row[1];
       titleCell.textContent = title;
       var entry = null; // MAW: this download's slot in the aggregate progress bar
       return new Promise(function (resolve, reject) {
                            if (cached) {
                              success();
                              resolve(url); // second parameter reused as a pass–through
                            } else {
                              entry = { loaded: 0, total: 0, done: false, xhr: null };
                              requests.push(entry);
                              var xhr = new XMLHttpRequest();
                              entry.xhr = xhr;
                              xhr.open('GET', url, true);
                              xhr.responseType = rt || 'arraybuffer';
                              xhr.onprogress = function (e) {
                                                 entry.loaded = e.loaded;
                                                 entry.total = e.lengthComputable ? e.total : 0;
                                                 updateProgress();
                                                 titleCell.innerHTML = title +" <span style=\"font-size: smaller\">"+ formatSize(e) +"</span>";
                                               };
                              xhr.onload = function (e) {
                                             if (xhr.status === 200) {
                                               success();
                                               resolve(xhr.response);
                                             } else if (optional) {
                                               success();
                                               resolve(null);
                                             } else {
                                               failure();
                                               reject();
                                             }
                                           };
                              xhr.onerror = function (e) {
                                              if (optional) {
                                                success();
                                                resolve(null);
                                              } else {
                                                failure();
                                                reject();
                                              }
                                            };
                              xhr.send();
                            }
                          });
       function success() {
         if (entry) {
           entry.done = true;
           if (entry.total) entry.loaded = entry.total; else entry.total = entry.loaded;
           updateProgress();
         }
         statusCell.textContent = "✔";
         titleCell.parentNode.classList.add('emularity-download-success');
         titleCell.textContent = title;
         if (needsCSS) {
           titleCell.style.fontWeight = 'bold';
           titleCell.parentNode.style.backgroundColor = splash.getColor('foreground');
           titleCell.parentNode.style.color = splash.getColor('background');
         }
       }
       function failure() {
         if (entry) {
           entry.done = true;
           updateProgress();
         }
         statusCell.textContent = "✘";
         titleCell.parentNode.classList.add('emularity-download-failure');
         titleCell.textContent = title;
         if (needsCSS) {
           titleCell.style.fontWeight = 'bold';
           titleCell.parentNode.style.backgroundColor = splash.getColor('failure');
           titleCell.parentNode.style.color = splash.getColor('background');
         }
       }
     };

     function keyevent(resolve) {
       return function (e) {
                if (e.which == 32) {
                  e.preventDefault();
                  resolve();
                }
              };
     };

     var resizeCanvas = function (canvas, scale, resolution, aspectRatio) {
       if (scale && resolution) {
         // optimizeSpeed is the standardized value. different
         // browsers support different values; they will all ignore
         // values that they don't understand.
         canvas.style.imageRendering = '-moz-crisp-edges';
         canvas.style.imageRendering = '-o-crisp-edges';
         canvas.style.imageRendering = '-webkit-optimize-contrast';
         canvas.style.imageRendering = 'optimize-contrast';
         canvas.style.imageRendering = 'crisp-edges';
         canvas.style.imageRendering = 'pixelated';
         canvas.style.imageRendering = 'optimizeSpeed';

         canvas.style.width = resolution.width * scale +'px';
         canvas.style.height = resolution.height * scale +'px';
         canvas.setAttribute("width", resolution.width * scale);
         canvas.setAttribute("height", resolution.height * scale);
       }
     };

     var clearCanvas = function () {
       var context = canvas.getContext('2d');
       context.fillStyle = splash.getColor('background');
       context.fillRect(0, 0, canvas.width, canvas.height);
       console.log("canvas cleared");
     };

     function setupSplash(canvas, splash, globalOptions) {
       splash.splashElt = document.getElementById("emularity-splash-screen");
       if (!splash.splashElt) {
         splash.splashElt = document.createElement('div');
         splash.splashElt.classList.add("emularity-splash-screen");
         if (!globalOptions.hasCustomCSS) {
           splash.splashElt.style.position = 'absolute';
           splash.splashElt.style.top = '0';
           splash.splashElt.style.left = '0';
           splash.splashElt.style.right = '0';
           splash.splashElt.style.color = splash.getColor('foreground');
           splash.splashElt.style.backgroundColor = splash.getColor('background');
         }
         canvas.parentElement.appendChild(splash.splashElt);
       }

       splash.splashimg.classList.add("emularity-splash-image");
       if (!globalOptions.hasCustomCSS) {
         splash.splashimg.style.display = 'block';
         splash.splashimg.style.marginLeft = 'auto';
         splash.splashimg.style.marginRight = 'auto';
       }
       splash.splashElt.appendChild(splash.splashimg);

       splash.titleElt = document.createElement('span');
       splash.titleElt.classList.add("emularity-splash-title");
       if (!globalOptions.hasCustomCSS) {
         splash.titleElt.style.display = 'block';
         splash.titleElt.style.width = '100%';
         splash.titleElt.style.marginTop = "1em";
         splash.titleElt.style.marginBottom = "1em";
         splash.titleElt.style.textAlign = 'center';
         splash.titleElt.style.font = "24px sans-serif";
       }
       splash.titleElt.textContent = " ";
       splash.splashElt.appendChild(splash.titleElt);

       var table = document.getElementById("emularity-progress-indicator");
       if (!table) {
         table = document.createElement('table');
         table.classList.add("emularity-progress-indicator");
         table.dataset.hasCustomCSS = globalOptions.hasCustomCSS;
         if (!globalOptions.hasCustomCSS) {
           table.style.width = "75%";
           table.style.color = splash.getColor('foreground');
           table.style.backgroundColor = splash.getColor('background');
           table.style.marginLeft = 'auto';
           table.style.marginRight = 'auto';
           table.style.borderCollapse = 'separate';
           table.style.borderSpacing = "2px";
         }
         splash.splashElt.appendChild(table);
       }
       splash.table = table;

       // MAW: a single aggregate loading bar (fill + label). Only in themed
       // mode; stock users keep the per-file table untouched. Styled by
       // emularity-maw.css (.c-emulator__progress*).
       if (globalOptions.hasCustomCSS) {
         splash.progressElt = document.createElement('div');
         splash.progressElt.classList.add("c-emulator__progress");
         splash.progressFill = document.createElement('div');
         splash.progressFill.classList.add("c-emulator__progress-fill");
         splash.progressLabel = document.createElement('span');
         splash.progressLabel.classList.add("c-emulator__progress-label");
         splash.progressElt.appendChild(splash.progressFill);
         splash.progressElt.appendChild(splash.progressLabel);
         splash.splashElt.appendChild(splash.progressElt);
       }
     }

     // MAW: recompute the aggregate loading bar from every tracked download.
     function updateProgress() {
       if (!splash.progressFill)
         return;
       var loaded = 0, total = 0, known = requests.length > 0;
       for (var i = 0; i < requests.length; i++) {
         loaded += requests[i].loaded;
         if (requests[i].total)
           total += requests[i].total;
         else
           known = false;
       }
       if (requests.length === 0)
         return;
       if (known) {
         var pct = total > 0 ? Math.min(100, Math.round(loaded / total * 100)) : 100;
         splash.progressElt.classList.remove("c-emulator__progress--indeterminate");
         splash.progressFill.style.width = pct + "%";
         splash.progressLabel.textContent = formatBytes(loaded) +" / "+ formatBytes(total) +" ("+ pct +"%)";
       } else {
         splash.progressElt.classList.add("c-emulator__progress--indeterminate");
         splash.progressLabel.textContent = formatBytes(loaded);
       }
     }

     splash.setTitle = function (title) {
       splash.titleElt.textContent = title;
     };

     splash.hide = function () {
       splash.splashElt.style.display = 'none';
     };

     splash.getColor = function (name) {
       return name in splash.colors ? splash.colors[name]
                                    : defaultSplashColors[name];
     };

     var addRow = function (table) {
       var needsCSS = table.dataset.hasCustomCSS == "false";
       var row = table.insertRow(-1);
       if (needsCSS) {
         row.style.textAlign = 'center';
       }
       var cell = row.insertCell(-1);
       if (needsCSS) {
         cell.style.position = 'relative';
       }
       var titleCell = document.createElement('span');
       titleCell.classList.add("emularity-download-title");
       titleCell.textContent = '—';
       if (needsCSS) {
         titleCell.style.verticalAlign = 'center';
         titleCell.style.minHeight = "24px";
         titleCell.style.whiteSpace = "nowrap";
       }
       cell.appendChild(titleCell);
       var statusCell = document.createElement('span');
       statusCell.classList.add("emularity-download-status");
       if (needsCSS) {
         statusCell.style.position = 'absolute';
         statusCell.style.left = "0";
         statusCell.style.paddingLeft = "0.5em";
       }
       cell.appendChild(statusCell);
       return [titleCell, statusCell];
     };

     var drawsplash = function (options) {
       canvas.setAttribute('moz-opaque', '');
       if (!splash.splashimg.src) {
         // MAW: default splash logo is the branded, spinning myabandonware logo
         // (styled/animated by emularity-maw.css when hasCustomCSS is true).
         // Resolved against the base path so it works wherever the fork is
         // mounted; the splashImage option replaces it outright.
         options = options || {};
         splash.splashimg.src = options.splashImage
                              ? assetUrl(options.splashImage, options.basePath)
                              : assetUrl("logo/maw.png", options.basePath);
       }
     };

     function attach_script(js_url, reuseIfLoaded) {
       return new Promise(function (resolve, reject) {
                            var newScript;
                            function loaded(e) {
                              if (e.target == newScript) {
                                newScript.removeEventListener("load", loaded);
                                newScript.removeEventListener("error", failed);
                                resolve();
                              }
                            }
                            function failed(e) {
                              if (e.target == newScript) {
                                newScript.removeEventListener("load", loaded);
                                newScript.removeEventListener("error", failed);
                                reject();
                              }
                            }
                            if (js_url) {
                              // MAW: a non-Emscripten engine already in the page
                              // is reused, not re-run — re-injecting it would
                              // re-declare its top-level const/let and throw.
                              if (reuseIfLoaded && document.querySelector('script[src="' + js_url + '"]')) {
                                resolve();
                                return;
                              }
                              var head = document.getElementsByTagName('head')[0];
                              newScript = document.createElement('script');
                              newScript.addEventListener("load", loaded);
                              newScript.addEventListener("error", failed);
                              newScript.type = 'text/javascript';
                              newScript.src = js_url;
                              head.appendChild(newScript);
                            }
                          });
     }

     function getpointerlockenabler() {
       return canvas.requestPointerLock || canvas.mozRequestPointerLock || canvas.webkitRequestPointerLock;
     }

     this.isfullscreensupported = function () {
        return !!(getfullscreenenabler());
     };

     function setupFullScreen() {
       var self = this;
       var fullScreenChangeHandler = function() {
                                       if (!(document.mozFullScreenElement || document.fullScreenElement)) {
                                         resizeCanvas(canvas, scale, css_resolution, aspectRatio);
                                       }
                                     };
       if ('onfullscreenchange' in document) {
         document.addEventListener('fullscreenchange', fullScreenChangeHandler);
       } else if ('onmozfullscreenchange' in document) {
         document.addEventListener('mozfullscreenchange', fullScreenChangeHandler);
       } else if ('onwebkitfullscreenchange' in document) {
         document.addEventListener('webkitfullscreenchange', fullScreenChangeHandler);
       }
     };

     this.requestFullScreen = function () {
       if (runner) {
         runner.requestFullScreen();
       }
     };

     /**
       * Prevents page navigation keys such as page up/page down from
       * moving the page while the user is playing.
       */
     function blockSomeKeys() {
       function keypress (e) {
         if (e.which >= 33 && e.which <= 40) {
           e.preventDefault();
           return false;
         }
         return true;
       }
       window.onkeydown = keypress;
     }

     /**
       * Disables the right click menu for the given element.
       */
     function disableRightClickContextMenu(element) {
       element.addEventListener('contextmenu',
                                function (e) {
                                  if (e.button == 2) {
                                    // Block right-click menu thru preventing default action.
                                    e.preventDefault();
                                  }
                                });
     }
   };

   /**
    * misc
    */
   function getfullscreenenabler() {
     // MAW: prefer the modern standard requestFullscreen (lowercase s); the
     // legacy prefixed names below no longer exist, so non-Emscripten runners
     // (SAE, V86, Cloudpilot) would otherwise throw.
     return canvas.requestFullscreen || canvas.requestFullScreen || canvas.webkitRequestFullScreen || canvas.mozRequestFullScreen;
   }

   // This is such a hack. We're not calling the BrowserFS api
   // "correctly", so we have to synthesize these flags ourselves
   var flag_r = { isReadable: function() { return true; },
                  isWriteable: function() { return false; },
                  isTruncating: function() { return false; },
                  isAppendable: function() { return false; },
                  isSynchronous: function() { return false; },
                  isExclusive: function() { return false; },
                  pathExistsAction: function() { return 0; },
                  pathNotExistsAction: function() { return 1; }
                };
   var flag_w = { isReadable: function() { return false; },
                  isWriteable: function() { return true; },
                  isTruncating: function() { return false; },
                  isAppendable: function() { return false; },
                  isSynchronous: function() { return false; },
                  isExclusive: function() { return false; },
                  pathExistsAction: function() { return 0; },
                  pathNotExistsAction: function() { return 3; }
                };

   /**
    * Searches for dosbox.conf, and moves it to '/dosbox.conf' so dosbox uses it.
    */
   function moveConfigToRoot(fs) {
     var dosboxConfPath = null;
     // Recursively search for dosbox.conf.
     function searchDirectory(dirPath) {
       fs.readdirSync(dirPath).forEach(function(item) {
         if (dosboxConfPath) {
           return;
         }
         // Avoid infinite recursion by ignoring these entries, which exist at
         // the root.
         if (item === '.' || item === '..') {
           return;
         }
         // Append '/' between dirPath and the item's name... unless dirPath
         // already ends in it (which always occurs if dirPath is the root, '/').
         var itemPath = dirPath + (dirPath[dirPath.length - 1] !== '/' ? "/" : "") + item,
             itemStat = fs.statSync(itemPath);
         if (itemStat.isDirectory(itemStat.mode)) {
           searchDirectory(itemPath);
         } else if (item === 'dosbox.conf') {
           dosboxConfPath = itemPath;
         }
       });
     }

     searchDirectory('/');

     if (dosboxConfPath !== null) {
       fs.writeFileSync('/dosbox.conf',
                        fs.readFileSync(dosboxConfPath, null, flag_r),
                        null, flag_w, 0x1a4);
     }
   };

   /**
    * MAW: savegame export / import.
    *
    * The game itself sits in read-only zip mounts; everything it writes lands
    * in the OverlayFS's writable layer (the deltaFS that start() mirrors to
    * IndexedDB). So that layer holds the player's saves, and zipping it up
    * exports them. Zip paths keep the drive folder, e.g. c/DOOM/DOOMSAV0.DSG.
    */
   // Where a store records the archive layout it was made against.
   var MANIFEST = '/.emularity-store.json';
   // OverlayFS bookkeeping, the copy moveConfigToRoot() makes and the
   // manifest; not saves.
   var SAVES_SKIP = ['/.deletedFiles.log', '/dosbox.conf', MANIFEST];

   function is_skipped(path, skip) {
     path = path.toLowerCase();
     return skip.some(function (p) { return p.toLowerCase() === path; });
   }

   var crc_table = null;
   function crc32(bytes) {
     if (!crc_table) {
       crc_table = new Uint32Array(256);
       for (var n = 0; n < 256; n++) {
         var c = n;
         for (var k = 0; k < 8; k++) {
           c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
         }
         crc_table[n] = c >>> 0;
       }
     }
     var crc = 0xffffffff;
     for (var i = 0; i < bytes.length; i++) {
       crc = crc_table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
     }
     return (crc ^ 0xffffffff) >>> 0;
   }

   function utf8_bytes(str) {
     var s = unescape(encodeURIComponent(str)),
         out = new Uint8Array(s.length);
     for (var i = 0; i < s.length; i++) {
       out[i] = s.charCodeAt(i);
     }
     return out;
   }

   // Builds a .zip Blob from { path, data: Uint8Array, date } entries, or
   // { path, dir: true } for a folder. Files are stored, not compressed:
   // saves are small, and this keeps it short.
   function make_zip(entries) {
     var parts = [], central = [], offset = 0, centralSize = 0;
     entries.forEach(function (entry) {
       var name = utf8_bytes(entry.dir ? entry.path + '/' : entry.path),
           data = entry.dir ? new Uint8Array(0) : entry.data,
           crc = crc32(data),
           d = entry.date instanceof Date ? entry.date : new Date(),
           time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
           date = ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();

       var local = new DataView(new ArrayBuffer(30));
       local.setUint32(0, 0x04034b50, true);
       local.setUint16(4, 20, true);      // version needed to extract
       local.setUint16(6, 0x0800, true);  // flags: names are UTF-8
       local.setUint16(8, 0, true);       // method: stored
       local.setUint16(10, time, true);
       local.setUint16(12, date, true);
       local.setUint32(14, crc, true);
       local.setUint32(18, data.length, true);
       local.setUint32(22, data.length, true);
       local.setUint16(26, name.length, true);
       parts.push(local.buffer, name, data);

       var dir = new DataView(new ArrayBuffer(46));
       dir.setUint32(0, 0x02014b50, true);
       dir.setUint16(4, 20, true);        // version made by
       dir.setUint16(6, 20, true);
       dir.setUint16(8, 0x0800, true);
       dir.setUint16(10, 0, true);
       dir.setUint16(12, time, true);
       dir.setUint16(14, date, true);
       dir.setUint32(16, crc, true);
       dir.setUint32(20, data.length, true);
       dir.setUint32(24, data.length, true);
       dir.setUint16(28, name.length, true);
       dir.setUint32(38, entry.dir ? 0x10 : 0, true); // MS-DOS folder flag
       dir.setUint32(42, offset, true);   // where the local header starts
       central.push(dir.buffer, name);

       centralSize += 46 + name.length;
       offset += 30 + name.length + data.length;
     });
     var end = new DataView(new ArrayBuffer(22));
     end.setUint32(0, 0x06054b50, true);
     end.setUint16(8, entries.length, true);
     end.setUint16(10, entries.length, true);
     end.setUint32(12, centralSize, true);
     end.setUint32(16, offset, true);
     return new Blob(parts.concat(central, [end.buffer]), { type: 'application/zip' });
   }

   // Calls visit(path, stat) for every file and folder below `root` of a
   // synchronous BrowserFS file system, each folder before what it holds.
   function walk_fs(fs, root, visit) {
     (function walk(dir) {
       fs.readdirSync(dir).forEach(function (item) {
         if (item === '.' || item === '..') {
           return;
         }
         var path = (dir === '/' ? '' : dir) + '/' + item,
             stat = fs.statSync(path, false);
         visit(path, stat);
         if (stat.isDirectory()) {
           walk(path);
         }
       });
     })(root || '/');
   }

   // Lists every file below `root` as zip entries (paths lose the leading /),
   // and every folder too when withDirs is set.
   function collect_files(fs, skip, root, withDirs) {
     var entries = [];
     walk_fs(fs, root, function (path, stat) {
       if (stat.isDirectory()) {
         if (withDirs) {
           entries.push({ path: path.substring(1), dir: true, date: stat.mtime });
         }
       } else if (!is_skipped(path, skip)) {
         entries.push({ path: path.substring(1),
                        data: new Uint8Array(fs.readFileSync(path, null, flag_r)),
                        date: stat.mtime });
       }
     });
     return entries;
   }

   // The layout of the read-only layer, as { "/c/DOOM": ["DOOM.EXE", ...] }:
   // one key per folder, listing the files directly in it.
   function list_tree(fs) {
     var tree = {};
     walk_fs(fs, '/', function (path, stat) {
       var cut = path.lastIndexOf('/'),
           dir = path.substring(0, cut);
       if (stat.isDirectory()) {
         tree[path] = tree[path] || [];
       } else if (dir) {
         (tree[dir] = tree[dir] || []).push(path.substring(cut + 1));
       }
     });
     return tree;
   }

   // The tree's file paths, lower case, as a lookup table.
   function shipped_files(tree) {
     var shipped = {};
     Object.keys(tree || {}).forEach(function (dir) {
       tree[dir].forEach(function (name) {
         shipped[(dir + '/' + name).toLowerCase()] = true;
       });
     });
     return shipped;
   }

   function write_files(fs, entries, skip) {
     var Buffer = BrowserFS.BFSRequire('buffer').Buffer,
         count = 0;
     entries.forEach(function (entry) {
       var path = '/' + entry.path.replace(/^\/+/, '');
       if (is_skipped(path, skip)) {
         return;
       }
       var parts = path.substring(1).split('/');
       for (var i = 1; i < parts.length; i++) {
         var dir = '/' + parts.slice(0, i).join('/');
         if (!fs.existsSync(dir)) {
           fs.mkdirSync(dir, 0777);
         }
       }
       // flag_w doesn't truncate, so a shorter file would keep the old tail.
       if (fs.existsSync(path)) {
         fs.unlinkSync(path);
       }
       fs.writeFileSync(path, new Buffer(entry.data), null, flag_w, 0644);
       count++;
     });
     return count;
   }

   function read_manifest(fs) {
     try {
       return JSON.parse(fs.readFileSync(MANIFEST, 'utf8', flag_r));
     } catch (e) {
       return null;
     }
   }

   function write_manifest(fs, manifest) {
     var Buffer = BrowserFS.BFSRequire('buffer').Buffer;
     if (fs.existsSync(MANIFEST)) {
       fs.unlinkSync(MANIFEST);
     }
     fs.writeFileSync(MANIFEST, new Buffer(JSON.stringify(manifest)), null, flag_w, 0644);
   }

   /**
    * MAW: works out where saves made against one archive layout belong in
    * another, e.g. after an admin repacked the game from C:\GAMES\DOOM into
    * C:\DOOM. oldTree and newTree are list_tree() results (oldTree may be
    * null); paths are the files to place, with a leading slash. Returns
    * { path: { path: target, parked: bool } }.
    *
    * Each folder maps to the first rule that gives one clear answer:
    *   - a folder the old archive shipped goes where most of its files went;
    *   - a folder the game made goes inside wherever its parent went;
    *   - a folder inside the old game root goes to the same place inside the
    *     new one (see exe_root below);
    *   - else the new folder ending in the most of the same folder names;
    *   - else it stays where it was.
    * A file that would cover a file the new archive ships, or one listed in
    * `taken`, is parked in /<drive>/OLDSAVES/<old path> instead, so it never
    * breaks the new game and the player can still find it.
    */
   function map_save_paths(oldTree, newTree, paths, taken) {
     function lower_index(tree) {
       var index = {};
       Object.keys(tree || {}).forEach(function (dir) {
         index[dir.toLowerCase()] = dir;
       });
       return index;
     }
     // The folder names below the drive, e.g. /c/GAMES/DOOM -> [games, doom].
     function segments(dir) {
       return dir.toLowerCase().split('/').slice(2);
     }
     var oldIndex = lower_index(oldTree),
         newIndex = lower_index(newTree),
         newDirs = Object.keys(newTree || {}),
         shipped = shipped_files(newTree),
         memo = {};

     // The new folder with the top score, or null unless one clearly wins.
     // A tie that includes `prefer` goes to it.
     function best(score, prefer) {
       var top = 0, winners = [];
       newDirs.forEach(function (dir) {
         var s = score(dir);
         if (s > top) {
           top = s;
           winners = [dir];
         } else if (s > 0 && s === top) {
           winners.push(dir);
         }
       });
       if (winners.length === 1) {
         return winners[0];
       }
       return prefer && winners.indexOf(prefer) !== -1 ? prefer : null;
     }

     // The game's root folder in each archive: where the shallowest .exe
     // that both ship under the same name sits. That is usually the game's
     // own .exe, sometimes a helper like DOS4GW.EXE. A name found twice at
     // its shallowest depth in either archive is no help; a tie between
     // names that disagree on the roots leaves no root at all.
     function exe_root() {
       function shallowest(tree) {
         var found = {};
         Object.keys(tree || {}).forEach(function (dir) {
           var depth = dir.split('/').length;
           tree[dir].forEach(function (name) {
             var key = name.toLowerCase(),
                 seen = found[key];
             if (!/\.exe$/.test(key)) {
               return;
             }
             if (!seen || depth < seen.depth) {
               found[key] = { depth: depth, dirs: [dir] };
             } else if (depth === seen.depth) {
               seen.dirs.push(dir);
             }
           });
         });
         return found;
       }
       var olds = shallowest(oldTree),
           news = shallowest(newTree),
           pick = null, top = Infinity, clash = false;
       Object.keys(olds).forEach(function (name) {
         var o = olds[name], n = news[name];
         if (!n || o.dirs.length > 1 || n.dirs.length > 1) {
           return;
         }
         var score = o.depth + n.depth,
             roots = { from: o.dirs[0], to: n.dirs[0] };
         if (score < top) {
           top = score;
           pick = roots;
           clash = false;
         } else if (score === top &&
                    (pick.from.toLowerCase() !== roots.from.toLowerCase() ||
                     pick.to.toLowerCase() !== roots.to.toLowerCase())) {
           clash = true;
         }
       });
       return clash ? null : pick;
     }
     var root = oldTree ? exe_root() : null;

     function map_dir(dir) {
       var key = dir.toLowerCase();
       if (key in memo) {
         return memo[key];
       }
       var same = newIndex[key] || null,
           known = oldIndex[key] ? oldTree[oldIndex[key]] : null,
           segs = segments(dir),
           found = null;
       function by_parent() {
         var cut = dir.lastIndexOf('/'),
             parent = map_dir(dir.substring(0, cut)),
             mapped = parent ? parent + dir.substring(cut) : null;
         return mapped ? newIndex[mapped.toLowerCase()] || mapped : null;
       }
       function by_root() {
         var from = root.from.toLowerCase(),
             mapped;
         if (key !== from && key.indexOf(from + '/') !== 0) {
           return null;
         }
         mapped = root.to + dir.substring(root.from.length);
         return newIndex[mapped.toLowerCase()] || mapped;
       }
       function by_names() {
         return best(function (d) {
                       var other = segments(d), n = 0;
                       while (n < segs.length && n < other.length &&
                              segs[segs.length - 1 - n] === other[other.length - 1 - n]) {
                         n++;
                       }
                       return n;
                     }, same);
       }
       memo[key] = same;
       if (known && known.length > 0) {
         var names = {};
         known.forEach(function (name) { names[name.toLowerCase()] = true; });
         found = best(function (d) {
                        return newTree[d].filter(function (name) {
                                                   return names[name.toLowerCase()];
                                                 }).length;
                      }, same);
       } else if (!known && oldTree && segs.length > 0) {
         found = by_parent();
       }
       if (!found && root) {
         found = by_root();
       }
       if (!found && segs.length > 0) {
         found = by_names();
       }
       // With no old layout to go on, a folder no name matches still follows
       // its parent.
       if (!found && !oldTree && segs.length > 0) {
         found = by_parent();
       }
       return (memo[key] = found || same);
     }

     var result = {};
     paths.forEach(function (path) {
       var cut = path.lastIndexOf('/'),
           dir = path.substring(0, cut),
           parts = path.split('/'),
           target = (dir && map_dir(dir) || dir) + path.substring(cut),
           lower = target.toLowerCase(),
           parked = parts.length > 2 && !!(shipped[lower] || (taken && taken[lower]));
       if (parked) {
         target = '/' + parts[1] + '/OLDSAVES/' + parts.slice(2).join('/');
       }
       result[path] = { path: target, parked: parked };
     });
     return result;
   }

   // Writes saves made against oldTree into the store, at the paths
   // map_save_paths() picks for them. With keepExisting, files already in the
   // store are never overwritten (their newcomers get parked).
   function place_saves(store, entries, oldTree, keepExisting) {
     var taken = null;
     if (keepExisting) {
       taken = {};
       walk_fs(store.fs, '/', function (path, stat) {
         if (!stat.isDirectory()) {
           taken[path.toLowerCase()] = true;
         }
       });
     }
     var placed = map_save_paths(oldTree, store.tree,
                                 entries.map(function (e) { return '/' + e.path; }),
                                 taken),
         report = { moved: [], kept: [], parked: [] };
     entries.forEach(function (entry) {
       var from = '/' + entry.path,
           to = placed[from];
       entry.path = to.path.substring(1);
       if (to.parked) {
         report.parked.push([from, to.path]);
       } else if (to.path !== from) {
         report.moved.push([from, to.path]);
       } else {
         report.kept.push(from);
       }
     });
     report.count = write_files(store.fs, entries, store.skip);
     return report;
   }

   function to_array_buffer(data) {
     if (data instanceof ArrayBuffer) {
       return Promise.resolve(data);
     }
     if (ArrayBuffer.isView(data)) {
       return Promise.resolve(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
     }
     return new Promise(function (resolve, reject) {
       var reader = new FileReader();
       reader.onload = function () { resolve(reader.result); };
       reader.onerror = function () { reject(reader.error); };
       reader.readAsArrayBuffer(data);
     });
   }

   function read_zip(data) {
     return to_array_buffer(data).then(function (buffer) {
       var Buffer = BrowserFS.BFSRequire('buffer').Buffer;
       return new Promise(function (resolve, reject) {
         BrowserFS.FileSystem.ZipFS.Create({ zipData: new Buffer(buffer) },
                                           function (e, zipfs) {
                                             if (e) {
                                               reject(new Error("Not a valid zip file"));
                                             } else {
                                               resolve(collect_files(zipfs, []));
                                             }
                                           });
       });
     });
   }

   // AsyncMirror copies writes to IndexedDB in the background; wait until it
   // has caught up, so a reload or a fresh boot sees the imported files.
   function when_flushed(fs) {
     return new Promise(function (resolve) {
       (function check() {
         if (fs && fs._queue && (fs._queueRunning || fs._queue.length > 0)) {
           setTimeout(check, 50);
         } else {
           resolve();
         }
       })();
     });
   }

   // OverlayFS also writes its deletion log in the background. Wait for it
   // and for IndexedDB before editing the store under a stopped game.
   function settle(store) {
     var inner = store.overlay && store.overlay._fs ? store.overlay._fs : store.overlay;
     return new Promise(function (resolve) {
       (function check() {
         if (inner && inner._deleteLogUpdatePending) {
           setTimeout(check, 50);
         } else {
           resolve();
         }
       })();
     }).then(function () { return when_flushed(store.fs); });
   }

   // The saves as a zip. The manifest rides along, so an import into a later
   // version of the game can fit the paths to its layout.
   function export_saves(store) {
     return new Promise(function (resolve, reject) {
       var entries = collect_files(store.fs, store.skip),
           manifest = read_manifest(store.fs);
       if (entries.length === 0) {
         reject(new Error("No saves found"));
         return;
       }
       if (manifest) {
         entries.push({ path: MANIFEST.substring(1),
                        data: utf8_bytes(JSON.stringify(manifest)) });
       }
       resolve(make_zip(entries));
     });
   }

   // Zips made against another archive layout (another manifest key) are
   // fitted to this one; others go back exactly where they were.
   function import_saves(store, zip) {
     return read_zip(zip).then(function (entries) {
       var theirs = null,
           ours = read_manifest(store.fs),
           report;
       entries = entries.filter(function (entry) {
         if ('/' + entry.path === MANIFEST) {
           try {
             theirs = JSON.parse(new TextDecoder().decode(entry.data));
           } catch (e) {}
           return false;
         }
         return true;
       });
       if (theirs && theirs.dirs && store.tree && !(ours && ours.key === theirs.key)) {
         report = place_saves(store, entries, theirs.dirs, false);
         report.from = theirs.key;
       } else {
         report = { moved: [], parked: [],
                    kept: entries.map(function (e) { return '/' + e.path; }),
                    count: write_files(store.fs, entries, store.skip) };
       }
       if (report.count === 0) {
         throw new Error("The zip holds no files to import");
       }
       return when_flushed(store.fs).then(function () { return report; });
     });
   }

   // The whole disk as the game sees it: shipped files with the player's
   // changes on top, folders included.
   function export_disk(store) {
     return new Promise(function (resolve, reject) {
       var entries = [];
       store.drives.forEach(function (drive) {
         entries = entries.concat(collect_files(store.overlay, [], '/' + drive, true));
       });
       if (entries.length === 0) {
         reject(new Error("This game has no disk to download"));
       } else {
         resolve(make_zip(entries));
       }
     });
   }

   // Drops the player's copies of shipped files and forgets deleted ones, so
   // the game files are as shipped again. Files the game made stay.
   function reset_game_files(store) {
     if (!store.tree) {
       return Promise.reject(new Error("This game hasn't been run yet"));
     }
     var shipped = shipped_files(store.tree),
         files = [];
     walk_fs(store.fs, '/', function (path, stat) {
       if (!stat.isDirectory() && shipped[path.toLowerCase()]) {
         files.push(path);
       }
     });
     files.forEach(function (path) { store.fs.unlinkSync(path); });
     if (store.fs.existsSync('/.deletedFiles.log')) {
       store.fs.unlinkSync('/.deletedFiles.log');
     }
     return when_flushed(store.fs).then(function () { return files.length; });
   }

   // Empties the store, bar the manifest and the files mountFile() copied in.
   function reset_saves(store) {
     var keep = {}, files = [], dirs = [];
     [MANIFEST].concat(store.keep).forEach(function (path) { keep[path.toLowerCase()] = true; });
     walk_fs(store.fs, '/', function (path, stat) {
       (stat.isDirectory() ? dirs : files).push(path);
     });
     files = files.filter(function (path) { return !keep[path.toLowerCase()]; });
     files.forEach(function (path) { store.fs.unlinkSync(path); });
     // Deepest first, so a folder is empty by the time its turn comes.
     dirs.reverse().forEach(function (dir) {
       try {
         if (store.fs.readdirSync(dir).length === 0) {
           store.fs.rmdirSync(dir);
         }
       } catch (e) {}
     });
     return when_flushed(store.fs).then(function () { return files.length; });
   }

   // Opens the IndexedDB save store for a fileSystemKey on its own, the same
   // way start() does, so saves can be handled without booting the game.
   function open_saves_store(key) {
     return new Promise(function (resolve, reject) {
       var IndexedDBFS = BrowserFS.FileSystem.IndexedDB;
       if (!IndexedDBFS.isAvailable()) {
         reject(new Error("IndexedDB is not available"));
         return;
       }
       IndexedDBFS.Create({ storeName: key || "emularity" }, function (e, idbfs) {
         if (e) {
           reject(e);
           return;
         }
         BrowserFS.FileSystem.InMemory.Create(function (e, inMemory) {
           if (e) {
             reject(e);
             return;
           }
           BrowserFS.FileSystem.AsyncMirror.Create({ sync: inMemory, async: idbfs },
                                                   function (e, fs) {
                                                     if (e) {
                                                       reject(e);
                                                     } else {
                                                       resolve(fs);
                                                     }
                                                   });
         });
       });
     });
   }

   // Lets go of the IndexedDB connection, so the store can be deleted.
   function close_store(fs) {
     try {
       fs._async.store.db.close();
     } catch (e) {}
   }

   // Runs task(store) on a store opened without the game. What the game
   // shipped is known from the manifest its last boot left.
   function with_store(key, task) {
     return open_saves_store(key).then(function (fs) {
       var manifest = read_manifest(fs),
           keep = manifest && manifest.keep || [],
           store = { fs: fs, keep: keep, skip: SAVES_SKIP.concat(keep),
                     tree: manifest && manifest.dirs || null };
       return Promise.resolve(store).then(task)
                     .then(function (value) {
                             close_store(fs);
                             return value;
                           },
                           function (e) {
                             close_store(fs);
                             throw e;
                           });
     });
   }

   // The other stores of a family (older versions of the same game).
   function family_stores(family, key) {
     if (!family || !window.indexedDB || typeof indexedDB.databases !== 'function') {
       return Promise.resolve([]);
     }
     return indexedDB.databases().then(function (list) {
                                         return list.map(function (db) { return db.name; })
                                                    .filter(function (name) {
                                                              return name && name !== key && name.indexOf(family) === 0;
                                                            });
                                       },
                                       function () { return []; });
   }

   // MAW: the first boot of a new store key brings the saves over from the
   // newest older store of its family, fitted to the new layout, then deletes
   // the old stores. Resolves with a report, or null if there was nothing.
   function migrate_saves(store, key, family) {
     return family_stores(family, key).then(function (names) {
       return Promise.all(names.map(function (name) {
                                      return open_saves_store(name).then(function (fs) {
                                                                           return { name: name, fs: fs, manifest: read_manifest(fs) };
                                                                         },
                                                                         function () { return null; });
                                    }));
     }).then(function (olds) {
       olds = olds.filter(Boolean).sort(function (a, b) {
                                          return (b.manifest && b.manifest.lastBoot || 0) -
                                                 (a.manifest && a.manifest.lastBoot || 0);
                                        });
       if (olds.length === 0) {
         return null;
       }
       var source = olds[0],
           manifest = source.manifest || {},
           entries = collect_files(source.fs, SAVES_SKIP.concat(manifest.keep || [])),
           report = null;
       if (entries.length > 0) {
         report = place_saves(store, entries, manifest.dirs || null, true);
         report.from = source.name;
       }
       return when_flushed(store.fs).then(function () {
         olds.forEach(function (old) {
           close_store(old.fs);
           try {
             indexedDB.deleteDatabase(old.name);
           } catch (e) {}
         });
         return report;
       });
     });
   }

   // MAW: runs once the game's files are mounted, before it boots: brings
   // saves over from an older version of the game, then records this
   // archive's layout in the manifest. Never fails the boot.
   function prepare_store(store, key, family) {
     var manifest = read_manifest(store.fs),
         now = Date.now(),
         migrating = !manifest && family ? migrate_saves(store, key, family)
                                         : Promise.resolve(null);
     return migrating.then(null, function (e) {
                             console.error("Could not bring the saves over from an older version:", e);
                             return null;
                           })
                     .then(function (report) {
                             try {
                               write_manifest(store.fs, { version: 1,
                                                          key: key,
                                                          created: manifest && manifest.created || now,
                                                          lastBoot: now,
                                                          keep: store.keep,
                                                          dirs: store.tree });
                             } catch (e) {
                               console.error("Could not write the save store manifest:", e);
                             }
                             return report;
                           });
   }

   // Static versions, for a game that isn't running. Don't use them while a
   // game on the same key runs: it holds its own copy of the files.
   Emularity.exportSaves = function (fileSystemKey) {
     return with_store(fileSystemKey, export_saves);
   };

   Emularity.importSaves = function (fileSystemKey, zip) {
     return with_store(fileSystemKey, function (store) { return import_saves(store, zip); });
   };

   Emularity.resetGameFiles = function (fileSystemKey) {
     return with_store(fileSystemKey, reset_game_files);
   };

   Emularity.resetSaves = function (fileSystemKey) {
     return with_store(fileSystemKey, reset_saves);
   };

   Emularity.downloadBlob = function (blob, filename) {
     var url = URL.createObjectURL(blob),
         a = document.createElement('a');
     a.href = url;
     a.download = filename || "saves.zip";
     a.style.display = 'none';
     document.body.appendChild(a);
     a.click();
     document.body.removeChild(a);
     setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
   };

   function extend(a, b) {
     if (a === null)
       return b;
     if (b === null)
       return a;
     var ta = typeof a,
         tb = typeof b;
     if (ta !== tb) {
       if (ta === 'undefined')
         return b;
       if (tb === 'undefined')
         return a;
       throw new Error("Cannot extend an "+ ta +" with an "+ tb);
     }
     if (Array.isArray(a))
       return a.concat(b);
     if (ta === 'object') {
       Object.keys(b).forEach(function (k) {
                                a[k] = extend(k in a ? a[k] : undefined, b[k]);
                              });
       return a;
     }
     return b;
   }

   function dict_from_xml(xml) {
     if (xml instanceof XMLDocument) {
       xml = xml.documentElement;
     }
     var dict = {};
     var len = xml.childNodes.length, i;
     for (i = 0; i < len; i++) {
       var node = xml.childNodes[i];
       dict[node.nodeName] = node.textContent;
     }
     return dict;
   }

   function list_from_xml(xml) {
     if (xml instanceof XMLDocument) {
       xml = xml.documentElement;
     }
     return Array.prototype.slice.call(xml.childNodes);
   }

   function files_from_filelist(xml) {
     return list_from_xml(xml).filter(function (node) {
                                        return "getAttribute" in node;
                                      })
                              .map(function (node) {
                                     var file = dict_from_xml(node);
                                     file.name = node.getAttribute("name");
                                     return file;
                              });
   }

   function files_with_ext_from_filelist(xml, ext) {
     if (!ext) {
       return [];
     }
     if (!ext.startsWith('.')) {
       ext = '.'+ ext;
     }
     ext = ext.toLowerCase();
     return files_from_filelist(xml).filter(function (file) {
                                              return file.name.toLowerCase().endsWith(ext);
                                            });
   }

   function meta_props_matching(meta, regex) {
     if (typeof regex == "string")
       regex = RegExp(regex);
     return Object.keys(meta).map(function (k) {
                                    var match = regex.exec(k);
                                    if (match)
                                      return [k, match];
                                    return null;
                                  })
                             .filter(function (result) {
                               return !!result;
                             });
   }

   function _SDL_CreateRGBSurfaceFrom(pixels, width, height, depth, pitch, rmask, gmask, bmask, amask) {
     // TODO: Actually fill pixel data to created surface.
     // TODO: Take into account depth and pitch parameters.
     // console.log('TODO: Partially unimplemented SDL_CreateRGBSurfaceFrom called!');
     var surface = SDL.makeSurface(width, height, 0, false, 'CreateRGBSurfaceFrom', rmask, gmask, bmask, amask);

     var surfaceData = SDL.surfaces[surface];
     var surfaceImageData = surfaceData.ctx.getImageData(0, 0, width, height);
     var surfacePixelData = surfaceImageData.data;

     // Fill pixel data to created surface.
     // Supports SDL_PIXELFORMAT_RGBA8888 and SDL_PIXELFORMAT_RGB888
     var channels = amask ? 4 : 3; // RGBA8888 or RGB888
     for (var pixelOffset = 0; pixelOffset < width*height; pixelOffset++) {
       surfacePixelData[pixelOffset*4+0] = HEAPU8[pixels + (pixelOffset*channels+0)]; // R
       surfacePixelData[pixelOffset*4+1] = HEAPU8[pixels + (pixelOffset*channels+1)]; // G
       surfacePixelData[pixelOffset*4+2] = HEAPU8[pixels + (pixelOffset*channels+2)]; // B
       surfacePixelData[pixelOffset*4+3] = amask ? HEAPU8[pixels + (pixelOffset*channels+3)] : 0xff; // A
     };

     surfaceData.ctx.putImageData(surfaceImageData, 0, 0);

     return surface;
   }

   window.IALoader = IALoader;
   window.DosBoxLoader = DosBoxLoader;
   window.PC98DosBoxLoader = PC98DosBoxLoader;
   window.JSMESSLoader = MAMELoader; // depreciated; just for backwards compatibility
   window.JSMAMELoader = MAMELoader; // ditto
   window.MAMELoader = MAMELoader;
   window.SAELoader = SAELoader;
   window.PCELoader = PCELoader;
   window.VICELoader = VICELoader;
   window.NP2Loader = NP2Loader;
   window.V86Loader = V86Loader;
   window.RuffleLoader = RuffleLoader;
   window.CloudpilotLoader = CloudpilotLoader;
   window.Emulator = Emulator;
   window.Emularity = Emularity; // MAW: runtime config (base path for assets)
   window._SDL_CreateRGBSurfaceFrom = _SDL_CreateRGBSurfaceFrom;
 })(typeof Promise === 'undefined' ? ES6Promise.Promise : Promise);

// legacy
var JSMESS = JSMESS || {};
JSMESS.ready = function (f) { f(); };

// Local Variables:
// js-indent-level: 2
// End:
