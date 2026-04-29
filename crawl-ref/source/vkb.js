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

    // Full keyboard layout — used in every qwerty mode (in-flow follow-up
    // for 'Cast'/'Look'/'Travel' etc., and the dedicated Keyboard tab).
    // Includes arrows, Ctrl, Shift, Enter, Esc so the keyboard is fully
    // self-sufficient regardless of whether the d-pad column is visible.
    // CTRL behaves like SHIFT — tap once to "stick", next non-modifier
    // key fires with that modifier (e.g. Ctrl+S), then both release.
    var KEYBOARD_LAYOUT = [
        ['1','2','3','4','5','6','7','8','9','0'],
        ['q','w','e','r','t','y','u','i','o','p'],
        ['a','s','d','f','g','h','j','k','l'],
        ['SHIFT','z','x','c','v','b','n','m','BACK'],
        ['CTRL','.',',','-','\'','/','?','SPACE','ENTER'],
        ['ESC','LEFT','UP','DOWN','RIGHT'],
    ];

    // Punctuation key descriptors (DOM `code` + DOM keyCode + whether shift
    // is required to type the char on a US layout). Letters/digits are
    // derived from the char itself; only the irregulars need a table.
    var PUNCT = {
        '.':  { code: 'Period',    keyCode: 190, shift: false },
        ',':  { code: 'Comma',     keyCode: 188, shift: false },
        ':':  { code: 'Semicolon', keyCode: 186, shift: true  },
        ';':  { code: 'Semicolon', keyCode: 186, shift: false },
        '-':  { code: 'Minus',     keyCode: 189, shift: false },
        '\'': { code: 'Quote',     keyCode: 222, shift: false },
        '/':  { code: 'Slash',     keyCode: 191, shift: false },
        '?':  { code: 'Slash',     keyCode: 191, shift: true  },
        '!':  { code: 'Digit1',    keyCode: 49,  shift: true  },
    };

    // Special-key descriptors keyed by layout token. Used by both layouts
    // for non-printable keys (arrows, Enter, Esc, backspace, space). The
    // ASCII charCode for arrows are ncurses KEY_* codes — get_wch returns
    // them as KEY_CODE_YES function keys.
    var SPECIAL_KEYS = {
        BACK:  { key: 'Backspace',  code: 'Backspace',  charCode: 8   },
        SPACE: { key: ' ',          code: 'Space',      charCode: 32  },
        ENTER: { key: 'Enter',      code: 'Enter',      charCode: 13  },
        ESC:   { key: 'Escape',     code: 'Escape',     charCode: 27  },
        LEFT:  { key: 'ArrowLeft',  code: 'ArrowLeft',  charCode: 260 },
        UP:    { key: 'ArrowUp',    code: 'ArrowUp',    charCode: 259 },
        DOWN:  { key: 'ArrowDown',  code: 'ArrowDown',  charCode: 258 },
        RIGHT: { key: 'ArrowRight', code: 'ArrowRight', charCode: 261 },
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
        // qwertyCtrl is sticky in the same sense as qwertyShift: tap once
        // and it stays on (visually highlighted) until the next non-
        // modifier key fires with `ctrlKey: true`, after which both
        // modifiers release. Only meaningful in qwerty-keyboard mode (the
        // compact layout doesn't expose Ctrl), but we keep the state
        // module-level so it survives across mode transitions and the
        // reset path in setMode is the single source of truth.
        qwertyCtrl: false,
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
        if (!isQwertyMode(newMode)) {
            state.qwertyShift = false;
            state.qwertyCtrl = false;
        }
        // Any qwerty mode hides the d-pad column — the keyboard already
        // contains arrows + Enter + Esc, so the dpad is redundant. Keep
        // 'vkb-mode-keyboard' for any keyboard-tab-specific tweaks (e.g.
        // bigger key font), separate from the more general "qwerty
        // active" toggle.
        document.body.classList.toggle('vkb-qwerty-active', isQwertyMode(newMode));
        document.body.classList.toggle('vkb-mode-keyboard', newMode === 'qwerty-keyboard');
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

    // Tokens that are modifiers, not key events. Tapping them toggles the
    // sticky state; they don't fire any DCSS input directly.
    function isModifierCell(cell) { return cell === 'SHIFT' || cell === 'CTRL'; }

    // Resolve a layout cell to a btn descriptor — what we'll feed into
    // injectKey when the cell fires. Returns null for modifier cells
    // (handled separately by the caller). Sticky modifiers (Shift/Ctrl)
    // are NOT applied here; they're layered on by `fire()` so the same
    // descriptor can be used for both the compact and full layouts.
    function qwertyCellBtn(cell) {
        if (isModifierCell(cell)) return null;
        if (SPECIAL_KEYS[cell]) {
            // Clone so callers can mutate (apply ctrl/shift) without
            // poisoning the SPECIAL_KEYS table.
            var s = SPECIAL_KEYS[cell];
            return { key: s.key, code: s.code, charCode: s.charCode };
        }
        var ch = cell;
        if (/^[a-z]$/.test(ch)) {
            // Shift handling for letters: produce the upper-case char
            // directly. SDL_TEXTINPUT cares about the resulting char, not
            // the shiftKey flag — but we set shiftKey too so the synthetic
            // event matches what a real keyboard would produce.
            var shifted = state.qwertyShift;
            var actual = shifted ? ch.toUpperCase() : ch;
            return {
                key: actual,
                code: 'Key' + ch.toUpperCase(),
                charCode: actual.charCodeAt(0),
                shiftKey: shifted,
            };
        }
        if (/^[0-9]$/.test(ch)) {
            return { key: ch, code: 'Digit' + ch, charCode: ch.charCodeAt(0) };
        }
        var p = PUNCT[ch];
        if (p) {
            return {
                key: ch, code: p.code,
                charCode: ch.charCodeAt(0),
                shiftKey: !!p.shift,
            };
        }
        return null;
    }

    function qwertyLabel(cell) {
        if (cell === 'SHIFT') return state.qwertyShift ? '⇧*' : '⇧';
        if (cell === 'CTRL')  return state.qwertyCtrl  ? 'Ctrl·' : 'Ctrl';
        if (cell === 'BACK')  return '⌫';
        if (cell === 'SPACE') return '';
        if (cell === 'ENTER') return '↵';
        if (cell === 'ESC')   return 'Esc';
        if (cell === 'LEFT')  return '←';
        if (cell === 'UP')    return '↑';
        if (cell === 'DOWN')  return '↓';
        if (cell === 'RIGHT') return '→';
        if (state.qwertyShift && /^[a-z]$/.test(cell)) return cell.toUpperCase();
        return cell;
    }

    function makeQwertyKey(cell) {
        var el = document.createElement('button');
        el.className = 'vkb-qkey';
        el.dataset.cell = cell;

        // Visual classification — drives flex sizing in CSS.
        if (cell === 'SHIFT' || cell === 'CTRL') el.classList.add('vkb-qkey-mod');
        if (cell === 'BACK')  el.classList.add('vkb-qkey-mod', 'vkb-qkey-back');
        if (cell === 'SPACE') el.classList.add('vkb-qkey-space');
        if (cell === 'ENTER') el.classList.add('vkb-qkey-mod', 'vkb-qkey-enter');
        if (cell === 'ESC')   el.classList.add('vkb-qkey-mod', 'vkb-qkey-esc');
        if (cell === 'LEFT' || cell === 'UP' || cell === 'DOWN' || cell === 'RIGHT') {
            el.classList.add('vkb-qkey-arrow');
        }
        // Sticky modifiers visually highlight when active.
        if (cell === 'SHIFT' && state.qwertyShift) el.classList.add('vkb-qkey-active');
        if (cell === 'CTRL'  && state.qwertyCtrl)  el.classList.add('vkb-qkey-active');

        el.textContent = qwertyLabel(cell);

        function fire() {
            // Modifier toggle: stays on until the next non-modifier key,
            // even across multiple modifier taps (so user can pre-arm
            // Ctrl+Shift+letter if they really need it, though DCSS rarely
            // uses that combo).
            if (cell === 'SHIFT') {
                state.qwertyShift = !state.qwertyShift;
                renderActions();
                return;
            }
            if (cell === 'CTRL') {
                state.qwertyCtrl = !state.qwertyCtrl;
                renderActions();
                return;
            }

            var btn = qwertyCellBtn(cell);
            if (!btn) return;

            // Layer the sticky Ctrl modifier on top of whatever the cell
            // produces. Shift for lower-case letters is already baked into
            // the descriptor (see qwertyCellBtn above); for non-letters
            // we still apply shiftKey so DCSS sees e.g. Shift+ArrowUp as
            // "run upward" instead of plain Up.
            if (state.qwertyCtrl) btn.ctrlKey = true;
            if (state.qwertyShift && !btn.shiftKey) btn.shiftKey = true;

            injectKey(btn, el);

            // Mode transitions — mirror handleEnter / handleEsc on the
            // dpad-meta buttons so the keyboard's own ENTER/ESC behave
            // the same way as the right-column buttons:
            //   - qwerty-once: any key returns to category (e.g. Look→V).
            //   - qwerty-text: only ENTER (submit) or ESC (cancel) returns.
            //   - qwerty-keyboard: ESC also returns; everything else stays.
            if (state.mode === 'qwerty-once') {
                setMode('category');
            } else if (state.mode === 'qwerty-text' && (cell === 'ENTER' || cell === 'ESC')) {
                setMode('category');
            } else if (state.mode === 'qwerty-keyboard' && cell === 'ESC') {
                setMode('category');
            }

            // Auto-release sticky modifiers after firing one key. This is
            // what the user asked for: tap Ctrl, tap S → Ctrl+S sent,
            // both modifiers release. Simulates iOS soft-keyboard shift.
            if (state.qwertyShift || state.qwertyCtrl) {
                state.qwertyShift = false;
                state.qwertyCtrl = false;
                renderActions();
            }
        }
        // Stash fire on the element so the container-level touch handler
        // (bindQwertyTouches) can call it on touchend with whichever key
        // the user lifted on, supporting "press one, slide to another,
        // lift" iOS-style entry.
        el._vkbFire = fire;
        // Mouse fallback for desktop. Touch is handled at the container
        // level (capture-phase listener), which stopPropagation()s before
        // the event reaches this listener — so on iOS this mousedown
        // path doesn't double-fire.
        el.addEventListener('mousedown', function (e) {
            e.preventDefault();
            fire();
        });
        return el;
    }

    function renderQwerty(container) {
        container.innerHTML = '';
        container.classList.add('vkb-qwerty');
        KEYBOARD_LAYOUT.forEach(function (row) {
            var rowEl = document.createElement('div');
            rowEl.className = 'vkb-qrow';
            row.forEach(function (cell) {
                rowEl.appendChild(makeQwertyKey(cell));
            });
            container.appendChild(rowEl);
        });
    }

    // Container-level touch handler that implements iOS-style "press,
    // slide between keys, lift to commit" on the qwerty keyboard. The
    // handler is attached once (in mount) in the capture phase: when in
    // a qwerty mode, it intercepts touchstart/move/end before they
    // reach individual keys, calls stopPropagation, and manages a
    // single highlighted key whose `_vkbFire` is invoked on lift.
    // In non-qwerty (category-buttons) modes the handler is a no-op so
    // each button's own bindTap fires immediately on touchstart as
    // before.
    // Module-level singleton: a popup pinned above the finger that mirrors
    // the currently-highlighted key. Lazily mounted on first use.
    var keyPreview = null;
    function ensureKeyPreview() {
        if (keyPreview) return keyPreview;
        keyPreview = document.createElement('div');
        keyPreview.id = 'vkb-key-preview';
        document.body.appendChild(keyPreview);
        return keyPreview;
    }
    function showKeyPreview(key, touch) {
        var p = ensureKeyPreview();
        // Use the rendered key text for letters/digits/punct so the
        // popup reflects the active shift state (key's textContent was
        // computed via qwertyLabel at render time). SPACE has no
        // visible glyph in the key itself; show ␣ in the popup so the
        // user sees something.
        var label = key.textContent;
        if (key.dataset.cell === 'SPACE') label = '␣';
        p.textContent = label;
        p.style.display = 'block';
        // Pin above the finger. Clamp Y so the popup never falls off
        // the top of the viewport on small phones / status bars.
        p.style.left = touch.clientX + 'px';
        p.style.top  = Math.max(8, touch.clientY - 80) + 'px';
    }
    function hideKeyPreview() {
        if (keyPreview) keyPreview.style.display = 'none';
    }

    function bindQwertyTouches(container) {
        var activeKey = null;

        function setHighlight(key) {
            if (activeKey === key) return;
            if (activeKey) activeKey.classList.remove('vkb-qkey-touch');
            if (key)       key.classList.add('vkb-qkey-touch');
            activeKey = key;
        }
        function keyAt(touch) {
            // elementFromPoint returns whichever element is rendered at
            // the touch coordinates — that's the qwerty key under the
            // user's finger after any panning. Walk up to the .vkb-qkey
            // ancestor in case the touch lands on a child node.
            var el = document.elementFromPoint(touch.clientX, touch.clientY);
            while (el && el !== container) {
                if (el.classList && el.classList.contains('vkb-qkey')) return el;
                el = el.parentElement;
            }
            return null;
        }
        function syncPreview(key, touch) {
            if (key) showKeyPreview(key, touch);
            else     hideKeyPreview();
        }

        container.addEventListener('touchstart', function (e) {
            if (!isQwertyMode(state.mode)) return;
            if (e.touches.length > 1) return;          // ignore multi-touch
            e.preventDefault();
            e.stopPropagation();
            var t = e.touches[0];
            var key = keyAt(t);
            setHighlight(key);
            syncPreview(key, t);
        }, { capture: true, passive: false });

        container.addEventListener('touchmove', function (e) {
            if (!isQwertyMode(state.mode)) return;
            if (e.touches.length > 1) return;
            e.preventDefault();
            e.stopPropagation();
            var t = e.touches[0];
            var key = keyAt(t);
            setHighlight(key);
            syncPreview(key, t);
        }, { capture: true, passive: false });

        container.addEventListener('touchend', function (e) {
            if (!isQwertyMode(state.mode)) return;
            e.preventDefault();
            e.stopPropagation();
            var fired = activeKey;
            setHighlight(null);
            hideKeyPreview();
            if (fired && fired._vkbFire) fired._vkbFire();
        }, { capture: true, passive: false });

        container.addEventListener('touchcancel', function () {
            setHighlight(null);
            hideKeyPreview();
        }, { capture: true });
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
        bindQwertyTouches(buttons);

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
        document.body.classList.toggle('vkb-qwerty-active', isQwertyMode(state.mode));
        document.body.classList.toggle('vkb-mode-keyboard', state.mode === 'qwerty-keyboard');
        updateToggle(true);
        try { localStorage.setItem('vkb-enabled', '1'); } catch (e) {}
    }

    function unmount() {
        var overlay = document.getElementById('vkb-overlay');
        if (overlay) overlay.remove();
        document.body.classList.remove('vkb-active');
        document.body.classList.remove('vkb-qwerty-active');
        document.body.classList.remove('vkb-mode-keyboard');
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

    // Default ON: only stay unmounted if the user explicitly disabled it
    // via the in-overlay ⌨/✕ toggle (which writes 'vkb-enabled':'0' to
    // localStorage). New visitors get the on-screen keyboard immediately —
    // the game is primarily targeted at touch devices.
    var enabledPref;
    try { enabledPref = localStorage.getItem('vkb-enabled'); } catch (e) {}
    if (enabledPref !== '0') mount();

    window.vkbMount   = mount;
    window.vkbUnmount = unmount;
    window.vkbToggle  = toggle;
}());
