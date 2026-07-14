import { useEffect, useState } from 'react';
import { createCompletedTimeEntry, fetchProjects, Me, ProjectOption } from '../../lib/api';
import {
  addLocalRunningTimer,
  draftDurationMs,
  formatDurationMs,
  getLocalTimerDrafts,
  LocalTimerDraft,
  removeLocalTimerDraft,
  removeLocalTimerDrafts,
  stopLocalTimer,
} from '../../lib/localTimers';

function activeTasks(project: ProjectOption | undefined) {
  return (project?.tasks ?? []).filter((t) => t.isActive);
}

function formatStoppedAt(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function TimerTab({ me }: { me: Me }) {
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [drafts, setDrafts] = useState<LocalTimerDraft[] | null>(null);
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [tick, setTick] = useState(0);
  const [lastStoppedId, setLastStoppedId] = useState<string | null>(null);

  async function reloadDrafts() {
    setDrafts(await getLocalTimerDrafts(me.id));
  }

  useEffect(() => {
    (async () => {
      setError('');
      try {
        const projectList = await fetchProjects();
        setProjects(projectList.filter((p) => p.isActive));
        await reloadDrafts();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setProjects([]);
        setDrafts([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id]);

  const runningDrafts = drafts?.filter((d) => !d.stoppedAt) ?? [];
  const unsavedDrafts = drafts?.filter((d) => d.stoppedAt) ?? [];

  useEffect(() => {
    if (runningDrafts.length === 0) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [runningDrafts.length]);

  const selectedProject = projects?.find((p) => p.id === projectId);
  const manualTasks = activeTasks(selectedProject);
  const canStart = !!projectId && !!taskId && manualTasks.length > 0;

  async function handleStart() {
    if (!projectId) {
      setError('Choose a project.');
      return;
    }
    if (!taskId) {
      setError('Choose a task.');
      return;
    }
    if (!selectedProject) return;

    const task = manualTasks.find((t) => t.id === taskId);
    if (!task) {
      setError('Choose a task.');
      return;
    }

    setBusy(true);
    setError('');
    setSaveMessage('');
    try {
      await addLocalRunningTimer(me.id, {
        projectId,
        projectName: selectedProject.name,
        clientName: selectedProject.client.name,
        taskId: task.id,
        taskName: task.name,
        description: description.trim(),
        startedAt: new Date().toISOString(),
      });
      await reloadDrafts();
      setDescription('');
      setLastStoppedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleStop(draftId: string) {
    setBusy(true);
    setError('');
    setSaveMessage('');
    try {
      await stopLocalTimer(me.id, draftId);
      await reloadDrafts();
      setLastStoppedId(draftId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleStartAgain(draft: LocalTimerDraft) {
    setProjectId(draft.projectId);
    setTaskId(draft.taskId);
    setDescription(draft.description);
    setLastStoppedId(null);
    setError('');
    setSaveMessage('');

    setBusy(true);
    try {
      await addLocalRunningTimer(me.id, {
        projectId: draft.projectId,
        projectName: draft.projectName,
        clientName: draft.clientName,
        taskId: draft.taskId,
        taskName: draft.taskName,
        description: draft.description,
        startedAt: new Date().toISOString(),
      });
      await reloadDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDiscard(draftId: string) {
    setBusy(true);
    setError('');
    try {
      await removeLocalTimerDraft(me.id, draftId);
      if (lastStoppedId === draftId) setLastStoppedId(null);
      await reloadDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveAll() {
    if (unsavedDrafts.length === 0) return;

    setBusy(true);
    setError('');
    setSaveMessage('');
    const savedIds: string[] = [];

    try {
      for (const draft of unsavedDrafts) {
        if (!draft.stoppedAt) continue;
        await createCompletedTimeEntry({
          projectId: draft.projectId,
          projectTaskId: draft.taskId,
          description: draft.description || undefined,
          startedAt: draft.startedAt,
          stoppedAt: draft.stoppedAt,
        });
        savedIds.push(draft.id);
      }
      await removeLocalTimerDrafts(me.id, savedIds);
      await reloadDrafts();
      setLastStoppedId(null);
      setSaveMessage(
        savedIds.length === 1
          ? '1 time entry saved to Back Office.'
          : `${savedIds.length} time entries saved to Back Office.`,
      );
    } catch (err) {
      if (savedIds.length > 0) {
        await reloadDrafts();
        setSaveMessage(`${savedIds.length} saved before the error — fix and save the rest.`);
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (projects === null || drafts === null) {
    return <div className="panel-body">Loading…</div>;
  }

  // tick keeps running clocks live
  void tick;

  return (
    <>
      <div className="panel-body">
        <div className="field-group">
          <label className="field-label">Project</label>
          <select
            className="field-select"
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setTaskId('');
            }}
          >
            <option value="">Select a project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.client.name})
              </option>
            ))}
          </select>
        </div>

        {projectId && (
          <div className="field-group">
            <label className="field-label">Task</label>
            {manualTasks.length > 0 ? (
              <select className="field-select" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                <option value="">Select a task</option>
                {manualTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="helper-text" style={{ marginTop: 0, textAlign: 'left' }}>
                This project has no tasks — add one in Back Office first.
              </p>
            )}
          </div>
        )}

        <div className="field-group">
          <label className="field-label">Notes (optional)</label>
          <textarea
            className="field-textarea"
            rows={2}
            placeholder="What are you working on?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <button className="btn-primary" onClick={handleStart} disabled={busy || !canStart}>
          {busy ? 'Starting…' : 'Start timer'}
        </button>

        {runningDrafts.length > 0 && (
          <section className="timer-section">
            <p className="timer-section-title">Running ({runningDrafts.length})</p>
            {runningDrafts.map((draft) => (
              <div key={draft.id} className="timer-card timer-card-list">
                <p className="timer-project">{draft.projectName}</p>
                <p className="timer-client">
                  {draft.clientName} · {draft.taskName}
                </p>
                <div className="timer-elapsed">{formatDurationMs(draftDurationMs(draft))}</div>
                {draft.description && <p className="timer-description">{draft.description}</p>}
                <button className="btn-danger" onClick={() => handleStop(draft.id)} disabled={busy}>
                  Stop
                </button>
              </div>
            ))}
          </section>
        )}

        {unsavedDrafts.length > 0 && (
          <section className="timer-section">
            <p className="timer-section-title">Ready to save ({unsavedDrafts.length})</p>
            <p className="helper-text" style={{ marginTop: 0, textAlign: 'left', marginBottom: 10 }}>
              Stopped timers stay here until you save them to Back Office.
            </p>
            {unsavedDrafts.map((draft) => (
              <div
                key={draft.id}
                className={`timer-card timer-card-list timer-card-stopped${draft.id === lastStoppedId ? ' timer-card-highlight' : ''}`}
              >
                <p className="timer-project">{draft.projectName}</p>
                <p className="timer-client">
                  {draft.clientName} · {draft.taskName}
                </p>
                <div className="timer-elapsed timer-elapsed-stopped">
                  {formatDurationMs(draftDurationMs(draft))}
                </div>
                {draft.stoppedAt && (
                  <p className="timer-stopped-at">Stopped at {formatStoppedAt(draft.stoppedAt)}</p>
                )}
                {draft.description && <p className="timer-description">{draft.description}</p>}
                <div className="timer-card-actions">
                  <button className="btn-secondary" onClick={() => handleStartAgain(draft)} disabled={busy}>
                    Start again
                  </button>
                  <button className="link-button" onClick={() => handleDiscard(draft.id)} disabled={busy}>
                    Discard
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {error && <div className="form-error">{error}</div>}
        {saveMessage && <div className="form-success">{saveMessage}</div>}
      </div>

      {unsavedDrafts.length > 0 && (
        <div className="panel-footer">
          <button className="btn-primary" onClick={handleSaveAll} disabled={busy}>
            {busy
              ? 'Saving…'
              : unsavedDrafts.length === 1
                ? 'Save 1 entry to Back Office'
                : `Save ${unsavedDrafts.length} entries to Back Office`}
          </button>
        </div>
      )}
    </>
  );
}
