# THE SYSTEM V8 — Project Reclamation

## Upgrade without breaking push
1. Export a V7 backup from Settings before replacing files.
2. Replace only these website-root frontend files: `index.html`, `app.js`, `styles.css`, `sw.js`. Keep the original `audio.js`, icon files, manifest, and `assets/` (V7 versions are included but unchanged).
3. **KEEP your configured `push-config.js` from your LIVE repository.** The placeholder in this ZIP is blank. Never replace your live URL with that placeholder.
4. **DO NOT overwrite or redeploy `push-worker/`**. The V6 Cloudflare Worker and D1 database do not change in V8.
5. Commit and redeploy website; on iPhone fully close and reopen the installed PWA. Verify Habits tab and Push test.

## Features
- Daily hydration entries with adjustable target, undo last entry; XP once per completed day (10 XP max).
- Recovery check-ins, 5 XP max per day.
- Fitness journal of repetitions/minutes, exertion and technique notes. No XP attached to repeated logs.
- One reflection daily; 5 XP.
- Five hidden post-S-Rank milestones; S rank required before trials are shown, and a one-time ascension to Eclipse Sovereign after completing them.
- The prior V7 rank rule is unchanged: S rank currently depends on recorded weight. This is a game mechanic, **not** a medical health/fitness rank. Do not alter your weight for rank rewards; future version should make rankings health-neutral.
- No sexual habit tracking or sensitive private module.
- All V8 records persist in the existing `the-system-save-v1` state and are included in ordinary JSON exports/imports.

## Notes
The existing push service remains generic morning/evening notices; hydration and fitness records stay on-device. Daily targets are adjustable, not medical hydration prescriptions. Browser storage is device-specific.
