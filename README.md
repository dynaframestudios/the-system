# The System V4 — Awakening

Static PWA. Deploy the contents of this folder at the root of your Cloudflare Pages GitHub repository (no build command, output `/`).

## Upgrades
- Seven-day analytics and XP history
- Custom milestone achievements
- Rank/level-up animation
- Escalating recovery-task instructions based on backlog, with excuse button and no XP punishment
- Last backup export date and JSON import/export
- Service worker cache bumped to V4 with network-first updates

## Storage and caveats
Uses the same `the-system-save-v1` localStorage key as V3; export your V3 backup before replacing files. Progress is tied to the browser and origin. Notifications still work only when the page is running; closed-app push needs an opt-in server push subscription and a push sender (Cloudflare Worker or similar). No background push is claimed here.

## Quick check
Open your deployed Pages site, navigate Analytics, create an achievement in Rewards, complete a quest, export a JSON backup, and reload to verify persistence. To see the level-up animation, earn enough XP to cross a level threshold.
