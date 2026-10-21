import { type FormEvent, useEffect, useState } from "react";
import { errorMessage, price as fmt } from "../lib/format";
import { useWatchlist } from "../state/watchlist";
import { Dialog } from "./Dialog";
import { useToast } from "./toast";

function parse(v: string): number | null | "bad" {
  const s = v.trim().replace(/,/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : "bad";
}

export function ThresholdDialog() {
  const { editing, closeThresholds, items, save, remove } = useWatchlist();
  const toast = useToast();
  const item = items?.find((i) => i.symbol === editing);
  const [upper, setUpper] = useState("");
  const [lower, setLower] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setUpper(item?.upper != null ? String(item.upper) : "");
      setLower(item?.lower != null ? String(item.lower) : "");
      setServerError(null);
    }
    // only when the dialog opens for a symbol
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const u = parse(upper);
  const l = parse(lower);
  const upperErr = u === "bad" ? "Enter a positive number" : null;
  const lowerErr =
    l === "bad"
      ? "Enter a positive number"
      : typeof l === "number" && typeof u === "number" && l >= u
        ? "Lower must be less than upper"
        : null;
  const invalid = !!upperErr || !!lowerErr;
  const last = item?.latest?.price ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!editing || invalid) return;
    setSaving(true);
    setServerError(null);
    try {
      await save(editing, { upper: u as number | null, lower: l as number | null });
      toast.show("success", `Alerts saved for ${editing}`);
      closeThresholds();
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={!!editing}
      onClose={closeThresholds}
      title={`Price alerts for ${editing ?? ""}`}
      description={
        last != null ? (
          <>
            Last price <span className="num">{fmt(last)}</span>. Leave a side empty to turn it off.
          </>
        ) : (
          "Leave a side empty to turn it off."
        )
      }
    >
      <form onSubmit={submit} noValidate>
        <div className="dlg-body">
          <div className="grid-2">
            <div className="field">
              <label htmlFor="th-upper">Alert above</label>
              <div className="input-affix">
                <span className="prefix">$</span>
                <input
                  id="th-upper"
                  className="input num"
                  inputMode="decimal"
                  autoComplete="off"
                  value={upper}
                  onChange={(e) => setUpper(e.target.value)}
                  aria-invalid={!!upperErr}
                  aria-describedby="th-upper-help"
                />
              </div>
              {upperErr ? (
                <span className="err" id="th-upper-help">
                  {upperErr}
                </span>
              ) : (
                <span className="help" id="th-upper-help">
                  Upper threshold
                </span>
              )}
            </div>
            <div className="field">
              <label htmlFor="th-lower">Alert below</label>
              <div className="input-affix">
                <span className="prefix">$</span>
                <input
                  id="th-lower"
                  className="input num"
                  inputMode="decimal"
                  autoComplete="off"
                  value={lower}
                  onChange={(e) => setLower(e.target.value)}
                  aria-invalid={!!lowerErr}
                  aria-describedby="th-lower-help"
                />
              </div>
              {lowerErr ? (
                <span className="err" id="th-lower-help">
                  {lowerErr}
                </span>
              ) : (
                <span className="help" id="th-lower-help">
                  Lower threshold
                </span>
              )}
            </div>
          </div>
          <p className="help">
            You get one email (and SMS, if on) each time the price crosses a threshold. It re-arms once
            the price moves back.
          </p>
          {serverError && (
            <p className="form-error" role="alert">
              {serverError}
            </p>
          )}
        </div>
        <div className="dlg-foot">
          {item && (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => {
                const s = editing!;
                closeThresholds();
                remove(s);
              }}
            >
              Remove from watchlist
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={closeThresholds}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={invalid || saving}>
            {saving ? "Saving" : "Save alerts"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
