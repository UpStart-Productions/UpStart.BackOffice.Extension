# UpStart Back Office — Chrome extension

A side-panel extension for [UpStart Back Office](https://office.heyupstart.com):
start/stop your timer and log an expense without switching to the app. Scaffolded
the same way as GrovLink Web Clipper (WXT + React, MV3, Cognito Hosted UI login
via `chrome.identity`).

## What's in this stub

- **Toolbar icon → side panel.** Clicking the icon opens the panel.
- **Timer tab.** Shows your running time entry (project, client, live elapsed
  time) with a Stop button, or a project/task picker with a Start button when
  nothing's running. Calls the existing `TimeEntriesController` endpoints —
  no backend changes were needed for this part.
- **Expense tab.** Log a business expense — description, amount, date,
  category, optional project link, reimbursable/billable flags, payment
  method, notes, and an optional receipt photo. This is backed by a new
  `Expense` model/API added to the main repo (`api/src/app/expenses/`) —
  see that repo's `apps/api/prisma/schema.prisma` for the full shape.
  Deliberately **not** connected to the Accounting module — no journal entry
  gets posted automatically. Also **no approval workflow**: a logged expense
  is final immediately (but deletable, from the admin app's new **Expenses**
  page).
- **Real Cognito login.** "Sign in with UpStart Back Office" opens the same
  Hosted UI the admin dashboard uses, via `chrome.identity.launchWebAuthFlow`
  (Authorization Code + PKCE, no AWS Amplify, no backend auth endpoint) —
  reusing the admin app's own App Client so it's the same signed-in users.
  **One manual AWS step is still required** before this works: the
  extension's OAuth redirect URI has to be registered on that Cognito App
  Client. See `dev-keys/README.md` for the exact console steps — it's a
  couple of clicks, not code.
- **Dev login.** "Use local dev login instead" on the sign-in screen — sends
  the API's dev auth header (`x-user-email`) instead of a token, and only
  works when the API's `NODE_ENV !== 'production'` (see
  `api/src/app/auth/dev-auth.guard.ts` in the main repo). Use this against
  your local API; Cognito login is what you'd use once pointed at the real
  API (see "Local build against the real (prod) API" below).

## What's deliberately left out (for now)

- **No context menu / page capture.** Unlike GrovLink's selection bubble,
  this stub doesn't try to pull page content into a time entry or expense
  description — everything's typed in manually. Could be added later (e.g.
  right-click → "Log time for this page").
- **No notifications bell / approval queue.** Not applicable here — expenses
  have no approval step, and there's no equivalent of GrovLink's staff
  notification feed in UpStart Back Office yet.
- **No org/tenant picker.** UpStart Back Office is single-tenant, so there's
  nothing to pick — unlike GrovLink's customer/tenant switcher.

## Prerequisites

1. `UpStart.BackOffice` running locally:
   ```sh
   cd /path/to/UpStart.BackOffice
   npm run dev
   ```
   This gives you an API at `http://localhost:3001/api` and admin at
   `http://localhost:4201`, both seeded (`admin@upstart.test` / ADMIN).

   One backend change was made to support this extension:
   `api/src/main.ts` now allows `chrome-extension://` origins through CORS
   (extension pages send that as their Origin header, and `host_permissions`
   in the manifest does **not** exempt them from CORS the way you might
   expect — learned this building GrovLink Web Clipper against a similar
   API). If the API was already running when you pull that change, restart
   it.

   A new `Expense` model/migration and `/expenses` API were also added —
   `npm run dev` runs `prisma migrate deploy` automatically, so this applies
   itself on next start.

2. Node 20+ (built with Node 22, matching the main repo).

## Setup

```sh
npm install
npm run build
```

This produces `.output/chrome-mv3/`. In Chrome:

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select `.output/chrome-mv3`

For live-reload while making changes, use `npm run dev` instead.

## Local build against the real (prod) API

This extension is not intended to be published to the Chrome Web Store —
it's meant to stay a locally-loaded ("unpacked") extension even when pointed
at the real API. That's why `manifest.key` in `wxt.config.ts` is pinned for
every build, not just dev ones: the extension ID (and therefore the Cognito
OAuth redirect URI) stays the same `lmdcjchnheomncngpjhcacnnkpaekmeg`
whether you're pointed at `localhost:3001` or `api.heyupstart.com`.

To build against production instead of localhost:

```sh
npm run build:release   # or npm run zip:release
```

This sets `WXT_API_ENV=production`, which switches `lib/config.ts`'s
`API_BASE`/`ADMIN_BASE_URL` and `wxt.config.ts`'s `host_permissions` to the
real domains. Load `.output/chrome-mv3` the same way (`chrome://extensions`
-> Load unpacked). Dev login won't work against this build (the real API
rejects `x-user-email` headers once `NODE_ENV=production` — see
`DevAuthGuard`), so **Sign in with UpStart Back Office** (Cognito) is the
only way in — which means the AWS callback-URL registration in
`dev-keys/README.md` has to be done first.

## Trying it out

1. Click the toolbar icon — the side panel opens on the sign-in screen.
2. Click **Use local dev login instead**, leave the default email
   (`admin@upstart.test`), and continue.
3. **Timer tab:** pick a project (and task, if the project has manual
   tasks), optionally add notes, click **Start timer**. The panel shows a
   live elapsed clock; click **Stop timer** when done. Check
   `http://localhost:4201/time-entry` to see it land there.
4. **Expense tab:** fill in a description and amount (required), optionally
   a category, project, reimbursable/billable flags, payment method, notes,
   and a receipt photo, then **Log expense**. Check
   `http://localhost:4201/expenses` to see it show up.

## Project layout

```
entrypoints/
  background.ts       service worker: opens the side panel on icon click
  sidepanel/
    App.tsx            login (Cognito + dev) + Timer tab + Expense tab
    style.css
lib/
  api.ts               fetch wrapper for the local API (me, projects,
                       time-entries start/stop, expenses create/receipt)
  cognitoAuth.ts        Cognito Hosted UI login scaffolding (launchWebAuthFlow +
                       PKCE) -- not usable until Cognito is configured for this
                       project; see dev-keys/README.md
  devAuth.ts            chrome.storage-backed dev credentials (just an email --
                       UpStart Back Office is single-tenant, unlike GrovLink)
  config.ts             API_BASE / ADMIN_BASE_URL, keyed by WXT_API_ENV
dev-keys/
  extension-dev-key.pem pinned keypair for a stable extension ID (gitignored) --
                       see dev-keys/README.md for why, and the Cognito callback
                       URL to register once Cognito is set up
```
