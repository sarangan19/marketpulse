// MOCK UI — throwaway.
import { type FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import type { Profile } from "../api/types";

export default function Settings() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api.getMe().then((p) => {
      setProfile(p);
      setPhone(p.phone ?? "");
    });
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    try {
      const p = await api.updateMe({
        ...(phone ? { phone } : {}),
        smsOptIn: profile.smsOptIn,
        digestOptIn: profile.digestOptIn,
      });
      setProfile(p);
      setMsg("Saved");
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  if (!profile) return <p>Loading…</p>;
  return (
    <form onSubmit={save}>
      <h3>Settings</h3>
      <p>Email: {profile.email}</p>
      <p>
        Phone (E.164): <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+919876543210" />
      </p>
      <p>
        <label>
          <input
            type="checkbox"
            checked={profile.smsOptIn}
            onChange={(e) => setProfile({ ...profile, smsOptIn: e.target.checked })}
          />{" "}
          SMS alerts
        </label>
      </p>
      <p>
        <label>
          <input
            type="checkbox"
            checked={profile.digestOptIn}
            onChange={(e) => setProfile({ ...profile, digestOptIn: e.target.checked })}
          />{" "}
          Daily digest email
        </label>
      </p>
      <button type="submit">Save</button> {msg}
    </form>
  );
}
