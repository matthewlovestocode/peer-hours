import { useEffect, useState } from "react";
import { Panel } from "../components/Primitive.js";

/** Presents locally owned immutable member-feed records without granting the renderer write access. */
export function RecordsPage() {
  const [records, setRecords] = useState<readonly unknown[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [identity, setIdentity] = useState<{ state: "unavailable" | "not-created" | "ready"; memberId: string | null; communityId: string | null } | null>(null);

  useEffect(() => {
    void Promise.all([loadMemberRecords(), window.peerHours.getMemberIdentityStatus()]).then(([next, nextIdentity]) => { setRecords(next); setIdentity(nextIdentity); setState("ready"); }).catch(() => setState("error"));
  }, []);

  return <section className="records-page"><header className="workspace-header"><div><p className="eyebrow">My records</p><h1>Your local history</h1><p className="muted">Immutable records stored in your member feed. This view is read-only and does not claim a balance or settlement state.</p></div></header><Panel>{identity?.state === "not-created" && <button onClick={() => void createIdentity(setIdentity, setRecords, setState)}>Create identity and announce this feed</button>}{identity?.state === "ready" && <p className="empty-state">Self-owned identity ready: <code>{identity.memberId}</code></p>}{identity?.state === "unavailable" && <p className="error-message">Secure operating-system key storage is unavailable.</p>}{state === "loading" && <p className="empty-state">Opening your local member feed…</p>}{state === "error" && <p className="error-message">Your local member records could not be read.</p>}{state === "ready" && (records.length === 0 ? <p className="empty-state">No records have been added to this member feed yet.</p> : <ol className="record-list">{records.map((record, index) => <li key={index}><span className="kicker">Record {index + 1}</span><pre>{formatRecord(record)}</pre></li>)}</ol>)}</Panel></section>;
}

/** Creates and announces a self-owned identity only after the member explicitly chooses the action. */
async function createIdentity(setIdentity: (value: { state: "unavailable" | "not-created" | "ready"; memberId: string | null; communityId: string | null }) => void, setRecords: (value: readonly unknown[]) => void, setState: (value: "loading" | "ready" | "error") => void): Promise<void> {
  try { setState("loading"); setIdentity(await window.peerHours.createAndAnnounceMemberIdentity()); setRecords(await loadMemberRecords()); setState("ready"); } catch { setState("error"); }
}

/** Reads member-feed contents through the narrow preload bridge. */
async function loadMemberRecords(): Promise<readonly unknown[]> {
  return window.peerHours.getMemberRecords();
}

/** Formats a JSON-compatible immutable record for transparent local inspection. */
function formatRecord(record: unknown): string {
  return JSON.stringify(record, null, 2);
}
