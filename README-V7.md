# THE SYSTEM V7 — Audio & Hunter Insignia

## Deploy
Back up progress first. Copy the V7 `site/` content to the existing frontend deployment root, replacing matching files. The `push-worker/` folder is unchanged from V6: do **not** redeploy it for this update. Verify `push-config.js` on your live deployment still points to your WORKING Worker URL: this source archive includes the original blank value.

## iPhone
Open The System from the Home Screen, verify quests and Settings → System audio. After the deployment, iOS may cache the old icon: remove the Home Screen shortcut (do not delete app data without backup), then add it again from Safari. Preserve exported JSON backup first because reinstalling may change the app data container.

## Sounds
Settings → System audio: enable, volume, profile, previews. Sounds generated with Web Audio API, no copyrighted music or sound files. First gesture required by iOS.

## Push notification tone
Web Push on installed iPhone web apps does not permit websites to attach a custom notification audio file or select an iOS alert tone. V6 push notifications remain functional and use sounds supplied by iOS.

## Smoke test
Onboarding, quest completion, level-up, Settings audio sliders, push subscribe and test push, service worker refresh, backup/restore, iPhone reinstall icon. JS syntax checked; real iPhone testing required.
