/*
 * AutoRep workout builder: one card per workout. A workout is one or more
 * exercise blocks (AutoRep 1.2), written as one line (workout-format.js). A
 * line over 128 bytes continues in the next "Workout N" field, so a card
 * takes as many fields as its line needs, and the cards number the fields in
 * order (Workout 1-2 for card 1, then Workout 3 for card 2...).
 *
 * Kept in the page: the hash (share link, one whole workout per line) and
 * localStorage (so the page reopens where you left it).
 */
(function () {
  'use strict';
  var WF = window.WorkoutFormat;
  var FIELDS = WF.FIELDS;
  var STORE_KEY = 'autorep-builder-v3';
  var OLD_STORE_KEY = 'autorep-builder-v2';   // one exercise per card
  // Shown on a workout with more than one exercise until 1.2 is on the store.
  var NEEDS_12 = 'Needs AutoRep 1.2 on the watch.';

  var MODE_LABEL = { SETS: 'Sets', EMOM: 'EMOM', AMRAP: 'AMRAP', TABATA: 'Tabata' };
  var MODE_INFO = {
    SETS: 'Your target reps, then a rest. Repeat for each set.',
    EMOM: 'Every minute on the minute: your reps, then rest until the next minute.',
    AMRAP: 'As many reps as possible in the time.',
    TABATA: '20 s of work, 10 s of rest, per round.',
  };
  var EXERCISE_LABEL = { SQUAT: 'Squats', CURL: 'Curls', PRESS: 'Press', SWING: 'Swings', JACK: 'Jacks' };
  // Same words as the watch's detail line (Model::exerciseShort).
  var EXERCISE_SHORT = { SQUAT: 'squats', CURL: 'curls', PRESS: 'press', SWING: 'swings', JACK: 'jacks' };
  var SECONDS_PER_REP = 3; // for the time estimate only

  function blankBlock() {
    return {
      mode: 'SETS', exercise: 'SQUAT',
      setsReps: 12, setsCount: 3, sides: 1, restS: 60,
      emomReps: 12, emomMinutes: 10,
      amrapMinutes: 5,
      tabataRounds: 8,
      getReadyS: 3,
      restAfterS: 0,
    };
  }

  function blank(name) {
    return { name: name || '', blocks: [blankBlock()], open: 0 };
  }

  var slots = [];

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  // ---- Workout <-> card ----
  function blockOf(b) {
    var w = { mode: b.mode, exercise: b.exercise, getReadyS: b.getReadyS, restAfterS: b.restAfterS || 0 };
    switch (b.mode) {
      case 'SETS': w.sets = b.setsCount; w.reps = b.setsReps; w.restS = b.restS; w.sides = b.sides; break;
      case 'EMOM': w.minutes = b.emomMinutes; w.reps = b.emomReps; break;
      case 'AMRAP': w.minutes = b.amrapMinutes; break;
      case 'TABATA': w.rounds = b.tabataRounds; break;
    }
    return w;
  }

  function fromBlock(w) {
    var b = blankBlock();
    b.mode = w.mode;
    b.exercise = w.exercise;
    b.getReadyS = w.getReadyS;
    b.restAfterS = w.restAfterS || 0;
    switch (w.mode) {
      case 'SETS': b.setsCount = w.sets; b.setsReps = w.reps; b.restS = w.restS; b.sides = w.sides; break;
      case 'EMOM': b.emomMinutes = w.minutes; b.emomReps = w.reps; break;
      case 'AMRAP': b.amrapMinutes = w.minutes; break;
      case 'TABATA': b.tabataRounds = w.rounds; break;
    }
    return b;
  }

  function workout(s) {
    var blocks = s.blocks.map(blockOf);
    blocks[blocks.length - 1].restAfterS = 0;
    return { name: s.name.trim(), blocks: blocks };
  }

  function fromWorkout(w) {
    return { name: w.name, blocks: (w.blocks || [w]).map(fromBlock), open: 0 };
  }

  // The whole line, or null while the name isn't valid.
  function lineOf(s) {
    return WF.checkName(s.name) ? null : WF.format(workout(s));
  }

  // The card's fields: the line cut into fields, or one empty field kept for
  // it while it has no line.
  function fieldsOf(s) {
    var line = lineOf(s);
    return line ? WF.split(line) : [null];
  }

  // Where each card's fields start (0-based), and how many fields in all.
  function layout(list) {
    var at = 0;
    var cards = list.map(function (s) {
      var f = fieldsOf(s);
      var c = { start: at, fields: f };
      at += f.length;
      return c;
    });
    return { cards: cards, used: at };
  }

  function summary(w) {
    var ex = EXERCISE_SHORT[w.exercise];
    switch (w.mode) {
      case 'SETS': return w.sets + 'x' + w.reps + ' ' + ex + (w.sides === 2 ? ' L+R' : '') + ', ' + w.restS + 's rest';
      case 'EMOM': return 'EMOM ' + w.minutes + ' min, ' + w.reps + ' ' + ex;
      case 'AMRAP': return 'AMRAP ' + w.minutes + ' min, ' + ex;
      default: return 'Tabata ' + w.rounds + ' rounds, ' + ex;
    }
  }

  // One block's time in seconds with its get-ready, and whether it is a
  // guess (sets end on the target).
  function duration(w) {
    var t = w.getReadyS;
    switch (w.mode) {
      case 'SETS': {
        var set = w.reps * SECONDS_PER_REP;
        var perSet = w.sides === 2 ? 2 * set + w.getReadyS : set;
        return { s: t + w.sets * perSet + (w.sets - 1) * w.restS, guess: true };
      }
      case 'EMOM': return { s: t + w.minutes * 60, guess: false };
      case 'AMRAP': return { s: t + w.minutes * 60, guess: false };
      default: return { s: t + w.rounds * 30 - 10, guess: false };
    }
  }

  // The whole workout. After a REST the next block starts at the end of the
  // rest (the rest is its get-ready); without one it has its own get-ready.
  function totalDuration(blocks) {
    var s = 0, guess = false;
    blocks.forEach(function (b, j) {
      var d = duration(b);
      guess = guess || d.guess;
      var prevRest = j > 0 ? blocks[j - 1].restAfterS : 0;
      s += prevRest ? prevRest + d.s - b.getReadyS : d.s;
    });
    return { s: s, guess: guess };
  }

  function fmtTime(s) {
    var m = Math.floor(s / 60), r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  // ---- Controls ----
  function attrs(i, j, field) {
    return ' data-slot="' + i + '"' + (j !== null ? ' data-block="' + j + '"' : '') + ' data-field="' + field + '"';
  }

  function chips(i, j, field, options, current, label) {
    return '<div class="chips" role="radiogroup" aria-label="' + esc(label) + '">' + options.map(function (o) {
      var on = o.value === current;
      return '<button type="button" class="chip' + (on ? ' on' : '') + '" role="radio" aria-checked="' + on + '"' +
        attrs(i, j, field) + ' data-value="' + esc(o.value) + '">' + esc(o.label) + '</button>';
    }).join('') + '</div>';
  }

  function stepper(i, j, field, label, value, lo, hi) {
    return '<div class="opt"><span class="opt-l">' + esc(label) + '</span>' +
      '<span class="step">' +
      '<button type="button" class="sb" aria-label="Less ' + esc(label) + '"' + attrs(i, j, field) + ' data-delta="-1"' + (value <= lo ? ' disabled' : '') + '>−</button>' +
      '<output class="sv">' + value + '</output>' +
      '<button type="button" class="sb" aria-label="More ' + esc(label) + '"' + attrs(i, j, field) + ' data-delta="1"' + (value >= hi ? ' disabled' : '') + '>+</button>' +
      '</span></div>';
  }

  function optionRow(label, control) {
    return '<div class="opt opt-col"><span class="opt-l">' + esc(label) + '</span>' + control + '</div>';
  }

  function seconds(list) { return list.map(function (v) { return { value: v, label: v + ' s' }; }); }

  function options(i, j, b) {
    var L = WF.LIMITS;
    var html = '';
    switch (b.mode) {
      case 'SETS':
        html += stepper(i, j, 'setsReps', 'Reps per set', b.setsReps, L.reps[0], L.reps[1]);
        html += stepper(i, j, 'setsCount', 'Sets', b.setsCount, 1, b.sides === 2 ? L.setsCountTwoSides[1] : L.setsCount[1]);
        html += optionRow('Rest between sets', chips(i, j, 'restS', seconds(WF.REST_OPTIONS), b.restS, 'Rest'));
        html += optionRow('Sides', chips(i, j, 'sides', [{ value: 1, label: 'One' }, { value: 2, label: 'Left, then right' }], b.sides, 'Sides'));
        break;
      case 'EMOM':
        html += stepper(i, j, 'emomReps', 'Reps per minute', b.emomReps, L.reps[0], L.reps[1]);
        html += stepper(i, j, 'emomMinutes', 'Minutes', b.emomMinutes, L.emomMinutes[0], L.emomMinutes[1]);
        break;
      case 'AMRAP':
        html += stepper(i, j, 'amrapMinutes', 'Minutes', b.amrapMinutes, L.amrapMinutes[0], L.amrapMinutes[1]);
        break;
      default:
        html += stepper(i, j, 'tabataRounds', 'Rounds', b.tabataRounds, L.tabataRounds[0], L.tabataRounds[1]);
        break;
    }
    html += optionRow('Get ready', chips(i, j, 'getReadyS', seconds(WF.GET_READY_OPTIONS), b.getReadyS, 'Get ready'));
    return html;
  }

  // The format/exercise/options of one block.
  function blockEditor(i, j, b) {
    var modes = WF.MODES.map(function (m) { return { value: m, label: MODE_LABEL[m] }; });
    var exercises = WF.EXERCISES.map(function (e) { return { value: e, label: EXERCISE_LABEL[e] }; });
    return '<span class="field-l">Format</span>' + chips(i, j, 'mode', modes, b.mode, 'Format') +
      '<p class="mode-info">' + esc(MODE_INFO[b.mode]) + '</p>' +
      '<span class="field-l">Exercise</span>' + chips(i, j, 'exercise', exercises, b.exercise, 'Exercise') +
      '<div class="opts">' + options(i, j, b) + '</div>';
  }

  function blocksHtml(i, s) {
    if (s.blocks.length === 1) return blockEditor(i, 0, s.blocks[0]);
    var rests = [{ value: 0, label: 'None' }].concat(seconds(WF.REST_OPTIONS));
    // One line between two exercises: a dropdown, not seven chips.
    function restPicker(j, current) {
      return '<label class="between"><span class="opt-l">Rest before next</span>' +
        '<select class="rest-sel" data-slot="' + i + '" data-block="' + j + '" data-field="restAfterS">' +
        rests.map(function (o) {
          return '<option value="' + o.value + '"' + (o.value === current ? ' selected' : '') + '>' + esc(o.label) + '</option>';
        }).join('') + '</select></label>';
    }
    return s.blocks.map(function (b, j) {
      var open = j === s.open;
      var head = '<div class="block-head">' +
        '<button type="button" class="block-title" data-slot="' + i + '" data-open="' + j + '" aria-expanded="' + open + '">' +
        '<span class="num">' + (j + 1) + '</span>' +
        '<span class="bsum">' + esc(summary(blockOf(b))) + '</span>' +
        (open ? '' : '<span class="edit">Edit</span>') + '</button>' +
        '<button type="button" class="x" data-slot="' + i + '" data-remove-block="' + j + '" aria-label="Remove exercise ' + (j + 1) + '" title="Remove">✕</button>' +
        '</div>';
      var html = '<div class="block' + (open ? ' open' : '') + '">' + head + (open ? blockEditor(i, j, b) : '') + '</div>';
      if (j < s.blocks.length - 1) {
        html += restPicker(j, b.restAfterS || 0);
      }
      return html;
    }).join('');
  }

  // ---- Cards ----
  var slotsEl = document.getElementById('slots');
  var addBtn = document.getElementById('add');

  function fieldRange(c) {
    var a = c.start + 1, z = c.start + c.fields.length;
    return a === z ? 'Workout ' + a : 'Workout ' + a + '–' + z;
  }

  function cardHtml(i, lay) {
    var s = slots[i];
    var c = lay.cards[i];
    var starters = window.STARTERS.map(function (st, k) {
      return '<button type="button" class="chip ghost" data-slot="' + i + '" data-starter="' + k + '">' + esc(st.title) + '</button>';
    }).join('');
    var n = c.fields.length;
    var where = n === 1
      ? 'Paste it into <b>Workout ' + (c.start + 1) + '</b> in AutoRep\'s settings.'
      : 'Too long for one field: paste the ' + n + ' lines into <b>Workout ' + (c.start + 1) + '</b> to <b>Workout ' + (c.start + n) + '</b>, in order.';
    var canAddBlock = s.blocks.length < WF.MAX_BLOCKS && fitsWith(i, function (t) { t.blocks.push(blankBlock()); });
    return '' +
      '<div class="card-head"><h2>' + fieldRange(c) + '</h2>' +
      (slots.length > 1 ? '<button type="button" class="link" data-slot="' + i + '" data-remove="1">Remove</button>' : '') + '</div>' +
      '<p class="desc">' + where + '</p>' +
      '<hr>' +
      '<label class="field-l" for="name' + i + '">Name</label>' +
      '<input class="pill name" id="name' + i + '" data-slot="' + i + '" type="text" autocomplete="off" autocapitalize="words" spellcheck="false" maxlength="40" value="' + esc(s.name) + '" placeholder="e.g. Leg day">' +
      '<p class="hint" data-hint="' + i + '"></p>' +
      '<div class="starters"><span class="field-l">Start from</span>' + starters + '</div>' +
      (s.blocks.length > 1 ? '<span class="field-l">Exercises, in order</span>' : '') +
      '<div class="blocks">' + blocksHtml(i, s) + '</div>' +
      '<button type="button" class="add-ex" data-slot="' + i + '" data-add-block="1"' + (canAddBlock ? '' : ' disabled') + '>+ Add exercise</button>' +
      (canAddBlock ? '' : '<p class="hint left">' + (s.blocks.length >= WF.MAX_BLOCKS ? 'At most ' + WF.MAX_BLOCKS + ' exercises.' : 'No room: AutoRep has ' + FIELDS + ' workout fields.') + '</p>') +
      '<div class="result">' +
      '<p class="sum" data-sum="' + i + '"></p>' +
      (s.blocks.length > 1 ? '<p class="note">' + esc(NEEDS_12) + '</p>' : '') +
      '<div data-lines="' + i + '"></div>' +
      '</div>' +
      '<details class="paste"><summary>Edit a workout you already have</summary>' +
      '<textarea class="pill mono" data-paste="' + i + '" rows="2" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Leg day|SETS SQUAT 3x12 R90"></textarea>' +
      '<p class="hint" data-paste-msg="' + i + '"></p></details>';
  }

  // Would the cards still fit the five fields after change(copy of card i)?
  function fitsWith(i, change) {
    var copy = slots.map(function (s, k) {
      if (k !== i) return s;
      var t = JSON.parse(JSON.stringify(s));
      change(t);
      return t;
    });
    return layout(copy).used <= FIELDS;
  }

  function render(focus) {
    var lay = layout(slots);
    slotsEl.innerHTML = slots.map(function (_, i) { return '<section class="card" id="slot' + i + '">' + cardHtml(i, lay) + '</section>'; }).join('');
    slots.forEach(function (_, i) { refresh(i, lay); });
    addBtn.hidden = lay.used >= FIELDS;
    if (focus) {
      var f = document.querySelector(focus);
      if (f) f.focus({ preventScroll: true });
    }
    save();
  }

  // The parts that follow the name as you type.
  function refresh(i, lay) {
    var s = slots[i];
    var c = lay.cards[i];
    var el = document.getElementById('slot' + i);
    var err = WF.checkName(s.name);
    var trimmed = s.name.trim();
    var name = el.querySelector('.name');
    var hint = el.querySelector('[data-hint="' + i + '"]');
    name.classList.toggle('bad', !!err);
    hint.textContent = err ? err : trimmed.length + '/' + WF.MAX_NAME + ' · shown in capitals on the watch';
    hint.classList.toggle('bad', !!err);

    var w = workout(s);
    var d = totalDuration(w.blocks);
    var what = w.blocks.length === 1 ? summary(w.blocks[0]) : w.blocks.length + ' exercises';
    el.querySelector('[data-sum="' + i + '"]').innerHTML =
      esc(what) + ' <span class="time">' + (d.guess ? 'about ' : '') + fmtTime(d.s) + '</span>';

    var multi = c.fields.length > 1;
    el.querySelector('[data-lines="' + i + '"]').innerHTML = c.fields.map(function (text, k) {
      var n = c.start + k + 1;
      var fits = n <= FIELDS;
      return '<div class="field">' +
        (multi ? '<span class="field-n">Workout ' + n + '</span>' : '') +
        '<output class="line' + (text ? '' : ' empty') + '">' + esc(text || 'Give it a name first') + '</output>' +
        (fits ? '' : '<p class="hint bad left">Doesn\'t fit: AutoRep has ' + FIELDS + ' workout fields. Remove an exercise or a workout.</p>') +
        '<button type="button" class="copy" data-slot="' + i + '" data-copy="' + k + '"' + (text && fits ? '' : ' disabled') + '>Copy for Workout ' + n + '</button>' +
        '</div>';
    }).join('');
  }

  function change(i, j, field, value) {
    var s = slots[i];
    var b = s.blocks[j];
    var L = WF.LIMITS;
    switch (field) {
      case 'mode': case 'exercise': b[field] = value; break;
      case 'restS': case 'getReadyS': case 'restAfterS': b[field] = Number(value); break;
      case 'sides':
        b.sides = Number(value);
        if (b.sides === 2) b.setsCount = Math.min(b.setsCount, L.setsCountTwoSides[1]);
        break;
    }
  }

  function step(i, j, field, delta) {
    var b = slots[i].blocks[j];
    var L = WF.LIMITS;
    var range = {
      setsReps: L.reps, emomReps: L.reps,
      setsCount: b.sides === 2 ? L.setsCountTwoSides : L.setsCount,
      emomMinutes: L.emomMinutes, amrapMinutes: L.amrapMinutes, tabataRounds: L.tabataRounds,
    }[field];
    b[field] = clamp(b[field] + delta, range[0], range[1]);
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

  function copyField(i, k, btn) {
    var c = layout(slots).cards[i];
    var text = c.fields[k];
    if (!text) return;
    var n = c.start + k + 1;
    copyText(text).then(function (ok) {
      btn.textContent = ok ? 'Copied. Paste it into Workout ' + n : 'Select the line above and copy it';
      btn.classList.toggle('done', ok);
      clearTimeout(btn._t);
      btn._t = setTimeout(function () {
        btn.textContent = 'Copy for Workout ' + n;
        btn.classList.remove('done');
      }, 2500);
    });
  }

  // ---- Events ----
  slotsEl.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var i = Number(b.getAttribute('data-slot'));
    var s = slots[i];
    if (b.hasAttribute('data-copy')) { copyField(i, Number(b.getAttribute('data-copy')), b); return; }
    if (b.hasAttribute('data-remove')) { slots.splice(i, 1); render(); return; }
    if (b.hasAttribute('data-starter')) {
      var w = WF.parse(window.STARTERS[Number(b.getAttribute('data-starter'))].text);
      if (w.ok) {
        var name = s.name;
        slots[i] = fromWorkout(w);
        if (!fitsWith(i, function () {})) { slots[i] = s; s.name = name; }
        render();
      }
      return;
    }
    if (b.hasAttribute('data-open')) {
      var j0 = Number(b.getAttribute('data-open'));
      s.open = s.open === j0 ? -1 : j0;
      render('#slot' + i + ' [data-open="' + j0 + '"]');
      return;
    }
    if (b.hasAttribute('data-add-block')) {
      if (b.disabled) return;
      s.blocks.push(blankBlock());
      s.open = s.blocks.length - 1;
      render('#slot' + i + ' [data-open="' + s.open + '"]');
      var nb = document.querySelector('#slot' + i + ' .block.open');
      if (nb) nb.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (b.hasAttribute('data-remove-block')) {
      var r = Number(b.getAttribute('data-remove-block'));
      s.blocks.splice(r, 1);
      if (s.blocks.length) s.blocks[s.blocks.length - 1].restAfterS = 0;
      s.open = Math.min(Math.max(s.open, 0), s.blocks.length - 1);
      render();
      return;
    }
    var field = b.getAttribute('data-field');
    if (!field) return;
    var j = Number(b.getAttribute('data-block') || 0);
    var sel = '#slot' + i + ' [data-block="' + j + '"][data-field="' + field + '"]';
    if (b.hasAttribute('data-delta')) {
      step(i, j, field, Number(b.getAttribute('data-delta')));
      render(sel + '[data-delta="' + b.getAttribute('data-delta') + '"]');
    } else {
      change(i, j, field, b.getAttribute('data-value'));
      render(sel + '.on');
    }
  });

  slotsEl.addEventListener('change', function (e) {
    var t = e.target;
    if (!t.classList.contains('rest-sel')) return;
    var i = Number(t.getAttribute('data-slot'));
    var j = Number(t.getAttribute('data-block'));
    var before = slots[i].blocks[j].restAfterS;
    slots[i].blocks[j].restAfterS = Number(t.value);
    if (layout(slots).used > FIELDS && before === 0) {
      // "REST 60" can push the line into one more field than is left.
      slots[i].blocks[j].restAfterS = before;
    }
    render('#slot' + i + ' select[data-block="' + j + '"]');
  });

  slotsEl.addEventListener('input', function (e) {
    var t = e.target;
    if (t.classList.contains('name')) {
      var i = Number(t.getAttribute('data-slot'));
      var before = layout(slots);
      slots[i].name = t.value;
      var after = layout(slots);
      var moved = before.cards.some(function (c, k) {
        return c.start !== after.cards[k].start || c.fields.length !== after.cards[k].fields.length;
      });
      if (moved) {
        // The field numbers changed: redraw the cards, keeping the caret.
        var pos = t.selectionStart;
        render('#name' + i);
        var n = document.getElementById('name' + i);
        try { n.setSelectionRange(pos, pos); } catch (err) { /* not a text box */ }
      } else {
        refresh(i, after);
        addBtn.hidden = after.used >= FIELDS;
        save();
      }
      return;
    }
    if (t.hasAttribute('data-paste')) {
      var k = Number(t.getAttribute('data-paste'));
      var msg = document.querySelector('[data-paste-msg="' + k + '"]');
      if (t.value.trim() === '') { msg.textContent = ''; msg.className = 'hint'; return; }
      // One line, or the lines of a workout that continues ("+|").
      var lines = t.value.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
      var r = lines.length > 1 ? WF.parseFields(lines.slice(0, FIELDS))[0] : WF.parse(lines[0]);
      if (!r || r.empty) return;
      if (!r.ok) {
        msg.textContent = 'Can\'t read: ' + r.reason + '.';
        msg.className = 'hint bad';
        return;
      }
      var old = slots[k];
      slots[k] = fromWorkout(r);
      if (!fitsWith(k, function () {})) {
        slots[k] = old;
        msg.textContent = 'It doesn\'t fit in the fields left. Remove another workout first.';
        msg.className = 'hint bad';
        return;
      }
      render();
      var m2 = document.querySelector('[data-paste-msg="' + k + '"]');
      m2.textContent = 'Loaded "' + r.name + '".';
      m2.className = 'hint good';
      document.querySelector('#slot' + k + ' details').open = true;
    }
  });

  addBtn.addEventListener('click', function () {
    if (layout(slots).used >= FIELDS) return;
    slots.push(blank(''));
    render();
    var name = document.getElementById('name' + (slots.length - 1));
    if (name) { name.scrollIntoView({ behavior: 'smooth', block: 'center' }); name.focus({ preventScroll: true }); }
  });

  // ---- Keep it: hash (share link) and localStorage ----
  function save() {
    var lines = slots.map(lineOf).filter(Boolean);
    try { history.replaceState(null, '', lines.length ? '#' + encodeURIComponent(lines.join('\n')) : location.pathname); } catch (e) { /* file:// */ }
    try { localStorage.setItem(STORE_KEY, JSON.stringify(slots)); } catch (e) { /* private mode */ }
  }

  // Keeps cards while they fit the five fields.
  function fitting(list) {
    var out = [];
    list.forEach(function (s) { if (layout(out.concat([s])).used <= FIELDS) out.push(s); });
    return out.length ? out : null;
  }

  function fromHash() {
    var h = location.hash.replace(/^#/, '');
    if (!h) return null;
    var text;
    try { text = decodeURIComponent(h.replace(/\+/g, ' ')); } catch (e) { return null; }
    var out = [];
    text.split('\n').forEach(function (line) {
      var r = WF.parseText(line);   // a whole workout, not cut into fields
      if (r.ok) out.push(fromWorkout(r));
    });
    return fitting(out);
  }

  // A saved card, in this page's shape. Cards saved before AutoRep 1.2 had
  // one exercise and its values next to the name.
  function fromSaved(x) {
    if (!x || typeof x !== 'object') return null;
    if (Array.isArray(x.blocks) && x.blocks.length) {
      return {
        name: String(x.name || ''),
        blocks: x.blocks.slice(0, WF.MAX_BLOCKS).map(function (b) { return Object.assign(blankBlock(), b); }),
        open: typeof x.open === 'number' ? x.open : 0,
      };
    }
    var b = Object.assign(blankBlock(), x);
    delete b.name;
    return { name: String(x.name || ''), blocks: [b], open: 0 };
  }

  function fromStore() {
    var keys = [STORE_KEY, OLD_STORE_KEY];
    for (var k = 0; k < keys.length; k++) {
      try {
        var v = JSON.parse(localStorage.getItem(keys[k]));
        if (Array.isArray(v) && v.length) {
          var list = v.map(fromSaved).filter(Boolean);
          list.forEach(function (s) { s.blocks[s.blocks.length - 1].restAfterS = 0; });
          var out = fitting(list);
          if (out) return out;
        }
      } catch (e) { /* none, or unreadable */ }
    }
    return null;
  }

  slots = fromHash() || fromStore() || [fromWorkout(WF.parse(window.STARTERS[0].text))];
  render();
})();
