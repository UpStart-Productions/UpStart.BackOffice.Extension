/**
 * Local-only timer drafts from earlier versions of the extension, which timed entries in the browser
 * and saved them later. The timer now runs on the server like the admin app's; this is only kept so
 * drafts left in storage can still be saved or discarded (see TimerTab).
 */

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
