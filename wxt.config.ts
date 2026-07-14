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
    // EVERY build, dev and release alike -- not just dev/testing. Since this
    // isn't going to the Chrome Web Store (a "release" build here just means
    // "pointed at the real API/Cognito instead of localhost", not "about to
    // publish"), there's no reason to ever drop the pinned key: doing so
    // would assign a new random ID and silently break the registered
    // Cognito callback URL. See dev-keys/README.md. If this project ever
    // does get published to the Web Store, remove `key` for that build only
    // (the Store assigns its own ID on first upload and rejects a manifest
    // that already has one).
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyejP+Bgt8rFAYwMC+L3Qx9cMhQf96fBMDxDQMTGd54RBK5KHiIC22/H6nzAuzPQkvwXnlO8/uMckYzMkwj3Z0/wHmYXA0WbXyLODr3g2dDJj6BUqdoNw+JCkNc91DZ1Im/0fFIIcwXO3j0vweQZh1PHyF7LGV5FqpQ1lpIN7m7jJ0Y2uYKFWt6vRkENURghlYPpDrOXWlUV9j78Ye8Ej3DTlnSlSCNsRizzsNlHbxGHSFgJ9Ry1eQy9Men3xVMGit1tTSZ+QSApsp1Rz+c9ybBlstE2vUMx8LizkgQN2jAKU4z1NsmkAfgIzPs24qGZ142jtyrdHbWhdRnRWiegN/wIDAQAB',
    // 'identity' unlocks chrome.identity.launchWebAuthFlow() for the Cognito
    // Hosted UI login (see lib/cognitoAuth.ts).
    permissions: ['storage', 'sidePanel', 'identity'],
    // Dev builds (npm run dev/build) talk to the local API; release builds
    // (npm run build:release, WXT_API_ENV=production) talk to the real
    // UpStart Back Office API -- this is independent of whether the build
    // gets published anywhere (see the `key` comment above). host_permissions
    // is what lets fetch() calls from the side panel reach these origins
    // regardless of CORS response headers. The Cognito domain is Cognito's
    // own default hosted-UI domain for this user pool's region + pool ID
    // (us-west-2_IlJRXdK5X), derived from the fallback values in the main
    // repo's scripts/set-amplify-env.js -- update both this and
    // lib/cognitoAuth.ts's COGNITO_DOMAIN if Amplify Console actually has
    // AMPLIFY_COGNITO_CUSTOM_DOMAIN set to something else (e.g.
    // auth.heyupstart.com) for the live admin app.
    host_permissions: isReleaseBuild
      ? ['https://api.heyupstart.com/*', 'https://us-west-2iljrxdk5x.auth.us-west-2.amazoncognito.com/*']
      : ['http://localhost:3001/*', 'https://us-west-2iljrxdk5x.auth.us-west-2.amazoncognito.com/*'],
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
