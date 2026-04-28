(function () {
    'use strict';

    // -----------------------------------------------------------------------
    // Key definitions
    // -----------------------------------------------------------------------

    // D-pad: 3×3 grid in reading order (top-left to bottom-right).
    // Cardinals send arrow keys so they work in menus too — DCSS menus
    // accept arrows for navigation but not vi-keys (hjkl only move on the
    // game map). Diagonals stay as vi-keys (yubn) since menus are 1-D /
    // 2-D and don't need diagonals; in-game movement still works for both.
    // ASCII charCode values are ncurses KEY_* codes (>= 256, picked up by
    // get_wch as KEY_CODE_YES function keys); tile mode ignores charCode
    // for non-keypress events and reads keyCode/key/code instead.
    var DPAD = [
        { label: '↖', charCode: 121, key: 'y', code: 'KeyY' },
        { label: '↑', charCode: 259, key: 'ArrowUp',    code: 'ArrowUp' },
        { label: '↗', charCode: 117, key: 'u', code: 'KeyU' },
        { label: '←', charCode: 260, key: 'ArrowLeft',  code: 'ArrowLeft' },
        { label: '·', charCode: 46,  key: '.', code: 'Period', isWait: true },
        { label: '→', charCode: 261, key: 'ArrowRight', code: 'ArrowRight' },
        { label: '↙', charCode: 98,  key: 'b', code: 'KeyB' },
        { label: '↓', charCode: 258, key: 'ArrowDown',  code: 'ArrowDown' },
        { label: '↘', charCode: 110, key: 'n', code: 'KeyN' },
    ];

    var CATEGORIES = {
        items: {
            label: 'Items',
            buttons: [
                { name: 'Inventory', title: 'Inventory',        charCode: 105, key: 'i', code: 'KeyI' },
                { name: 'Quaff',     title: 'Quaff potion',     charCode: 113, key: 'q', code: 'KeyQ' },
                { name: 'Read',      title: 'Read scroll/book', charCode: 114, key: 'r', code: 'KeyR' },
                { name: 'Pick up',   title: 'Pick up item',     charCode: 103, key: 'g', code: 'KeyG' },
                { name: 'Drop',      title: 'Drop item',        charCode: 100, key: 'd', code: 'KeyD' },
                { name: 'Wield',     title: 'Wield weapon',     charCode: 119, key: 'w', code: 'KeyW' },
                { name: 'Wear',      title: 'Wear armour',      charCode: 87,  key: 'W', code: 'KeyW', shiftKey: true },
                { name: 'Take off',  title: 'Take off armour',  charCode: 84,  key: 'T', code: 'KeyT', shiftKey: true },
            ],
        },
        combat: {
            label: 'Combat',
            buttons: [
                { name: 'Attack', title: 'Auto-attack nearest',   charCode: 9,   key: 'Tab', code: 'Tab' },
                { name: 'Cast',   title: 'Cast spell / Zap wand', charCode: 122, key: 'z',   code: 'KeyZ' },
                { name: 'Throw',  title: 'Throw item',            charCode: 116, key: 't',   code: 'KeyT' },
                { name: 'Ability', title: 'Use ability',          charCode: 97,  key: 'a',   code: 'KeyA' },
                { name: 'Evoke',  title: 'Evoke item',            charCode: 118, key: 'v',   code: 'KeyV' },
            ],
        },
        explore: {
            label: 'Explore',
            buttons: [
                { name: 'Autoexplore', title: 'Autoexplore',           charCode: 111, key: 'o', code: 'KeyO' },
                { name: 'Travel',      title: 'Travel to location',    charCode: 71,  key: 'G', code: 'KeyG', shiftKey: true },
                { name: 'Search',      title: 'Search current tile',   charCode: 115, key: 's', code: 'KeyS' },
                { name: 'Look',        title: 'Look around / examine', charCode: 120, key: 'x', code: 'KeyX' },
                { name: 'Descend',     title: 'Descend stairs',        charCode: 62,  key: '>', code: 'Period', shiftKey: true },
                { name: 'Ascend',      title: 'Ascend stairs',         charCode: 60,  key: '<', code: 'Comma',  shiftKey: true },
            ],
        },
        meta: {
            label: 'Meta',
            buttons: [
                { name: 'Confirm',   title: 'Confirm / Enter',    charCode: 13, key: 'Enter', code: 'Enter' },
                { name: 'Space',     title: 'Space (more / dismiss)', charCode: 32, key: ' ', code: 'Space' },
                { name: 'Help',      title: 'Help / commands',    charCode: 63, key: '?', code: 'Slash',  shiftKey: true },
                { name: 'Character', title: 'Character overview', charCode: 64, key: '@', code: 'Digit2', shiftKey: true },
                { name: 'Religion',  title: 'Religion menu',      charCode: 94, key: '^', code: 'Digit6', shiftKey: true },
                { name: 'Save',      title: 'Save and quit',      charCode: 19, key: 's', code: 'KeyS', ctrlKey: true },
                { name: 'Messages',  title: 'Message log',        charCode: 16, key: 'p', code: 'KeyP', ctrlKey: true },
                { name: 'Find',      title: 'Find item',          charCode: 6,  key: 'f', code: 'KeyF', ctrlKey: true },
            ],
        },
    };

    // -----------------------------------------------------------------------
    // Key-code helpers
    // -----------------------------------------------------------------------

    // Emscripten's SDL2 port maps DOM keyCode (the legacy integer property) to
    // SDL scancodes via a lookup table. Synthetic KeyboardEvents have keyCode=0
    // by default, so SDL gets SDL_SCANCODE_UNKNOWN and silently drops the event.
    // Chrome/Firefox honour keyCode when passed in the KeyboardEventInit dict,
    // so we derive it from the button's `code` field.
    function deriveKeyCode(code, shiftKey, ctrlKey) {
        if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3); // KeyO → 79
        var map = {
            'Tab':    9,
            'Enter':  13,
            'Space':  32,
            'Period': 190,
            'Comma':  188,
            'Slash':  191,
            'ArrowLeft':  37,
            'ArrowUp':    38,
            'ArrowRight': 39,
            'ArrowDown':  40,
            'Digit0': 48, 'Digit1': 49, 'Digit2': 50, 'Digit3': 51,
            'Digit4': 52, 'Digit5': 53, 'Digit6': 54, 'Digit7': 55,
            'Digit8': 56, 'Digit9': 57,
        };
        return map[code] || 0;
    }

    // -----------------------------------------------------------------------
    // Input injection
    // -----------------------------------------------------------------------

    function detectMode() {
        if (window.DCSS_MODE) return window.DCSS_MODE;
        // Heuristic: tiles build sets Module.canvas (an HTMLCanvasElement).
        // ASCII build leaves Module.canvas unset and uses xterm.js + the
        // _dcssKeyBuffer bridge. Fall back to ASCII if neither is detectable.
        if (window.Module && window.Module.canvas) return 'tiles';
        return 'ascii';
    }

    function injectKey(btn, srcEl) {
        var mode = detectMode();

        // Brief flash on the button so the tap is visually acknowledged.
        if (srcEl) {
            srcEl.style.background = '#445';
            setTimeout(function () { srcEl.style.background = ''; }, 120);
        }

        if (mode === 'tiles') {
            tilesInject(btn);
        } else {
            asciiInject(btn);
        }
    }

    // Tiles input bridge — synthesise keyboard events and hand them to SDL2.
    //
    // Three browser/SDL quirks make naive `dispatchEvent` insufficient:
    //
    //   1. Chrome/Safari ignore keyCode/which in KeyboardEventInit; only
    //      Firefox honours them. Emscripten's SDL2 port reads e.keyCode and
    //      uses it as an index into a DOM-keyCode → SDL_Scancode table. With
    //      keyCode=0 the lookup returns SDL_SCANCODE_UNKNOWN and SDL2 drops
    //      the event. We override the property descriptor on the event
    //      instance so SDL2 sees the right value in any browser.
    //
    //   2. SDL2 registers its keyboard listeners on window via Emscripten's
    //      HTML5 events API. Synthetic events bubbling from the canvas don't
    //      always reach those listeners — and even when they do, SDL2's
    //      handler doesn't call SDL_TEXTINPUT for character keys unless
    //      keypress is also dispatched. tiles.html captures SDL2's listener
    //      registrations into window.__vkbKeyListeners so we can invoke them
    //      directly with our synthetic events.
    //
    //   3. Modifier bookkeeping. SDL_GetModState() reads from the internal
    //      keystate array, which is only updated by SDL_KEYDOWN/KEYUP for the
    //      modifier scancodes themselves — not from the per-event ctrlKey
    //      flag. DCSS converts SDLK_f + KMOD_CTRL → ^F by checking that
    //      modifier state, so a single keydown(KeyF, ctrlKey=true) without a
    //      preceding keydown(ControlLeft) gets read as plain 'f'. We wrap
    //      ctrl-letter sequences with explicit Control down/up events to
    //      match a real keyboard's event sequence.
    function fireListeners(ev, type) {
        var listeners = window.__vkbKeyListeners || [];
        listeners.forEach(function (reg) {
            if (reg.type !== type) return;
            try { reg.listener(ev); } catch (e) { /* ignore */ }
        });
    }

    function makeKeyEvent(type, init, kc, charCode) {
        var e = new KeyboardEvent(type, init);
        var isPress = type === 'keypress';
        Object.defineProperty(e, 'keyCode',  { get: function () { return isPress ? charCode : kc; } });
        Object.defineProperty(e, 'which',    { get: function () { return isPress ? charCode : kc; } });
        Object.defineProperty(e, 'charCode', { get: function () { return isPress ? charCode : 0; } });
        return e;
    }

    function tilesInject(btn) {
        var canvas = document.getElementById('canvas');
        if (!canvas) return;
        canvas.focus({ preventScroll: true });

        var kc = deriveKeyCode(btn.code, !!btn.shiftKey, !!btn.ctrlKey);
        // Browsers fire keypress for printable single-char keys with no
        // Ctrl/Alt modifier; match that so SDL2 generates SDL_TEXTINPUT.
        // DCSS reads letter input via SDL_TEXTINPUT, not SDL_KEYDOWN.
        var wantKeypress = btn.key && btn.key.length === 1 && !btn.ctrlKey && !btn.altKey;

        // Open the modifier first so SDL_KEYMOD_CTRL is set before the letter
        // keydown lands. Without this, ctrl-letter combos read as plain
        // letters because DCSS's SDL handler checks SDL_GetModState().
        if (btn.ctrlKey) {
            var ctrlInit = { key: 'Control', code: 'ControlLeft', ctrlKey: true,
                             bubbles: true, cancelable: true };
            fireListeners(makeKeyEvent('keydown', ctrlInit, 17, 0), 'keydown');
        }

        var evInit = {
            key:      btn.key,
            code:     btn.code,
            shiftKey: !!btn.shiftKey,
            ctrlKey:  !!btn.ctrlKey,
            bubbles:  true,
            cancelable: true,
        };
        fireListeners(makeKeyEvent('keydown', evInit, kc, btn.charCode), 'keydown');
        if (wantKeypress) {
            fireListeners(makeKeyEvent('keypress', evInit, kc, btn.charCode), 'keypress');
        }
        fireListeners(makeKeyEvent('keyup', evInit, kc, btn.charCode), 'keyup');

        if (btn.ctrlKey) {
            var ctrlUpInit = { key: 'Control', code: 'ControlLeft', ctrlKey: false,
                               bubbles: true, cancelable: true };
            fireListeners(makeKeyEvent('keyup', ctrlUpInit, 17, 0), 'keyup');
        }
    }

    // ASCII input bridge — push directly into the curses key buffer that
    // library_dcss.js's getch() shim drains.
    function asciiInject(btn) {
        var M = window.Module;
        if (!M) return;
        var code = btn.charCode;
        if (M._dcssKeyResolve) {
            M._dcssKeyResolve(code);
        } else {
            M._dcssKeyBuffer = M._dcssKeyBuffer || [];
            M._dcssKeyBuffer.push(code);
        }
    }

    // -----------------------------------------------------------------------
    // DOM helpers
    // -----------------------------------------------------------------------

    function formatShortcut(btn) {
        var k = btn.key;
        if (k === ' ') k = 'Space';
        if (btn.ctrlKey) return '(Ctrl+' + k.toUpperCase() + ')';
        return '(' + k + ')';
    }

    function makeBtn(btn, extraClass) {
        var el = document.createElement('button');
        el.className = 'vkb-btn' + (extraClass ? ' ' + extraClass : '');
        var isDpad = extraClass && extraClass.indexOf('vkb-dpad-btn') !== -1;
        if (isDpad) {
            el.textContent = btn.label;
        } else {
            var nameSpan = document.createElement('span');
            nameSpan.className = 'vkb-btn-name';
            nameSpan.textContent = btn.name || btn.label;
            var keySpan = document.createElement('span');
            keySpan.className = 'vkb-btn-key';
            keySpan.textContent = formatShortcut(btn);
            el.appendChild(nameSpan);
            el.appendChild(keySpan);
        }
        if (btn.title) el.setAttribute('title', btn.title);
        var lastTouch = 0;
        el.addEventListener('touchstart', function (e) {
            e.preventDefault();
            lastTouch = Date.now();
            injectKey(btn, el);
        }, { passive: false });
        el.addEventListener('touchend', function (e) {
            e.preventDefault();
        }, { passive: false });
        // mousedown for desktop; guard against double-fire with touch emulation.
        el.addEventListener('mousedown', function (e) {
            if (Date.now() - lastTouch < 300) return;
            e.preventDefault();
            injectKey(btn, el);
        });
        return el;
    }

    function renderCategory(cat) {
        var container = document.getElementById('vkb-buttons');
        if (!container) return;
        container.innerHTML = '';
        var catDef = CATEGORIES[cat];
        if (!catDef) return;
        catDef.buttons.forEach(function (btn) {
            container.appendChild(makeBtn(btn));
        });
    }

    function setCategory(cat) {
        activeCategory = cat;
        try { localStorage.setItem('vkb-category', cat); } catch (e) {}
        document.querySelectorAll('.vkb-tab').forEach(function (tab) {
            tab.classList.toggle('active', tab.dataset.cat === cat);
        });
        renderCategory(cat);
    }

    // -----------------------------------------------------------------------
    // Mount / unmount
    // -----------------------------------------------------------------------

    var activeCategory;

    function mount() {
        if (document.getElementById('vkb-overlay')) return; // already mounted

        try { activeCategory = localStorage.getItem('vkb-category'); } catch (e) {}
        if (!activeCategory || !CATEGORIES[activeCategory]) activeCategory = 'items';

        // Inject stylesheet if not already loaded.
        if (!document.getElementById('vkb-css')) {
            var link = document.createElement('link');
            link.id = 'vkb-css';
            link.rel = 'stylesheet';
            link.href = 'vkb.css';
            document.head.appendChild(link);
        }

        var overlay = document.createElement('div');
        overlay.id = 'vkb-overlay';

        // D-pad
        var dpad = document.createElement('div');
        dpad.id = 'vkb-dpad';
        DPAD.forEach(function (btn) {
            var cls = 'vkb-dpad-btn' + (btn.isWait ? ' vkb-wait' : '');
            dpad.appendChild(makeBtn(btn, cls));
        });
        overlay.appendChild(dpad);

        // Actions panel
        var actions = document.createElement('div');
        actions.id = 'vkb-actions';

        var tabs = document.createElement('div');
        tabs.id = 'vkb-tabs';
        Object.keys(CATEGORIES).forEach(function (cat) {
            var tab = document.createElement('button');
            tab.className = 'vkb-tab' + (cat === activeCategory ? ' active' : '');
            tab.dataset.cat = cat;
            tab.textContent = CATEGORIES[cat].label;
            var lastTabTouch = 0;
            tab.addEventListener('touchstart', function (e) {
                e.preventDefault();
                lastTabTouch = Date.now();
                setCategory(cat);
            }, { passive: false });
            tab.addEventListener('touchend', function (e) {
                e.preventDefault();
            }, { passive: false });
            tab.addEventListener('mousedown', function (e) {
                if (Date.now() - lastTabTouch < 300) return;
                e.preventDefault();
                setCategory(cat);
            });
            tabs.appendChild(tab);
        });
        actions.appendChild(tabs);

        var buttons = document.createElement('div');
        buttons.id = 'vkb-buttons';
        actions.appendChild(buttons);

        overlay.appendChild(actions);
        document.body.appendChild(overlay);

        renderCategory(activeCategory);
        document.body.classList.add('vkb-active');
        updateToggle(true);
        try { localStorage.setItem('vkb-enabled', '1'); } catch (e) {}
    }

    function unmount() {
        var overlay = document.getElementById('vkb-overlay');
        if (overlay) overlay.remove();
        document.body.classList.remove('vkb-active');
        updateToggle(false);
        try { localStorage.setItem('vkb-enabled', '0'); } catch (e) {}
    }

    // -----------------------------------------------------------------------
    // Toggle button (always present after vkb.js loads)
    // -----------------------------------------------------------------------

    function updateToggle(active) {
        var btn = document.getElementById('vkb-toggle');
        if (!btn) return;
        btn.textContent = active ? '✕' : '⌨';
        btn.setAttribute('title', active ? 'Hide virtual keyboard' : 'Show virtual keyboard');
    }

    function createToggle() {
        if (document.getElementById('vkb-toggle')) return;
        var btn = document.createElement('button');
        btn.id = 'vkb-toggle';
        btn.textContent = '⌨';
        btn.setAttribute('title', 'Show virtual keyboard');
        btn.addEventListener('touchstart', function (e) {
            e.preventDefault();
            toggle();
        }, { passive: false });
        btn.addEventListener('mousedown', function (e) {
            e.preventDefault();
            toggle();
        });
        document.body.appendChild(btn);
        // Inject toggle styles if the full vkb.css hasn't been loaded yet.
        if (!document.getElementById('vkb-css')) {
            var style = document.getElementById('vkb-toggle-style');
            if (!style) {
                style = document.createElement('style');
                style.id = 'vkb-toggle-style';
                style.textContent = [
                    '#vkb-toggle{position:fixed;bottom:8px;right:8px;z-index:1001;',
                    'background:#222;color:#888;border:1px solid #444;border-radius:50%;',
                    'width:40px;height:40px;font-size:18px;cursor:pointer;',
                    'touch-action:manipulation;display:flex;align-items:center;',
                    'justify-content:center;-webkit-tap-highlight-color:transparent;}',
                    'body.vkb-active #vkb-toggle{bottom:calc(30vh + 8px);}',
                ].join('');
                document.head.appendChild(style);
            }
        }
    }

    function toggle() {
        if (document.getElementById('vkb-overlay')) {
            unmount();
        } else {
            mount();
        }
    }

    // -----------------------------------------------------------------------
    // Initialise
    // -----------------------------------------------------------------------

    createToggle();

    var enabledPref;
    try { enabledPref = localStorage.getItem('vkb-enabled'); } catch (e) {}
    var wantsVkb = new URLSearchParams(location.search).get('vkb') === '1'
                   || enabledPref === '1';
    if (wantsVkb) {
        mount();
    }

    // Expose for external use (e.g. landing page deep-link).
    window.vkbMount   = mount;
    window.vkbUnmount = unmount;
    window.vkbToggle  = toggle;
}());
