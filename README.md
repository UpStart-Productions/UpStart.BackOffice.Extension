# UpStart Back Office — Chrome extension

A side-panel extension for [UpStart Back Office](https://office.heyupstart.com):
start/stop your timer and log an expense without switching to the app. Scaffolded
the same way as GrovLink Web Clipper (WXT + React, MV3, Cognito email/password
login via aws-amplify).

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
- **Real Cognito login.** Email and password on the sign-in screen — same
  flow as the admin dashboard (`aws-amplify` USER_SRP_AUTH against the same
  user pool and app client). No Hosted UI popup, no AWS callback URL
  registration needed.
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

This produces `.output/chrome-mv3/` pointed at **production**
(`api.heyupstart.com`). In Chrome:

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select `.output/chrome-mv3`

For live-reload while making changes against your **local** API, use
`npm run dev` instead (requires the local Back Office stack running).

To build explicitly for localhost instead of prod:

```sh
npm run build:local
```

## Local API development

If you're actively changing the Back Office API locally:

1. `UpStart.BackOffice` running locally (`npm run dev` in that repo).
2. `npm run build:local` or `npm run dev` in this repo.
3. Sign in with email/password (same Cognito pool) or **Use local dev login**
   with `admin@upstart.test`.

## Build output

`npm run build` (default) talks to production. `npm run build:local` talks to
`http://localhost:3001/api`. The extension name in Chrome shows **(dev)** for
local builds so you can tell which is loaded.

## Trying it out

**Local API** (`npm run build:local` or `npm run dev`):

1. Click the toolbar icon — the side panel opens on the sign-in screen.
2. Either sign in with email/password (same Cognito pool as local admin), or click
   **Use local dev login instead**, leave the default email
   (`admin@upstart.test`), and continue.

**Production API** (`npm run build` — the default):

1. Reload the extension in `chrome://extensions` after building.
2. Sign in with the same email and password you use at
   `https://office.heyupstart.com`.

Then:

3. **Timer tab:** pick a project (and task, if the project has manual
   tasks), optionally add notes, click **Start timer**. The panel shows a
   live elapsed clock; click **Stop timer** when done.
4. **Expense tab:** fill in a description and amount (required), optionally
   a category, project, reimbursable/billable flags, payment method, notes,
   and a receipt photo, then **Log expense**.

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
  cognitoAuth.ts        Cognito email/password login (aws-amplify, same as admin app)
  devAuth.ts            chrome.storage-backed dev credentials (just an email --
                       UpStart Back Office is single-tenant, unlike GrovLink)
  config.ts             API_BASE / ADMIN_BASE_URL, keyed by WXT_API_ENV
dev-keys/
  extension-dev-key.pem pinned keypair for a stable extension ID (gitignored) --
                       see dev-keys/README.md for why, and the Cognito callback
                       URL to register once Cognito is set up
```
