import { useEffect, useState } from 'react';
import {
  Me,
  TmProjectListItem,
  TmSection,
  TmTaskCreated,
  createTmTask,
  fetchTmProject,
  fetchTmProjects,
  tmProjectLabel,
} from '../../lib/api';

export default function TaskTab({ me: _me }: { me: Me }) {
  const [projects, setProjects] = useState<TmProjectListItem[]>([]);
  const [sections, setSections] = useState<TmSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<TmTaskCreated | null>(null);

  useEffect(() => {
    void fetchTmProjects()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!projectId) {
      setSections([]);
      setSectionId('');
      return;
    }
    let cancelled = false;
    void fetchTmProject(projectId)
      .then((p) => {
        if (cancelled) return;
        const list = [...p.sections].sort((a, b) => a.sortOrder - b.sortOrder);
        setSections(list);
        setSectionId(list[0]?.id ?? '');
      })
      .catch(() => {
        if (!cancelled) {
          setSections([]);
          setSectionId('');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  function resetForm() {
    setProjectId('');
    setSectionId('');
    setName('');
    setDescription('');
    setDueOn('');
    setSections([]);
    setError('');
    setStatus('idle');
    setSaved(null);
  }

  async function handleSave() {
    if (!projectId) {
      setError('Pick a Task Manager project.');
      setStatus('error');
      return;
    }
    if (!name.trim()) {
      setError('Task name is required.');
      setStatus('error');
      return;
    }
    setStatus('saving');
    setError('');
    try {
      const created = await createTmTask({
        projectId,
        sectionId: sectionId || null,
        name: name.trim(),
        description: description.trim() || null,
        dueOn: dueOn ? new Date(`${dueOn}T00:00:00`).toISOString() : null,
      });
      setSaved(created);
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  if (loading) {
    return <div className="panel-body">Loading…</div>;
  }

  if (projects.length === 0) {
    return (
      <div className="panel-body">
        <p className="helper-text" style={{ textAlign: 'left' }}>
          No Task Manager projects are available. Add a project to Tasks in the admin app first.
        </p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="success-wrap">
        <div className="success-check">✓</div>
        <p className="success-title">Task added</p>
        <p className="success-sub">{saved?.name ?? name.trim()}</p>
        <button className="btn-secondary" style={{ marginTop: 0 }} onClick={resetForm}>
          Add another
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="panel-body">
        <div className="field-group">
          <label className="field-label">Project</label>
          <select className="field-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Select project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {tmProjectLabel(p)}
              </option>
            ))}
          </select>
        </div>
        {projectId && sections.length > 0 && (
          <div className="field-group">
            <label className="field-label">Section</label>
            <select className="field-select" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field-group">
          <label className="field-label">Task name</label>
          <input
            className="field-input"
            placeholder="What needs to be done?"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Description</label>
          <textarea
            className="field-textarea"
            rows={2}
            placeholder="Optional"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Due date</label>
          <input className="field-input" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        </div>
      </div>
      <div className="panel-footer">
        <button className="btn-primary" onClick={() => void handleSave()} disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving…' : 'Add task'}
        </button>
        {status === 'error' && <div className="form-error">{error}</div>}
      </div>
    </>
  );
}
