// Deliberately NOT keyed off Vite's built-in import.meta.env.PROD/DEV --
// `wxt build` (the same command used for everyday local "Load unpacked"
// testing) always runs in Vite's "production" mode, which has nothing to do
// with whether this build should talk to the real UpStart Back Office API.
// Driven by WXT_API_ENV: `npm run build` sets production (real API);
// `npm run build:local` omits it (localhost). Plain `npm run dev` also
// targets localhost.
const isReleaseBuild = import.meta.env.WXT_API_ENV === 'production';

// Port 3001 matches the main repo's local dev setup (see UpStart.BackOffice's
// README -- API on :3001, admin on :4201 locally; API listens on :3000 inside
// its production Docker container but is reverse-proxied at api.heyupstart.com).
export const API_BASE = isReleaseBuild ? 'https://api.heyupstart.com/api' : 'http://localhost:3001/api';

// Where a "open in app" link would point -- the Angular admin dashboard.
export const ADMIN_BASE_URL = isReleaseBuild ? 'https://office.heyupstart.com' : 'http://localhost:4201';

// Whether the dev-mode (x-user-email header) login path should be offered at
// all. Mirrors DevAuthGuard on the API, which refuses dev headers outright
// once NODE_ENV=production -- hidden here too so a real user never sees a
// toggle that can't do anything for them.
export const DEV_LOGIN_AVAILABLE = !isReleaseBuild;
