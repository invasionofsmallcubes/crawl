// library_dcss.js — curses input bridge for the WASM build.
//
// We implement getch/wgetch/get_wch here instead of in C so that we
// can call Asyncify.handleSleep directly: one suspend per blocking
// read, no polling loop, no recursive stack growth.
//
// Contract with index.html:
//   Module._dcssKeyBuffer  — array of pending keycodes (numbers).
//   Module._dcssKeyResolve — set by getch() while suspended; the
//                            key handler calls it with the keycode.
//   Module._dcss.nodelay   — set by nodelay() in libunix.cc.

mergeInto(LibraryManager.library, {

    getch__async: true,
    getch__deps: ['$Asyncify'],
    getch: function() {
        var buf = Module._dcssKeyBuffer;
        if (buf && buf.length > 0) {
            return buf.shift();
        }
        if (Module._dcssNodelay) {
            return -1; // ERR — non-blocking, no key available.
        }
        return Asyncify.handleSleep(function(wakeUp) {
            Module._dcssKeyResolve = function(code) {
                Module._dcssKeyResolve = null;
                wakeUp(code);
            };
        });
    },

    wgetch__async: true,
    wgetch__deps: ['getch'],
    wgetch: function(win) {
        return _getch();
    },

    get_wch__async: true,
    get_wch__deps: ['getch'],
    get_wch: function(p) {
        // Codes >= 0x100 are ncurses function keys (KEY_UP, KEY_BACKSPACE, ...).
        // Real ncurses signals these via KEY_CODE_YES so callers don't treat
        // them as printable wide chars. ERR=-1, OK=0, KEY_CODE_YES=0400 (256).
        var code = _getch();
        if (p) {
            HEAP32[p >> 2] = (code < 0) ? 0 : code;
        }
        if (code < 0)    return -1;     // ERR
        if (code >= 256) return 0400;   // KEY_CODE_YES — function key
        return 0;                        // OK — printable wide char
    }
});
