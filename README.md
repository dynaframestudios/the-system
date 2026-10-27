# THE SYSTEM V6 — The System Never Sleeps

Includes the full V5 PWA plus optional Cloudflare Worker Web Push. Existing save key remains `the-system-save-v1`.

## 1. Back up and deploy the static PWA
Export your V5 progress first. Upload the contents of the `site/` folder to your existing Cloudflare Pages GitHub repository. No build command, output folder `/`. Deploy as normal.

## 2. Configure push Worker (needed for notifications with app closed)
Requirements: Node.js, npm, Cloudflare account and Wrangler login. Run these commands from `push-worker/`:

```sh
npm install
npx wrangler login
npx wrangler d1 create the-system-push
```

Put the resulting **database_id** into `wrangler.jsonc`. Set `APP_ORIGIN` to your exact deployed Pages URL (no final slash). Run:

```sh
npx wrangler d1 execute the-system-push --remote --file=./schema.sql
npx web-push generate-vapid-keys --json
```

Save the generated VAPID public and private keys securely. Configure Worker secrets (never commit private keys):

```sh
npx wrangler secret put VAPID_PUBLIC
npx wrangler secret put VAPID_PRIVATE
npx wrangler secret put VAPID_SUBJECT
```

Use `mailto:you@example.com` (replace with your own email) for VAPID_SUBJECT. Then:

```sh
npm run deploy
```

Copy the deployed `https://...workers.dev` URL into `site/push-config.js`, commit that change to your Pages repository and redeploy.

## 3. Enable on your device
Open the deployed HTTPS site → Settings → System alerts: enable and save Morning and/or Daily reminders → V6 Background push → Enable background push → Test push. The same browser/site origin retains V5 progress. iOS requires adding the web app to the Home Screen (iOS 16.4+). Users must explicitly grant notification permission.

## Design & limits
- The Worker sends **generic** scheduled morning/evening messages, not quest-specific reminders. User quest contents remain on-device.
- Worker Cron runs every 5 minutes, and reminders may be delayed by the browser, network or OS. No exact-time SLA.
- This is an opt-in, single-user-friendly system; each browser subscribes separately.
- Worker stores the anonymous push subscription endpoint, timezone and alert preferences in D1. Disable Push to delete it; if browser storage is cleared first, server entries may remain until stale endpoints return 404/410. Review Cloudflare's data policies before using.
- The app stays fully usable with the Worker unconfigured. V5 in-app alerts continue.
- No VAPID private key belongs in the Pages site repository or `push-config.js`.
- Not fully end-to-end tested against a live Cloudflare account. Validate Worker bundling and push on your deployed device.
