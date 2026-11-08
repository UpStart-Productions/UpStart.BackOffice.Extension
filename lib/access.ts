import type { AreaAction, Me, PermissionArea } from './api';

// Mirrors allows() in the main repo's libs/shared/src/lib/permissions.ts (and areaEnabled() in
// modules.ts), so the panel only offers what the API will accept. Time and Expenses are core areas
// (no module owns them), so only the role decides: admins may do everything, USER accounts need the
// area in their role (a missing action checkbox counts as allowed), CLIENT accounts get nothing.
const MODULE_AREAS: Record<string, string[]> = {
  bookings: ['bookings'],
  care: ['care', 'visits', 'schedule'],
};

function areaEnabled(modules: string[] | undefined, area: PermissionArea): boolean {
  if (!modules) return true;
  const owner = Object.keys(MODULE_AREAS).find((m) => MODULE_AREAS[m].includes(area));
  return !owner || modules.includes(owner);
}

export function allows(me: Me | null | undefined, area: PermissionArea, action: AreaAction): boolean {
  if (!me) return false;
  if (!areaEnabled(me.modules, area)) return false;
  if (me.role === 'ADMIN') return true;
  if (me.role !== 'USER') return false;
  if (!me.permissions?.[area]) return false;
  if (action === 'view') return true;
  return me.actions?.[area]?.[action] !== false;
}

/** Label under the name in the panel header. */
export function roleLabel(me: Me): string {
  if (me.role === 'ADMIN') return 'Admin';
  if (me.role === 'CLIENT') return 'Client';
  return me.roleName || 'User';
}
