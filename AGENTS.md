# una-apps: guide for adding an app

Public showcase of RF's entries in UNA's first app competition
(https://dev.unawatch.com/t/announcing-unas-first-app-competition-october-2026/113).
GitHub: https://github.com/ROunofF/una-apps (branch `main`; renamed from una-apps-submissions on 2026-10-27, the old address redirects). The local folder is still `~/STM32Cube/una-apps-submissions`.

**Deadline:** 2026-10-30, 4 pm UK = 12:00 noon Toronto. Each entry needs the app on the UNA
community store (an unpublished draft counts) plus the Google Form
(https://forms.gle/MTWZYWsVgB6UvrxA7). Judging: Usefulness, Originality, UX/UI, 10 points each.

This repo shows the apps; their source lives in each app's own project
(`~/STM32Cube/unawatch-<app>/`).

## Layout

```
README.md              index: one table row + hero picture per app
AGENTS.md              this guide (CLAUDE.md can just say @AGENTS.md)
tools/make-mockups.py  screenshots -> watch mockups
.github/ISSUE_TEMPLATE/ feedback forms (see "Feedback hub")
<App>/README.md        the app's page
<App>/images/          mockups, hero, icon (and phone_app.png if any)
```

## Adding an app (what AutoRep did)

1. **Screenshots from the simulator.** In the TouchGFX simulator, **F3** saves the 240×240
   screen as a BMP in `build/bin/screenshots/` next to `simulator.exe`. Step through the screens
   with keys `1`–`4` (L1, L2, R1, R2; `q w e r` press, `a s d f` release). Use the simulator, not
   photos of the watch: it gives pixel-exact frames with no glare. Pick 5–7 frames that tell the
   story: start, setup, the app in use, the payoff moment, the result.
2. **Convert to PNG** with readable names (`1_mode.png`, `2_setup.png`, …) and put them in the
   app's `AutoRep/previews/`-style folder. Those are the store previews.
3. **Mockups:** `py -3 tools/make-mockups.py <png dir> <App>/images --body white --hero a.png,b.png,c.png`. Add `--look watch` to tone the screens like the real panel (dimmer, less saturated), so the
   simulator colours don't look fake inside the photo-like renders.
   This puts each screen into the official UNA watch render from the SDK's Figma UI kit. RF owns the
   **white** watch, so white goes in front; black and teal go on the sides of the hero picture.
4. **`<App>/README.md`:** copy `AutoRep/README.md` and keep its order:
   - Centred title, a one-line tagline in bold, one sentence on what the app is, the hero picture.
   - **Demo (30 s):** placeholder. GitHub plays a video inline only if it's uploaded on
     github.com: edit the README there and drag the .mp4 in.
   - **Why:** the problem in 3–4 sentences.
   - **What it does:** the store description, with any acronym spelled out the first time.
   - **Screens:** a table, one column per screen, with a caption row.
   - **Buttons:** one line.
   - **How it works:** plain language, honest about what was tested on a real wrist and what
     only in the simulator.
   - Footer naming the competition and crediting the UNA SDK UI kit for the watch renders.
5. **Index:** add a row to the table in the top `README.md`, and the app to the feedback forms
   (see "Feedback hub").
6. **Push** from the repo folder: `git add . && git commit -m "Add <App>" && git push`.

## Style

Plain, short sentences. Name concrete things (screens, buttons, numbers). No hype words. Don't claim
real-world accuracy the app hasn't shown on a real wrist.

## Apps

| App | Project | Store ID | Status |
|---|---|---|---|
| AutoRep by RF | `~/STM32Cube/unawatch-autorep` | `AD5202A23D2FEE00` | v0.9.7; page updated 2026-10-24 (round store previews, watch-look mockups, 6 screens, "Coming next": workout plans); video and phone-app screenshot to add |
| PomoTimer by RF | `~/STM32Cube/unawatch-pomodoro` | `EBD6F3D4E1035F74` | v0.4.1 on the store; page added 2026-10-27 (hero + 6 screens, from the 0.4.1 simulator frames); video to add |
| Theme (Halloween!) Face by RF | `~/STM32Cube/unawatch-halloweenface` | `9A25EE3448337D5D` | Watch face; v1.0.0 on the store 2026-10-29 (tested on the watch); no page yet; monthly themes planned for 1.1 |

## Feedback hub

This repo is where users reach RF about any of the apps: GitHub issues with three forms in
`.github/ISSUE_TEMPLATE/` (bug, idea, feedback), each starting with a "Which app?" dropdown.

- **New app:** add it to the "Which app?" dropdown in all three forms.
- **Every app page** ends with a "Feedback" section linking to `issues/new/choose`.
- **Every store description** (`app-manifest.json` in the app's project) ends with this
  paragraph, as its last lines (no "<App> by RF." line after it: the store already shows the app name, so it read twice):

  ```
  FEEDBACK
  Found a bug or have an idea? Tell me at https://github.com/ROunofF/una-apps/issues/new/choose (pick <App> in the form). My other apps are there too.
  ```

  It reaches the store with the app's next upload.
