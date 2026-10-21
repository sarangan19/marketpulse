// MOCK AUTH. Accepts any email and password; any 6-digit confirmation code.
// Used by src/auth/cognito.ts when USE_MOCKS is on.
const KEY = "mp.mock.session";

const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

let memory: string | null = null;

export function mockSession(): string | null {
  try {
    return store()?.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

function setSession(email: string | null) {
  memory = email;
  try {
    if (email) store()?.setItem(KEY, email);
    else store()?.removeItem(KEY);
  } catch {
    /* storage unavailable: keep the in-memory session */
  }
}

function check(email: string, password: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (!password) throw new Error("Password cannot be empty.");
}

export async function mockSignUp(email: string, password: string) {
  await wait();
  check(email, password);
}

export async function mockConfirm(_email: string, code: string) {
  await wait();
  if (!/^\d{6}$/.test(code.trim())) throw new Error("Invalid verification code provided, please try again.");
}

export async function mockSignIn(email: string, password: string) {
  await wait();
  check(email, password);
  setSession(email.trim().toLowerCase());
}

export function mockSignOut() {
  setSession(null);
}

export async function mockIdToken(): Promise<string | null> {
  const s = mockSession();
  return s ? `mock.${btoa(s)}.token` : null;
}
