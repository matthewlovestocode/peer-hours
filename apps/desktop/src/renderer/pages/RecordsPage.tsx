import { useCallback, useEffect, useRef, useState } from "react";
import { Panel } from "../components/Primitive.js";
import { ListingComposer } from "../components/records/ListingComposer.js";
import { PendingProposalList } from "../components/records/PendingProposalList.js";
import { ProposalComposer } from "../components/records/ProposalComposer.js";
import { RawRecordList } from "../components/records/RawRecordList.js";
import { ResolvedState } from "../components/records/ResolvedState.js";
import { RecordsWorkspaceStatus, type RecordsWorkspacePhase } from "../components/records/RecordsWorkspaceStatus.js";
import { SettlementAcknowledgementList } from "../components/records/SettlementAcknowledgementList.js";
import { readRecordsWorkspace, recordsWorkspaceErrorMessage, type RecordsWorkspaceSnapshot } from "../components/records/recordsWorkspace.js";

/** Presents raw member-feed history separately from the locally accepted state derived from it. */
export function RecordsPage() {
  const [snapshot, setSnapshot] = useState<RecordsWorkspaceSnapshot | null>(null);
  const [phase, setPhase] = useState<RecordsWorkspacePhase>("loading");
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [creatingIdentity, setCreatingIdentity] = useState(false);
  const requestVersion = useRef(0);

  /** Refreshes every member-facing view from one consistent local snapshot and retains usable state if it fails. */
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    setPhase((current) => current === "loading" ? "loading" : "refreshing");
    setRefreshError(null);
    try {
      const nextSnapshot = await readRecordsWorkspace(window.peerHours);
      if (version !== requestVersion.current) return;
      setSnapshot(nextSnapshot);
      setPhase("ready");
    } catch (reason) {
      if (version !== requestVersion.current) return;
      setRefreshError(recordsWorkspaceErrorMessage(reason));
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => { requestVersion.current += 1; };
  }, [refresh]);

  /** Creates and announces a local identity, then refreshes every dependent records view. */
  const createIdentity = async () => {
    try {
      setCreatingIdentity(true);
      await window.peerHours.createAndAnnounceMemberIdentity();
      await refresh();
    } catch (reason) {
      setRefreshError(recordsWorkspaceErrorMessage(reason));
      setPhase("error");
    } finally {
      setCreatingIdentity(false);
    }
  };

  const identity = snapshot?.identity;
  const resolved = snapshot?.resolved ?? null;

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
        <RecordsWorkspaceStatus phase={phase} hasSnapshot={snapshot !== null} error={refreshError} onRefresh={() => void refresh()} />
        {snapshot && <ResolvedState state={resolved} />}
        {identity?.state === "not-created" && <button disabled={creatingIdentity} onClick={() => void createIdentity()}>{creatingIdentity ? "Creating identity…" : "Create identity and announce this feed"}</button>}
        {identity?.state === "ready" && (
          <>
            <p className="empty-state">Self-owned identity ready: <code>{identity.memberId}</code></p>
            <ListingComposer onComplete={refresh} />
            {resolved?.state === "ready" && <ProposalComposer listings={resolved.publishedListings} onComplete={refresh} />}
            {resolved?.state === "ready" && identity.memberId && <PendingProposalList proposals={resolved.proposedProposals} memberId={identity.memberId} onComplete={refresh} />}
            {resolved?.state === "ready" && identity.memberId && <SettlementAcknowledgementList proposals={resolved.acceptedProposals} confirmations={resolved.settlementConfirmations} memberId={identity.memberId} onComplete={refresh} />}
          </>
        )}
        {identity?.state === "unavailable" && <p className="error-message">Secure operating-system key storage is unavailable.</p>}
        {snapshot && <RawRecordList records={snapshot.records} />}
      </Panel>
    </section>
  );
}
