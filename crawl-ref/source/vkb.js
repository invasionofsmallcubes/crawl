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

    // Enter / Esc — rendered below the d-pad. Always reachable, no matter
    // which category or qwerty mode is active. Esc additionally clears any
    // pending follow-up state (see `setMode`); Enter clears it iff the mode
    // was triggered by a 'text' follow-up (see button handler).
    var ENTER_BTN = { label: '↵', name: 'Enter', key: 'Enter',  code: 'Enter',  charCode: 13 };
    var ESC_BTN   = { label: 'Esc', name: 'Esc',  key: 'Escape', code: 'Escape', charCode: 27 };

    // Action categories. Each button can declare a `followUp`:
    //   undefined : send the key, no UI change.
    //   'letter'  : send the key, then show the qwerty for one letter
    //               (auto-returns to category after one tap).
    //   'text'    : send the key, then show the qwerty persistently
    //               (Enter or Esc closes it).
    // After 'letter' / 'text' picks, DCSS is in "wait for direction" mode —
    // the d-pad on the right is always there, and the Enter button below it
    // sends the default-target confirmation, so we don't need extra UI.
    var CATEGORIES = {
        fight: {
            label: '⚔️ Fight',
            buttons: [
                { name: 'Autofight', key: 'Tab', code: 'Tab',    charCode: 9   },
                { name: 'Cast',      key: 'z',   code: 'KeyZ',   charCode: 122, followUp: 'letter' },
                { name: 'Fire',      key: 'f',   code: 'KeyF',   charCode: 102 },
                { name: 'Evoke',     key: 'v',   code: 'KeyV',   charCode: 118, followUp: 'letter' },
                { name: 'Wait',      key: '5',   code: 'Digit5', charCode: 53  },
                { name: 'Ability',   key: 'a',   code: 'KeyA',   charCode: 97,  followUp: 'letter' },
            ],
        },
        nav: {
            label: '🗺️ Nav',
            buttons: [
                { name: 'Explore', key: 'o', code: 'KeyO',   charCode: 111 },
                { name: 'Travel',  key: 'G', code: 'KeyG',   charCode: 71,  shiftKey: true,  followUp: 'text' },
                { name: 'Up',      key: '<', code: 'Comma',  charCode: 60,  shiftKey: true },
                { name: 'Down',    key: '>', code: 'Period', charCode: 62,  shiftKey: true },
                { name: 'Look',    key: 'x', code: 'KeyX',   charCode: 120, followUp: 'letter' },
                { name: 'Find',    key: 'f', code: 'KeyF',   charCode: 6,   ctrlKey: true,   followUp: 'text' },
            ],
        },
        item: {
            label: '🎒 Item',
            buttons: [
                { name: 'Inventory', key: 'i', code: 'KeyI', charCode: 105, followUp: 'letter' },
                { name: 'Pick up',   key: 'g', code: 'KeyG', charCode: 103 },
                { name: 'Drop',      key: 'd', code: 'KeyD', charCode: 100, followUp: 'letter' },
                { name: 'Wield',     key: 'w', code: 'KeyW', charCode: 119, followUp: 'letter' },
                { name: 'Wear',      key: 'W', code: 'KeyW', charCode: 87,  shiftKey: true, followUp: 'letter' },
                { name: 'Take off',  key: 'T', code: 'KeyT', charCode: 84,  shiftKey: true, followUp: 'letter' },
                { name: 'Put on',    key: 'P', code: 'KeyP', charCode: 80,  shiftKey: true, followUp: 'letter' },
                { name: 'Remove',    key: 'R', code: 'KeyR', charCode: 82,  shiftKey: true, followUp: 'letter' },
                { name: 'Quiver',    key: 'Q', code: 'KeyQ', charCode: 81,  shiftKey: true, followUp: 'letter' },
            ],
        },
        consume: {
            label: '🧪 Consume',
            buttons: [
                { name: 'Quaff', key: 'q', code: 'KeyQ', charCode: 113, followUp: 'letter' },
                { name: 'Read',  key: 'r', code: 'KeyR', charCode: 114, followUp: 'letter' },
                { name: 'Eat',   key: 'e', code: 'KeyE', charCode: 101, followUp: 'letter' },
            ],
        },
        meta: {
            label: '📜 Meta',
            buttons: [
                { name: 'Status',    key: '@', code: 'Digit2', charCode: 64,  shiftKey: true },
                { name: 'Skills',    key: 'm', code: 'KeyM',   charCode: 109, followUp: 'letter' },
                { name: 'Religion',  key: '^', code: 'Digit6', charCode: 94,  shiftKey: true },
                { name: 'Mutations', key: 'A', code: 'KeyA',   charCode: 65,  shiftKey: true },
                { name: 'Spells',    key: 'I', code: 'KeyI',   charCode: 73,  shiftKey: true, followUp: 'letter' },
                { name: 'Resists',   key: '%', code: 'Digit5', charCode: 37,  shiftKey: true },
                { name: 'Help',      key: '?', code: 'Slash',  charCode: 63,  shiftKey: true },
                { name: 'Save',      key: 's', code: 'KeyS',   charCode: 19,  ctrlKey:  true },
            ],
        },
        keyboard: {
            label: '⌨️',
            // Special-case: selecting this tab opens the persistent qwerty
            // (mode='qwerty-keyboard'). No buttons array — see `setCategory`.
            isQwerty: true,
        },
    };

    // QWERTY layout. Each cell is either a printable single char or a
    // special token: SHIFT (toggle case), BACK (backspace), SPACE.
    // Numbers stay digits in shifted mode (no symbol overlay) — DCSS
    // doesn't ask for symbols often enough to justify the complexity.
    var QWERTY_LAYOUT = [
        ['1','2','3','4','5','6','7','8','9','0'],
        ['q','w','e','r','t','y','u','i','o','p'],
        ['a','s','d','f','g','h','j','k','l'],
        ['SHIFT','z','x','c','v','b','n','m','BACK'],
        ['.',',',':','-','\'','SPACE'],
    ];

    // Punctuation key descriptors (DOM `code` + DOM keyCode + whether shift
    // is required to type the char on a US layout). Letters/digits are
    // derived from the char itself; only the irregulars need a table.
    var PUNCT = {
        '.':  { code: 'Period',    keyCode: 190, shift: false },
        ',':  { code: 'Comma',     keyCode: 188, shift: false },
        ':':  { code: 'Semicolon', keyCode: 186, shift: true  },
        '-':  { code: 'Minus',     keyCode: 189, shift: false },
        '\'': { code: 'Quote',     keyCode: 222, shift: false },
    };

    // -----------------------------------------------------------------------
    // Module state
    // -----------------------------------------------------------------------

    // mode:
    //   'category'         — show category buttons.
    //   'qwerty-once'      — show qwerty; auto-return to 'category' after one tap.
    //   'qwerty-text'      — show qwerty; Enter or Esc returns to 'category'.
    //   'qwerty-keyboard'  — show qwerty; only category-tab change closes it.
    //                        (User selected the Keyboard tab explicitly.)
    var state = {
        mode: 'category',
        qwertyShift: false,
        activeCategory: 'fight',
    };

    function isQwertyMode(m) { return m === 'qwerty-once' || m === 'qwerty-text' || m === 'qwerty-keyboard'; }

    // -----------------------------------------------------------------------
    // Key-code helpers
    // -----------------------------------------------------------------------

    // Emscripten's SDL2 port maps DOM keyCode (the legacy integer property) to
    // SDL scancodes via a lookup table. Synthetic KeyboardEvents have keyCode=0
    // by default, so SDL gets SDL_SCANCODE_UNKNOWN and silently drops the event.
    // Chrome/Safari ignore keyCode in KeyboardEventInit; we override the
    // property descriptor on the event instance so SDL2 sees the right value.
    function deriveKeyCode(code) {
        if (!code) return 0;
        if (/^Key[A-Z]$/.test(code))   return code.charCodeAt(3);   // KeyO → 79
        if (/^Digit[0-9]$/.test(code)) return code.charCodeAt(5);   // Digit5 → 53
        var map = {
            'Tab':    9,
            'Enter':  13,
            'Escape': 27,
            'Space':  32,
            'Period': 190,
            'Comma':  188,
            'Slash':  191,
            'Semicolon': 186,
            'Minus':  189,
            'Quote':  222,
            'Backspace': 8,
            'ArrowLeft':  37,
            'ArrowUp':    38,
            'ArrowRight': 39,
            'ArrowDown':  40,
        };
        return map[code] || 0;
    }

    // -----------------------------------------------------------------------
    // Input injection
    // -----------------------------------------------------------------------

    function detectMode() {
        if (window.DCSS_MODE) return window.DCSS_MODE;
        if (window.Module && window.Module.canvas) return 'tiles';
        return 'ascii';
    }

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

    // Tiles input bridge — synthesise keyboard events and hand them to SDL2.
    //
    // Three browser/SDL quirks make naive `dispatchEvent` insufficient:
    //
    //   1. Chrome/Safari ignore keyCode in KeyboardEventInit; only Firefox
    //      honours it. Override the instance property so SDL2 sees it.
    //
    //   2. SDL2 registers its keyboard listeners on window via Emscripten's
    //      HTML5 events API. tiles.html captures them into
    //      window.__vkbKeyListeners so we can invoke them directly with
    //      synthetic events (bypassing DOM-dispatch quirks).
    //
    //   3. SDL_GetModState() reads from the internal keystate array, which
    //      is only updated by SDL_KEYDOWN/KEYUP for the modifier scancodes
    //      themselves — not from the per-event ctrlKey flag. DCSS converts
    //      SDLK_f + KMOD_CTRL → ^F by checking that modifier state, so a
    //      single keydown(KeyF, ctrlKey=true) without a preceding
    //      keydown(ControlLeft) gets read as plain 'f'. We wrap ctrl-letter
    //      sequences with explicit Control down/up events.
    function tilesInject(btn) {
        var canvas = document.getElementById('canvas');
        if (!canvas) return;
        canvas.focus({ preventScroll: true });

        var kc = deriveKeyCode(btn.code);
        // Browsers fire keypress for printable single-char keys with no
        // Ctrl/Alt modifier; match that so SDL2 generates SDL_TEXTINPUT.
        // DCSS reads letter input via SDL_TEXTINPUT, not SDL_KEYDOWN.
        var wantKeypress = btn.key && btn.key.length === 1 && !btn.ctrlKey && !btn.altKey;

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

    function injectKey(btn, srcEl) {
        var m = detectMode();
        if (srcEl) {
            srcEl.style.background = '#445';
            setTimeout(function () { srcEl.style.background = ''; }, 120);
        }
        if (m === 'tiles') tilesInject(btn);
        else               asciiInject(btn);
    }

    // -----------------------------------------------------------------------
    // Mode transitions
    // -----------------------------------------------------------------------

    function setMode(newMode) {
        if (state.mode === newMode) return;
        state.mode = newMode;
        if (!isQwertyMode(newMode)) state.qwertyShift = false;
        renderActions();
        updateModeIndicators();
    }

    function setCategory(cat) {
        if (!CATEGORIES[cat]) return;
        state.activeCategory = cat;
        try { localStorage.setItem('vkb-category', cat); } catch (e) {}
        document.querySelectorAll('.vkb-tab').forEach(function (tab) {
            tab.classList.toggle('active', tab.dataset.cat === cat);
        });
        // Selecting the Keyboard tab opens persistent qwerty; any other tab
        // returns to category-buttons mode.
        if (CATEGORIES[cat].isQwerty) setMode('qwerty-keyboard');
        else                          setMode('category');
        // Always re-render — even if mode didn't change (e.g. switching
        // between two non-qwerty categories), we still need fresh buttons.
        if (state.mode === 'category') renderActions();
    }

    // -----------------------------------------------------------------------
    // Action button handler — sends the key and applies followUp.
    // -----------------------------------------------------------------------

    function handleAction(btn, srcEl) {
        injectKey(btn, srcEl);
        if (btn.followUp === 'letter')      setMode('qwerty-once');
        else if (btn.followUp === 'text')   setMode('qwerty-text');
        // No followUp: stay where we are.
    }

    // Special handlers for Enter / Esc (the meta keys below the d-pad).
    function handleEnter(srcEl) {
        injectKey(ENTER_BTN, srcEl);
        // Pressing Enter while typing into a text prompt closes the prompt
        // on DCSS's side; mirror that by leaving qwerty-text mode. The
        // persistent Keyboard-tab mode stays open — the user opened it
        // explicitly and should close it explicitly (via Esc or tab change).
        if (state.mode === 'qwerty-text') setMode('category');
    }
    function handleEsc(srcEl) {
        injectKey(ESC_BTN, srcEl);
        // Escape always returns to the category view. DCSS's own menu
        // hierarchy is popped by the Esc key we just sent it; the vkb just
        // mirrors that one level of "go back" locally.
        if (isQwertyMode(state.mode)) setMode('category');
    }

    // -----------------------------------------------------------------------
    // QWERTY rendering
    // -----------------------------------------------------------------------

    // Build the btn descriptor for a qwerty cell. `cell` is a string from
    // QWERTY_LAYOUT — either a printable char or a special token.
    function qwertyCellBtn(cell) {
        if (cell === 'SHIFT' || cell === 'BACK' || cell === 'SPACE') return null;
        var ch = cell;
        if (/^[a-z]$/.test(ch)) {
            var actual = state.qwertyShift ? ch.toUpperCase() : ch;
            return {
                name: actual, key: actual,
                code: 'Key' + ch.toUpperCase(),
                charCode: actual.charCodeAt(0),
                shiftKey: state.qwertyShift,
            };
        }
        if (/^[0-9]$/.test(ch)) {
            return {
                name: ch, key: ch,
                code: 'Digit' + ch,
                charCode: ch.charCodeAt(0),
            };
        }
        var p = PUNCT[ch];
        if (p) {
            return {
                name: ch, key: ch,
                code: p.code,
                charCode: ch.charCodeAt(0),
                shiftKey: !!p.shift,
            };
        }
        return null;
    }

    function makeQwertyKey(cell) {
        var el = document.createElement('button');
        el.className = 'vkb-qkey';

        var label;
        if      (cell === 'SHIFT') { label = state.qwertyShift ? '⇧*' : '⇧'; el.classList.add('vkb-qkey-mod'); }
        else if (cell === 'BACK')  { label = '⌫';  el.classList.add('vkb-qkey-mod'); el.classList.add('vkb-qkey-back'); }
        else if (cell === 'SPACE') { label = ' '; el.classList.add('vkb-qkey-space'); }
        else                       { label = state.qwertyShift && /^[a-z]$/.test(cell) ? cell.toUpperCase() : cell; }
        el.textContent = label;

        function fire() {
            if (cell === 'SHIFT') {
                state.qwertyShift = !state.qwertyShift;
                renderActions();
                return;
            }
            if (cell === 'BACK') {
                injectKey({ key: 'Backspace', code: 'Backspace', charCode: 8 }, el);
                return;
            }
            if (cell === 'SPACE') {
                injectKey({ key: ' ', code: 'Space', charCode: 32 }, el);
                return;
            }
            var btn = qwertyCellBtn(cell);
            if (!btn) return;
            injectKey(btn, el);
            // Single-letter follow-ups (e.g. Cast → spell-slot picker)
            // auto-return to the category view after one tap.
            if (state.mode === 'qwerty-once') setMode('category');
            // After typing a shifted letter, drop shift back (matches the
            // soft-keyboard idiom on iOS).
            if (state.qwertyShift && /^[a-z]$/.test(cell)) {
                state.qwertyShift = false;
                renderActions();
            }
        }
        bindTap(el, fire);
        return el;
    }

    function renderQwerty(container) {
        container.innerHTML = '';
        container.classList.add('vkb-qwerty');
        QWERTY_LAYOUT.forEach(function (row) {
            var rowEl = document.createElement('div');
            rowEl.className = 'vkb-qrow';
            row.forEach(function (cell) {
                rowEl.appendChild(makeQwertyKey(cell));
            });
            container.appendChild(rowEl);
        });
    }

    // -----------------------------------------------------------------------
    // Category-buttons rendering
    // -----------------------------------------------------------------------

    function formatShortcut(btn) {
        var k = btn.key;
        if (k === ' ') k = 'Space';
        if (btn.ctrlKey) return '(Ctrl+' + k.toUpperCase() + ')';
        return '(' + k + ')';
    }

    function bindTap(el, fn) {
        var lastTouch = 0;
        el.addEventListener('touchstart', function (e) {
            e.preventDefault();
            lastTouch = Date.now();
            fn(el);
        }, { passive: false });
        el.addEventListener('touchend', function (e) { e.preventDefault(); }, { passive: false });
        el.addEventListener('mousedown', function (e) {
            if (Date.now() - lastTouch < 300) return;
            e.preventDefault();
            fn(el);
        });
    }

    // Same as bindTap but doesn't preventDefault on touchstart, so the
    // parent container's horizontal scroll keeps working. We watch
    // touchmove and only fire `fn` on touchend if the finger never moved
    // far enough to count as a scroll gesture. Used for the category tab
    // strip — without this, swiping the tabs to scroll just registered
    // as a tap on whichever tab the finger landed on.
    function bindScrollableTap(el, fn) {
        var startX = 0, startY = 0, moved = false, lastTouch = 0;
        el.addEventListener('touchstart', function (e) {
            var t = e.changedTouches[0];
            startX = t.clientX; startY = t.clientY; moved = false;
        }, { passive: true });
        el.addEventListener('touchmove', function (e) {
            var t = e.changedTouches[0];
            if (Math.abs(t.clientX - startX) > 8 || Math.abs(t.clientY - startY) > 8) {
                moved = true;
            }
        }, { passive: true });
        el.addEventListener('touchend', function (e) {
            if (moved) return;
            e.preventDefault();
            lastTouch = Date.now();
            fn(el);
        }, { passive: false });
        el.addEventListener('mousedown', function (e) {
            if (Date.now() - lastTouch < 300) return;
            e.preventDefault();
            fn(el);
        });
    }

    function makeBtn(btn, extraClass, onTap) {
        var el = document.createElement('button');
        el.className = 'vkb-btn' + (extraClass ? ' ' + extraClass : '');
        var isDpad = extraClass && extraClass.indexOf('vkb-dpad-btn') !== -1;
        var isMeta = extraClass && extraClass.indexOf('vkb-meta-btn') !== -1;
        if (isDpad || isMeta) {
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
        bindTap(el, onTap || function (srcEl) { handleAction(btn, srcEl); });
        return el;
    }

    function renderCategoryButtons(container) {
        container.classList.remove('vkb-qwerty');
        var catDef = CATEGORIES[state.activeCategory];
        if (!catDef || catDef.isQwerty) return;
        catDef.buttons.forEach(function (btn) {
            container.appendChild(makeBtn(btn));
        });
    }

    function renderActions() {
        var container = document.getElementById('vkb-buttons');
        if (!container) return;
        container.innerHTML = '';
        if (isQwertyMode(state.mode)) renderQwerty(container);
        else                          renderCategoryButtons(container);
    }

    function updateModeIndicators() {
        // Highlight the Esc button while a follow-up is pending so the user
        // sees that there's a "back" action available.
        var escEl = document.getElementById('vkb-esc');
        if (escEl) escEl.classList.toggle('vkb-meta-active', isQwertyMode(state.mode));
    }

    // -----------------------------------------------------------------------
    // Mount / unmount
    // -----------------------------------------------------------------------

    function mount() {
        if (document.getElementById('vkb-overlay')) return;

        try { state.activeCategory = localStorage.getItem('vkb-category'); } catch (e) {}
        if (!state.activeCategory || !CATEGORIES[state.activeCategory]) state.activeCategory = 'fight';
        state.mode = CATEGORIES[state.activeCategory].isQwerty ? 'qwerty-keyboard' : 'category';
        state.qwertyShift = false;

        if (!document.getElementById('vkb-css')) {
            var link = document.createElement('link');
            link.id = 'vkb-css';
            link.rel = 'stylesheet';
            link.href = 'vkb.css';
            document.head.appendChild(link);
        }

        var overlay = document.createElement('div');
        overlay.id = 'vkb-overlay';

        // Tabs row: spans the full overlay width, sits above both the
        // actions panel and the d-pad column. Selecting a tab only
        // re-renders #vkb-buttons (via setCategory → renderActions);
        // the d-pad column stays unchanged across category switches.
        var tabs = document.createElement('div');
        tabs.id = 'vkb-tabs';
        Object.keys(CATEGORIES).forEach(function (cat) {
            var tab = document.createElement('button');
            tab.className = 'vkb-tab' + (cat === state.activeCategory ? ' active' : '');
            tab.dataset.cat = cat;
            tab.textContent = CATEGORIES[cat].label;
            bindScrollableTap(tab, function () { setCategory(cat); });
            tabs.appendChild(tab);
        });
        overlay.appendChild(tabs);

        // Body row: actions panel on the left, d-pad column on the right.
        var body = document.createElement('div');
        body.id = 'vkb-body';

        var buttons = document.createElement('div');
        buttons.id = 'vkb-buttons';
        body.appendChild(buttons);

        var dpadwrap = document.createElement('div');
        dpadwrap.id = 'vkb-dpadwrap';

        var dpad = document.createElement('div');
        dpad.id = 'vkb-dpad';
        DPAD.forEach(function (btn) {
            var cls = 'vkb-dpad-btn' + (btn.isWait ? ' vkb-wait' : '');
            dpad.appendChild(makeBtn(btn, cls));
        });
        dpadwrap.appendChild(dpad);

        var meta = document.createElement('div');
        meta.id = 'vkb-dpad-meta';
        var enterEl = makeBtn(ENTER_BTN, 'vkb-meta-btn', handleEnter);
        enterEl.id = 'vkb-enter';
        var escEl = makeBtn(ESC_BTN, 'vkb-meta-btn', handleEsc);
        escEl.id = 'vkb-esc';
        meta.appendChild(enterEl);
        meta.appendChild(escEl);
        dpadwrap.appendChild(meta);

        body.appendChild(dpadwrap);
        overlay.appendChild(body);
        document.body.appendChild(overlay);

        renderActions();
        updateModeIndicators();
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
        btn.addEventListener('touchstart', function (e) { e.preventDefault(); toggle(); }, { passive: false });
        btn.addEventListener('mousedown',  function (e) { e.preventDefault(); toggle(); });
        document.body.appendChild(btn);
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
        if (document.getElementById('vkb-overlay')) unmount();
        else                                         mount();
    }

    // -----------------------------------------------------------------------
    // Initialise
    // -----------------------------------------------------------------------

    createToggle();

    var enabledPref;
    try { enabledPref = localStorage.getItem('vkb-enabled'); } catch (e) {}
    var wantsVkb = new URLSearchParams(location.search).get('vkb') === '1'
                   || enabledPref === '1';
    if (wantsVkb) mount();

    window.vkbMount   = mount;
    window.vkbUnmount = unmount;
    window.vkbToggle  = toggle;
}());
