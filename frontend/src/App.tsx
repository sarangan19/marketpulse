// MOCK UI — throwaway. Replace freely; keep src/api and src/auth.
import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { currentEmail, getIdToken, signOut } from "./auth/cognito";
import Login from "./pages/Login";
import Settings from "./pages/Settings";
import SymbolDetail from "./pages/SymbolDetail";
import Watchlist from "./pages/Watchlist";

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    getIdToken().then((t) => setAuthed(t !== null));
  }, []);

  if (authed === null) return <p>Loading…</p>;
  if (!authed) return <Login onSignedIn={() => setAuthed(true)} />;

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <nav style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <strong>MarketPulse (mock UI)</strong>
        <Link to="/">Watchlist</Link>
        <Link to="/settings">Settings</Link>
        <span style={{ marginLeft: "auto" }}>{currentEmail()}</span>
        <button
          onClick={() => {
            signOut();
            setAuthed(false);
          }}
        >
          Sign out
        </button>
      </nav>
      <hr />
      <Routes>
        <Route path="/" element={<Watchlist />} />
        <Route path="/symbol/:symbol" element={<SymbolDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
}
