# UpStart Back Office — Chrome extension

A side-panel extension for [UpStart Back Office](https://office.heyupstart.com):
start/stop your timer and log an expense without switching to the app. Scaffolded
the same way as GrovLink Web Clipper (WXT + React, MV3, Cognito email/password
login via aws-amplify).

## What it does

- **Toolbar icon → side panel.** Clicking the icon opens the panel.
- **Sign-in.** Email and password or Google, on the extension's own sign-in
  screen, against the same Cognito pool and app client as the admin app (no
  Hosted UI). "Use local dev login instead" is offered on local builds only.
- **Organization (tenant).** After sign-in the panel loads `/users/me` and
  `/tenants/mine` and picks the tenant the same way the admin app does
  (`admin/src/app/core/tenant.service.ts`): a super user's last choice (else the
  first tenant), everyone else's own tenant or last choice. It is sent as
  `x-tenant-slug` on every call. People who can work in more than one tenant see
  an **Organization** picker under the header; switching reloads the panel.
- **Role-aware.** The header shows Admin, the tenant role (Member, Guest) or
  Client. The Timer and Expense tabs appear only when the person's role allows
  creating time or expenses in that tenant (same rule as `allows()` in
  `libs/shared/src/lib/permissions.ts`).
- **Timer tab.** Same timer as the admin dashboard and timesheet: one running
  timer, kept on the server. Start with an optional project (or a client when
  there is no project), a task, Task Manager work tasks, an Asana task (when
  Asana is connected and the project is linked), and notes. Stop it here or in
  the app. Below it, today's entries with a **Start** button (the timesheet's
  restart). Timers left in the browser by older versions of the extension show
  under "Not saved yet" until saved or discarded.
- **Expense tab.** Same fields as the admin "New expense" dialog: description,
  date, amount, the tenant's own categories and payment methods (Settings →
  Expenses and Invoicing), client then project, project defaults for
  Reimbursable/Billable, mileage (miles × the organization's rate), notes and a
  receipt (image or PDF). No approval step: a logged expense is final at once.

## What's deliberately left out (for now)

- **No editing or deleting** of time entries or expenses; that stays in the app.
- **No Asana sync from the panel.** The Asana task picker lists tasks already
  synced to the project; the admin dialog's sync-on-open isn't repeated here.
- **No context menu / page capture.** Everything is typed in manually.
- **No notifications.**

## Prerequisites

1. `UpStart.BackOffice` running locally:
   ```sh
   cd /path/to/UpStart.BackOffice
   npm run dev
   ```
   This gives you an API at `http://localhost:3001/api` and admin at
   `http://localhost:4201`, both seeded (`admin@upstart.test` / ADMIN).

   The API allows `chrome-extension://` origins through CORS (`api/src/main.ts`);
   `host_permissions` alone does not exempt extension pages from CORS.

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

3. If you can work in more than one organization, pick it under the header.
4. **Timer tab:** optionally pick a project (or a client), task and work tasks,
   add notes, click **Start timer**. The running timer also shows on the app's
   dashboard and timesheet; click **Stop** here or there.
5. **Expense tab:** fill in a description and amount (or pick the Mileage
   category and enter miles), optionally the rest, then **Log expense**.

## Project layout

```
entrypoints/
  background.ts       service worker: opens the side panel on icon click
  sidepanel/
    App.tsx            login (Cognito + Google + dev), tenant picker, tabs
    TimerTab.tsx       server-side timer + today's entries
    ExpenseTab.tsx     new expense (categories, payment methods, mileage)
    style.css
lib/
  api.ts               fetch wrapper for the API (sends x-tenant-slug): me,
                       tenants, projects, clients, work tasks, time entries,
                       expenses, categories, payment methods, mileage rate
  access.ts            role/permission check, mirrors allows() in the main repo
  tenant.ts            remembered tenant choice + the admin app's pick rule
  localTimers.ts       reads timers saved in the browser by older versions
  cognitoAuth.ts        Cognito email/password + Google login (same pool as admin app)
  devAuth.ts            chrome.storage-backed dev credentials (just an email)
  config.ts             API_BASE / ADMIN_BASE_URL, keyed by WXT_API_ENV
dev-keys/
  extension-dev-key.pem pinned keypair for a stable extension ID (gitignored) --
                       see dev-keys/README.md for why, and the Cognito callback
                       URL to register once Cognito is set up
```
