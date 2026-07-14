import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { DEV_LOGIN_AVAILABLE } from '../../lib/config';
import { DEFAULT_EMAIL, DevCreds, clearDevCreds, getDevCreds, setDevCreds } from '../../lib/devAuth';
import {
  confirmSignInWithNewPassword,
  getAuthErrorMessage,
  hasCognitoSession,
  signInWithPassword,
  signOutCognito,
} from '../../lib/cognitoAuth';
import {
  Expense,
  Me,
  ProjectOption,
  createExpense,
  fetchMe,
  fetchProjects,
  uploadExpenseReceipt,
} from '../../lib/api';
import TimerTab from './TimerTab';

type Screen = 'loading' | 'login' | 'main';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [authMode, setAuthMode] = useState<'dev' | 'cognito' | null>(null);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    (async () => {
      if (await hasCognitoSession()) {
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

type CognitoFormMode = 'login' | 'new-password-required';

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
  const [cognitoMode, setCognitoMode] = useState<CognitoFormMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [cognitoBusy, setCognitoBusy] = useState(false);
  const [cognitoError, setCognitoError] = useState(initialError ?? '');

  async function handleEmailPasswordSignIn() {
    setCognitoError('');
    if (!email.trim()) {
      setCognitoError('Email is required.');
      return;
    }
    if (!password) {
      setCognitoError('Password is required.');
      return;
    }

    setCognitoBusy(true);
    try {
      const { needsNewPassword } = await signInWithPassword(email, password);
      if (needsNewPassword) {
        setCognitoMode('new-password-required');
        setNewPassword('');
        setNewPasswordConfirm('');
        setPassword('');
      } else {
        onCognitoSignedIn();
      }
    } catch (err) {
      setCognitoError(getAuthErrorMessage(err));
    } finally {
      setCognitoBusy(false);
    }
  }

  async function handleNewPassword() {
    setCognitoError('');
    const p = newPassword.trim();
    const c = newPasswordConfirm.trim();
    if (p.length < 8) {
      setCognitoError('Password must be at least 8 characters.');
      return;
    }
    if (p !== c) {
      setCognitoError('Passwords do not match.');
      return;
    }

    setCognitoBusy(true);
    try {
      await confirmSignInWithNewPassword(p);
      onCognitoSignedIn();
    } catch (err) {
      setCognitoError(getAuthErrorMessage(err));
    } finally {
      setCognitoBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="login-wrap">
        <img className="login-mark" src={chrome.runtime.getURL('icon/128.png')} alt="UpStart Back Office" />
        <p className="login-title">Sign in to UpStart Back Office</p>
        <p className="login-sub">Use the same email and password as the admin dashboard.</p>
        <div className="login-form">
          {cognitoMode === 'login' ? (
            <>
              <div className="field-group">
                <label className="field-label">Email</label>
                <input
                  className="field-input"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="field-group">
                <label className="field-label">Password</label>
                <input
                  className="field-input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <button
                className="btn-primary"
                onClick={handleEmailPasswordSignIn}
                disabled={cognitoBusy || !email.trim() || !password}
              >
                {cognitoBusy ? 'Signing in…' : 'Sign in'}
              </button>
            </>
          ) : (
            <>
              <p className="login-sub" style={{ textAlign: 'left', marginBottom: 12 }}>
                Your account uses a temporary password. Set a new password to continue.
              </p>
              <div className="field-group">
                <label className="field-label">New password</label>
                <input
                  className="field-input"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>
              <div className="field-group">
                <label className="field-label">Confirm new password</label>
                <input
                  className="field-input"
                  type="password"
                  autoComplete="new-password"
                  value={newPasswordConfirm}
                  onChange={(e) => setNewPasswordConfirm(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <button
                className="btn-primary"
                onClick={handleNewPassword}
                disabled={cognitoBusy || !newPassword || !newPasswordConfirm}
              >
                {cognitoBusy ? 'Saving…' : 'Set password and sign in'}
              </button>
              <button
                className="link-button"
                style={{ marginTop: 12, display: 'block' }}
                onClick={() => {
                  setCognitoMode('login');
                  setCognitoError('');
                  setNewPassword('');
                  setNewPasswordConfirm('');
                }}
              >
                Back to sign in
              </button>
            </>
          )}
          {cognitoError && <div className="login-error">{cognitoError}</div>}
          {DEV_LOGIN_AVAILABLE && cognitoMode === 'login' && (
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
