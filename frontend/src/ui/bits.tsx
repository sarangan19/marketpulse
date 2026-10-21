import { ArrowDown, ArrowUp, WarningCircle } from "@phosphor-icons/react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import type { AlertSide, AlertState } from "../api/types";

export function Skel({ w, h = 14, style }: { w?: number | string; h?: number; style?: CSSProperties }) {
  return <span className="skel" style={{ width: w ?? "100%", height: h, ...style }} aria-hidden />;
}

export function AlertChip({ side, state }: { side: AlertSide; state: AlertState }) {
  const Icon = side === "UPPER" ? ArrowUp : ArrowDown;
  const word = side === "UPPER" ? "Upper" : "Lower";
  return (
    <span className={`chip ${state === "BREACHED" ? "chip-breached" : ""}`}>
      <Icon size={12} weight="bold" aria-hidden />
      {word} {state === "BREACHED" ? "breached" : "clear"}
    </span>
  );
}

/** Text that flashes green/red briefly when `value` moves. */
export function Tick({ value, children, className = "" }: { value: number; children: ReactNode; className?: string }) {
  const prev = useRef(value);
  const [flash, setFlash] = useState<{ dir: "up" | "down"; n: number } | null>(null);
  useEffect(() => {
    if (value !== prev.current) {
      const dir = value > prev.current ? "up" : "down";
      prev.current = value;
      setFlash((f) => ({ dir, n: (f?.n ?? 0) + 1 }));
    }
  }, [value]);
  return (
    <span key={flash?.n ?? 0} className={`tick ${className}`} data-flash={flash?.dir}>
      {children}
    </span>
  );
}

export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="inline-error" role="alert">
      <WarningCircle size={18} weight="fill" aria-hidden />
      <span style={{ flex: 1 }}>{message}</span>
      {onRetry && (
        <button className="btn btn-secondary btn-sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
