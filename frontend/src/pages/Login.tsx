// MOCK UI — throwaway.
import { type FormEvent, useState } from "react";
import { confirmSignUp, signIn, signUp } from "../auth/cognito";

type Mode = "signin" | "signup" | "confirm";

export default function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (mode === "signup") {
        await signUp(email, password);
        setMode("confirm");
      } else if (mode === "confirm") {
        await confirmSignUp(email, code);
        await signIn(email, password);
        onSignedIn();
      } else {
        await signIn(email, password);
        onSignedIn();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form onSubmit={submit} style={{ fontFamily: "sans-serif", maxWidth: 320, margin: "64px auto" }}>
      <h2>MarketPulse — {mode === "signin" ? "Sign in" : mode === "signup" ? "Sign up" : "Confirm"}</h2>
      <p>
        <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </p>
      <p>
        <input
          placeholder="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </p>
      {mode === "confirm" && (
        <p>
          <input placeholder="code from email" value={code} onChange={(e) => setCode(e.target.value)} />
        </p>
      )}
      <button type="submit">Continue</button>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <p>
        {mode === "signin" ? (
          <a href="#" onClick={() => setMode("signup")}>
            Create an account
          </a>
        ) : (
          <a href="#" onClick={() => setMode("signin")}>
            Back to sign in
          </a>
        )}
      </p>
    </form>
  );
}
