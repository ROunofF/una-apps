#!/usr/bin/env node
/*
 * Runs the shared AutoRep workout-format cases against workout-format.js.
 *
 *   node test.js [path/to/workout-format-tests.json]
 *
 * Without a path it looks for the file next to this one, then in the
 * unawatch-autorep checkout beside una-apps-submissions.
 *
 * Checks: every `cases` entry (one field read as a workout, then its
 * canonical text), every `fields` entry (the five phone fields through
 * parseFields), that split() -> parseFields() gives back the same workout,
 * and that the starters are valid and canonical.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var WF = require('./workout-format.js');
var STARTERS = require('./starters.js');

var candidates = process.argv[2]
  ? [process.argv[2]]
  : [
      path.join(__dirname, 'workout-format-tests.json'),
      path.join(__dirname, '..', '..', '..', 'unawatch-autorep', 'AutoRep', 'Docs', 'workout-format-tests.json'),
    ];
var file = candidates.filter(function (p) { return fs.existsSync(p); })[0];
if (!file) {
  console.error('Cannot find workout-format-tests.json. Looked in:\n  ' + candidates.join('\n  '));
  process.exit(2);
}

var data = JSON.parse(fs.readFileSync(file, 'utf8'));
var cases = data.cases;
var fieldCases = data.fields || [];
var failures = [];
var roundTrips = 0;

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function sorted(o) {
  var r = {};
  Object.keys(o).sort().forEach(function (k) { r[k] = o[k]; });
  return r;
}
function sortedBlocks(bs) { return bs.map(sorted); }

// The blocks a test case expects: its `blocks`, or (one block) its top-level
// values with restAfterS 0.
function wantBlocks(c) {
  if (c.blocks) return c.blocks;
  var b = {};
  Object.keys(c).forEach(function (k) {
    if (['in', 'canonical', 'ok', 'name'].indexOf(k) < 0) b[k] = c[k];
  });
  b.restAfterS = 0;
  return [b];
}

// split() into fields, then read them back as the phone app would.
function roundTrip(label, w) {
  var text = WF.format(w);
  var fields = WF.split(text);
  if (fields.length > WF.FIELDS) return; // too long for the phone: the builder says so
  var tooLong = fields.filter(function (f) { return WF.utf8Bytes(f) > WF.MAX_BYTES; });
  if (tooLong.length) { failures.push(label + ': split() made a field over ' + WF.MAX_BYTES + ' bytes: ' + JSON.stringify(tooLong[0])); return; }
  for (var k = 1; k < fields.length; k++) {
    if (fields[k].indexOf('+|') !== 0) { failures.push(label + ': split() field ' + (k + 1) + ' does not start with +|'); return; }
  }
  var five = fields.concat(['', '', '', '', '']).slice(0, WF.FIELDS);
  var got = WF.parseFields(five);
  if (got.length !== 1 || !got[0].ok || got[0].fields !== fields.length ||
      !same(sortedBlocks(got[0].blocks), sortedBlocks(w.blocks)) || got[0].name !== w.name) {
    failures.push(label + ': split -> parseFields does not read back the same:\n    fields ' + JSON.stringify(fields) +
      '\n    got    ' + JSON.stringify(got));
    return;
  }
  roundTrips++;
}

cases.forEach(function (c, i) {
  var got = WF.parse(c.in);
  var label = '#' + (i + 1) + ' ' + JSON.stringify(c.in);
  if (c.empty) {
    if (!got.empty) failures.push(label + ': want empty, got ' + JSON.stringify(got));
    return;
  }
  if (c.ok) {
    var blocks = wantBlocks(c);
    if (!got.ok || got.name !== c.name || !same(sortedBlocks(got.blocks), sortedBlocks(blocks))) {
      failures.push(label + ':\n    want ' + JSON.stringify({ name: c.name, blocks: blocks }) + '\n    got  ' + JSON.stringify(got));
      return;
    }
    // v1 callers: the first block's values at the top level.
    var top = Object.assign({}, blocks[0]);
    delete top.restAfterS;
    var mismatch = Object.keys(top).filter(function (k) { return got[k] !== top[k]; });
    if (mismatch.length) { failures.push(label + ': top-level ' + mismatch.join(', ') + ' differ from block 1'); return; }
    var text = WF.format(got);
    if (text !== c.canonical) { failures.push(label + ': canonical want ' + JSON.stringify(c.canonical) + ', got ' + JSON.stringify(text)); return; }
    var again = WF.parseText(text);   // may be over one field (e.g. ten blocks)
    if (!again.ok || !same(sortedBlocks(again.blocks), sortedBlocks(blocks))) failures.push(label + ': canonical text does not read back the same');
    roundTrip(label, got);
    return;
  }
  if (got.ok !== false || got.error !== c.error || got.token !== c.token) {
    failures.push(label + ': want ' + c.error + (c.token !== undefined ? ' ' + JSON.stringify(c.token) : '') +
      ', got ' + JSON.stringify(got));
  }
});

fieldCases.forEach(function (c, i) {
  var label = 'fields #' + (i + 1) + ' ' + JSON.stringify(c.fields);
  var got = WF.parseFields(c.fields).map(function (r) {
    var o = { field: r.field, ok: !!r.ok };
    if (r.ok) { o.name = r.name; o.blocks = r.blocks.length; } else { o.error = r.error; if (r.token !== undefined) o.token = r.token; }
    return o;
  });
  var want = c.workouts.map(sorted);
  if (!same(got.map(sorted), want)) failures.push(label + ':\n    want ' + JSON.stringify(want) + '\n    got  ' + JSON.stringify(got.map(sorted)));
});

// Long workouts that need more than one field.
(function () {
  var sets = { mode: 'SETS', exercise: 'SQUAT', sets: 4, reps: 10, restS: 90, sides: 2, getReadyS: 10, restAfterS: 120 };
  var tab = { mode: 'TABATA', exercise: 'JACK', rounds: 8, getReadyS: 3, restAfterS: 0 };
  [3, 5, 8, 10].forEach(function (n) {
    var blocks = [];
    for (var k = 0; k < n; k++) blocks.push(Object.assign({}, k % 2 ? tab : sets, { restAfterS: k < n - 1 && k % 2 === 0 ? 120 : 0 }));
    roundTrip('long workout of ' + n + ' blocks', { name: 'Long one', blocks: blocks });
  });
})();

// Builder's own checks: the starters are valid and canonical.
STARTERS.forEach(function (s) {
  var w = WF.parse(s.text);
  if (!w.ok) failures.push('starter ' + JSON.stringify(s.text) + ': ' + JSON.stringify(w));
  else if (WF.format(w) !== s.text) failures.push('starter ' + JSON.stringify(s.text) + ': not canonical, want ' + JSON.stringify(WF.format(w)));
});

console.log('Cases: ' + file);
if (failures.length) {
  console.log(failures.length + ' failed:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('All ' + cases.length + ' cases, ' + fieldCases.length + ' field sets, ' + roundTrips +
  ' split round trips and ' + STARTERS.length + ' starters pass.');
