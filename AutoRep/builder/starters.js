/* Starter workouts shown under the builder. Each one must read cleanly and be
   in canonical form; test.js checks that. */
(function (root) {
  var STARTERS = [
    { title: 'Leg day', note: '4 sets of 10 squats, 90 s rest', text: 'Leg day|SETS SQUAT 4x10 R90' },
    { title: 'Lunges L/R', note: 'Left, right, rest: 3 sets of 10', text: 'Lunges L/R|SETS SQUAT 3x10 R60 S2' },
    { title: 'Swing EMOM', note: '12 swings every minute for 10 min', text: 'Swing EMOM|EMOM SWING 10x12' },
    { title: 'Jack Tabata', note: '8 rounds, 20 s on, 10 s off', text: 'Jack Tabata|TABATA JACK 8x' },
    // Several exercises: needs AutoRep 1.2.
    { title: 'Full body', note: 'Squats, press, then a Tabata', text: 'Full body|SETS SQUAT 4x10 R90|REST 60|SETS PRESS 3x10 R60|REST 60|TABATA JACK 8x' },
  ];
  if (typeof module === 'object' && module.exports) module.exports = STARTERS;
  else root.STARTERS = STARTERS;
})(typeof self !== 'undefined' ? self : this);
