// Cognito sign-up / sign-in wrapper. KEEP this file when replacing the mock UI.
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  type CognitoUserSession,
} from "amazon-cognito-identity-js";
import {
  mockConfirm,
  mockIdToken,
  mockSession,
  mockSignIn,
  mockSignOut,
  mockSignUp,
} from "../api/mock/auth";
import { USE_MOCKS } from "../api/mode";

let pool: CognitoUserPool | null = null;

function getPool(): CognitoUserPool {
  if (!pool) {
    pool = new CognitoUserPool({
      UserPoolId: import.meta.env.VITE_USER_POOL_ID,
      ClientId: import.meta.env.VITE_CLIENT_ID,
    });
  }
  return pool;
}

function user(email: string) {
  return new CognitoUser({ Username: email, Pool: getPool() });
}

export function signUp(email: string, password: string): Promise<void> {
  if (USE_MOCKS) return mockSignUp(email, password);
  return new Promise((resolve, reject) => {
    getPool().signUp(
      email,
      password,
      [new CognitoUserAttribute({ Name: "email", Value: email })],
      [],
      (err) => (err ? reject(err) : resolve()),
    );
  });
}

export function confirmSignUp(email: string, code: string): Promise<void> {
  if (USE_MOCKS) return mockConfirm(email, code);
  return new Promise((resolve, reject) => {
    user(email).confirmRegistration(code, true, (err) => (err ? reject(err) : resolve()));
  });
}

export function signIn(email: string, password: string): Promise<void> {
  if (USE_MOCKS) return mockSignIn(email, password);
  return new Promise((resolve, reject) => {
    user(email).authenticateUser(new AuthenticationDetails({ Username: email, Password: password }), {
      onSuccess: () => resolve(),
      onFailure: reject,
    });
  });
}

export function signOut(): void {
  if (USE_MOCKS) return mockSignOut();
  getPool().getCurrentUser()?.signOut();
}

/** Current ID token (refreshed if expired), or null when signed out. */
export function getIdToken(): Promise<string | null> {
  if (USE_MOCKS) return mockIdToken();
  const current = typeof window === "undefined" ? null : getPool().getCurrentUser();
  if (!current) return Promise.resolve(null);
  return new Promise((resolve) => {
    current.getSession((err: Error | null, session: CognitoUserSession | null) => {
      resolve(err || !session?.isValid() ? null : session.getIdToken().getJwtToken());
    });
  });
}

export function currentEmail(): string | null {
  if (USE_MOCKS) return mockSession();
  return typeof window === "undefined" ? null : (getPool().getCurrentUser()?.getUsername() ?? null);
}
