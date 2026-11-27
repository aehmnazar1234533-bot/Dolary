# Dolary Developer Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure, configuration-driven `/dev` panel to the existing Dolary Worker that can draft, preview, publish, and roll back safe PWA changes through GitHub without touching unrelated app logic.

**Architecture:** Keep the existing Worker and `PUSH_STORE` KV. Add a small developer module layer for auth, config validation, GitHub Git-Database publishing, drafts, previews, and history; make the PWA consume a versioned static config file with an optional preview override. Publish related files as one Git commit so settings and PWA metadata cannot be half-updated.

**Tech Stack:** Cloudflare Workers, existing KV binding, vanilla HTML/CSS/JavaScript, GitHub REST Git Database API, Node 22 tests, existing Wrangler configuration.

**Spec:** `docs/superpowers/specs/2026-11-27-dolary-developer-panel.md`

## Global Constraints

- Preserve all existing Dolary rate, calculator, favorites, notification, privacy, Android, social publishing, and service-worker behavior.
- Do not replace the existing `PUSH_STORE` KV namespace.
- Do not expose `ADMIN_PASSWORD` or `GITHUB_TOKEN` to the browser.
- Do not add arbitrary source-code editing to the panel.
- Use the existing Worker compatibility date and package versions as the baseline.
- All GitHub writes must be atomic and concurrency-checked against the branch head.
- The editable configuration must have strict validation, bounded sizes, and a version field.
- Rollback creates a new forward commit; never force-resets the repository.
- Existing repository checks remain required: Node syntax checks, worker tests, and `npm run dry-run`.

## Review Focus

- Session theft/replay: a valid login must use HttpOnly Secure SameSite=Strict cookies and expire from KV.
- Origin/CSRF bypass: unauthenticated or cross-origin state-changing developer requests must be rejected.
- Publish race: a stale branch head must never be overwritten.
- Config injection: oversized, malformed, or unsafe URLs/text must be rejected before storage/publish.
- Icon abuse: uploads must be bounded and converted to a non-executable SVG image wrapper before publication.

### Task 1: Add the versioned Dolary configuration contract

**Files:**
- Create: `docs/dolary/dolary-config.js`
- Create: `worker/src/dev-config.js`
- Create: `worker/test/dev-config.test.js`
- Modify: `docs/dolary/pwa-app.js` only after the validation contract is tested.

**Interfaces:**
- Produces `DEFAULT_DOLARY_CONFIG`, `sanitizeDolaryConfig(input)`, `configToJs(config)`.
- `sanitizeDolaryConfig(input)` returns a normalized config or throws a stable validation error.
- `configToJs(config)` returns complete UTF-8 JavaScript assigning `window.DOLARY_CONFIG`.

- [ ] **Step 1: Write failing tests for config defaults and normalization.**
  Test that a missing config produces defaults for every required section, unknown properties are removed, bounded numeric fields are clamped/rejected according to the spec, and invalid URLs are rejected.

- [ ] **Step 2: Run the focused test to verify failure.**
  Run: `cd worker && node --test test/dev-config.test.js`
  Expected: FAIL because the module/config contract does not exist.

- [ ] **Step 3: Implement the config schema and sanitizer.**
  Keep the schema small and explicit. Add version `1`, fixed feature keys, fixed editable copy keys, bounded layout values, and controlled quick-link records.

- [ ] **Step 4: Implement `configToJs(config)`.**
  Serialize a normalized config as safe JSON-like JavaScript only; no user-supplied raw script or HTML is emitted.

- [ ] **Step 5: Add the initial static `docs/dolary/dolary-config.js`.**
  Populate it from the current visible PWA defaults so the first publish is behavior-neutral.

- [ ] **Step 6: Run the focused test to verify pass.**
  Run: `cd worker && node --test test/dev-config.test.js`
  Expected: PASS.

- [ ] **Step 7: Commit.**
  Commit message: `feat: add Dolary developer config contract`

### Task 2: Add secure developer sessions and draft/preview storage

**Files:**
- Create: `worker/src/dev-auth.js`
- Create: `worker/src/dev-storage.js`
- Create: `worker/test/dev-auth.test.js`
- Modify: `worker/src/index.js`

**Interfaces:**
- `createDevSession(env) -> { token, cookie }`
- `verifyDevSession(request, env) -> session|null`
- `destroyDevSession(request, env) -> void`
- `getDevDraft(env) -> config|null`
- `putDevDraft(env, config, metadata) -> void`
- `createDevPreviewToken(env, config) -> token`
- `getDevPreview(env, token) -> config|null`
- `listDevHistory(env) -> history[]`
- `getDevHistory(env, id) -> historyEntry|null`

- [ ] **Step 1: Write failing authentication tests.**
  Cover successful login, wrong password rejection, session expiry, missing cookie, and logout invalidation. Assert that session cookies contain HttpOnly, Secure, and SameSite=Strict.

- [ ] **Step 2: Run the focused test to verify failure.**
  Run: `cd worker && node --test test/dev-auth.test.js`
  Expected: FAIL because the auth module does not exist.

- [ ] **Step 3: Implement secure session helpers.**
  Generate session tokens with Web Crypto, hash the token before KV storage, use the existing `ADMIN_PASSWORD` only for the login comparison, and keep session records under `dev:session:`.

- [ ] **Step 4: Implement KV draft/preview/history helpers.**
  Use dedicated prefixes so existing push/social records are untouched. Give preview tokens a short TTL and history a bounded retention policy.

- [ ] **Step 5: Add developer API routes in `worker/src/index.js`.**
  Add `/api/dev/login`, `/api/dev/logout`, `/api/dev/session`, `/api/dev/draft`, `/api/dev/preview-token`, `/api/dev/history`, and `/api/dev/history/:id`.
  Keep existing public routes unchanged.

- [ ] **Step 6: Run the focused tests.**
  Run: `cd worker && node --test test/dev-auth.test.js test/dev-config.test.js`
  Expected: PASS.

- [ ] **Step 7: Commit.**
  Commit message: `feat: add secure developer sessions and drafts`

### Task 3: Make the existing PWA consume the config and support preview overrides

**Files:**
- Modify: `docs/dolary/pwa-app.js`
- Modify: `docs/dolary/index.html` only where the config script must be loaded.
- Modify: `docs/dolary/pwa-app.css`
- Create: `worker/test/pwa-config-contract.test.js`

**Interfaces:**
- Browser helper `getDolaryConfig() -> normalizedConfig`.
- Browser helper `applyDolaryConfig(config) -> void`.
- Preview request: `GET https://dolary.aehmnazar-1234533.workers.dev/api/dev/preview-config?token=<short-lived-token>`.

- [ ] **Step 1: Write failing source-contract tests.**
  Assert that `pwa-app.js` loads `window.DOLARY_CONFIG`, recognizes `dolaryDevPreview`, fetches the preview config only when the query parameter exists, and applies config values before rendering the PWA template.

- [ ] **Step 2: Run the focused test to verify failure.**
  Run: `cd worker && node --test test/pwa-config-contract.test.js`
  Expected: FAIL because the config integration is absent.

- [ ] **Step 3: Load the static config before `pwa-app.js`.**
  Keep current behavior intact by falling back to the existing hardcoded values when a config field is missing.

- [ ] **Step 4: Replace selected hardcoded PWA copy with config lookups.**
  Include home title/labels/notes, quick links, feature visibility, and selected navigation labels. Do not refactor unrelated business logic.

- [ ] **Step 5: Add bounded CSS custom properties for safe layout controls.**
  Map config values to existing classes for radius, spacing, hero/rate scaling, and navigation height. Keep the existing responsive breakpoints.

- [ ] **Step 6: Add preview override loading.**
  When `dolaryDevPreview` is present, fetch the Worker preview endpoint with `cache: "no-store"`, validate the response shape, merge it over the published config, and continue with the same UI initialization path.

- [ ] **Step 7: Run syntax and focused tests.**
  Run:
  `node --check docs/dolary/pwa-app.js`
  `cd worker && node --test test/pwa-config-contract.test.js`
  Expected: PASS.

- [ ] **Step 8: Commit.**
  Commit message: `feat: make Dolary PWA configuration-driven`

### Task 4: Implement GitHub atomic publishing

**Files:**
- Create: `worker/src/dev-github.js`
- Create: `worker/test/dev-github.test.js`
- Modify: `worker/src/index.js`
- Modify: `worker/wrangler.jsonc` for non-secret repository/branch variables only.

**Interfaces:**
- `publishFilesAtomically(env, changes, message) -> {commitSha, parentSha, paths}`
- `readBranchHead(env) -> {sha, treeSha}`
- `readFileForPublish(env, path, ref) -> {content, sha}`

- [ ] **Step 1: Write failing GitHub publisher tests.**
  Mock fetch and assert the publisher performs the sequence: branch head read -> blob creation -> tree creation -> commit creation -> ref update, and rejects a stale branch head before updating the ref.

- [ ] **Step 2: Run the focused test to verify failure.**
  Run: `cd worker && node --test test/dev-github.test.js`
  Expected: FAIL because the publisher does not exist.

- [ ] **Step 3: Implement GitHub REST helpers.**
  Use `GITHUB_TOKEN` only inside the Worker. Use the Git Database API so config, manifest, and icon changes can be included in one commit. Set the GitHub API version header and `Accept: application/vnd.github+json`.

- [ ] **Step 4: Add optimistic concurrency.**
  Read `refs/heads/<branch>` before building the tree. When updating the ref, require the expected previous head to still match. Return a stable `publish_conflict` error when it does not.

- [ ] **Step 5: Wire publish routes.**
  Add `POST /api/dev/publish` and `POST /api/dev/rollback`. Validate the normalized config first, calculate changed files, save the prior snapshot to history, publish one commit, and update KV metadata only after the GitHub commit succeeds.

- [ ] **Step 6: Add the repository/branch variables.**
  `GITHUB_REPOSITORY=aehmnazar1234533-bot/Dolary`
  `GITHUB_BRANCH=main`
  Keep `GITHUB_TOKEN` as a Worker secret; do not commit it.

- [ ] **Step 7: Run focused tests.**
  Run: `cd worker && node --test test/dev-github.test.js`
  Expected: PASS.

- [ ] **Step 8: Commit.**
  Commit message: `feat: add atomic GitHub publishing for developer panel`

### Task 5: Add the Arabic `/dev` control panel

**Files:**
- Create: `worker/src/dev-ui.js`
- Modify: `worker/src/index.js`
- Create: `worker/test/dev-ui.test.js`

**Interfaces:**
- `renderDevPage(state) -> Response`
- `renderDevLoginPage() -> Response`

- [ ] **Step 1: Write failing UI contract tests.**
  Assert the page contains RTL Arabic sections for appearance, text, links, features, PWA, icon, preview/publish, and history/rollback; assert the page does not include raw secret values.

- [ ] **Step 2: Run the focused test to verify failure.**
  Run: `cd worker && node --test test/dev-ui.test.js`
  Expected: FAIL because the new UI module does not exist.

- [ ] **Step 3: Implement the login page and authenticated panel shell.**
  Match the existing Dolary dark/glass visual language without reusing the public PWA's business DOM.

- [ ] **Step 4: Implement the editor sections.**
  Provide bounded controls for:
  - theme and layout
  - editable PWA text
  - quick links with enable/disable/reorder
  - supported feature flags
  - PWA metadata
  - icon upload and preview

- [ ] **Step 5: Implement Draft and Preview actions.**
  Save to `/api/dev/draft`, request a preview token, and open the real PWA URL with `dolaryDevPreview=<token>` in an embedded preview frame.

- [ ] **Step 6: Implement Publish confirmation.**
  Show changed paths and a human-readable summary. Require an explicit confirmation before `POST /api/dev/publish`.

- [ ] **Step 7: Implement History and Rollback UI.**
  Show the latest 10 publishes with timestamp, commit SHA, summary, and a rollback action.

- [ ] **Step 8: Run focused tests and syntax checks.**
  Run:
  `cd worker && node --test test/dev-ui.test.js`
  `node --check worker/src/dev-ui.js`
  Expected: PASS.

- [ ] **Step 9: Commit.**
  Commit message: `feat: add Dolary developer control panel`

### Task 6: Add icon upload normalization and keep the existing icon workflow compatible

**Files:**
- Modify: `worker/src/dev-config.js`
- Modify: `worker/src/dev-ui.js`
- Modify: `.github/workflows/fix-pwa-icon.yml` only if needed by the final icon contract.
- Create: `worker/test/dev-icon.test.js`

**Interfaces:**
- Browser helper `imageFileToSvg(file) -> Promise<string>`.
- Worker validator `validateIconSvg(svg) -> normalizedSvg`.

- [ ] **Step 1: Write failing icon tests.**
  Cover allowed image MIME types, upload size limit, malformed SVG rejection, and safe SVG wrapping.

- [ ] **Step 2: Run the focused test to verify failure.**
  Run: `cd worker && node --test test/dev-icon.test.js`
  Expected: FAIL because the icon helpers do not exist.

- [ ] **Step 3: Implement client-side raster-to-SVG wrapping.**
  Convert an uploaded PNG/JPEG/WebP file into an SVG with an embedded data image. Reject files above the configured size before reading them fully into memory.

- [ ] **Step 4: Implement server-side SVG validation.**
  Permit only an image-oriented SVG subset and reject scripts, event handlers, external document references, foreignObject, and unsafe data URLs.

- [ ] **Step 5: Publish `docs/dolary/pwa-icon.svg` through the same atomic GitHub publisher.**
  Keep the existing ImageMagick workflow responsible for `apple-touch-icon.png` and cache-busting after the SVG changes.

- [ ] **Step 6: Run focused tests.**
  Run: `cd worker && node --test test/dev-icon.test.js`
  Expected: PASS.

- [ ] **Step 7: Commit.**
  Commit message: `feat: add safe Dolary PWA icon uploads`

### Task 7: Wire final publish verification and repository checks

**Files:**
- Modify: `.github/workflows/validate-dolary-push.yml`
- Modify: `worker/src/index.js` only if final route coverage requires it.
- Create: `worker/test/dev-integration.test.js`

- [ ] **Step 1: Write failing integration checks.**
  Assert that developer routes require authentication, preview routes accept only valid preview tokens, publish returns changed paths and a commit SHA, and existing broadcast/social routes remain present in the Worker source.

- [ ] **Step 2: Run the integration test to verify failure.**
  Run: `cd worker && node --test test/dev-integration.test.js`
  Expected: FAIL until the complete route set is wired.

- [ ] **Step 3: Add the new config/test files to the existing validation workflow paths.**
  Keep the existing Node 22 syntax check and Worker dry-run.

- [ ] **Step 4: Run the complete repository checks.**
  Run from repository root:
  `cd worker && npm install && npm test && npm run dry-run`
  Then:
  `node --check docs/dolary/pwa-app.js`
  `node --check docs/dolary/pwa-push.js`
  `node --check docs/dolary/pwa-push-config.js`
  `node --check docs/dolary/service-worker.js`

- [ ] **Step 5: Verify the changed-file surface.**
  Confirm only the planned Worker/PWA/config/workflow/test files changed. Confirm no secret values are present in the repository diff.

- [ ] **Step 6: Commit.**
  Commit message: `test: verify Dolary developer panel integration`

### Task 8: Production verification and handoff

**Files:**
- No new source files.

- [ ] **Step 1: Deploy the Worker using the existing deployment path only after all repository tests pass.**
  Use the project's existing Wrangler deployment configuration; do not change unrelated bindings.

- [ ] **Step 2: Verify the login flow on the deployed Worker.**
  Confirm `/dev` redirects/serves the login state, wrong password is rejected, and valid login receives the secure session cookie.

- [ ] **Step 3: Verify Draft -> Preview without publish.**
  Change a harmless PWA text value, save a draft, open preview, confirm only the preview changes, and confirm the public PWA remains unchanged.

- [ ] **Step 4: Verify Publish.**
  Publish the same harmless change, confirm one GitHub commit contains the expected changed file(s), and verify the public PWA reflects it after GitHub Pages propagation.

- [ ] **Step 5: Verify Rollback.**
  Roll back the test change, confirm a new commit is created, and verify the public PWA returns to the prior configuration.

- [ ] **Step 6: Verify icon safety.**
  Upload a test image through the panel, confirm `pwa-icon.svg` changes, confirm the existing icon workflow regenerates the iPhone icon, and confirm no script-capable SVG content is published.

- [ ] **Step 7: Verify existing functionality.**
  Check rate display, calculator, favorites, notification UI, privacy screen, social image route, broadcast endpoint, and scheduled rate checks remain present and functional.

- [ ] **Step 8: Finish only with fresh verification evidence.**
  Record the test commands and the deployed checks that passed before declaring the feature ready.
