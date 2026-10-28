/*
 * AutoRep saved workouts: reader and writer for the text format.
 *
 * The contract is unawatch-autorep/AutoRep/Docs/workout-format.md (version 2:
 * several blocks in one workout, and workouts that continue in the next
 * field). The watch reads the same format, and both sides run
 * workout-format-tests.json.
 *
 * Works as a plain <script> (sets window.WorkoutFormat) and in Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WorkoutFormat = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_BYTES = 128;     // one phone field
  var FIELDS = 5;          // AutoRep's "Workout 1" to "Workout 5"
  var MAX_BLOCKS = 10;
  var MAX_NAME = 12;
  var NAME_RE = /^[A-Za-z0-9 \-\/:]+$/;
  var CONT_RE = /^ *\+ *\|/;   // a field that continues the one before it

  var MODES = ['SETS', 'EMOM', 'AMRAP', 'TABATA'];
  var EXERCISES = ['SQUAT', 'CURL', 'PRESS', 'SWING', 'JACK'];

  var REST_OPTIONS = [30, 45, 60, 90, 120, 180];   // R<s> in SETS, and REST <s> between blocks
  var GET_READY_OPTIONS = [3, 5, 10, 20];

  // Limits per mode, shared with the builder UI.
  var LIMITS = {
    setsCount: [1, 20],
    setsCountTwoSides: [1, 15],
    reps: [1, 50],
    emomMinutes: [1, 30],
    amrapMinutes: [1, 30],
    tabataRounds: [1, 20],
  };

  var DEFAULTS = {
    SETS: { sets: 3, reps: 12, restS: 60, sides: 1, getReadyS: 3 },
    EMOM: { minutes: 10, reps: 12, getReadyS: 3 },
    AMRAP: { minutes: 5, getReadyS: 3 },
    TABATA: { rounds: 8, getReadyS: 3 },
  };

  // Which token kinds each mode takes.
  var ACCEPTS = {
    SETS: { NxM: true, R: true, S: true, G: true },
    EMOM: { NxM: true, G: true },
    AMRAP: { Nm: true, G: true },
    TABATA: { Nx: true, G: true },
  };

  // The reason the watch shows after "Can't read:".
  var REASONS = {
    NAME: 'name',
    MODE: 'mode',
    EXERCISE: 'exercise',
    LONG: 'too long',
    BLOCKS: 'too many blocks',
    ALONE: 'nothing to continue',
  };

  function utf8Bytes(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; } // surrogate pair
      else n += 3;
    }
    return n;
  }

  // Spaces only, as in the contract ("one or more spaces separate the words").
  function trimSpaces(s) {
    return s.replace(/^ +| +$/g, '');
  }

  function words(s) {
    return trimSpaces(s).split(/ +/).filter(function (w) { return w !== ''; });
  }

  function fail(code, token) {
    var r = { ok: false, error: code };
    if (token !== undefined) r.token = token;
    r.reason = token !== undefined ? token : REASONS[code];
    return r;
  }

  function digits(s) {
    // "Numbers are plain digits, at most 3 of them": a longer one is out of range.
    return s.length > 3 ? NaN : parseInt(s, 10);
  }

  // Splits a token into { kind, a, b } or null when it is not a known shape.
  function classify(tok) {
    var m;
    if ((m = /^(\d+)[xX](\d+)$/.exec(tok))) return { kind: 'NxM', a: digits(m[1]), b: digits(m[2]) };
    if ((m = /^(\d+)[mM]$/.exec(tok))) return { kind: 'Nm', a: digits(m[1]) };
    if ((m = /^(\d+)[xX]$/.exec(tok))) return { kind: 'Nx', a: digits(m[1]) };
    if ((m = /^([rRsSgG])(\d+)$/.exec(tok))) return { kind: m[1].toUpperCase(), a: digits(m[2]) };
    return null;
  }

  function inRange(v, lo, hi) {
    return v === v && v >= lo && v <= hi; // v === v rules out NaN
  }

  function inRangeOk(mode, t) {
    switch (t.kind) {
      case 'NxM':
        return mode === 'SETS'
          ? inRange(t.a, 1, 20) && inRange(t.b, 1, 50)
          : inRange(t.a, 1, 30) && inRange(t.b, 1, 50);
      case 'Nm': return inRange(t.a, 1, 30);
      case 'Nx': return inRange(t.a, 1, 20);
      case 'R': return REST_OPTIONS.indexOf(t.a) >= 0;
      case 'S': return t.a === 1 || t.a === 2;
      case 'G': return GET_READY_OPTIONS.indexOf(t.a) >= 0;
    }
    return false;
  }

  // One block's words -> { ok: true, block } or a failure (version 1 checks).
  function parseBlock(w) {
    var mode = (w[0] || '').toUpperCase();
    if (MODES.indexOf(mode) < 0) return fail('MODE');
    var exercise = (w[1] || '').toUpperCase();
    if (EXERCISES.indexOf(exercise) < 0) return fail('EXERCISE');

    var seen = {};
    var v = {};
    var mainToken; // as typed, for the 15-sets-with-S2 check
    for (var i = 2; i < w.length; i++) {
      var tok = w[i];
      var t = classify(tok);
      if (!t || !ACCEPTS[mode][t.kind]) return fail('TOKEN', tok);
      if (!inRangeOk(mode, t)) return fail('RANGE', tok);
      if (seen[t.kind]) return fail('TWICE', tok);
      seen[t.kind] = true;
      switch (t.kind) {
        case 'NxM':
          mainToken = tok;
          if (mode === 'SETS') { v.sets = t.a; v.reps = t.b; } else { v.minutes = t.a; v.reps = t.b; }
          break;
        case 'Nm': v.minutes = t.a; break;
        case 'Nx': v.rounds = t.a; break;
        case 'R': v.restS = t.a; break;
        case 'S': v.sides = t.a; break;
        case 'G': v.getReadyS = t.a; break;
      }
    }

    var b = { mode: mode, exercise: exercise };
    var d = DEFAULTS[mode];
    for (var k in d) b[k] = v[k] !== undefined ? v[k] : d[k];

    if (mode === 'SETS' && b.sides === 2 && b.sets > LIMITS.setsCountTwoSides[1]) {
      return fail('RANGE', mainToken);
    }
    return { ok: true, block: b };
  }

  /**
   * Reads a whole workout with no length limit: one field, or the fields of a
   * continued workout already joined with "|". Same result as parse().
   * Also reads the share link's lines, which aren't split into fields.
   */
  function parseText(input) {
    if (typeof input !== 'string') input = '';
    if (trimSpaces(input) === '') return { empty: true };

    var parts = input.split('|');
    if (parts.length < 2) return fail('NAME');
    var name = trimSpaces(parts[0]);
    if (name.length < 1 || name.length > MAX_NAME || !NAME_RE.test(name)) return fail('NAME');

    var blocks = [];
    var restWord = null; // the REST just read, as typed, until a block follows it
    for (var p = 1; p < parts.length; p++) {
      var w = words(parts[p]);
      if (w.length && w[0].toUpperCase() === 'REST') {
        if (blocks.length === 0 || restWord !== null || w.length < 2) return fail('TOKEN', w[0]);
        var s = /^\d+$/.test(w[1]) ? digits(w[1]) : NaN;
        if (REST_OPTIONS.indexOf(s) < 0) return fail('RANGE', w[1]);
        if (w.length > 2) return fail('TOKEN', w[2]);
        blocks[blocks.length - 1].restAfterS = s;
        restWord = w[0];
        continue;
      }
      if (blocks.length >= MAX_BLOCKS) return fail('BLOCKS');
      var r = parseBlock(w);
      if (!r.ok) return r;
      r.block.restAfterS = 0;
      blocks.push(r.block);
      restWord = null;
    }
    if (restWord !== null) return fail('TOKEN', restWord);

    // The first block's values also sit at the top level, as in version 1.
    var out = { ok: true, name: name };
    for (var k in blocks[0]) if (k !== 'restAfterS') out[k] = blocks[0][k];
    out.blocks = blocks;
    return out;
  }

  /**
   * Reads one field as a whole workout.
   * Returns { empty: true } for an unused slot; { ok: true, name, blocks, ...
   * } for a workout (defaults filled in; each block has restAfterS, and the
   * first block's values are also at the top level); or { ok: false, error,
   * token?, reason } for the first error.
   */
  function parse(input) {
    if (typeof input !== 'string') input = '';
    if (utf8Bytes(input) > MAX_BYTES) return fail('LONG');
    return parseText(input);
  }

  /**
   * Reads the five phone fields. Returns one entry per workout, in order:
   * parse()'s result plus `field` (the 1-based field it is listed under) and
   * `fields` (how many fields it takes). Empty fields give no entry.
   */
  function parseFields(fields) {
    var groups = [];
    var cur = null; // the workout a "+|" field would continue
    for (var i = 0; i < FIELDS; i++) {
      var f = typeof fields[i] === 'string' ? fields[i] : '';
      if (trimSpaces(f) === '') { cur = null; continue; }
      if (CONT_RE.test(f)) {
        if (cur) { cur.texts.push(f); continue; }
        // Nothing to continue. A "+|" right after this one joins it, and
        // the whole entry still reads as ALONE.
        cur = { field: i + 1, texts: [f], alone: true };
        groups.push(cur);
        continue;
      }
      cur = { field: i + 1, texts: [f] };
      groups.push(cur);
    }
    return groups.map(function (g) {
      var r;
      if (g.alone) r = fail('ALONE');
      else if (g.texts.some(function (t) { return utf8Bytes(t) > MAX_BYTES; })) r = fail('LONG');
      else {
        r = parseText(g.texts[0] + g.texts.slice(1).map(function (t) { return '|' + t.replace(CONT_RE, ''); }).join(''));
      }
      r.field = g.field;
      r.fields = g.texts.length;
      return r;
    });
  }

  function formatBlock(b) {
    var d = DEFAULTS[b.mode];
    var get = function (k) { return b[k] !== undefined ? b[k] : d[k]; };
    var s = b.mode + ' ' + b.exercise + ' ';
    switch (b.mode) {
      case 'SETS':
        s += get('sets') + 'x' + get('reps') + ' R' + get('restS');
        if (get('sides') === 2) s += ' S2';
        break;
      case 'EMOM': s += get('minutes') + 'x' + get('reps'); break;
      case 'AMRAP': s += get('minutes') + 'm'; break;
      case 'TABATA': s += get('rounds') + 'x'; break;
    }
    if (get('getReadyS') !== 3) s += ' G' + get('getReadyS');
    return s;
  }

  /**
   * Writes a workout in the canonical form: { name, blocks: [...] } (each
   * block may have restAfterS), or a version 1 workout with its values at the
   * top level. A rest after the last block is left out. The result can be
   * longer than one field; split() cuts it into fields.
   */
  function format(w) {
    var blocks = w.blocks && w.blocks.length ? w.blocks : [w];
    var last = blocks.length - 1;
    return trimSpaces(w.name) + '|' + blocks.map(function (b, i) {
      return formatBlock(b) + (i < last && b.restAfterS ? '|REST ' + b.restAfterS : '');
    }).join('|');
  }

  /**
   * Cuts a canonical workout into as few fields as it can: each field holds
   * whole parts (a block or a REST), at most MAX_BYTES, and each next field
   * starts with "+|". Returns the fields' texts.
   */
  function split(canonical) {
    var parts = canonical.split('|');
    var out = [];
    var cur = parts[0] + '|' + (parts[1] || '');
    for (var k = 2; k < parts.length; k++) {
      if (utf8Bytes(cur + '|' + parts[k]) <= MAX_BYTES) cur += '|' + parts[k];
      else { out.push(cur); cur = '+|' + parts[k]; }
    }
    out.push(cur);
    return out;
  }

  /** Name check for the builder's name box: null when fine, else a message. */
  function checkName(raw) {
    var name = trimSpaces(raw || '');
    if (name.length === 0) return 'Give it a name';
    if (name.length > MAX_NAME) return 'At most ' + MAX_NAME + ' characters';
    if (!NAME_RE.test(name)) return 'Only letters, digits, space and - / :';
    return null;
  }

  return {
    MAX_BYTES: MAX_BYTES,
    FIELDS: FIELDS,
    MAX_BLOCKS: MAX_BLOCKS,
    MAX_NAME: MAX_NAME,
    MODES: MODES,
    EXERCISES: EXERCISES,
    REST_OPTIONS: REST_OPTIONS,
    GET_READY_OPTIONS: GET_READY_OPTIONS,
    LIMITS: LIMITS,
    DEFAULTS: DEFAULTS,
    parse: parse,
    parseText: parseText,
    parseFields: parseFields,
    format: format,
    split: split,
    checkName: checkName,
    utf8Bytes: utf8Bytes,
  };
});
