<div align="center">

# AutoRep by RF

**Your timer counts seconds. AutoRep counts reps.**

An interval timer for the [UNA Watch](https://unawatch.com) that counts your reps by itself, from the
motion of your wrist. EMOM, AMRAP and Tabata, with no tapping and no phone.

<img src="images/hero_3_watches.png" alt="AutoRep on three UNA watches: counting reps, target hit, workout summary" width="800">

</div>

## Demo (30 s)

<!-- To embed the video: edit this file on github.com and drag the .mp4 onto this spot.
     GitHub uploads it and inserts a https://github.com/user-attachments/assets/... link,
     which plays inline. Replace this comment with that link. -->

*Video coming soon.*

## Why

Interval timers tell you when to work, but you still count reps in your head while out of breath,
and the count is gone when the set ends. AutoRep counts for you. In EMOM it buzzes the moment you
hit your target, so the rest of the minute is rest. Afterwards it shows reps per round, so you can
see where you slowed down.

## What it does

AutoRep counts your reps from wrist motion while it runs your interval timer. Pick a workout format:

- **EMOM** (Every Minute On the Minute): do your reps at the start of each minute and rest for what
  is left of it.
- **AMRAP** (As Many Reps As Possible): as many reps as you can in a set time.
- **Tabata**: rounds of 20 seconds of work and 10 seconds of rest, 8 rounds by default.

Then choose an exercise and a target, and train.

- **In EMOM**, the watch buzzes when you hit your target, and the rest of the minute is yours.
- **In Tabata**, it counts every round, so you see exactly where you faded.
- **Miscounted?** L1 and L2 add or remove a rep with one press, even during rest.
- **At the end** you get your total, your reps per round against your target, and how much you
  slowed down from the first rounds to the last.
- **Exercises:** squats, curls, overhead presses, kettlebell swings and jumping jacks.
- **Saved to the UNA phone app:** each workout is saved as an activity, with one lap per round,
  heart rate, and graphs of total reps and reps per minute over time.
- **On the watch:** counting and timing need no phone and no account.

## Screens

| Choose a format | Set it up | Counting | Target hit | Summary |
|:---:|:---:|:---:|:---:|:---:|
| <img src="images/1_mode.png" width="150"> | <img src="images/2_setup.png" width="150"> | <img src="images/5_counting.png" width="150"> | <img src="images/6_target_hit_rest.png" width="150"> | <img src="images/7_summary.png" width="150"> |
| EMOM, AMRAP or Tabata | Exercise, target and length | The ring shows the time left in the round | Green: rest until the next minute | Reps per round against the target |

<!-- UNA phone app screenshot goes here:
<img src="images/phone_app.png" alt="An AutoRep workout in the UNA phone app" width="300">
-->

**Buttons:** L1 / L2 = up / down (during a workout: +1 / −1 rep), R1 = select (during a workout:
pause), R2 = back (during a workout: hold to end).

## How the counting works

The watch reads its accelerometer and gyroscope 50 times a second. For each exercise it uses the
sensor that swings exactly once per rep: acceleration for squats and presses, rotation for curls,
kettlebell swings and jumping jacks.

1. **Filter** out gravity drift and hand tremor.
2. **Find the main direction** of the movement as you go. This lets AutoRep work on either wrist,
   however the strap sits.
3. **Count a rep** each time the motion swings fully up and down along that direction, past a
   threshold that follows the size of your recent reps.
4. **Lock on to your rhythm:** reps count only once three in a row keep a steady pace. Until
   then, the Workout screen shows them in grey with "FINDING RHYTHM n/3". When the rhythm locks,
   all three are counted. Picking up the weight, reaching for water or fidgeting doesn't count.

On 300 simulated sets per exercise (random speed, depth, fatigue, pauses, strap position and sensor
noise), the count is within one rep of the truth in every clean set. Standing still for 30 s adds
zero false reps. These are simulator numbers, and real wrists are tested on the watch.

---

Made by RF for [UNA's first app competition](https://dev.unawatch.com/t/announcing-unas-first-app-competition-october-2026/113)
(October 2026). The watch renders come from the UNA SDK's UI resource pack.
