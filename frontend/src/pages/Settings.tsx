import { Check, EnvelopeSimple, SignOut } from "@phosphor-icons/react";
import { type FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import type { Profile, ProfileUpdate } from "../api/types";
import { signOut } from "../auth/cognito";
import { day, errorMessage } from "../lib/format";
import { applyTheme, getTheme, type ThemePref } from "../lib/theme";
import { InlineError, Skel } from "../ui/bits";
import { useToast } from "../ui/toast";

const E164 = /^\+[1-9]\d{7,14}$/;

function Switch({
  id,
  checked,
  onChange,
  disabled,
  labelledBy,
  describedBy,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  labelledBy: string;
  describedBy: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      className="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

export default function Settings({ onSignOut }: { onSignOut: () => void }) {
  const toast = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [sms, setSms] = useState(false);
  const [digest, setDigest] = useState(true);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [theme, setTheme] = useState<ThemePref>(getTheme);

  function load() {
    setLoadError(null);
    api
      .getMe()
      .then((p) => {
        setProfile(p);
        setPhone(p.phone ?? "");
        setSms(p.smsOptIn);
        setDigest(p.digestOptIn);
      })
      .catch((e) => setLoadError(errorMessage(e)));
  }
  useEffect(load, []);

  const phoneTrim = phone.replace(/[\s()-]/g, "");
  const phoneErr = phoneTrim && !E164.test(phoneTrim) ? "Use international format: + then country code, e.g. +14155550123" : null;
  const smsErr = sms && !phoneTrim ? "Add a phone number to turn on SMS alerts" : null;
  const dirty =
    !!profile &&
    (phoneTrim !== (profile.phone ?? "") || sms !== profile.smsOptIn || digest !== profile.digestOptIn);

  async function save(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!profile || phoneErr || smsErr) return;
    const u: ProfileUpdate = { smsOptIn: sms, digestOptIn: digest };
    if (phoneTrim && phoneTrim !== profile.phone) u.phone = phoneTrim;
    setSaving(true);
    setServerError(null);
    try {
      const p = await api.updateMe(u);
      setProfile(p);
      setPhone(p.phone ?? "");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setServerError(errorMessage(err));
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function sendDigest() {
    setSending(true);
    try {
      await api.triggerDigest();
      toast.show("success", "Digest queued. It should reach your inbox in a minute or two.");
    } catch (e) {
      toast.error(e);
    } finally {
      setSending(false);
    }
  }

  function pickTheme(t: ThemePref) {
    setTheme(t);
    applyTheme(t);
  }

  return (
    <div className="wrap page">
      <h1 className="page-title" style={{ marginBottom: 24 }}>
        Settings
      </h1>
      {loadError && <InlineError message={loadError} onRetry={load} />}

      <div className="settings">
        <section className="set-section" aria-labelledby="s-account">
          <header>
            <h2 id="s-account">Account</h2>
          </header>
          <div className="set-body">
            {profile ? (
              <dl className="kv" style={{ margin: 0 }}>
                <dt>Email</dt>
                <dd style={{ fontFamily: "var(--font-sans)", wordBreak: "break-all" }}>{profile.email}</dd>
                <dt>Member since</dt>
                <dd style={{ fontFamily: "var(--font-sans)" }}>{day(profile.createdAt)}</dd>
              </dl>
            ) : (
              !loadError && <Skel h={44} />
            )}
            <div className="set-actions">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  signOut();
                  onSignOut();
                }}
              >
                <SignOut size={16} aria-hidden /> Sign out
              </button>
            </div>
          </div>
        </section>

        <form className="set-section" aria-labelledby="s-notify" onSubmit={save} noValidate>
          <header>
            <h2 id="s-notify">Notifications</h2>
            <p>Alerts always go to your email. SMS is optional.</p>
          </header>
          <div className="set-body">
            {!profile && !loadError ? (
              <>
                <Skel h={66} />
                <Skel h={56} />
                <Skel h={56} />
              </>
            ) : profile ? (
              <>
                <div className="field">
                  <label htmlFor="phone">Mobile number</label>
                  <input
                    id="phone"
                    className="input num"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+14155550123"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onBlur={() => setTouched(true)}
                    aria-invalid={touched && !!phoneErr}
                    aria-describedby="phone-help"
                  />
                  {touched && phoneErr ? (
                    <span className="err" id="phone-help">
                      {phoneErr}
                    </span>
                  ) : (
                    <span className="help" id="phone-help">
                      E.164 format, starting with + and your country code.
                    </span>
                  )}
                </div>
                <div>
                  <div className="switch-row">
                    <div className="text">
                      <strong id="sms-l">SMS alerts</strong>
                      <span id="sms-d">Text me when a threshold is crossed.</span>
                      {touched && smsErr && (
                        <span className="err" style={{ marginTop: 4 }}>
                          {smsErr}
                        </span>
                      )}
                    </div>
                    <Switch id="sms" checked={sms} onChange={setSms} labelledBy="sms-l" describedBy="sms-d" />
                  </div>
                  <div className="switch-row">
                    <div className="text">
                      <strong id="dig-l">Daily digest</strong>
                      <span id="dig-d">One email a day with prices, news sentiment, an AI summary and top headlines.</span>
                    </div>
                    <Switch id="dig" checked={digest} onChange={setDigest} labelledBy="dig-l" describedBy="dig-d" />
                  </div>
                </div>
                {serverError && (
                  <p className="form-error" role="alert">
                    {serverError}
                  </p>
                )}
                <div className="set-actions">
                  <button type="submit" className="btn btn-primary" disabled={!dirty || saving}>
                    {saving ? "Saving" : "Save changes"}
                  </button>
                  {saved && (
                    <span className="saved-note" role="status">
                      <Check size={14} weight="bold" aria-hidden /> Saved
                    </span>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </form>

        <section className="set-section" aria-labelledby="s-digest">
          <header>
            <h2 id="s-digest">Digest</h2>
            <p>Get today's digest now instead of waiting for the scheduled run.</p>
          </header>
          <div className="set-body">
            <div className="set-actions">
              <button className="btn btn-secondary" onClick={sendDigest} disabled={sending}>
                <EnvelopeSimple size={16} aria-hidden /> {sending ? "Sending" : "Send digest now"}
              </button>
            </div>
          </div>
        </section>

        <section className="set-section" aria-labelledby="s-look">
          <header>
            <h2 id="s-look">Appearance</h2>
            <p>Saved on this device.</p>
          </header>
          <div className="set-body">
            <div className="seg sans" role="radiogroup" aria-labelledby="s-look">
              {(["dark", "light", "system"] as const).map((t) => (
                <button key={t} role="radio" aria-checked={theme === t} onClick={() => pickTheme(t)}>
                  {t === "dark" ? "Dark" : t === "light" ? "Light" : "System"}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
