/*
 * AutoRep saved workouts: reader and writer for the one-line text format.
 *
 * The contract is unawatch-autorep/AutoRep/Docs/workout-format.md (version 1).
 * The watch reads the same format, and both sides run workout-format-tests.json.
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

  var MAX_BYTES = 128;
  var MAX_NAME = 12;
  var NAME_RE = /^[A-Za-z0-9 \-\/:]+$/;

  var MODES = ['SETS', 'EMOM', 'AMRAP', 'TABATA'];
  var EXERCISES = ['SQUAT', 'CURL', 'PRESS', 'SWING', 'JACK'];

  var REST_OPTIONS = [30, 45, 60, 90, 120, 180];
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
    CHAIN: 'needs newer AutoRep',
    LONG: 'too long',
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

  /**
   * Reads one field.
   * Returns { empty: true } for an unused slot, { ok: true, name, mode,
   * exercise, ...values } for a workout (defaults filled in), or
   * { ok: false, error, token?, reason } for the first error.
   */
  function parse(input) {
    if (typeof input !== 'string') input = '';
    if (utf8Bytes(input) > MAX_BYTES) return fail('LONG');
    if (trimSpaces(input) === '') return { empty: true };

    var parts = input.split('|');
    if (parts.length > 2) return fail('CHAIN');
    if (parts.length < 2) return fail('NAME');

    var name = trimSpaces(parts[0]);
    if (name.length < 1 || name.length > MAX_NAME || !NAME_RE.test(name)) return fail('NAME');

    var words = trimSpaces(parts[1]).split(/ +/).filter(function (w) { return w !== ''; });
    var mode = (words[0] || '').toUpperCase();
    if (MODES.indexOf(mode) < 0) return fail('MODE');
    var exercise = (words[1] || '').toUpperCase();
    if (EXERCISES.indexOf(exercise) < 0) return fail('EXERCISE');

    var seen = {};
    var v = {};
    var mainToken; // as typed, for the 15-sets-with-S2 check
    for (var i = 2; i < words.length; i++) {
      var tok = words[i];
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

    var out = { ok: true, name: name, mode: mode, exercise: exercise };
    var d = DEFAULTS[mode];
    for (var k in d) out[k] = v[k] !== undefined ? v[k] : d[k];

    if (mode === 'SETS' && out.sides === 2 && out.sets > LIMITS.setsCountTwoSides[1]) {
      return fail('RANGE', mainToken);
    }
    return out;
  }

  /** Writes a workout (as parse() returns it) in the canonical form. */
  function format(w) {
    var d = DEFAULTS[w.mode];
    var get = function (k) { return w[k] !== undefined ? w[k] : d[k]; };
    var s = trimSpaces(w.name) + '|' + w.mode + ' ' + w.exercise + ' ';
    switch (w.mode) {
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
    MAX_NAME: MAX_NAME,
    MODES: MODES,
    EXERCISES: EXERCISES,
    REST_OPTIONS: REST_OPTIONS,
    GET_READY_OPTIONS: GET_READY_OPTIONS,
    LIMITS: LIMITS,
    DEFAULTS: DEFAULTS,
    parse: parse,
    format: format,
    checkName: checkName,
    utf8Bytes: utf8Bytes,
  };
});
