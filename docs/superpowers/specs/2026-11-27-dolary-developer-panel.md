# Dolary Developer Panel Design Specification

## Goal
Add a protected `/dev` control panel to the existing Dolary Cloudflare Worker so the owner can edit selected PWA appearance, text, links, feature flags, PWA metadata, and icon assets without manually editing source files for every routine change.

## Scope
The first release controls the existing standalone iPhone/PWA experience under `docs/dolary`. It must preserve all existing rate fetching, calculator, favorites, notification, privacy, social publishing, Android, and service-worker behavior.

The panel is configuration-driven. It must never expose an arbitrary source-code editor and must not rewrite unrelated application files.

## Architecture

### 1. Developer panel
- Route: `/dev` on the existing Worker.
- Reuse the existing `ADMIN_PASSWORD` secret for login.
- Successful login creates a short-lived opaque HttpOnly Secure SameSite=Strict session cookie.
- Session records are stored in the existing `PUSH_STORE` KV under a dedicated `dev:session:` namespace.
- State-changing developer API routes require the valid session and same-origin checks.

### 2. Configuration contract
Create `docs/dolary/dolary-config.js` as a small versioned browser configuration object.

The configuration owns only safe editable values:
- branding: app name, small label, selected PWA icon asset
- theme: background/theme/accent values used by the PWA
- home copy: selected titles, subtitles, labels and notes
- quick links: id, label, description, URL, enabled, order
- feature flags: favorites, calculator, notifications, daily share, privacy
- layout controls: a bounded set of scale/gap/radius variables
- PWA metadata: name, short name, description, theme color, background color

All editable fields have strict validation, length limits, URL allow-list rules where appropriate, and bounded numeric ranges.

### 3. Draft and preview
- Draft configuration is stored in KV under `dev:draft`.
- Preview tokens are stored under `dev:preview:` with a short TTL.
- A preview token can be passed to the public PWA as `?dolaryDevPreview=<token>`.
- `pwa-app.js` uses the published static config normally and fetches the draft only when a valid preview token is present.
- The developer panel embeds the real PWA in preview mode so the owner sees the actual PWA rather than a second fake renderer.

### 4. GitHub publishing
The Worker publishes through the GitHub Git Database API using a fine-grained token kept only as a Worker secret:
- `GITHUB_TOKEN` secret
- `GITHUB_REPOSITORY` variable, default `aehmnazar1234533-bot/Dolary`
- `GITHUB_BRANCH` variable, default `main`

Publishing must:
1. Read the current branch head.
2. Read the current tree.
3. Create blobs only for files that changed.
4. Create one new tree from the current tree.
5. Create one commit containing all changed files.
6. Advance the branch ref only if the parent is still the head read at step 1.
7. Return the commit SHA and changed paths.

This keeps a multi-file publish atomic and avoids partially published UI updates.

### 5. Published files
Routine settings publish:
- `docs/dolary/dolary-config.js`
- `docs/dolary/manifest.webmanifest` when PWA metadata changes

Icon publish:
- `docs/dolary/pwa-icon.svg`

The existing `.github/workflows/fix-pwa-icon.yml` continues generating the iPhone PNG and cache-busting references after `pwa-icon.svg` changes.

The panel may accept PNG/JPEG/WebP uploads up to a bounded size and convert them client-side to an SVG wrapper with embedded image data before publishing `pwa-icon.svg`. No arbitrary executable content is accepted.

### 6. History and rollback
- Before each publish, store the previous editable-file contents and metadata in KV under `dev:history:<id>`.
- Keep a bounded history (latest 10 publishes).
- Rollback restores a selected prior snapshot by publishing a new commit; it does not force-reset Git history.
- Each history entry records timestamp, commit SHA, changed paths, summary, and whether it was a publish or rollback.

### 7. Feature extensibility
The config schema is versioned.
Future features can add a new config section and UI controls without changing the publishing architecture.
Truly new application logic remains a code change until it is explicitly exposed through a tested configuration capability.

## UX
The developer panel is Arabic RTL and visually matches Dolary's dark/glass style.

Sections:
1. **المظهر** — theme, spacing, card radius, controlled sizes.
2. **النصوص** — editable PWA copy with live preview.
3. **الروابط** — add/edit/hide/reorder quick links.
4. **الميزات** — toggle supported features.
5. **PWA** — name, short name, description, theme/background colors.
6. **الأيقونة** — current icon preview and image upload.
7. **المعاينة والنشر** — Save Draft, Preview, Publish, History, Rollback.

The publish button must require an explicit confirmation and show the exact changed paths before committing.

## Non-goals
- No arbitrary HTML/CSS/JS editor.
- No changes to the Android application.
- No changes to the existing social publishing flow unless required by test isolation.
- No replacement of the existing KV namespace.
- No new paid service.

## Safety requirements
- Never send `GITHUB_TOKEN` or `ADMIN_PASSWORD` to the browser.
- Never store the admin password in localStorage/sessionStorage.
- Never publish directly from browser code to GitHub.
- Never overwrite unrelated repository files.
- Reject concurrent publish when branch head changed since the draft was loaded; ask the panel to refresh before retry.
