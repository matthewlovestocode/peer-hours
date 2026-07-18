import { useEffect, useState } from "react";
import { Panel } from "../components/Primitive.js";
import { ListingComposer } from "../components/records/ListingComposer.js";
import { ProposalComposer } from "../components/records/ProposalComposer.js";
import { RawRecordList } from "../components/records/RawRecordList.js";
import { ResolvedState } from "../components/records/ResolvedState.js";

type Identity = { state: "unavailable" | "not-created" | "ready"; memberId: string | null; communityId: string | null };
type Resolved = Awaited<ReturnType<typeof window.peerHours.getResolvedMemberState>>;

/** Presents raw member-feed history separately from the locally accepted state derived from it. */
export function RecordsPage() {
  const [records, setRecords] = useState<readonly unknown[]>([]);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  /** Reads the independently stored raw records, identity status, and resolved local state together. */
  const refresh = async () => {
    const [nextRecords, nextIdentity, nextResolved] = await Promise.all([
      window.peerHours.getMemberRecords(),
      window.peerHours.getMemberIdentityStatus(),
      window.peerHours.getResolvedMemberState(),
    ]);
    setRecords(nextRecords);
    setIdentity(nextIdentity);
    setResolved(nextResolved);
  };

  useEffect(() => {
    void refresh().then(() => setState("ready")).catch(() => setState("error"));
  }, []);

  /** Creates and announces a local identity before exposing member-owned record actions. */
  const createIdentity = async () => {
    try {
      setState("loading");
      await window.peerHours.createAndAnnounceMemberIdentity();
      await refresh();
      setState("ready");
    } catch {
      setState("error");
    }
  };

  return (
    <section className="records-page">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">My records</p>
          <h1>Your local history</h1>
          <p className="muted">Raw replicated records and accepted local state are shown separately.</p>
        </div>
      </header>
      <Panel>
        <ResolvedState state={resolved} />
        {identity?.state === "not-created" && <button onClick={() => void createIdentity()}>Create identity and announce this feed</button>}
        {identity?.state === "ready" && (
          <>
            <p className="empty-state">Self-owned identity ready: <code>{identity.memberId}</code></p>
            <ListingComposer onComplete={refresh} />
            {resolved?.state === "ready" && <ProposalComposer listings={resolved.publishedListings} onComplete={refresh} />}
          </>
        )}
        {identity?.state === "unavailable" && <p className="error-message">Secure operating-system key storage is unavailable.</p>}
        {state === "loading" && <p className="empty-state">Opening your local member feed…</p>}
        {state === "error" && <p className="error-message">Your local member records could not be read.</p>}
        {state === "ready" && <RawRecordList records={records} />}
      </Panel>
    </section>
  );
}
