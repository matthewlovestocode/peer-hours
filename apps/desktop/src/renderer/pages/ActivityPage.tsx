import { useState } from "react";
import { Panel } from "../components/Primitive.js";
import { ActivityAccessNotice } from "../components/records/ActivityAccessNotice.js";
import { CreateListingActions } from "../components/records/CreateListingActions.js";
import { MyListings } from "../components/records/MyListings.js";
import { PendingProposalList } from "../components/records/PendingProposalList.js";
import { ProposalComposer } from "../components/records/ProposalComposer.js";
import { RecordsTrustNotice } from "../components/records/RecordsTrustNotice.js";
import { RecordsWorkspaceStatus } from "../components/records/RecordsWorkspaceStatus.js";
import { SettlementAcknowledgementList } from "../components/records/SettlementAcknowledgementList.js";
import { useRecordsWorkspace } from "../components/records/useRecordsWorkspace.js";
import { WorkspaceHeader } from "../components/WorkspaceHeader.js";

/** Presents the offers, requests, and exchange actions that a ready member can take. */
export function ActivityPage({ onOpenWelcome, onCreateOffer, onCreateRequest }: { onOpenWelcome: () => void; onCreateOffer: () => void; onCreateRequest: () => void }) {
  const { snapshot, phase, refreshError, refresh } = useRecordsWorkspace();
  const [refreshingAction, setRefreshingAction] = useState(false);
  const identity = snapshot?.identity;
  const resolved = snapshot?.resolved ?? null;
  const readyActivity = identity?.state === "ready" && identity.memberId !== null && resolved?.state === "ready"
    ? { memberId: identity.memberId, resolved }
    : null;

  /** Refreshes after a signed member action without exposing transport details to feature components. */
  const refreshAfterAction = async () => {
    setRefreshingAction(true);
    try {
      await refresh();
    } finally {
      setRefreshingAction(false);
    }
  };

  return (
    <section className="activity-page">
      <WorkspaceHeader eyebrow="My activity" title="Share and receive help" description="Create offers and requests, agree on an exchange, and confirm it together." />
      <Panel>
        <RecordsWorkspaceStatus phase={phase} hasSnapshot={snapshot !== null} error={refreshError} onRefresh={() => void refresh()} />
        {identity && identity.state !== "ready" ? <ActivityAccessNotice onOpenWelcome={onOpenWelcome} /> : <>
          <RecordsTrustNotice resolved={resolved} rawRecordCount={snapshot?.records.length ?? 0} />
          {readyActivity && <>
            <CreateListingActions onCreateOffer={onCreateOffer} onCreateRequest={onCreateRequest} />
            <MyListings listings={readyActivity.resolved.publishedListings} memberId={readyActivity.memberId} onComplete={refreshAfterAction} />
            <ProposalComposer listings={readyActivity.resolved.publishedListings} onComplete={refreshAfterAction} />
            <PendingProposalList proposals={readyActivity.resolved.proposedProposals} memberId={readyActivity.memberId} onComplete={refreshAfterAction} />
            <SettlementAcknowledgementList proposals={readyActivity.resolved.acceptedProposals} confirmations={readyActivity.resolved.settlementConfirmations} settlementAttestations={readyActivity.resolved.settlementAttestations} settledProposalIds={readyActivity.resolved.settledProposalIds} settlementDurability={readyActivity.resolved.settlementDurability} memberId={readyActivity.memberId} onComplete={refreshAfterAction} />
          </>}
          {refreshingAction && <p className="empty-state" role="status">Updating your activity…</p>}
        </>}
      </Panel>
    </section>
  );
}
