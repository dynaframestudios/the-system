# The System V8.5 — Hunter Awakening

Public version: 1.08.5

This build combines OG V8 with the first public-product upgrades:
- Personalized Hunter onboarding
- Four-tab navigation (Home, Quests, Growth, Hunter)
- Manual weekly step tracking
- Local random Gate Events on free days
- Branded launch screen
- V7/V8 features retained, including hydration, recovery, reflections, audio, and the hidden S-rank trials

## Deployment notes
- Replace the frontend files in your existing repository with this package
- Keep your existing `push-config.js` if it already contains your real Worker URL
- Keep your existing configured `push-worker/` folder if push notifications are already working
- Export a backup before upgrading

## Important limitations
- Random Gate Events are generated locally in the app in this build
- Manual steps are the supported movement input for now
- 75-Day Trials and the live Shop are included as bridge/preview sections and are not fully transactional yet
