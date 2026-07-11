import { defineConfig } from 'wxt';

// Same reasoning as GrovLink Web Clipper's wxt.config.ts: `wxt build` always
// runs in Vite's "production" mode even for an everyday local "Load
// unpacked" test build, so that can't be used to tell "about to upload to
// the Chrome Web Store" apart from "just testing locally." This reads the
// same WXT_API_ENV env var lib/config.ts uses, set only by
// `npm run build:release`/`npm run zip:release`.
const isReleaseBuild = process.env.WXT_API_ENV === 'production';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  manifest: {
    name: isReleaseBuild ? 'UpStart Back Office' : 'UpStart Back Office (dev)',
    description:
      'Quick time tracking and expense capture for UpStart Back Office, without switching to the app.',
    version: '0.0.1',
    // Pins the extension to a fixed ID (lmdcjchnheomncngpjhcacnnkpaekmeg) for
    // local dev/testing builds only -- Chrome Web Store rejects a manifest
    // with a `key` field on first upload (it assigns its own ID instead), so
    // this is omitted entirely from release builds below. See
    // dev-keys/README.md for what this is for and the Cognito callback URL
    // that needs registering once Cognito is configured for this project.
    ...(isReleaseBuild
      ? {}
      : {
          key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyejP+Bgt8rFAYwMC+L3Qx9cMhQf96fBMDxDQMTGd54RBK5KHiIC22/H6nzAuzPQkvwXnlO8/uMckYzMkwj3Z0/wHmYXA0WbXyLODr3g2dDJj6BUqdoNw+JCkNc91DZ1Im/0fFIIcwXO3j0vweQZh1PHyF7LGV5FqpQ1lpIN7m7jJ0Y2uYKFWt6vRkENURghlYPpDrOXWlUV9j78Ye8Ej3DTlnSlSCNsRizzsNlHbxGHSFgJ9Ry1eQy9Men3xVMGit1tTSZ+QSApsp1Rz+c9ybBlstE2vUMx8LizkgQN2jAKU4z1NsmkAfgIzPs24qGZ142jtyrdHbWhdRnRWiegN/wIDAQAB',
        }),
    // 'identity' unlocks chrome.identity.launchWebAuthFlow() for the Cognito
    // Hosted UI login (see lib/cognitoAuth.ts), once Cognito is configured
    // for this project (it isn't yet in local dev -- see lib/config.ts).
    permissions: ['storage', 'sidePanel', 'identity'],
    // Dev builds talk to the local API; production builds talk to the real
    // UpStart Back Office API. host_permissions is what lets fetch() calls
    // from the side panel reach these origins regardless of CORS response
    // headers. The Cognito domain below is a placeholder -- update it (and
    // lib/cognitoAuth.ts's COGNITO_DOMAIN/CLIENT_ID) once Cognito is set up
    // for heyupstart.com; see .env.example's COGNITO_* vars in the main repo.
    host_permissions: isReleaseBuild
      ? ['https://api.heyupstart.com/*', 'https://auth.heyupstart.com/*']
      : ['http://localhost:3001/*', 'https://auth.heyupstart.com/*'],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    action: {
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
  },
});
