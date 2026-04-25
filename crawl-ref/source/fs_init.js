// fs_init.js — IDBFS persistence for DCSS saves and morgue.
// Wired in via Emscripten's --pre-js, runs before the WASM module starts.
// DCSS is invoked with `-dir /crawl`, so its save and morgue paths are
// /crawl/saves and /crawl/morgue. We mount IDBFS at those exact paths so
// IndexedDB-backed persistence actually intercepts writes.

Module['preRun'] = Module['preRun'] || [];
Module['preRun'].push(function() {
    console.log("[fs_init] Setting up IDBFS persistence at /crawl/saves and /crawl/morgue...");

    // Create the home dir + leaf dirs DCSS writes into.
    var dirs = ['/crawl', '/crawl/saves', '/crawl/morgue', '/crawl/crash'];
    dirs.forEach(function(d) {
        try { FS.mkdir(d); } catch (e) { /* already exists */ }
    });

    // Mount IndexedDB-backed filesystems where saves and morgue actually live.
    // autoPersist: true flushes writes to IndexedDB without explicit syncfs.
    var idbfsOpts = { autoPersist: true, persistByteSize: 10 * 1024 * 1024 };
    try {
        FS.mount(IDBFS, idbfsOpts, '/crawl/saves');
        FS.mount(IDBFS, idbfsOpts, '/crawl/morgue');
    } catch (e) {
        console.error("[fs_init] IDBFS mount failed:", e);
        return;
    }

    // Hydrate from IndexedDB on startup so existing saves are visible.
    FS.syncfs(true, function(err) {
        if (err)
            console.error("[fs_init] IDBFS sync (hydrate) error:", err);
        else
            console.log("[fs_init] IDBFS hydrated; saves persist across reloads.");
    });
});
