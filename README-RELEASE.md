# THE SYSTEM — v1.9.0 | Hunter Expansion

**By Dynaframe Studios.** This is a frontend upgrade to your existing V7/V8/V8.5-based PWA. The release retains the original localStorage save key `the-system-save-v1`.

## What is included

- The OG V8 hydration, recovery, fitness records, daily reflections and hidden post-S-Rank questline.
- Existing four fixed bottom tabs: Home, Quests, Growth, Hunter. New contextual section navigation avoids an overloaded bottom bar.
- Personalized onboarding and an editable profile calibration form (focus, available days, training level, equipment, session length).
- Manual daily step totals and weekly goals. Re-entering a daily total **replaces** the previous number rather than adding to it. XP milestones are awarded at most once per day/week.
- Original home workout library with full body, upper body, lower body, core, low-impact cardio, and recovery sessions. Each offers written form cues, movement timers, 25-second rest breaks, pause and resume, and session history. A completed guided workout earns XP at most once per day.
- Local optional Gate Events, offered on user-selected available days. Events earn bonus XP and coins; decline or ignore without penalty. These are local, not server-triggered push events.
- 75 Adapt, 75 Discipline and 75 Ascension: optional original 75-day challenge variants with once-daily check-ins backed by quest/recovery/workout activity, milestone rewards, and no punitive reset.
- More accessible Notices view with a reminder of push setup status and separate `Send iPhone test push` and `Enable / resync` controls.
- Splash branding: **THE SYSTEM · by Dynaframe Studios · v 1.9.0**.
- Existing V7 in-app sounds and Hunter icon assets remain.

## Deliberately not in this build

- Hunter Shop purchases or editable dashboard widgets.
- Real-money donations, ads or payment processing.
- Apple Health or Android Health Connect automatic step sync.
- Public accounts or cross-device progress sync.
- Closed-app, quest-specific or Gate-specific push events. The existing Worker continues to send scheduled **generic morning/evening** reminders; in-app events/quest deadlines depend on the app running.
- Copies of third-party workout animations, images, branded routines or code. The workout content here is original and text-guided; no video coach yet.

## Safe upgrade from existing iPhone beta

1. In your currently deployed app, **Settings → Export JSON backup**. Keep the file somewhere safe.
2. Keep your existing **`push-config.js`** (contains your real Worker URL) and entire **`push-worker/`** folder. Do not replace or redeploy either for this frontend update.
3. Upload the files in this archive to the existing **website root** in GitHub, replacing files of the same names. This archive deliberately **excludes** `push-config.js` and `push-worker/`.
4. Confirm your deployed website still loads `push-config.js` from its root. Deploy from the same URL/origin so browser progress remains in place.
5. After Cloudflare deploys, open the installed iPhone web app, check version `1.9.0`, then verify Home → Quests → Workouts, Growth → Steps and Hunter → Notices → Send iPhone test push.
6. New beta testers should get the personalized onboarding. Existing testers' data is retained; they can visit **Hunter → Profile** and change their schedule and fitness starting level.
7. If the old UI is cached, close and reopen the app after deployment or refresh your installed Home Screen web app. Avoid deleting the app without a backup.

## Verification and known constraints

- JavaScript syntax passed `node --check` for `app.js`, `workouts.js`, `audio.js` and `sw.js`.
- Functional smoke-tested in a browser harness for onboarding, navigation, guided workout, trial enrollment, steps and notices.
- A full hosted iPhone/Cloudflare integration test has **not** been completed in this environment; validate the actual device and Worker.
- The original V8 ranking logic remains weight-threshold-based for compatibility; a fair XP-based rank migration is still a future design decision.
- Step entries are self-reported and can be edited; previously awarded step XP is not revoked after edits.
- Guided workout completion is self-reported; stop when you feel unwell, dizzy or unsteady. Beginners can skip exercises and take longer rests.
- The 75-day modes are original flexible System challenges and **not official 75 Hard**.
- No account backend is included; browser storage is still per-device. Keep periodic JSON backups.
