import { useEffect, useState } from 'react';
import {
  ClientOption,
  Me,
  ProjectOption,
  TimeEntry,
  WorkTaskOption,
  createTimeEntry,
  entryTitle,
  entryWorkTasks,
  fetchAsanaConnected,
  fetchClientLookup,
  fetchMyTimeEntries,
  fetchProjects,
  fetchWorkTasks,
  projectLabel,
  restartTimeEntry,
  stopTimeEntry,
  workTaskLine,
} from '../../lib/api';
import {
  LocalTimerDraft,
  draftDurationMs,
  formatDurationMs,
  getLocalTimerDrafts,
  removeLocalTimerDraft,
  removeLocalTimerDrafts,
} from '../../lib/localTimers';

// Mirrors the admin app's timer (Timesheet page + "Track time" dialog, admin/src/app/pages/time-entry/):
// one running timer, kept on the server, so the panel, the dashboard and the timesheet all show the
// same one. Project, client and task are optional, like in the app; work tasks come from Task Manager.

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

/** H:MM, as the admin timesheet shows durations. */
function formatMinutes(min: number): string {
  const total = Math.max(0, Math.round(min));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function elapsedMs(entry: TimeEntry, now = Date.now()): number {
  return Math.max(0, now - new Date(entry.startedAt).getTime());
}

export default function TimerTab({ me }: { me: Me }) {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [asanaConnected, setAsanaConnected] = useState(false);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [running, setRunning] = useState<TimeEntry | null>(null);
  const [legacyDrafts, setLegacyDrafts] = useState<LocalTimerDraft[]>([]);

  const [projectId, setProjectId] = useState('');
  const [clientId, setClientId] = useState('');
  const [manualTaskId, setManualTaskId] = useState('');
  const [asanaTaskId, setAsanaTaskId] = useState('');
  const [workTaskOptions, setWorkTaskOptions] = useState<WorkTaskOption[]>([]);
  const [workTaskIds, setWorkTaskIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [, setTick] = useState(0);

  async function loadEntries() {
    let today = await fetchMyTimeEntries(me.id, startOfToday(), endOfToday());
    let active = today.find((e) => !e.stoppedAt) ?? null;
    if (!active) {
      // A timer left running from an earlier day still shows, as on the timesheet.
      const all = await fetchMyTimeEntries(me.id);
      active = all.find((e) => !e.stoppedAt) ?? null;
    }
    today = today.filter((e) => e.stoppedAt);
    setEntries(today);
    setRunning(active);
  }

  useEffect(() => {
    (async () => {
      setError('');
      try {
        const [projectList, clientList, asana] = await Promise.all([
          fetchProjects(),
          fetchClientLookup().catch(() => [] as ClientOption[]),
          fetchAsanaConnected(),
        ]);
        setProjects(projectList.filter((p) => p.isActive !== false));
        setClients(clientList);
        setAsanaConnected(asana);
        await loadEntries();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
      setLegacyDrafts(await getLocalTimerDrafts(me.id));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id]);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [running]);

  const selectedProject = projects.find((p) => p.id === projectId);
  const manualTasks = (selectedProject?.tasks ?? []).filter((t) => t.source !== 'ASANA');
  const asanaTasks = (selectedProject?.tasks ?? []).filter((t) => t.source === 'ASANA' && t.isActive !== false);
  const showAsanaPicker = asanaConnected && !!selectedProject?.asanaSectionGid && asanaTasks.length > 0;

  async function onProjectChange(id: string) {
    setProjectId(id);
    setClientId('');
    setManualTaskId('');
    setAsanaTaskId('');
    setWorkTaskIds([]);
    setWorkTaskOptions([]);
    const project = projects.find((p) => p.id === id);
    if (project?.inTaskManager) {
      setWorkTaskOptions(await fetchWorkTasks(id).catch(() => []));
    }
  }

  function toggleWorkTask(id: string) {
    setWorkTaskIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function resetForm() {
    setProjectId('');
    setClientId('');
    setManualTaskId('');
    setAsanaTaskId('');
    setWorkTaskIds([]);
    setWorkTaskOptions([]);
    setNotes('');
  }

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
      await loadEntries().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  function handleStart() {
    return run(async () => {
      const projectTaskId = asanaTaskId || manualTaskId;
      await createTimeEntry({
        projectId: projectId || null,
        clientId: projectId ? null : clientId || null,
        ...(projectTaskId ? { projectTaskId } : {}),
        taskIds: workTaskIds.length ? workTaskIds : null,
        taskId: workTaskIds[0] ?? null,
        description: notes.trim() || undefined,
        startedAt: new Date().toISOString(),
      });
      resetForm();
      await loadEntries();
    }, 'Failed to start timer');
  }

  function handleStop() {
    if (!running) return;
    return run(async () => {
      await stopTimeEntry(running.id);
      await loadEntries();
    }, 'Failed to stop timer');
  }

  function handleStartFromEntry(entry: TimeEntry) {
    if (running) {
      setError('Stop the current timer first.');
      return;
    }
    return run(async () => {
      await restartTimeEntry(entry.id);
      await loadEntries();
    }, 'Failed to start timer');
  }

  // Timers kept in the browser by earlier versions of this extension. Saved as finished entries.
  function handleSaveLegacy() {
    return run(async () => {
      const savedIds: string[] = [];
      try {
        for (const draft of legacyDrafts) {
          await createTimeEntry({
            projectId: draft.projectId || null,
            clientId: null,
            ...(draft.taskId ? { projectTaskId: draft.taskId } : {}),
            taskIds: null,
            taskId: null,
            description: draft.description || undefined,
            startedAt: draft.startedAt,
            stoppedAt: draft.stoppedAt ?? new Date().toISOString(),
          });
          savedIds.push(draft.id);
        }
      } finally {
        await removeLocalTimerDrafts(me.id, savedIds);
        setLegacyDrafts(await getLocalTimerDrafts(me.id));
      }
      setMessage(savedIds.length === 1 ? '1 time entry saved.' : `${savedIds.length} time entries saved.`);
      await loadEntries();
    }, 'Failed to save');
  }

  function handleDiscardLegacy(id: string) {
    return run(async () => {
      await removeLocalTimerDraft(me.id, id);
      setLegacyDrafts(await getLocalTimerDrafts(me.id));
    }, 'Failed to discard');
  }

  if (loading) {
    return <div className="panel-body">Loading…</div>;
  }

  const todayMin =
    entries.reduce((sum, e) => sum + (e.durationMin ?? 0), 0) +
    (running && new Date(running.startedAt) >= startOfToday() ? elapsedMs(running) / 60000 : 0);

  return (
    <div className="panel-body">
      {running ? (
        <div className="timer-card">
          <p className="timer-project">{entryTitle(running)}</p>
          {running.projectTask?.name && <p className="timer-client">{running.projectTask.name}</p>}
          {entryWorkTasks(running).map((t) => (
            <p key={t.id} className="timer-client">
              {workTaskLine(t)}
            </p>
          ))}
          <div className="timer-elapsed">{formatDurationMs(elapsedMs(running))}</div>
          {running.description && <p className="timer-description">{running.description}</p>}
          <button className="btn-danger" onClick={handleStop} disabled={busy}>
            {busy ? 'Stopping…' : '■ Stop'}
          </button>
        </div>
      ) : (
        <>
          {projects.length > 0 && (
            <div className="field-group">
              <label className="field-label">Project (optional)</label>
              <select className="field-select" value={projectId} onChange={(e) => void onProjectChange(e.target.value)}>
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {projectLabel(p)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!projectId && clients.length > 0 && (
            <div className="field-group">
              <label className="field-label">Client (optional)</label>
              <select className="field-select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">No client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {manualTasks.length > 0 && (
            <div className="field-group">
              <label className="field-label">Task</label>
              <select
                className="field-select"
                value={manualTaskId}
                onChange={(e) => {
                  setManualTaskId(e.target.value);
                  if (e.target.value) setAsanaTaskId('');
                }}
              >
                <option value="">Select a task</option>
                {manualTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.isBillable ? 'Billable' : 'Non-billable'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {workTaskOptions.length > 0 && (
            <div className="field-group">
              <label className="field-label">Work tasks</label>
              <div className="check-list">
                {workTaskOptions.map((t) => (
                  <label key={t.id} className="checkbox-row">
                    <input type="checkbox" checked={workTaskIds.includes(t.id)} onChange={() => toggleWorkTask(t.id)} />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {showAsanaPicker && (
            <div className="field-group">
              <label className="field-label">Asana task</label>
              <select
                className="field-select"
                value={asanaTaskId}
                onChange={(e) => {
                  setAsanaTaskId(e.target.value);
                  if (e.target.value) setManualTaskId('');
                }}
              >
                <option value="">Select an Asana task</option>
                {asanaTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="field-group">
            <label className="field-label">Notes</label>
            <textarea
              className="field-textarea"
              rows={2}
              placeholder="What did you work on?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <button className="btn-primary" onClick={handleStart} disabled={busy}>
            {busy ? 'Starting…' : 'Start timer'}
          </button>
        </>
      )}

      {error && <div className="form-error">{error}</div>}
      {message && <div className="form-success">{message}</div>}

      <section className="timer-section">
        <p className="timer-section-title">Today ({formatMinutes(todayMin)})</p>
        {entries.length === 0 ? (
          <p className="helper-text" style={{ textAlign: 'left', marginTop: 0 }}>
            No time tracked for this day.
          </p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="timer-card timer-card-list">
              <p className="timer-project">{entryTitle(entry)}</p>
              {entry.projectTask?.name && <p className="timer-client">{entry.projectTask.name}</p>}
              {entryWorkTasks(entry).map((t) => (
                <p key={t.id} className="timer-client">
                  {workTaskLine(t)}
                </p>
              ))}
              {entry.description && <p className="timer-description">{entry.description}</p>}
              <div className="entry-row-actions">
                <span className="entry-duration">{formatMinutes(entry.durationMin ?? 0)}</span>
                <button
                  className="btn-secondary btn-inline"
                  onClick={() => handleStartFromEntry(entry)}
                  disabled={busy || !!running}
                  title="Start timer for this entry"
                >
                  Start
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      {legacyDrafts.length > 0 && (
        <section className="timer-section">
          <p className="timer-section-title">Not saved yet ({legacyDrafts.length})</p>
          <p className="helper-text" style={{ marginTop: 0, textAlign: 'left', marginBottom: 10 }}>
            Timers from an earlier version of this extension, kept only in this browser. Save them to Back
            Office or discard them. Any still running are stopped now when saved.
          </p>
          {legacyDrafts.map((draft) => (
            <div key={draft.id} className="timer-card timer-card-list timer-card-stopped">
              <p className="timer-project">
                {draft.projectName} ({draft.clientName || 'Personal'})
              </p>
              {draft.taskName && <p className="timer-client">{draft.taskName}</p>}
              <div className="timer-elapsed timer-elapsed-stopped">{formatDurationMs(draftDurationMs(draft))}</div>
              {draft.description && <p className="timer-description">{draft.description}</p>}
              <button className="link-button" onClick={() => handleDiscardLegacy(draft.id)} disabled={busy}>
                Discard
              </button>
            </div>
          ))}
          <button className="btn-primary" onClick={handleSaveLegacy} disabled={busy}>
            {legacyDrafts.length === 1 ? 'Save 1 entry to Back Office' : `Save ${legacyDrafts.length} entries to Back Office`}
          </button>
        </section>
      )}
    </div>
  );
}
