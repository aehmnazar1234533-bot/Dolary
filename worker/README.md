# Dolary Web Push Worker

This service sends background price-target notifications to installed Dolary web apps, including iPhone Home Screen apps. It uses the standards-based Web Push protocol (VAPID + RFC 8291 aes128gcm) and Cloudflare Workers + KV.

## Cloudflare setup

1. Create a free Cloudflare account and open **Workers & Pages**.
2. Connect the GitHub repository `aehmnazar1234533-bot/Dolary` to a new Worker build. Set the working directory to `worker`, the deploy command to `npm install && npx wrangler deploy`, and keep the Worker name as `dolary-push`.
3. After the first deploy, create a Workers KV namespace named `DOLARY_PUSH_STORE`. In the Worker settings, add a KV namespace binding named exactly `PUSH_STORE` and select that namespace.
4. In Worker **Settings → Variables and Secrets**, add `VAPID_PRIVATE_KEY` as a **Secret** (never as a plain variable). The VAPID public key and subject are already in `wrangler.jsonc`.
5. The Worker needs these values:
   - `APP_ORIGIN`: `https://aehamtech.top`
   - `APP_URL`: `https://aehamtech.top/dolary/`
   - `VAPID_SUBJECT`: `https://aehamtech.top`
   - `VAPID_PUBLIC_KEY`: already configured in `wrangler.jsonc`
   - `VAPID_PRIVATE_KEY`: add the private key as a Cloudflare Secret
6. Open `docs/dolary/pwa-push-config.js` in GitHub and set `apiBaseUrl` to the Worker URL shown by Cloudflare, for example `https://dolary-push.YOUR-SUBDOMAIN.workers.dev`. Save the file.
7. Confirm the Worker has the `*/5 * * * *` Cron Trigger. It checks XEIQD every five minutes and sends notifications only when a saved target is crossed.

## API and health check

- `GET /api/health` reports whether KV and VAPID are configured.
- `GET /api/config` returns the public VAPID key only.
- `POST /api/subscribe` stores a browser subscription and optional price rule.
- `POST /api/remove-rule` removes the price rule but keeps the browser subscription.
- `POST /api/test` sends a one-time test notification to the subscribed device.

The Worker accepts browser push endpoints only over HTTPS and uses an origin allowlist for `https://aehamtech.top`.

## Free-tier note

Cloudflare's free tier has request, CPU, Cron and KV quotas. The Worker checks four subscriptions per five-minute run to stay conservative on the free CPU/subrequest limits; it rotates through saved subscriptions. Larger audiences may need a higher batch size or a paid plan. Delivery also depends on the phone's iOS version, Home Screen installation, notification permission, Apple push service and network availability.
