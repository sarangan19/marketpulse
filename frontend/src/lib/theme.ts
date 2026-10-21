// Dark is the house theme. "system" follows prefers-color-scheme.
export type ThemePref = "dark" | "light" | "system";
const KEY = "mp.theme";

export function getTheme(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "system" ? v : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(t: ThemePref, persist = true) {
  document.documentElement.setAttribute("data-theme", t);
  if (!persist) return;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* preference just will not persist */
  }
}
