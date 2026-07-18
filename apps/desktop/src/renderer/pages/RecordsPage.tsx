import { useEffect, useState, type FormEvent } from "react";
import { Panel } from "../components/Primitive.js";

/** Presents locally owned immutable member-feed records without granting the renderer write access. */
export function RecordsPage() {
  const [records, setRecords] = useState<readonly unknown[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [identity, setIdentity] = useState<{ state: "unavailable" | "not-created" | "ready"; memberId: string | null; communityId: string | null } | null>(null);
  const [resolved, setResolved] = useState<Awaited<ReturnType<typeof window.peerHours.getResolvedMemberState>> | null>(null);

  useEffect(() => {
    void Promise.all([loadMemberRecords(), window.peerHours.getMemberIdentityStatus(), window.peerHours.getResolvedMemberState()]).then(([next, nextIdentity, nextResolved]) => { setRecords(next); setIdentity(nextIdentity); setResolved(nextResolved); setState("ready"); }).catch(() => setState("error"));
  }, []);

  return <section className="records-page"><header className="workspace-header"><div><p className="eyebrow">My records</p><h1>Your local history</h1><p className="muted">Raw replicated records and accepted local state are shown separately.</p></div></header><Panel>{resolved?.state === "ready" && <p className="empty-state">Locally accepted: {resolved.publishedListings.length} listings, {resolved.acceptedProposals.length} accepted proposals, {resolved.transfers.length} settlements.</p>}{resolved?.state === "rejected" && <p className="error-message">Raw records are present but not accepted locally: {resolved.reason}</p>}{identity?.state === "not-created" && <button onClick={() => void createIdentity(setIdentity, setRecords, setResolved, setState)}>Create identity and announce this feed</button>}{identity?.state === "ready" && <><p className="empty-state">Self-owned identity ready: <code>{identity.memberId}</code></p><ListingComposer onPublished={async () => { setRecords(await loadMemberRecords()); setResolved(await window.peerHours.getResolvedMemberState()); }} /></>}{identity?.state === "unavailable" && <p className="error-message">Secure operating-system key storage is unavailable.</p>}{state === "loading" && <p className="empty-state">Opening your local member feed…</p>}{state === "error" && <p className="error-message">Your local member records could not be read.</p>}{state === "ready" && (records.length === 0 ? <p className="empty-state">No records have been added to this member feed yet.</p> : <ol className="record-list">{records.map((record, index) => <li key={index}><span className="kicker">Raw record {index + 1}</span><pre>{formatRecord(record)}</pre></li>)}</ol>)}</Panel></section>;
}

/** Collects a local draft and explicitly asks the main process to sign and publish it. */
function ListingComposer({ onPublished }: { onPublished: () => Promise<void> }) {
  const [kind, setKind] = useState<"offer" | "request">("offer");
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("60");
  const [state, setState] = useState<"idle" | "publishing" | "published" | "error">("idle");
  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try { setState("publishing"); await window.peerHours.publishListing({ kind, title, minutes: Number(minutes) }); await onPublished(); setTitle(""); setState("published"); } catch { setState("error"); }
  };
  return <form className="listing-composer" onSubmit={(event) => void publish(event)}><h2>Publish an offer or request</h2><p className="muted">This signs a new immutable record with your local root identity. It may replicate when compatible peers are available.</p><label>Type<select value={kind} onChange={(event) => setKind(event.target.value as "offer" | "request")}><option value="offer">Offer</option><option value="request">Request</option></select></label><label>Title<input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Garden help" /></label><label>Minutes<input required min="1" step="1" type="number" value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label><button disabled={state === "publishing"} type="submit">{state === "publishing" ? "Publishing…" : "Sign and publish"}</button>{state === "published" && <p className="empty-state">Published to your local member feed.</p>}{state === "error" && <p className="error-message">The listing could not be published. Check your identity and draft details.</p>}</form>;
}

/** Creates and announces a self-owned identity only after the member explicitly chooses the action. */
async function createIdentity(setIdentity: (value: { state: "unavailable" | "not-created" | "ready"; memberId: string | null; communityId: string | null }) => void, setRecords: (value: readonly unknown[]) => void, setResolved: (value: Awaited<ReturnType<typeof window.peerHours.getResolvedMemberState>>) => void, setState: (value: "loading" | "ready" | "error") => void): Promise<void> {
  try { setState("loading"); setIdentity(await window.peerHours.createAndAnnounceMemberIdentity()); const [records, resolved] = await Promise.all([loadMemberRecords(), window.peerHours.getResolvedMemberState()]); setRecords(records); setResolved(resolved); setState("ready"); } catch { setState("error"); }
}

/** Reads member-feed contents through the narrow preload bridge. */
async function loadMemberRecords(): Promise<readonly unknown[]> {
  return window.peerHours.getMemberRecords();
}

/** Formats a JSON-compatible immutable record for transparent local inspection. */
function formatRecord(record: unknown): string {
  return JSON.stringify(record, null, 2);
}
