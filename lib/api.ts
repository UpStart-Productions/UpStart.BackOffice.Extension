import { API_BASE } from './config';
import { getDevCreds } from './devAuth';
import { getValidIdToken } from './cognitoAuth';

// Tenant the panel is working in, sent as x-tenant-slug on every call -- the same header the admin
// app sends (admin/src/app/core/auth-store.service.ts). Super users need it to reach any tenant's
// data at all; people with user rows in several tenants use it to pick one. The API only honors a
// tenant the person actually belongs to (resolveUserForRequest), so this is a choice, never a grant.
let tenantSlug = '';

export function setApiTenantSlug(slug: string): void {
  tenantSlug = slug;
}

// Real Cognito login takes priority when both are present -- that shouldn't
// normally happen (App.tsx only ever sets up one at a time), but if it did,
// a real signed-in session is the one actually backed by a live token worth
// trusting. Same shape the API expects from the admin app: Bearer token in
// prod, x-user-email header in dev (see JwtAuthGuard / DevAuthGuard in the
// main repo).
async function authHeadersRaw(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (tenantSlug) headers['x-tenant-slug'] = tenantSlug;
  const idToken = await getValidIdToken();
  if (idToken) {
    headers['Authorization'] = `Bearer ${idToken}`;
    return headers;
  }
  const creds = await getDevCreds();
  if (!creds) throw new Error('Not signed in yet.');
  headers['x-user-email'] = creds.email;
  return headers;
}

async function authHeaders(): Promise<Record<string, string>> {
  return { ...(await authHeadersRaw()), 'content-type': 'application/json' };
}

async function throwIfNotOk(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let message = body;
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed.message === 'string') message = parsed.message;
      else if (Array.isArray(parsed.message)) message = parsed.message.join(', ');
    } catch {
      /* body wasn't JSON -- use it as-is */
    }
    throw new Error(message || `${res.status} ${res.statusText}`);
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: await authHeaders() });
  await throwIfNotOk(res);
  return res.json();
}

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  await throwIfNotOk(res);
  return res.json();
}

// ---------------------------------------------------------------------------------------------
// Session: who am I, which tenants can I work in
// ---------------------------------------------------------------------------------------------

export type UserRole = 'ADMIN' | 'USER' | 'CLIENT';
export type PermissionArea = 'time' | 'expenses' | 'projects' | 'clients' | 'tasks' | string;
export type AccessLevel = 'own' | 'all';
export type AreaAction = 'view' | 'create' | 'edit' | 'delete' | 'setup';

/** GET /users/me -- see UsersController.me in the main repo. */
export interface Me {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  role: UserRole;
  hourlyRate?: number | null;
  clientId?: string | null;
  tenantId?: string | null;
  isSuper?: boolean;
  /** The tenant role's name (Member, Guest) for USER accounts; null for admins. */
  roleName?: string | null;
  permissions?: Partial<Record<PermissionArea, AccessLevel>>;
  actions?: Partial<Record<PermissionArea, Partial<Record<Exclude<AreaAction, 'view'>, boolean>>>>;
  /** Modules on for the tenant this request ran in; undefined when there was no tenant. */
  modules?: string[];
}

export function fetchMe(): Promise<Me> {
  return get<Me>('/users/me');
}

export interface TenantOption {
  id: string;
  name: string;
  slug: string;
}

/** Tenants this person can work in: all of them for a super user, else the ones they have a user row in. */
export function fetchTenants(): Promise<TenantOption[]> {
  return get<TenantOption[]>('/tenants/mine');
}

// ---------------------------------------------------------------------------------------------
// Projects, clients, tasks
// ---------------------------------------------------------------------------------------------

export interface ProjectTaskOption {
  id: string;
  projectId: string;
  name: string;
  source?: 'MANUAL' | 'ASANA';
  isBillable: boolean;
  isActive: boolean;
}

export interface ProjectOption {
  id: string;
  name: string;
  isActive?: boolean;
  isBillable?: boolean;
  /** Personal / internal projects have no client. */
  client: { id: string; name: string } | null;
  /** When true, Task Manager work tasks can be tagged on time entries. */
  inTaskManager?: boolean;
  asanaSectionGid?: string | null;
  defaultExpenseReimbursable?: boolean;
  defaultExpenseBillable?: boolean;
  tasks?: ProjectTaskOption[];
}

export function fetchProjects(): Promise<ProjectOption[]> {
  return get<ProjectOption[]>('/projects');
}

/** "Name (Client)" as the admin app shows a project; projects without a client show as Personal. */
export function projectLabel(p: { name: string; client?: { name: string } | null }): string {
  return `${p.name} (${p.client?.name ?? 'Personal'})`;
}

export interface ClientOption {
  id: string;
  name: string;
}

/** Clients the user can reach, for the time and expense pickers (same endpoint the admin timesheet uses). */
export function fetchClientLookup(): Promise<ClientOption[]> {
  return get<ClientOption[]>('/clients/lookup');
}

/** Whether the tenant has Asana connected (the admin app only offers the Asana task picker when it is). */
export async function fetchAsanaConnected(): Promise<boolean> {
  try {
    return (await get<{ connected: boolean }>('/asana/status')).connected;
  } catch {
    return false;
  }
}

export interface WorkTaskOption {
  id: string;
  name: string;
}

/** Open Task Manager tasks on a project -- the "Work tasks" picker. */
export function fetchWorkTasks(projectId: string): Promise<WorkTaskOption[]> {
  return get<WorkTaskOption[]>(`/tm/projects/${encodeURIComponent(projectId)}/tasks?completed=incomplete`);
}

// ---------------------------------------------------------------------------------------------
// Time entries (server-side timer, same as the admin timesheet and dashboard)
// ---------------------------------------------------------------------------------------------

export interface TimeEntryTask {
  id: string;
  name: string;
  parent?: { id: string; name: string } | null;
}

export interface TimeEntry {
  id: string;
  description?: string | null;
  startedAt: string;
  stoppedAt?: string | null;
  durationMin?: number | null;
  isBillable: boolean;
  project: { id: string; name: string; client?: { id: string; name: string } | null } | null;
  client?: { id: string; name: string } | null;
  projectTask?: { id: string; name: string } | null;
  tasks?: TimeEntryTask[];
  task?: TimeEntryTask | null;
}

/** Your own entries, optionally in a date range (always filtered to you, even for admins). */
export function fetchMyTimeEntries(userId: string, from?: Date, to?: Date): Promise<TimeEntry[]> {
  const q = new URLSearchParams({ userId });
  if (from) q.set('from', from.toISOString());
  if (to) q.set('to', to.toISOString());
  return get<TimeEntry[]>(`/time-entries?${q.toString()}`);
}

export interface TimeEntryInput {
  projectId: string | null;
  clientId: string | null;
  projectTaskId?: string;
  taskIds: string[] | null;
  taskId: string | null;
  description?: string;
  startedAt: string;
  stoppedAt?: string;
}

/** POST /time-entries. Without stoppedAt this starts the timer (the API allows one running timer). */
export function createTimeEntry(input: TimeEntryInput): Promise<TimeEntry> {
  return post<TimeEntry>('/time-entries', input);
}

export function stopTimeEntry(id: string): Promise<TimeEntry> {
  return post<TimeEntry>(`/time-entries/${encodeURIComponent(id)}/stop`);
}

/** The admin timesheet's "Start" on a stopped entry. */
export function restartTimeEntry(id: string): Promise<TimeEntry> {
  return post<TimeEntry>(`/time-entries/${encodeURIComponent(id)}/restart`);
}

/** Title for an entry, as the admin timesheet shows it. */
export function entryTitle(entry: TimeEntry): string {
  if (entry.project) return projectLabel(entry.project);
  return entry.client?.name ?? 'No project';
}

export function workTaskLine(task: TimeEntryTask): string {
  return task.parent?.name ? `${task.parent.name} › ${task.name}` : task.name;
}

export function entryWorkTasks(entry: TimeEntry): TimeEntryTask[] {
  if (entry.tasks?.length) return entry.tasks;
  return entry.task ? [entry.task] : [];
}

// ---------------------------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------------------------

export interface CreateExpenseInput {
  description: string;
  /** Left out for mileage: the API computes it from miles x the organization's rate. */
  amount?: number;
  miles?: number | null;
  category?: string;
  incurredAt: string;
  projectId?: string;
  isReimbursable?: boolean;
  isBillable?: boolean;
  paymentMethod?: string;
  notes?: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category?: string | null;
  incurredAt: string;
  isReimbursable: boolean;
  isBillable: boolean;
  miles?: number | null;
  mileageRate?: number | null;
  receiptUrl?: string | null;
}

/** A tenant's expense category or payment method, as listed in Settings → Expenses and Invoicing. */
export interface ExpenseListOption {
  id: string;
  slug: string | null;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export const MILEAGE_CATEGORY_SLUG = 'mileage';

/** Same rule as the admin app's isMileageCategory (admin/src/app/pages/expenses/expense.types.ts). */
export function isMileageCategory(category: string, categories: ExpenseListOption[]): boolean {
  const value = category.trim();
  if (!value) return false;
  const mileage = categories.find((c) => c.slug === MILEAGE_CATEGORY_SLUG && c.isActive);
  if (mileage && value.toLowerCase() === mileage.name.toLowerCase()) return true;
  return value.toLowerCase() === 'mileage';
}

export function fetchExpenseCategories(): Promise<ExpenseListOption[]> {
  return get<ExpenseListOption[]>('/expense-categories');
}

export function fetchExpensePaymentMethods(): Promise<ExpenseListOption[]> {
  return get<ExpenseListOption[]>('/expense-payment-methods');
}

/** The organization's mileage rate per mile; null when none is set in Settings. */
export async function fetchMileageRate(): Promise<number | null> {
  const res = await get<{ rate: number | null }>('/expenses/mileage-rate');
  return res.rate != null ? Number(res.rate) : null;
}

// Prisma's Decimal type (used for Expense.amount, miles, mileageRate) serializes to a JSON
// *string* (it has a toJSON() that calls toString()), not a number --
// res.json() hands that back as-is. Coercing here, once, at the API
// boundary is what keeps every caller free to treat `amount` as a real
// number (e.g. `.toFixed(2)`) without re-checking -- skipping this is what
// crashed the whole panel earlier: `.toFixed` doesn't exist on a string,
// and an uncaught render error unmounts the entire React tree.
function normalizeExpense(raw: Expense): Expense {
  return {
    ...raw,
    amount: Number(raw.amount),
    miles: raw.miles != null ? Number(raw.miles) : null,
    mileageRate: raw.mileageRate != null ? Number(raw.mileageRate) : null,
  };
}

export async function createExpense(input: CreateExpenseInput): Promise<Expense> {
  return normalizeExpense(await post<Expense>('/expenses', input));
}

export async function uploadExpenseReceipt(expenseId: string, file: File): Promise<Expense> {
  const form = new FormData();
  form.append('file', file, file.name || 'receipt.jpg');
  const res = await fetch(`${API_BASE}/expenses/${expenseId}/receipt`, {
    method: 'POST',
    // No content-type here -- fetch sets multipart/form-data with the right
    // boundary automatically for a FormData body.
    headers: await authHeadersRaw(),
    body: form,
  });
  await throwIfNotOk(res);
  return normalizeExpense(await res.json());
}

// ---------------------------------------------------------------------------------------------
// Organizations (clients), people (contacts), Task Manager tasks
// ---------------------------------------------------------------------------------------------

export interface OrganizationListItem {
  id: string;
  name: string;
}

/** Organizations the user can reach (same list as the admin People org picker). */
export function fetchOrganizations(): Promise<OrganizationListItem[]> {
  return get<OrganizationListItem[]>('/clients');
}

export interface CreateOrganizationInput {
  name: string;
  /** CLIENT = active client; NONE = Partner / other (admin "New Organization" default). */
  journey?: 'CLIENT' | 'NONE';
  email?: string;
  phone?: string;
  website?: string;
}

export interface OrganizationCreated {
  id: string;
  name: string;
}

export function createOrganization(input: CreateOrganizationInput): Promise<OrganizationCreated> {
  return post<OrganizationCreated>('/clients', {
    journey: input.journey ?? 'NONE',
    name: input.name,
    email: input.email,
    phone: input.phone,
    website: input.website,
    addToPipeline: false,
  });
}

export interface ContactCreated {
  id: string;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
}

export interface CreateContactInput {
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  title?: string;
  linkedInUrl?: string;
  clientId?: string;
  role?: string;
}

export function createContact(input: CreateContactInput): Promise<ContactCreated> {
  return post<ContactCreated>('/contacts', input);
}

const CONTACT_AVATAR_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
const CONTACT_AVATAR_MAX_BYTES = 5 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(',') ? result.split(',')[1]! : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/** Same JSON base64 upload as the admin app (POST /contacts/:id/avatar). */
export async function uploadContactAvatar(contactId: string, file: File): Promise<void> {
  if (!CONTACT_AVATAR_MIMES.includes(file.type as (typeof CONTACT_AVATAR_MIMES)[number])) {
    throw new Error('Avatar must be PNG, JPEG, GIF, or WebP.');
  }
  if (file.size > CONTACT_AVATAR_MAX_BYTES) {
    throw new Error('Avatar must be less than 5 MB.');
  }
  await post(`/contacts/${encodeURIComponent(contactId)}/avatar`, {
    fileBase64: await fileToBase64(file),
    mimeType: file.type,
  });
}

export interface TmProjectListItem {
  id: string;
  name: string;
  client: { id: string; name: string } | null;
}

export interface TmSection {
  id: string;
  name: string;
  sortOrder: number;
}

export interface TmProjectDetail {
  id: string;
  name: string;
  sections: TmSection[];
}

export function fetchTmProjects(): Promise<TmProjectListItem[]> {
  return get<TmProjectListItem[]>('/tm/projects');
}

export function fetchTmProject(projectId: string): Promise<TmProjectDetail> {
  return get<TmProjectDetail>(`/tm/projects/${encodeURIComponent(projectId)}`);
}

export interface TmTaskCreated {
  id: string;
  name: string;
}

export interface CreateTmTaskInput {
  projectId: string;
  name: string;
  sectionId?: string | null;
  description?: string | null;
  dueOn?: string | null;
}

export function createTmTask(input: CreateTmTaskInput): Promise<TmTaskCreated> {
  return post<TmTaskCreated>('/tm/tasks', input);
}

export function tmProjectLabel(p: TmProjectListItem): string {
  return p.client ? `${p.name} (${p.client.name})` : p.name;
}
