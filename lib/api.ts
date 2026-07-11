import { API_BASE } from './config';
import { getDevCreds } from './devAuth';
import { getValidIdToken } from './cognitoAuth';

// Real Cognito login takes priority when both are present -- that shouldn't
// normally happen (App.tsx only ever sets up one at a time), but if it did,
// a real signed-in session is the one actually backed by a live token worth
// trusting. Same shape the API expects from the admin app: Bearer token in
// prod, x-user-email header in dev (see JwtAuthGuard / DevAuthGuard in the
// main repo).
async function authHeadersRaw(): Promise<Record<string, string>> {
  const idToken = await getValidIdToken();
  if (idToken) {
    return { Authorization: `Bearer ${idToken}` };
  }
  const creds = await getDevCreds();
  if (!creds) throw new Error('Not signed in yet.');
  return { 'x-user-email': creds.email };
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

export interface Me {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  role: 'ADMIN' | 'MEMBER';
  hourlyRate?: number | null;
  clientId?: string | null;
}

export async function fetchMe(): Promise<Me> {
  const res = await fetch(`${API_BASE}/users/me`, { headers: await authHeaders() });
  await throwIfNotOk(res);
  return res.json();
}

export interface ProjectTaskOption {
  id: string;
  projectId: string;
  name: string;
  source: 'MANUAL' | 'ASANA';
  isBillable: boolean;
  isActive: boolean;
}

export interface ProjectOption {
  id: string;
  name: string;
  isActive: boolean;
  isBillable: boolean;
  client: { id: string; name: string; code: string };
  tasks: ProjectTaskOption[];
}

export async function fetchProjects(): Promise<ProjectOption[]> {
  const res = await fetch(`${API_BASE}/projects`, { headers: await authHeaders() });
  await throwIfNotOk(res);
  return res.json();
}

export interface TimeEntry {
  id: string;
  description?: string | null;
  startedAt: string;
  stoppedAt?: string | null;
  durationMin?: number | null;
  isBillable: boolean;
  project: { id: string; name: string; client: { id: string; name: string } };
  projectTask?: { id: string; name: string } | null;
}

// There's no dedicated "running timer" endpoint -- at most one time entry per
// user can be running at once (enforced server-side, see
// TimeEntriesController#assertNoRunningTimer), and a running one is always
// the most recent. A generous `from` window (well beyond any realistic timer
// length) keeps this to one cheap query instead of pulling a user's entire
// time-entry history just to check for a stoppedAt: null row.
export async function fetchRunningTimeEntry(userId: string): Promise<TimeEntry | null> {
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({ userId, from });
  const res = await fetch(`${API_BASE}/time-entries?${params}`, { headers: await authHeaders() });
  await throwIfNotOk(res);
  const entries: TimeEntry[] = await res.json();
  return entries.find((e) => !e.stoppedAt) ?? null;
}

export async function startTimer(input: {
  projectId: string;
  projectTaskId?: string;
  description?: string;
}): Promise<TimeEntry> {
  const res = await fetch(`${API_BASE}/time-entries`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ ...input, startedAt: new Date().toISOString() }),
  });
  await throwIfNotOk(res);
  return res.json();
}

export async function stopTimer(id: string): Promise<TimeEntry> {
  const res = await fetch(`${API_BASE}/time-entries/${id}/stop`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  await throwIfNotOk(res);
  return res.json();
}

export interface CreateExpenseInput {
  description: string;
  amount: number;
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
  receiptUrl?: string | null;
}

export async function createExpense(input: CreateExpenseInput): Promise<Expense> {
  const res = await fetch(`${API_BASE}/expenses`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(input),
  });
  await throwIfNotOk(res);
  return res.json();
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
  return res.json();
}
