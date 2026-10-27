/*
 * AutoRep workout builder: a copy of the watch's Mode and Setup screens that
 * writes the one-line workout for the UNA app's "Workout" fields.
 *
 * Buttons follow the watch (AGENT_APPDESIGN.md): L1 up / +, L2 down / -,
 * R1 select / edit / done, R2 back. The START row is COPY here.
 */
(function () {
  'use strict';
  var WF = window.WorkoutFormat;

  // ---- State: one value per setting per mode, like the watch's Model ----
  var state = {
    name: 'My workout',
    mode: 'SETS',
    exercise: 'SQUAT',
    setsReps: 12, setsCount: 3, sides: 1, restS: 60,
    emomReps: 12, emomMinutes: 10,
    amrapMinutes: 5,
    tabataRounds: 8,
    getReadyS: 3,
  };

  // Watch UI state
  var ui = { screen: 'mode', modeSel: 0, setupSel: 0, editing: false, flash: null, flashTimer: 0 };

  var MODE_INFO = {
    SETS: 'Target reps, then rest',
    EMOM: 'New set every minute',
    AMRAP: 'As many reps as possible',
    TABATA: '20s work, 10s rest',
  };
  var EXERCISE_NAME = { SQUAT: 'SQUATS', CURL: 'CURLS', PRESS: 'PRESS', SWING: 'SWINGS', JACK: 'JACKS' };
  var ONE_ARM = { CURL: true, PRESS: true, SWING: true };

  // Seconds per rep, for the timeline estimate only.
  var SECONDS_PER_REP = 3;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // Steps through a list of choices, stopping at the ends (watch: REST, GET READY).
  function stepOption(list, cur, delta) {
    var i = 0;
    while (i < list.length - 1 && list[i] < cur) i++;
    return list[clamp(i + delta, 0, list.length - 1)];
  }

  // ---- Workout <-> state ----
  function workout() {
    var w = { name: state.name.trim(), mode: state.mode, exercise: state.exercise, getReadyS: state.getReadyS };
    switch (state.mode) {
      case 'SETS': w.sets = state.setsCount; w.reps = state.setsReps; w.restS = state.restS; w.sides = state.sides; break;
      case 'EMOM': w.minutes = state.emomMinutes; w.reps = state.emomReps; break;
      case 'AMRAP': w.minutes = state.amrapMinutes; break;
      case 'TABATA': w.rounds = state.tabataRounds; break;
    }
    return w;
  }

  function load(w) {
    state.name = w.name;
    state.mode = w.mode;
    state.exercise = w.exercise;
    state.getReadyS = w.getReadyS;
    switch (w.mode) {
      case 'SETS': state.setsCount = w.sets; state.setsReps = w.reps; state.restS = w.restS; state.sides = w.sides; break;
      case 'EMOM': state.emomMinutes = w.minutes; state.emomReps = w.reps; break;
      case 'AMRAP': state.amrapMinutes = w.minutes; break;
      case 'TABATA': state.tabataRounds = w.rounds; break;
    }
    ui.screen = 'setup';
    ui.setupSel = 0;
    ui.editing = false;
    ui.modeSel = WF.MODES.indexOf(w.mode);
    nameInput.value = state.name;
  }

  // ---- Setup fields ----
  function fields() {
    var f = ['COPY', 'EXERCISE'];
    switch (state.mode) {
      case 'SETS': f.push('TARGET', 'SETS', 'SIDES', 'REST'); break;
      case 'EMOM': f.push('TARGET', 'MINUTES'); break;
      case 'AMRAP': f.push('MINUTES'); break;
      default: f.push('ROUNDS'); break;
    }
    f.push('GET READY');
    return f;
  }

  function fieldValue(f) {
    switch (f) {
      case 'EXERCISE': return EXERCISE_NAME[state.exercise];
      case 'TARGET': return String(state.mode === 'SETS' ? state.setsReps : state.emomReps);
      case 'SETS': return String(state.setsCount);
      case 'SIDES': return String(state.sides);
      case 'REST': return state.restS + 's';
      case 'MINUTES': return String(state.mode === 'EMOM' ? state.emomMinutes : state.amrapMinutes);
      case 'ROUNDS': return String(state.tabataRounds);
      case 'GET READY': return state.getReadyS + 's';
    }
    return '';
  }

  function change(f, delta) {
    var L = WF.LIMITS;
    switch (f) {
      case 'EXERCISE': {
        var n = WF.EXERCISES.length;
        state.exercise = WF.EXERCISES[(WF.EXERCISES.indexOf(state.exercise) + delta + n) % n];
        break;
      }
      case 'TARGET':
        if (state.mode === 'SETS') state.setsReps = clamp(state.setsReps + delta, L.reps[0], L.reps[1]);
        else state.emomReps = clamp(state.emomReps + delta, L.reps[0], L.reps[1]);
        break;
      case 'SETS': {
        var max = state.sides === 2 ? L.setsCountTwoSides[1] : L.setsCount[1];
        state.setsCount = clamp(state.setsCount + delta, 1, max);
        break;
      }
      case 'SIDES':
        state.sides = state.sides === 2 ? 1 : 2; // L1 and L2 both flip it
        if (state.sides === 2) state.setsCount = Math.min(state.setsCount, L.setsCountTwoSides[1]);
        break;
      case 'REST': state.restS = stepOption(WF.REST_OPTIONS, state.restS, delta); break;
      case 'MINUTES':
        if (state.mode === 'EMOM') state.emomMinutes = clamp(state.emomMinutes + delta, L.emomMinutes[0], L.emomMinutes[1]);
        else state.amrapMinutes = clamp(state.amrapMinutes + delta, L.amrapMinutes[0], L.amrapMinutes[1]);
        break;
      case 'ROUNDS': state.tabataRounds = clamp(state.tabataRounds + delta, L.tabataRounds[0], L.tabataRounds[1]); break;
      case 'GET READY': state.getReadyS = stepOption(WF.GET_READY_OPTIONS, state.getReadyS, delta); break;
    }
  }

  // ---- Buttons ----
  function press(key) {
    var btn = document.querySelector('.hw[data-key="' + key + '"]');
    if (btn) {
      btn.classList.add('pressed');
      setTimeout(function () { btn.classList.remove('pressed'); }, 120);
    }
    if (ui.screen === 'mode') {
      var n = WF.MODES.length; // 4 items: no wrap, stops at the ends
      if (key === 'L1') ui.modeSel = Math.max(0, ui.modeSel - 1);
      else if (key === 'L2') ui.modeSel = Math.min(n - 1, ui.modeSel + 1);
      else if (key === 'R1') {
        state.mode = WF.MODES[ui.modeSel];
        ui.screen = 'setup';
        ui.setupSel = 0;
        ui.editing = false;
      }
      // R2 is "Exit" on the watch; nothing to exit to here.
    } else {
      var f = fields();
      var cur = f[ui.setupSel];
      var wrap = f.length > 5;
      if (key === 'L1' || key === 'L2') {
        var d = key === 'L1' ? -1 : 1;
        if (ui.editing) change(cur, -d); // L1 is +, L2 is -
        else if (wrap) ui.setupSel = (ui.setupSel + d + f.length) % f.length;
        else ui.setupSel = clamp(ui.setupSel + d, 0, f.length - 1);
      } else if (key === 'R1') {
        if (cur === 'COPY') copyWorkout();
        else ui.editing = !ui.editing;
      } else if (key === 'R2') {
        if (ui.editing) ui.editing = false;
        else { ui.screen = 'mode'; ui.modeSel = WF.MODES.indexOf(state.mode); }
      }
    }
    update();
  }

  document.querySelectorAll('.hw').forEach(function (b) {
    b.addEventListener('click', function () { press(b.getAttribute('data-key')); });
  });

  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    var map = {
      ArrowUp: 'L1', ArrowDown: 'L2',
      Enter: 'R1', ArrowRight: 'R1',
      Escape: 'R2', ArrowLeft: 'R2', Backspace: 'R2',
    };
    var key = map[e.key];
    if (!key) return;
    // Enter on a focused page button clicks that button instead.
    if (e.key === 'Enter' && t && t.tagName === 'BUTTON') return;
    e.preventDefault();
    press(key);
  });

  // ---- Watch screen drawing ----
  var screen = document.getElementById('screen');
  var glass = document.querySelector('.glass');

  function fit() {
    screen.style.transform = 'scale(' + glass.clientWidth / 240 + ')';
  }
  window.addEventListener('resize', fit);

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  // Curved-rim word for R1 / R2, like the watch's TiltedLabel.
  function rimLabel(key, text, colour) {
    if (!text) return '';
    var a = key === 'R1' ? -41 : 41; // degrees below horizontal
    var r = 110;
    var x = 120 + r * Math.cos(a * Math.PI / 180);
    var y = 120 + r * Math.sin(a * Math.PI / 180);
    var rot = key === 'R1' ? 50 : -50;
    return '<div class="s-label ' + colour + '" style="left:' + x.toFixed(1) + 'px;top:' + y.toFixed(1) +
      'px;--rot:' + rot + 'deg">' + esc(text) + '</div>';
  }

  // Left-rim scroll indicator (Designer widget at 0,47 36x146).
  function scrollIndicator(sel, count) {
    if (count < 2) return '';
    var r = 112, span = 38; // degrees each side of 9 o'clock
    var a0 = 180 - span, a1 = 180 + span;
    var frac = Math.max(1 / count, 0.25);
    var len = (a1 - a0) * frac;
    var start = a0 + (a1 - a0 - len) * (sel / (count - 1));
    function pt(deg) {
      var rad = deg * Math.PI / 180;
      return (120 + r * Math.cos(rad)).toFixed(2) + ' ' + (120 - r * Math.sin(rad)).toFixed(2);
    }
    // Angles grow from the top of the track (upper left) down to the bottom.
    function arc(from, to) {
      return 'M ' + pt(from) + ' A ' + r + ' ' + r + ' 0 0 0 ' + pt(to);
    }
    return '<svg width="240" height="240" style="position:absolute;left:0;top:0">' +
      '<path d="' + arc(a0, a1) + '" stroke="#555" stroke-width="6" fill="none" stroke-linecap="round"/>' +
      '<path d="' + arc(start, start + len) + '" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"/>' +
      '</svg>';
  }

  // The shared 5-row list: selected row in the middle, dimmer rows around it.
  function rowList(items, sel, opt) {
    var n = items.length;
    var wrap = n > 5;
    var html = '';
    for (var k = -2; k <= 2; k++) {
      var i = sel + k;
      if (wrap) i = (i + n) % n;
      else if (i < 0 || i >= n) continue;
      var it = items[i];
      var off = k === 0 ? 0 : (k < 0 ? -1 : 1) * (Math.abs(k) === 1 ? opt.step1 : opt.step2);
      if (k > 0 && opt.detail) off += opt.detailH;
      var y = opt.centreY + off;
      var cls = 'r' + Math.abs(k);
      var size = k === 0 ? (opt.big ? 34 : 20) : 15;
      var inner = esc(it.label) + (it.value ? ' <span class="v' + (k === 0 && opt.editing ? ' edit' : '') + '">' + esc(it.value) + '</span>' : '');
      html += '<div class="s-row ' + cls + '" style="top:' + y + 'px;font-size:' + size + 'px;line-height:' + (size + 6) + 'px"><span class="t">' + inner + '</span></div>';
      if (k === 0 && opt.detail) {
        html += '<div class="s-abs s-detail" style="top:' + (y + (opt.big ? 18 : 12)) + 'px">' + esc(opt.detail) + '</div>';
      }
    }
    return html;
  }

  function setupHint() {
    if (ui.flash) return ui.flash;
    if (ui.editing) return { text: 'L1 / L2 to change' };
    switch (state.mode) {
      case 'SETS':
        if (state.sides !== 2) return { text: 'Rest starts at target' };
        return { text: ONE_ARM[state.exercise] ? 'Watch arm first' : 'Left, right, rest' };
      case 'EMOM': return { text: 'Rest after the target' };
      case 'AMRAP': return { text: 'Max reps, no rest' };
      default: return { text: state.tabataRounds + ' x 20s on, 10s off' };
    }
  }

  var sr = document.getElementById('sr');

  function drawScreen() {
    var html = '';
    var spoken;
    if (ui.screen === 'mode') {
      html += '<div class="s-abs s-title">AutoRep</div>';
      html += '<div class="s-abs s-sig">by <span class="r">R</span><span class="f">F</span></div>';
      var items = WF.MODES.map(function (m) { return { label: m }; });
      html += rowList(items, ui.modeSel, {
        centreY: 106, step1: 34, step2: 58, big: true,
        detail: MODE_INFO[WF.MODES[ui.modeSel]], detailH: 22,
      });
      html += scrollIndicator(ui.modeSel, items.length);
      html += rimLabel('R1', 'Select', 'amber');
      spoken = WF.MODES[ui.modeSel] + ': ' + MODE_INFO[WF.MODES[ui.modeSel]];
    } else {
      var f = fields();
      var hint = setupHint();
      html += '<div class="s-abs s-heading">' + esc(state.mode) + '</div>';
      html += '<div class="s-abs s-hint' + (hint.cls ? ' ' + hint.cls : '') + '">' + esc(hint.text) + '</div>';
      html += rowList(f.map(function (x) { return { label: x, value: fieldValue(x) }; }), ui.setupSel, {
        centreY: 128, step1: 30, step2: 54, big: false, editing: ui.editing,
      });
      html += scrollIndicator(ui.setupSel, f.length);
      var cur = f[ui.setupSel];
      html += rimLabel('R1', ui.editing ? 'Done' : cur === 'COPY' ? 'Copy' : 'Edit', 'amber');
      html += rimLabel('R2', 'Back', 'white');
      var nm = state.name.trim().toUpperCase();
      if (nm) html += '<div class="s-abs s-foot">' + esc(nm) + '</div>';
      spoken = cur + (fieldValue(cur) ? ' ' + fieldValue(cur) : '') + (ui.editing ? ', editing' : '');
    }
    screen.innerHTML = html;
    sr.textContent = spoken;
  }

  // ---- Page panels ----
  var nameInput = document.getElementById('name');
  var nameCount = document.getElementById('nameCount');
  var nameMsg = document.getElementById('nameMsg');
  var lineEl = document.getElementById('line');
  var bytesEl = document.getElementById('bytes');
  var copyBtn = document.getElementById('copy');
  var timelineEl = document.getElementById('timeline');
  var shareInput = document.getElementById('share');
  var shareBtn = document.getElementById('copyShare');
  var pasteInput = document.getElementById('paste');
  var pasteMsg = document.getElementById('pasteMsg');

  function currentText() {
    return WF.checkName(state.name) ? null : WF.format(workout());
  }

  function shareUrl(text) {
    return location.href.split('#')[0] + '#' + encodeURIComponent(text);
  }

  function fmtTime(s) {
    var m = Math.floor(s / 60), r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  // Blocks in order: { kind: 'ready' | 'work' | 'rest', s }.
  function timeline(w) {
    var b = [{ kind: 'ready', s: w.getReadyS }];
    var guess = false;
    switch (w.mode) {
      case 'SETS':
        guess = true;
        for (var i = 1; i <= w.sets; i++) {
          b.push({ kind: 'work', s: w.reps * SECONDS_PER_REP });
          if (w.sides === 2) {
            b.push({ kind: 'ready', s: w.getReadyS }); // switch countdown
            b.push({ kind: 'work', s: w.reps * SECONDS_PER_REP });
          }
          if (i < w.sets) b.push({ kind: 'rest', s: w.restS });
        }
        break;
      case 'EMOM':
        guess = true;
        for (var m = 0; m < w.minutes; m++) {
          var work = Math.min(60, w.reps * SECONDS_PER_REP);
          b.push({ kind: 'work', s: work });
          if (work < 60) b.push({ kind: 'rest', s: 60 - work });
        }
        break;
      case 'AMRAP':
        b.push({ kind: 'work', s: w.minutes * 60 });
        break;
      case 'TABATA':
        for (var r = 1; r <= w.rounds; r++) {
          b.push({ kind: 'work', s: 20 });
          if (r < w.rounds) b.push({ kind: 'rest', s: 10 });
        }
        break;
    }
    return { blocks: b, guess: guess && w.mode === 'SETS' };
  }

  function summary(w) {
    // Same wording as the watch's detail line for a saved workout.
    var ex = EXERCISE_NAME[w.exercise].toLowerCase();
    switch (w.mode) {
      case 'SETS': return w.sets + 'x' + w.reps + ' ' + ex + (w.sides === 2 ? ' L+R' : '') + ', ' + w.restS + 's rest';
      case 'EMOM': return 'EMOM ' + w.minutes + ' min, ' + w.reps + ' ' + ex;
      case 'AMRAP': return 'AMRAP ' + w.minutes + ' min, ' + ex;
      default: return 'Tabata ' + w.rounds + ' rounds, ' + ex;
    }
  }

  function drawTimeline() {
    var w = workout();
    var t = timeline(w);
    var total = t.blocks.reduce(function (a, x) { return a + x.s; }, 0);
    var bar = t.blocks.map(function (x) {
      return '<i class="' + x.kind + '" style="flex:' + x.s + ' 0 0"></i>';
    }).join('');
    timelineEl.innerHTML =
      '<div class="tl-bar" role="img" aria-label="Timeline, total ' + fmtTime(total) + '">' + bar + '</div>' +
      '<div class="tl-info"><span>' + esc(summary(w)) + '</span><span>' + (t.guess ? 'about ' : '') + '<b>' + fmtTime(total) + '</b></span></div>' +
      '<div class="tl-info tl-legend"><span></span><span><span class="work">work</span><span class="rest">rest</span><span class="ready">get ready</span></span></div>' +
      (t.guess ? '<p class="tl-note">A set ends when you hit your target, so its length is a guess (' + SECONDS_PER_REP + ' s per rep).</p>' : '') +
      (w.mode === 'EMOM' ? '<p class="tl-note">Work is a guess (' + SECONDS_PER_REP + ' s per rep); each minute is exactly one minute.</p>' : '');
  }

  function drawPanels() {
    var nameErr = WF.checkName(state.name);
    var trimmed = state.name.trim();
    nameCount.textContent = trimmed.length + '/' + WF.MAX_NAME;
    nameCount.classList.toggle('bad', trimmed.length > WF.MAX_NAME);
    nameInput.classList.toggle('bad', !!nameErr);
    nameMsg.textContent = nameErr || 'The watch shows it in capitals.';
    nameMsg.classList.toggle('bad', !!nameErr);

    var text = currentText();
    var shown = text || WF.format(Object.assign(workout(), { name: trimmed || '?' }));
    lineEl.textContent = shown;
    lineEl.classList.toggle('bad', !text);
    var bytes = WF.utf8Bytes(shown);
    bytesEl.textContent = bytes + '/' + WF.MAX_BYTES;
    bytesEl.classList.toggle('bad', bytes > WF.MAX_BYTES);
    copyBtn.disabled = !text;
    if (!copyBtn.dataset.flash) copyBtn.textContent = text ? 'Copy' : 'Fix the name to copy';

    shareInput.value = text ? shareUrl(text) : '';
    shareBtn.disabled = !text;
    if (text) {
      try { history.replaceState(null, '', '#' + encodeURIComponent(text)); } catch (e) { /* file:// in some browsers */ }
    }
    drawTimeline();
  }

  function update() {
    drawScreen();
    drawPanels();
  }

  // ---- Copy ----
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallbackCopy(text); });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function flashButton(btn, text) {
    btn.dataset.flash = '1';
    btn.textContent = text;
    clearTimeout(btn._t);
    btn._t = setTimeout(function () { delete btn.dataset.flash; drawPanels(); btn.textContent = btn === copyBtn ? (currentText() ? 'Copy' : 'Fix the name to copy') : 'Copy link'; }, 1500);
  }

  function flashScreen(text, cls) {
    ui.flash = { text: text, cls: cls };
    clearTimeout(ui.flashTimer);
    ui.flashTimer = setTimeout(function () { ui.flash = null; drawScreen(); }, 1500);
  }

  function copyWorkout() {
    var text = currentText();
    if (!text) {
      flashScreen('Fix the name first', 'warn');
      nameInput.focus();
      return;
    }
    copyText(text).then(function (ok) {
      flashButton(copyBtn, ok ? 'Copied ✓' : 'Select the line and copy it');
      flashScreen(ok ? 'Copied to clipboard' : 'Copy failed', ok ? 'good' : 'warn');
      drawScreen();
    });
  }

  copyBtn.addEventListener('click', copyWorkout);
  shareBtn.addEventListener('click', function () {
    copyText(shareInput.value).then(function (ok) { flashButton(shareBtn, ok ? 'Copied ✓' : 'Copy failed'); });
  });

  nameInput.addEventListener('input', function () {
    state.name = nameInput.value;
    update();
  });

  // ---- Paste box ----
  var HELP = {
    NAME: 'Start with a name of 1 to 12 letters, digits, spaces or - / :, then a |.',
    MODE: 'After the |, start with SETS, EMOM, AMRAP or TABATA.',
    EXERCISE: 'After the mode, give SQUAT, CURL, PRESS, SWING or JACK.',
    TOKEN: 'This mode doesn\'t take that.',
    RANGE: 'That value is out of range.',
    TWICE: 'That setting is given twice.',
    CHAIN: 'Only one block per workout for now.',
    LONG: 'The UNA app takes at most 128 bytes.',
  };

  function readPaste(text, fromHash) {
    var r = WF.parse(text);
    pasteMsg.classList.remove('bad', 'good');
    if (r.empty) {
      pasteMsg.textContent = fromHash ? '' : 'An empty field is an unused slot.';
      return false;
    }
    if (!r.ok) {
      pasteMsg.textContent = 'Can\'t read: ' + r.reason + '. ' + HELP[r.error];
      pasteMsg.classList.add('bad');
      return false;
    }
    load(r);
    pasteMsg.textContent = 'Loaded "' + r.name + '".';
    pasteMsg.classList.add('good');
    update();
    return true;
  }

  pasteInput.addEventListener('input', function () {
    if (pasteInput.value === '') { pasteMsg.textContent = ''; pasteMsg.className = 'msg'; return; }
    readPaste(pasteInput.value, false);
  });

  // ---- Starters ----
  var startersEl = document.getElementById('starters');
  window.STARTERS.forEach(function (s) {
    var b = document.createElement('button');
    b.className = 'starter';
    b.innerHTML = '<b>' + esc(s.title) + '</b><span>' + esc(s.note) + '</span>';
    b.addEventListener('click', function () {
      var w = WF.parse(s.text);
      if (w.ok) { load(w); update(); document.getElementById('device').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    });
    startersEl.appendChild(b);
  });

  // ---- Share link in ----
  function fromHash() {
    var h = location.hash.replace(/^#/, '');
    if (!h) return false;
    var text;
    try { text = decodeURIComponent(h.replace(/\+/g, ' ')); } catch (e) { return false; }
    if (text === currentText()) return true;
    var ok = readPaste(text, true);
    if (!ok) pasteInput.value = text;
    return ok;
  }
  window.addEventListener('hashchange', fromHash);

  // ---- Start ----
  nameInput.value = state.name;
  fit();
  if (!fromHash()) update();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
})();
