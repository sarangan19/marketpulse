import { Bell, GearSix, ListBullets, MagnifyingGlass, SignOut, Pulse } from "@phosphor-icons/react";
import { type ReactNode, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { USE_MOCKS } from "../api/mode";
import { currentEmail } from "../auth/cognito";
import { useWatchlist } from "../state/watchlist";
import { SearchDialog } from "../ui/SearchDialog";
import { ThresholdDialog } from "../ui/ThresholdDialog";

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}

export function AppShell({ children, onSignOut }: { children: ReactNode; onSignOut: () => void }) {
  const { openSearch, items } = useWatchlist();
  const breached = items?.reduce(
    (n, i) => n + Object.values(i.alertState).filter((s) => s === "BREACHED").length,
    0,
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (document.querySelector("dialog[open]")) return;
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !isTyping(e.target))) {
        e.preventDefault();
        openSearch();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSearch]);

  const badge = breached ? (
    <span className="count-badge" aria-label={`${breached} breached`}>
      {breached}
    </span>
  ) : null;

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <NavLink to="/" className="wordmark" aria-label="MarketPulse home">
            <span className="wordmark-glyph" aria-hidden>
              <Pulse size={15} weight="bold" />
            </span>
            MarketPulse
          </NavLink>
          <nav className="nav" aria-label="Primary">
            <NavLink to="/" end>
              Watchlist
            </NavLink>
            <NavLink to="/alerts">Alerts {badge}</NavLink>
            <NavLink to="/settings">Settings</NavLink>
          </nav>
          <div className="topbar-right">
            {USE_MOCKS && (
              <span className="demo-tag" title="Running on the in-memory mock API">
                Sample data
              </span>
            )}
            <button className="search-trigger" onClick={openSearch}>
              <MagnifyingGlass size={15} aria-hidden />
              Search symbols
              <span className="kbd" aria-hidden>
                /
              </span>
            </button>
            <button className="icon-btn topbar-search-icon" aria-label="Search symbols" onClick={openSearch}>
              <MagnifyingGlass size={20} />
            </button>
            <div className="account">
              <span className="account-email" title={currentEmail() ?? ""}>
                {currentEmail()}
              </span>
              <button className="icon-btn" aria-label="Sign out" title="Sign out" onClick={onSignOut}>
                <SignOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </header>
      <main id="main">{children}</main>
      <nav className="tabbar" aria-label="Primary">
        <NavLink to="/" end>
          <ListBullets size={22} aria-hidden />
          Watchlist
        </NavLink>
        <button onClick={openSearch}>
          <MagnifyingGlass size={22} aria-hidden />
          Search
        </button>
        <NavLink to="/alerts">
          <Bell size={22} aria-hidden />
          Alerts
          {badge}
        </NavLink>
        <NavLink to="/settings">
          <GearSix size={22} aria-hidden />
          Settings
        </NavLink>
      </nav>
      <SearchDialog />
      <ThresholdDialog />
    </>
  );
}
