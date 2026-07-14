// Email/password sign-in via Cognito — same flow as the admin app's
// CognitoAuthService.signInWithPassword() (aws-amplify/auth, USER_SRP_AUTH).
// No Hosted UI popup, no chrome.identity, no extension callback URL to register
// in AWS. Uses the same user pool + app client as the admin dashboard.

import { Amplify } from 'aws-amplify';
import {
  confirmSignIn,
  fetchAuthSession,
  signIn,
  signOut,
} from 'aws-amplify/auth';

const USER_POOL_ID = 'us-west-2_IlJRXdK5X';
const CLIENT_ID = '5oi5vfbt574mqect5psnqkqabn';

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

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ needsNewPassword: boolean }> {
  ensureConfigured();
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

export async function getValidIdToken(): Promise<string | null> {
  ensureConfigured();
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString() ?? null;
    if (token) return token;
    const refreshed = await fetchAuthSession({ forceRefresh: true });
    return refreshed.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}

export async function hasCognitoSession(): Promise<boolean> {
  return !!(await getValidIdToken());
}

export async function signOutCognito(): Promise<void> {
  ensureConfigured();
  try {
    await signOut({ global: true });
  } catch {
    /* local session already gone */
  }
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
