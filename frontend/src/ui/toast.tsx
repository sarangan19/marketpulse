import { CheckCircle, Info, WarningCircle, X } from "@phosphor-icons/react";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";
import { errorMessage } from "../lib/format";

type Kind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: Kind;
  message: string;
  action?: { label: string; run: () => void };
}
interface ToastApi {
  show: (kind: Kind, message: string, action?: Toast["action"]) => void;
  error: (e: unknown) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback<ToastApi["show"]>(
    (kind, message, action) => {
      const id = next.current++;
      setToasts((t) => [...t.slice(-2), { id, kind, message, action }]);
      setTimeout(() => dismiss(id), kind === "error" ? 7000 : action ? 6000 : 4000);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({ show, error: (e) => show("error", errorMessage(e)) }),
    [show],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => {
          const Icon = t.kind === "error" ? WarningCircle : t.kind === "success" ? CheckCircle : Info;
          return (
            <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === "error" ? "alert" : "status"}>
              <Icon className="lead" size={18} weight="fill" aria-hidden />
              <span className="msg">{t.message}</span>
              {t.action && (
                <button
                  className="toast-action"
                  onClick={() => {
                    t.action!.run();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button className="icon-btn" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast outside ToastProvider");
  return c;
}
