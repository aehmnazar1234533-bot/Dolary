# Dolary automatic social publishing

This Worker adds server-side automatic publishing of the canonical Dolary rate to the Dolary Facebook Page and Instagram Professional account.

## Flow

- Cron remains every 10 minutes.
- The Worker reads the same `https://xeiqd.com/rates.json` source already used by the existing notification system.
- Baghdad is the canonical social rate by default (`SOCIAL_RATE_SLUG=baghdad`).
- A social job is created only when the canonical rate is not already present in the five-year published-rate history.
- The existing Dolary daily-card SVG template is rendered to a 1080×1350 JPEG by Cloudflare Browser Run.
- The JPEG is stored in the existing KV namespace and exposed through a read-only public image endpoint so Meta can fetch it.
- Facebook and Instagram are processed independently.
- Each platform has its own state and errors. A failure on one platform does not block the other.
- Before publishing, the Worker searches recent posts for a unique `[DOLARY-RATE:<rate>]` marker to recover safely after an interrupted request.

## Cloudflare configuration

Existing KV is reused. The Worker now also has a Browser Run binding named `BROWSER`.

Plain variables:
- `SOCIAL_IMAGE_BASE_URL=https://dolary.aehmnazar-1234533.workers.dev`
- `SOCIAL_RATE_SLUG=baghdad`
- `SOCIAL_LOGO_URL=https://aehamtech.top/dolary/dolary-mark.svg`

Secrets:
- `META_PAGE_ID`
- `META_PAGE_ACCESS_TOKEN`
- `META_INSTAGRAM_BUSINESS_ACCOUNT_ID`
- `META_USER_ACCESS_TOKEN`

Do not put tokens in GitHub or frontend files.

## Meta permissions

For Page photo publishing, use a Page access token for a person with the Page `CREATE_CONTENT` task and the Page permissions Meta documents for publishing: `pages_show_list`, `pages_read_engagement`, and `pages_manage_posts`.

For the Instagram API with Facebook Login, use a Facebook user access token and the permissions approved for that API flow. Current Meta references identify `instagram_basic` and `instagram_content_publish` for the Facebook Login flow. The newer Instagram Login API uses `instagram_business_basic` and `instagram_business_content_publish`; choose one auth flow and do not mix its permissions. Do not mix this with the separate Instagram Login API, which uses different permission names.

## Testing

The code has no production social-test endpoint. Without all Meta secrets and IDs, the cron can generate nothing and publish nothing. After configuring Meta secrets, test by changing the canonical rate in the upstream data source or by temporarily using a test Meta account/Page; do not add test tokens to the repository.

## Failure behavior

- Same rate: no new image and no new post.
- Facebook success + Instagram failure: Facebook ID is stored; later cron retries only Instagram.
- Instagram success + Facebook failure: Instagram ID is stored; later cron retries only Facebook.
- Invalid/expired token: sanitized Meta error code/status/message is stored; token itself is never logged.
- Browser Run failure: no social publish is attempted until the image can be generated.
