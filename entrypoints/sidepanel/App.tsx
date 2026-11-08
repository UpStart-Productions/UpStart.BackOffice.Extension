import { useEffect, useMemo, useState } from 'react';
import { LogOut } from 'lucide-react';
import { DEV_LOGIN_AVAILABLE } from '../../lib/config';
import { DEFAULT_EMAIL, DevCreds, clearDevCreds, getDevCreds, setDevCreds } from '../../lib/devAuth';
import {
  confirmSignInWithNewPassword,
  getAuthErrorMessage,
  hasCognitoSession,
  signInWithGoogle,
  signInWithPassword,
  signOutCognito,
} from '../../lib/cognitoAuth';
import { Me, TenantOption, fetchMe, fetchTenants, setApiTenantSlug } from '../../lib/api';
import { allows, roleLabel } from '../../lib/access';
import { getStoredTenantSlug, pickTenantSlug, setStoredTenantSlug } from '../../lib/tenant';
import TimerTab from './TimerTab';
import ExpenseTab from './ExpenseTab';
import TaskTab from './TaskTab';
import PersonTab from './PersonTab';
import OrganizationTab from './OrganizationTab';

type PanelTab = 'timer' | 'expense' | 'task' | 'person' | 'organization';

type Screen = 'loading' | 'login' | 'main';

interface Session {
  me: Me;
  tenants: TenantOption[];
  tenantSlug: string;
}

/**
 * Sign-in, then the tenant: /users/me and /tenants/mine, pick the tenant the same way the admin app
 * does, and send it as x-tenant-slug from then on. /users/me is fetched again under the chosen tenant
 * so role, permissions and modules are the ones for that tenant.
 */
async function loadSession(preferredSlug?: string): Promise<Session> {
  setApiTenantSlug('');
  const first = await fetchMe();
  const stored = preferredSlug ?? (await getStoredTenantSlug(first.email));
  setApiTenantSlug(stored);
  let me = stored ? await fetchMe() : first;
  const tenants = await fetchTenants();
  const tenantSlug = pickTenantSlug(me, tenants, stored);
  setApiTenantSlug(tenantSlug);
  if (tenantSlug !== stored) me = await fetchMe();
  await setStoredTenantSlug(me.email, tenantSlug);
  return { me, tenants, tenantSlug };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [session, setSession] = useState<Session | null>(null);
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
      setSession(await loadSession());
      setAuthMode(mode);
      setScreen('main');
    } catch (err) {
      // Stale/invalid session -- clear it and send back to login rather than
      // getting stuck showing an empty main panel.
      if (mode === 'cognito') await signOutCognito();
      else await clearDevCreds();
      setApiTenantSlug('');
      setAuthError(err instanceof Error ? err.message : String(err));
      setScreen('login');
    }
  }

  async function handleSwitchTenant(slug: string) {
    if (!session || slug === session.tenantSlug) return;
    setScreen('loading');
    try {
      setSession(await loadSession(slug));
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    }
    setScreen('main');
  }

  async function handleSignOut() {
    if (authMode === 'cognito') await signOutCognito();
    else await clearDevCreds();
    setApiTenantSlug('');
    setSession(null);
    setAuthMode(null);
    setScreen('login');
  }

  if (screen === 'loading') {
    return <div className="panel-body">Loading…</div>;
  }

  if (screen === 'login' || !session) {
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

  return (
    <MainPanel
      // Remount on tenant switch so no data from the old tenant stays on screen.
      key={session.tenantSlug}
      session={session}
      authMode={authMode}
      onSwitchTenant={handleSwitchTenant}
      onSignOut={handleSignOut}
    />
  );
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

  async function handleGoogleSignIn() {
    setCognitoError('');
    setCognitoBusy(true);
    try {
      await signInWithGoogle();
      onCognitoSignedIn();
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
        <p className="login-sub">Use the same email and password as the admin dashboard, or your Google account.</p>
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
              <p className="login-sub" style={{ margin: '12px 0' }}>or</p>
              <button className="btn-secondary" onClick={handleGoogleSignIn} disabled={cognitoBusy}>
                Sign in with Google
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
  session,
  authMode,
  onSwitchTenant,
  onSignOut,
}: {
  session: Session;
  authMode: 'dev' | 'cognito' | null;
  onSwitchTenant: (slug: string) => void;
  onSignOut: () => void;
}) {
  const { me, tenants, tenantSlug } = session;
  const canTime = allows(me, 'time', 'create');
  const canExpense = allows(me, 'expenses', 'create');
  const canTask = allows(me, 'tasks', 'create');
  const canPerson = allows(me, 'contacts', 'create');
  const canOrganization = allows(me, 'clients', 'create');
  const tabs = useMemo(() => {
    const items: { id: PanelTab; label: string }[] = [];
    if (canTime) items.push({ id: 'timer', label: 'Timer' });
    if (canExpense) items.push({ id: 'expense', label: 'Expense' });
    if (canTask) items.push({ id: 'task', label: 'Task' });
    if (canPerson) items.push({ id: 'person', label: 'Person' });
    if (canOrganization) items.push({ id: 'organization', label: 'Org' });
    return items;
  }, [canTime, canExpense, canTask, canPerson, canOrganization]);
  const [tab, setTab] = useState<PanelTab>('timer');
  const tenantName = tenants.find((t) => t.slug === tenantSlug)?.name ?? '';

  useEffect(() => {
    if (tabs.length === 0) return;
    if (!tabs.some((t) => t.id === tab)) setTab(tabs[0]!.id);
  }, [tabs, tab]);

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="header-user">
          <p className="header-user-name">{displayName(me)}</p>
          <p className="header-user-role">
            {roleLabel(me)}
            {authMode === 'dev' ? ', dev login' : ''}
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
      {tenants.length > 1 && (
        <div className="tenant-row">
          <label className="field-label" htmlFor="tenant-select">
            Tenant
          </label>
          <select
            id="tenant-select"
            className="field-select"
            value={tenantSlug}
            onChange={(e) => onSwitchTenant(e.target.value)}
          >
            {tenants.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {tabs.length === 0 ? (
        <div className="panel-body">
          <p className="helper-text" style={{ textAlign: 'left' }}>
            Your account{tenantName ? ` in ${tenantName}` : ''} doesn't include any quick-capture areas this
            extension supports. Ask an administrator if you need access.
          </p>
        </div>
      ) : (
        <>
          {tabs.length > 1 && (
            <div className="tab-row">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`tab-btn${tab === t.id ? ' active' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <div className="panel-main">
            {tab === 'timer' && canTime && <TimerTab me={me} />}
            {tab === 'expense' && canExpense && <ExpenseTab me={me} />}
            {tab === 'task' && canTask && <TaskTab me={me} />}
            {tab === 'person' && canPerson && <PersonTab me={me} />}
            {tab === 'organization' && canOrganization && <OrganizationTab me={me} />}
          </div>
        </>
      )}
    </div>
  );
}
