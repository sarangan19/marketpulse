import { X } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useId, useRef } from "react";

/** Native <dialog> (focus trap, Esc, inert background) driven by `open`. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className = "",
  hideHeader = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  hideHeader?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dlg ${className}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <>
          {hideHeader ? (
            <h2 id={titleId} className="sr-only">
              {title}
            </h2>
          ) : (
            <div className="dlg-head">
              <div>
                <h2 id={titleId}>{title}</h2>
                {description && <p>{description}</p>}
              </div>
              <button className="icon-btn" aria-label="Close" onClick={onClose}>
                <X size={16} />
              </button>
            </div>
          )}
          {children}
        </>
      )}
    </dialog>
  );
}
