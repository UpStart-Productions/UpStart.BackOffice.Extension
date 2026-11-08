// Local dev auth -- mirrors the admin app's own dev login (see
// admin/src/app/core/auth-store.service.ts in the main repo): just an email
// header, no password, checked against DevAuthGuard which is hard-disabled
// once the API's NODE_ENV is "production". Storage-backed the same way
// GrovLink's devAuth.ts does it. The tenant is picked after sign-in, the same
// way as for Cognito logins (see lib/tenant.ts), and sent as x-tenant-slug.

const KEY = 'ubo_dev_email';
const DEFAULT_EMAIL = 'admin@upstart.test';

export interface DevCreds {
  email: string;
}

export async function getDevCreds(): Promise<DevCreds | null> {
  const stored = await chrome.storage.local.get(KEY);
  const email = stored[KEY] as string | undefined;
  return email ? { email } : null;
}

export async function setDevCreds(creds: DevCreds): Promise<void> {
  await chrome.storage.local.set({ [KEY]: creds.email.trim() || DEFAULT_EMAIL });
}

export async function clearDevCreds(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}

export { DEFAULT_EMAIL };
