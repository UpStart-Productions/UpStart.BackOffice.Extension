/** Local-only timer drafts — not sent to the API until the user saves. */

export interface LocalTimerDraft {
  id: string;
  projectId: string;
  projectName: string;
  clientName: string;
  taskId: string;
  taskName: string;
  description: string;
  startedAt: string;
  /** null while the timer is still running */
  stoppedAt: string | null;
}

function storageKey(userId: string): string {
  return `ubo_timer_drafts_${userId}`;
}

export async function getLocalTimerDrafts(userId: string): Promise<LocalTimerDraft[]> {
  const stored = await chrome.storage.local.get(storageKey(userId));
  return stored[storageKey(userId)] ?? [];
}

async function setLocalTimerDrafts(userId: string, drafts: LocalTimerDraft[]): Promise<void> {
  await chrome.storage.local.set({ [storageKey(userId)]: drafts });
}

export function newDraftId(): string {
  return crypto.randomUUID();
}

export async function addLocalRunningTimer(
  userId: string,
  draft: Omit<LocalTimerDraft, 'id' | 'stoppedAt'>,
): Promise<LocalTimerDraft> {
  const entry: LocalTimerDraft = { ...draft, id: newDraftId(), stoppedAt: null };
  const drafts = await getLocalTimerDrafts(userId);
  drafts.unshift(entry);
  await setLocalTimerDrafts(userId, drafts);
  return entry;
}

export async function stopLocalTimer(userId: string, draftId: string): Promise<LocalTimerDraft | null> {
  const drafts = await getLocalTimerDrafts(userId);
  const idx = drafts.findIndex((d) => d.id === draftId);
  if (idx < 0) return null;
  const updated: LocalTimerDraft = { ...drafts[idx], stoppedAt: new Date().toISOString() };
  drafts[idx] = updated;
  await setLocalTimerDrafts(userId, drafts);
  return updated;
}

export async function removeLocalTimerDraft(userId: string, draftId: string): Promise<void> {
  const drafts = await getLocalTimerDrafts(userId);
  await setLocalTimerDrafts(
    userId,
    drafts.filter((d) => d.id !== draftId),
  );
}

export async function removeLocalTimerDrafts(userId: string, draftIds: string[]): Promise<void> {
  const drop = new Set(draftIds);
  const drafts = await getLocalTimerDrafts(userId);
  await setLocalTimerDrafts(
    userId,
    drafts.filter((d) => !drop.has(d.id)),
  );
}

export function draftDurationMs(draft: LocalTimerDraft, now = Date.now()): number {
  const end = draft.stoppedAt ? new Date(draft.stoppedAt).getTime() : now;
  return Math.max(0, end - new Date(draft.startedAt).getTime());
}

export function formatDurationMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
