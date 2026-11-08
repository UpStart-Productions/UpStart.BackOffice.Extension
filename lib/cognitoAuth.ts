// Sign-in for the side panel. Two paths, both on our own branded screen:
// - Email/password: aws-amplify signIn (USER_SRP_AUTH), same as the admin app's
//   CognitoAuthService.signInWithPassword(). Amplify keeps those tokens.
// - Google: chrome.identity.launchWebAuthFlow straight to Google
//   (identity_provider=Google, so Cognito's own sign-in page never shows), then a
//   PKCE code exchange. Those tokens live in chrome.storage.local and are refreshed here.
// getValidIdToken() checks the Amplify session first, then the Google tokens.
// Copied from GrovLink Web Clipper's lib/cognitoAuth.ts.

import { Amplify } from 'aws-amplify';
import {
  confirmSignIn,
  fetchAuthSession,
  signIn,
  signOut,
} from 'aws-amplify/auth';

// Cognito domain for the user pool (App integration > Domain). Switch to
// auth.heyupstart.com if a custom domain is set up on the pool.
export const COGNITO_DOMAIN = 'us-west-2iljrxdk5x.auth.us-west-2.amazoncognito.com';
const USER_POOL_ID = 'us-west-2_IlJRXdK5X';
const CLIENT_ID = '5oi5vfbt574mqect5psnqkqabn';
const SCOPES = 'openid profile email';
const OAUTH_TOKENS_KEY = 'ubo_cognito_oauth_tokens';

interface OAuthTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: USER_POOL_ID,
        userPoolClientId: CLIENT_ID,
      },
    },
  });
  configured = true;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return base64UrlEncode(new Uint8Array(digest));
}

/** https://<extension-id>.chromiumapp.org/ — must be an allowed callback/sign-out URL on the Cognito app client. */
function getRedirectUri(): string {
  return chrome.identity.getRedirectURL();
}

async function requestOAuthTokens(body: URLSearchParams): Promise<OAuthTokens> {
  const res = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Sign-in failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  return {
    idToken: json.id_token,
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
}

async function getOAuthTokens(): Promise<OAuthTokens | null> {
  const stored = await chrome.storage.local.get(OAUTH_TOKENS_KEY);
  return (stored[OAUTH_TOKENS_KEY] as OAuthTokens | undefined) ?? null;
}

async function setOAuthTokens(tokens: OAuthTokens): Promise<void> {
  await chrome.storage.local.set({ [OAUTH_TOKENS_KEY]: tokens });
}

async function clearOAuthTokens(): Promise<void> {
  await chrome.storage.local.remove(OAUTH_TOKENS_KEY);
}

async function getValidOAuthIdToken(): Promise<string | null> {
  const tokens = await getOAuthTokens();
  if (!tokens) return null;
  if (Date.now() < tokens.expiresAt - 60_000) return tokens.idToken;
  if (!tokens.refreshToken) {
    await clearOAuthTokens();
    return null;
  }
  try {
    const fresh = await requestOAuthTokens(
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        refresh_token: tokens.refreshToken,
      }),
    );
    const merged: OAuthTokens = { ...fresh, refreshToken: fresh.refreshToken || tokens.refreshToken };
    await setOAuthTokens(merged);
    return merged.idToken;
  } catch {
    await clearOAuthTokens();
    return null;
  }
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ needsNewPassword: boolean }> {
  ensureConfigured();
  await clearOAuthTokens();
  const result = await signIn({ username: email.trim(), password });
  const step = (result as { nextStep?: { signInStep?: string } }).nextStep?.signInStep;
  const needsNewPassword =
    step === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' ||
    step === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD';
  if (needsNewPassword) {
    return { needsNewPassword: true };
  }
  await fetchAuthSession();
  return { needsNewPassword: false };
}

export async function confirmSignInWithNewPassword(newPassword: string): Promise<void> {
  ensureConfigured();
  await confirmSignIn({ challengeResponse: newPassword });
  await fetchAuthSession();
}

/** Opens a Chrome sign-in window that goes straight to Google's account picker. */
export async function signInWithGoogle(): Promise<void> {
  ensureConfigured();
  try {
    await signOut();
  } catch {
    /* no password session */
  }
  await clearOAuthTokens();

  const redirectUri = getRedirectUri();
  const codeVerifier = randomString(32);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const state = randomString(16);

  const authorizeUrl = new URL(`https://${COGNITO_DOMAIN}/oauth2/authorize`);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('scope', SCOPES);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('identity_provider', 'Google');

  const resultUrl = await new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authorizeUrl.toString(), interactive: true }, (redirectedTo) => {
      if (chrome.runtime.lastError || !redirectedTo) {
        reject(new Error(chrome.runtime.lastError?.message || 'Sign-in was cancelled.'));
        return;
      }
      resolve(redirectedTo);
    });
  });

  const returned = new URL(resultUrl);
  const errorParam = returned.searchParams.get('error');
  if (errorParam) {
    throw new Error(returned.searchParams.get('error_description') || errorParam);
  }
  const code = returned.searchParams.get('code');
  if (!code) throw new Error('Google sign-in did not return an authorization code.');
  if (returned.searchParams.get('state') !== state) {
    throw new Error('Sign-in response failed state verification.');
  }

  const tokens = await requestOAuthTokens(
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  );
  await setOAuthTokens(tokens);
}

export async function getValidIdToken(): Promise<string | null> {
  ensureConfigured();
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString() ?? null;
    if (token) return token;
    const refreshed = await fetchAuthSession({ forceRefresh: true });
    const refreshedToken = refreshed.tokens?.idToken?.toString() ?? null;
    if (refreshedToken) return refreshedToken;
  } catch {
    /* fall through to Google tokens */
  }
  return getValidOAuthIdToken();
}

export async function hasCognitoSession(): Promise<boolean> {
  return !!(await getValidIdToken());
}

export async function signOutCognito(): Promise<void> {
  ensureConfigured();
  const hadGoogle = !!(await getOAuthTokens());
  await clearOAuthTokens();
  try {
    await signOut({ global: true });
  } catch {
    /* local session already gone */
  }
  if (!hadGoogle) return;
  // Clear Cognito's Google cookie so the next Google sign-in can pick a different account.
  const logoutUrl = new URL(`https://${COGNITO_DOMAIN}/logout`);
  logoutUrl.searchParams.set('client_id', CLIENT_ID);
  logoutUrl.searchParams.set('logout_uri', getRedirectUri());
  await new Promise<void>((resolve) => {
    chrome.identity.launchWebAuthFlow({ url: logoutUrl.toString(), interactive: false }, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

export function getAuthErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.startsWith('API error ')) {
    return err.message.replace(/^API error \d+: /, '');
  }
  if (err && typeof err === 'object' && 'name' in err) {
    const name = (err as { name: string }).name;
    const message = (err as { message?: string }).message ?? '';
    if (name === 'NotAuthorizedException' || message.includes('Incorrect username or password')) {
      return 'Incorrect email or password.';
    }
    if (name === 'UserNotFoundException') {
      return 'No sign-in account for this email. Ask an admin to create your account first.';
    }
    if (name === 'LimitExceededException' || message.includes('Attempt limit exceeded')) {
      return 'Too many attempts. Please try again later.';
    }
    if (
      name === 'InvalidParameterException' ||
      message.includes('cannot be reset in the current state')
    ) {
      return 'Your account needs a temporary password first. Sign in with the password from your invite, then set a new password.';
    }
    if (name === 'UserNotConfirmedException') {
      return 'Please verify your email before signing in.';
    }
    if (name === 'InvalidPasswordException') {
      return 'Password does not meet requirements.';
    }
    if (message) return message;
  }
  return 'An error occurred. Please try again.';
}
