// fs_init.js - IDBFS persistence for DCSS saves and morgue
// This file is prepended to the Emscripten output

Module['preRun'] = Module['preRun'] || [];
Module['preRun'].push(function() {
    console.log("[Bridge] Setting up IDBFS persistence...");

    // Create directories for saves and morgue
    FS.mkdir('/saves');
    FS.mkdir('/morgue');

    // Mount IndexedDB filesystems
    FS.mount(IDBFS, { autoPersist: true, persistByteSize: 1024 * 1024 * 10 }, '/saves');
    FS.mount(IDBFS, { autoPersist: true, persistByteSize: 1024 * 1024 * 10 }, '/morgue');

    // Sync filesystem on startup
    FS.syncfs(true, function(err) {
        if (err) {
            console.error("[Bridge] IDBFS sync error:", err);
        } else {
            console.log("[Bridge] IDBFS persistence ready at /saves and /morgue");
        }
    });
});

// Also handle game saves directory
Module['onRuntimeInit'] = function() {
    console.log("[Bridge] DCSS runtime initialized");
};