import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { getIdToken, signOut } from "./auth/cognito";
import { PageSkeleton } from "./pages/PageSkeleton";
import { AppShell } from "./shell/AppShell";
import { WatchlistProvider } from "./state/watchlist";
import { ToastProvider } from "./ui/toast";

// Route-level code splitting: recharts only loads with the symbol page.
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const SymbolDetail = lazy(() => import("./pages/SymbolDetail"));
const Alerts = lazy(() => import("./pages/Alerts"));
const Settings = lazy(() => import("./pages/Settings"));

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    getIdToken().then((t) => setAuthed(t !== null));
  }, []);

  if (authed === null) {
    return (
      <div className="boot" role="status">
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  return (
    <ToastProvider>
      {!authed ? (
        <Suspense fallback={<div className="boot" />}>
          <Auth onSignedIn={() => setAuthed(true)} />
        </Suspense>
      ) : (
        <WatchlistProvider>
          <AppShell
            onSignOut={() => {
              signOut();
              setAuthed(false);
            }}
          >
            <Suspense fallback={<PageSkeleton />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/symbol/:symbol" element={<SymbolDetail />} />
                <Route path="/alerts" element={<Alerts />} />
                <Route path="/settings" element={<Settings onSignOut={() => setAuthed(false)} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </AppShell>
        </WatchlistProvider>
      )}
    </ToastProvider>
  );
}
