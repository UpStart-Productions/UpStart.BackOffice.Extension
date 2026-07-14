import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { DEV_LOGIN_AVAILABLE } from '../../lib/config';
import { DEFAULT_EMAIL, DevCreds, clearDevCreds, getDevCreds, setDevCreds } from '../../lib/devAuth';
import { getCognitoTokens, signInWithCognito, signOutCognito } from '../../lib/cognitoAuth';
import {
  Expense,
  Me,
  ProjectOption,
  TimeEntry,
  createExpense,
  fetchMe,
  fetchProjects,
  fetchRunningTimeEntry,
  startTimer,
  stopTimer,
  uploadExpenseReceipt,
} from '../../lib/api';

type Screen = 'loading' | 'login' | 'main';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [authMode, setAuthMode] = useState<'dev' | 'cognito' | null>(null);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    (async () => {
      const cognitoTokens = await getCognitoTokens();
      if (cognitoTokens) {
        await loadMe('cognito');
        return;
      }
      const devCreds = await getDevCreds();
      if (devCreds) {
        await loadMe('dev');
        return;
      }
      setScreen('login');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMe(mode: 'dev' | 'cognito') {
    try {
      const profile = await fetchMe();
      setMe(profile);
      setAuthMode(mode);
      setScreen('main');
    } catch (err) {
      // Stale/invalid session -- clear it and send back to login rather than
      // getting stuck showing an empty main panel.
      if (mode === 'cognito') await signOutCognito();
      else await clearDevCreds();
      setAuthError(err instanceof Error ? err.message : String(err));
      setScreen('login');
    }
  }

  async function handleSignOut() {
    if (authMode === 'cognito') await signOutCognito();
    else await clearDevCreds();
    setMe(null);
    setAuthMode(null);
    setScreen('login');
  }

  if (screen === 'loading') {
    return <div className="panel-body">Loading…</div>;
  }

  if (screen === 'login' || !me) {
    return (
      <LoginScreen
        initialError={authError}
        onDevSignedIn={async (c) => {
          await setDevCreds(c);
          await loadMe('dev');
        }}
        onCognitoSignedIn={() => loadMe('cognito')}
      />
    );
  }

  return <MainPanel me={me} authMode={authMode} onSignOut={handleSignOut} />;
}

function LoginScreen({
  initialError,
  onDevSignedIn,
  onCognitoSignedIn,
}: {
  initialError?: string;
  onDevSignedIn: (creds: DevCreds) => void;
  onCognitoSignedIn: () => void;
}) {
  const [showDevLogin, setShowDevLogin] = useState(false);
  const [cognitoBusy, setCognitoBusy] = useState(false);
  const [cognitoError, setCognitoError] = useState(initialError ?? '');

  async function handleCognitoSignIn() {
    setCognitoBusy(true);
    setCognitoError('');
    try {
      await signInWithCognito();
      onCognitoSignedIn();
    } catch (err) {
      setCognitoError(err instanceof Error ? err.message : String(err));
    } finally {
      setCognitoBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="login-wrap">
        <img className="login-mark" src={chrome.runtime.getURL('icon/128.png')} alt="UpStart Back Office" />
        <p className="login-title">Sign in to UpStart Back Office</p>
        <p className="login-sub">Use the same account you sign in to the admin dashboard with.</p>
        <div className="login-form">
          <button className="btn-primary" onClick={handleCognitoSignIn} disabled={cognitoBusy}>
            {cognitoBusy ? 'Signing in…' : 'Sign in with UpStart Back Office'}
          </button>
          {cognitoError && <div className="login-error">{cognitoError}</div>}
          {DEV_LOGIN_AVAILABLE && (
            <>
              <button
                className="link-button"
                style={{ marginTop: 14, display: 'block' }}
                onClick={() => setShowDevLogin((v) => !v)}
              >
                {showDevLogin ? 'Hide local dev login' : 'Use local dev login instead'}
              </button>
              {showDevLogin && <DevLogin onSignedIn={onDevSignedIn} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DevLogin({ onSignedIn }: { onSignedIn: (creds: DevCreds) => void }) {
  const [email, setEmail] = useState(DEFAULT_EMAIL);
  const [error, setError] = useState('');

  function handleContinue() {
    setError('');
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    onSignedIn({ email: email.trim() });
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
      <p className="login-sub" style={{ textAlign: 'left', marginBottom: 12 }}>
        Local dev mode — uses your API's dev auth headers instead of Cognito. Only works
        when the API's NODE_ENV isn't &quot;production&quot;.
      </p>
      <div className="field-group">
        <label className="field-label">Email</label>
        <input
          className="field-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={DEFAULT_EMAIL}
        />
      </div>
      <button className="btn-primary" onClick={handleContinue}>
        Continue
      </button>
      {error && <div className="login-error">{error}</div>}
    </div>
  );
}

function displayName(me: Me): string {
  const parts = [me.firstName, me.lastName].filter(Boolean).join(' ').trim();
  return parts || me.name || me.email;
}

function MainPanel({
  me,
  authMode,
  onSignOut,
}: {
  me: Me;
  authMode: 'dev' | 'cognito' | null;
  onSignOut: () => void;
}) {
  const [tab, setTab] = useState<'timer' | 'expense'>('timer');

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="header-user">
          <p className="header-user-name">{displayName(me)}</p>
          <p className="header-user-role">
            {me.role === 'ADMIN' ? 'Admin' : 'Member'}
            {authMode === 'dev' ? ' · dev login' : ''}
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="icon-button"
            onClick={onSignOut}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={17} strokeWidth={2} />
          </button>
        </div>
      </div>
      <div className="tab-row">
        <button className={`tab-btn${tab === 'timer' ? ' active' : ''}`} onClick={() => setTab('timer')}>
          Timer
        </button>
        <button className={`tab-btn${tab === 'expense' ? ' active' : ''}`} onClick={() => setTab('expense')}>
          Expense
        </button>
      </div>
      {tab === 'timer' ? <TimerTab me={me} /> : <ExpenseTab me={me} />}
    </div>
  );
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function TimerTab({ me }: { me: Me }) {
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [running, setRunning] = useState<TimeEntry | null | undefined>(undefined);
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  async function load() {
    setError('');
    try {
      const [projectList, runningEntry] = await Promise.all([fetchProjects(), fetchRunningTimeEntry(me.id)]);
      setProjects(projectList.filter((p) => p.isActive));
      setRunning(runningEntry);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ticks the elapsed-time display for a running timer once a second.
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [running]);

  const selectedProject = projects?.find((p) => p.id === projectId);
  const manualTasks = (selectedProject?.tasks ?? []).filter((t) => t.isActive);

  async function handleStart() {
    if (!projectId) {
      setError('Choose a project.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const entry = await startTimer({
        projectId,
        projectTaskId: taskId || undefined,
        description: description.trim() || undefined,
      });
      setRunning(entry);
      setDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleStop() {
    if (!running) return;
    setBusy(true);
    setError('');
    try {
      await stopTimer(running.id);
      setRunning(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (projects === null || running === undefined) {
    return <div className="panel-body">Loading…</div>;
  }

  if (running) {
    const elapsedMs = tick >= 0 ? Date.now() - new Date(running.startedAt).getTime() : 0;
    return (
      <div className="panel-body">
        <div className="timer-card">
          <p className="timer-project">{running.project.name}</p>
          <p className="timer-client">{running.project.client.name}</p>
          <div className="timer-elapsed">{formatElapsed(elapsedMs)}</div>
          {running.description && <p className="timer-description">{running.description}</p>}
          <button className="btn-danger" onClick={handleStop} disabled={busy}>
            {busy ? 'Stopping…' : 'Stop timer'}
          </button>
        </div>
        {error && <div className="form-error">{error}</div>}
      </div>
    );
  }

  return (
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

      {manualTasks.length > 0 && (
        <div className="field-group">
          <label className="field-label">Task</label>
          <select className="field-select" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            <option value="">Select a task</option>
            {manualTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
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

      {error && <div className="form-error">{error}</div>}

      <button className="btn-primary" onClick={handleStart} disabled={busy || !projectId}>
        {busy ? 'Starting…' : 'Start timer'}
      </button>
    </div>
  );
}

const EXPENSE_CATEGORIES = ['Software', 'Travel', 'Meals', 'Supplies', 'Contractor', 'Advertising', 'Other'];

function todayDateInputValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function ExpenseTab({ me: _me }: { me: Me }) {
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [incurredAt, setIncurredAt] = useState(todayDateInputValue());
  const [projectId, setProjectId] = useState('');
  const [isReimbursable, setIsReimbursable] = useState(false);
  const [isBillable, setIsBillable] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [savedExpense, setSavedExpense] = useState<Expense | null>(null);

  useEffect(() => {
    fetchProjects()
      .then((list) => setProjects(list.filter((p) => p.isActive)))
      .catch(() => setProjects([]));
  }, []);

  function resetForm() {
    setDescription('');
    setAmount('');
    setCategory('');
    setIncurredAt(todayDateInputValue());
    setProjectId('');
    setIsReimbursable(false);
    setIsBillable(false);
    setPaymentMethod('');
    setNotes('');
    setReceiptFile(null);
    setStatus('idle');
    setSavedExpense(null);
  }

  async function handleSave() {
    const amountNum = Number(amount);
    if (!description.trim()) {
      setError('Description is required.');
      setStatus('error');
      return;
    }
    if (!amountNum || amountNum <= 0) {
      setError('Enter an amount greater than 0.');
      setStatus('error');
      return;
    }

    setStatus('saving');
    setError('');
    try {
      const expense = await createExpense({
        description: description.trim(),
        amount: amountNum,
        category: category.trim() || undefined,
        incurredAt: new Date(incurredAt).toISOString(),
        projectId: projectId || undefined,
        isReimbursable,
        isBillable,
        paymentMethod: paymentMethod.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      if (receiptFile) {
        await uploadExpenseReceipt(expense.id, receiptFile);
      }
      setSavedExpense(expense);
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div className="success-wrap">
        <div className="success-check">✓</div>
        <p className="success-title">Expense logged</p>
        <p className="success-sub">
          {savedExpense ? `$${savedExpense.amount.toFixed(2)} — ${savedExpense.description}` : ''}
        </p>
        <button className="btn-secondary" style={{ marginTop: 0 }} onClick={resetForm}>
          Log another
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="panel-body">
        <div className="field-group">
          <label className="field-label">Description</label>
          <input
            className="field-input"
            placeholder="What was this for?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="field-row">
          <div className="field-group">
            <label className="field-label">Amount</label>
            <input
              className="field-input"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label className="field-label">Date</label>
            <input
              className="field-input"
              type="date"
              value={incurredAt}
              onChange={(e) => setIncurredAt(e.target.value)}
            />
          </div>
        </div>

        <div className="field-group">
          <label className="field-label">Category (optional)</label>
          <input
            className="field-input"
            list="expense-category-options"
            placeholder="e.g. Software, Travel, Supplies…"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <datalist id="expense-category-options">
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <div className="field-group">
          <label className="field-label">Project (optional)</label>
          <select className="field-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">No project</option>
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.client.name})
              </option>
            ))}
          </select>
        </div>

        <div className="field-group" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label className="checkbox-row">
            <input type="checkbox" checked={isReimbursable} onChange={(e) => setIsReimbursable(e.target.checked)} />
            Reimbursable
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={isBillable} onChange={(e) => setIsBillable(e.target.checked)} />
            Billable to client
          </label>
        </div>

        <div className="field-group">
          <label className="field-label">Payment method (optional)</label>
          <input
            className="field-input"
            placeholder="e.g. Personal card, Company Amex…"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
          />
        </div>

        <div className="field-group">
          <label className="field-label">Notes (optional)</label>
          <textarea className="field-textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="field-group">
          <label className="field-label">Receipt (optional)</label>
          <input
            className="field-input"
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>
      <div className="panel-footer">
        <button className="btn-primary" onClick={handleSave} disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving…' : 'Log expense'}
        </button>
        {status === 'error' && <div className="form-error">{error}</div>}
      </div>
    </>
  );
}
