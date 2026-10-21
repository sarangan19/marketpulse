import { BellRinging, ChartLineUp, Newspaper, Pulse } from "@phosphor-icons/react";
import { type FormEvent, useState } from "react";
import { USE_MOCKS } from "../api/mode";
import { confirmSignUp, signIn, signUp } from "../auth/cognito";
import { errorMessage } from "../lib/format";

type Mode = "signin" | "signup" | "confirm";

const COPY: Record<Mode, { title: string; sub: string; cta: string; busy: string }> = {
  signin: { title: "Sign in", sub: "Welcome back to your watchlist.", cta: "Sign in", busy: "Signing in" },
  signup: {
    title: "Create your account",
    sub: "We will email you a code to confirm the address.",
    cta: "Create account",
    busy: "Creating account",
  },
  confirm: { title: "Check your email", sub: "", cta: "Confirm and sign in", busy: "Confirming" },
};

function Wordmark() {
  return (
    <span className="wordmark">
      <span className="wordmark-glyph" aria-hidden>
        <Pulse size={15} weight="bold" />
      </span>
      MarketPulse
    </span>
  );
}

export default function Auth({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        await signUp(email.trim(), password);
        setMode("confirm");
      } else if (mode === "confirm") {
        await confirmSignUp(email.trim(), code.trim());
        await signIn(email.trim(), password);
        onSignedIn();
      } else {
        await signIn(email.trim(), password);
        onSignedIn();
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function go(m: Mode) {
    setMode(m);
    setError(null);
  }

  const c = COPY[mode];

  return (
    <div className="auth">
      <section className="auth-brand" aria-label="About MarketPulse">
        <Wordmark />
        <h1>Know the moment your price is hit.</h1>
        <p className="lead">
          Watch up to 20 US stocks, set upper and lower thresholds, and get a calm daily read on the news.
        </p>
        <ul className="auth-points">
          <li>
            <BellRinging size={18} aria-hidden /> Threshold alerts by email or SMS
          </li>
          <li>
            <Newspaper size={18} aria-hidden /> A daily digest with news sentiment and an AI summary
          </li>
          <li>
            <ChartLineUp size={18} aria-hidden /> 30 days of price history for every symbol
          </li>
        </ul>
      </section>

      <div className="auth-form-wrap">
        <div className="auth-mobile-brand">
          <Wordmark />
        </div>
        <form className="auth-form" onSubmit={submit} noValidate>
          <div>
            <h2>{c.title}</h2>
          </div>
          <p className="sub">
            {mode === "confirm" ? (
              <>
                We sent a 6-digit code to <strong>{email}</strong>.
              </>
            ) : (
              c.sub
            )}
          </p>

          {mode !== "confirm" && (
            <>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby={mode === "signup" ? "pw-help" : undefined}
                />
                {mode === "signup" && (
                  <span className="help" id="pw-help">
                    At least 8 characters with upper and lower case letters and a number.
                  </span>
                )}
              </div>
            </>
          )}

          {mode === "confirm" && (
            <div className="field">
              <label htmlFor="code">Confirmation code</label>
              <input
                id="code"
                className="input num"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                style={{ letterSpacing: "0.3em", fontSize: 18 }}
              />
              {USE_MOCKS && <span className="help">Sample mode: any 6 digits work.</span>}
            </div>
          )}

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <button className="btn btn-primary btn-block" type="submit" disabled={busy} style={{ height: 44 }}>
            {busy ? c.busy : c.cta}
          </button>

          <p className="auth-switch">
            {mode === "signin" ? (
              <>
                New to MarketPulse?{" "}
                <button type="button" className="link-btn" onClick={() => go("signup")}>
                  Create an account
                </button>
              </>
            ) : mode === "signup" ? (
              <>
                Already have an account?{" "}
                <button type="button" className="link-btn" onClick={() => go("signin")}>
                  Sign in
                </button>
              </>
            ) : (
              <>
                Wrong email?{" "}
                <button type="button" className="link-btn" onClick={() => go("signup")}>
                  Start over
                </button>
              </>
            )}
          </p>
          {USE_MOCKS && mode === "signin" && (
            <p className="help">Sample mode: any email and password sign you in.</p>
          )}
        </form>
      </div>
    </div>
  );
}
