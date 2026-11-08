import type { Me, TenantOption } from './api';

// The tenant chosen in the panel, remembered per email (the same email can be in several tenants).
// Same choice logic as the admin app's TenantService.load().
function key(email: string): string {
  return `ubo_tenant_slug_${email.trim().toLowerCase()}`;
}

export async function getStoredTenantSlug(email: string): Promise<string> {
  const stored = await chrome.storage.local.get(key(email));
  return (stored[key(email)] as string | undefined) ?? '';
}

export async function setStoredTenantSlug(email: string, slug: string): Promise<void> {
  await chrome.storage.local.set({ [key(email)]: slug });
}

/**
 * A super user may sit in any tenant (their stored choice, else the first). Everyone else is in the
 * tenant the API actually resolved for them (their stored choice if it is still one of theirs).
 */
export function pickTenantSlug(me: Me, list: TenantOption[], stored: string): string {
  if (stored && list.some((t) => t.slug === stored)) return stored;
  const own = list.find((t) => t.id === me.tenantId);
  return own?.slug ?? list[0]?.slug ?? '';
}
