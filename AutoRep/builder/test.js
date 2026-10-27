#!/usr/bin/env node
/*
 * Runs the shared AutoRep workout-format cases against workout-format.js.
 *
 *   node test.js [path/to/workout-format-tests.json]
 *
 * Without a path it looks for the file next to this one, then in the
 * unawatch-autorep checkout beside una-apps-submissions.
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

var cases = JSON.parse(fs.readFileSync(file, 'utf8')).cases;
var failures = [];

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function sorted(o) {
  var r = {};
  Object.keys(o).sort().forEach(function (k) { r[k] = o[k]; });
  return r;
}

cases.forEach(function (c, i) {
  var got = WF.parse(c.in);
  var label = '#' + (i + 1) + ' ' + JSON.stringify(c.in);
  if (c.empty) {
    if (!got.empty) failures.push(label + ': want empty, got ' + JSON.stringify(got));
    return;
  }
  if (c.ok) {
    var want = {};
    Object.keys(c).forEach(function (k) { if (k !== 'in' && k !== 'canonical') want[k] = c[k]; });
    if (!same(sorted(got), sorted(want))) {
      failures.push(label + ':\n    want ' + JSON.stringify(sorted(want)) + '\n    got  ' + JSON.stringify(sorted(got)));
      return;
    }
    var text = WF.format(got);
    if (text !== c.canonical) failures.push(label + ': canonical want ' + JSON.stringify(c.canonical) + ', got ' + JSON.stringify(text));
    // The canonical text must read back to the same workout.
    else if (!same(sorted(WF.parse(text)), sorted(want))) failures.push(label + ': canonical text does not read back the same');
    return;
  }
  if (got.ok !== false || got.error !== c.error || got.token !== c.token) {
    failures.push(label + ': want ' + c.error + (c.token !== undefined ? ' ' + JSON.stringify(c.token) : '') +
      ', got ' + JSON.stringify(got));
  }
});

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
console.log('All ' + cases.length + ' cases and ' + STARTERS.length + ' starters pass.');
