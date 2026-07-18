import { useState } from "react";
import type { AcceptedProposal, SettlementAttestationState, SettlementConfirmation } from "./types.js";
import { settlementLifecycleMessage, settlementProgress } from "./settlementPresentation.js";

/**
 * Presents eligible accepted exchanges through acknowledgement, attestation, and local-admission
 * stages without letting the renderer access signing material or claim network finality.
 */
export function SettlementAcknowledgementList({ proposals, confirmations, settlementAttestations, settledProposalIds, memberId, onComplete }: {
  proposals: readonly AcceptedProposal[];
  confirmations: readonly SettlementConfirmation[];
  settlementAttestations: readonly SettlementAttestationState[];
  settledProposalIds: readonly string[];
  memberId: string;
  onComplete: () => Promise<void>;
}) {
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eligible = proposals.filter((proposal) => proposal.providerMemberId === memberId || proposal.receiverMemberId === memberId);
  const confirmationByProposalId = new Map(confirmations.map((confirmation) => [confirmation.proposalId, confirmation]));
  const attestationsByProposalId = new Map(settlementAttestations.map((state) => [state.proposalId, state]));

  /** Signs one immutable acknowledgement through Electron and refreshes the verified state. */
  const acknowledge = async (proposalId: string) => {
    setAcknowledgingId(proposalId);
    setError(null);
    try {
      await window.peerHours.acknowledgeSettlement(proposalId);
      await onComplete();
    } catch (reason) {
      setError(actionErrorMessage(reason, "The settlement acknowledgement could not be published."));
    } finally {
      setAcknowledgingId(null);
    }
  };

  /** Requests one main-process-only settlement advancement, then refreshes locally verified state. */
  const advanceSettlement = async (proposalId: string) => {
    setAdvancingId(proposalId);
    setError(null);
    try {
      await window.peerHours.advanceSettlement(proposalId);
      await onComplete();
    } catch (reason) {
      setError(actionErrorMessage(reason, "The settlement could not be advanced."));
    } finally {
      setAdvancingId(null);
    }
  };

  if (!eligible.length) return <p className="empty-state">No locally verified accepted exchanges are ready for completion acknowledgement.</p>;

  return (
    <section className="proposal-queue" aria-labelledby="settlement-acknowledgements-heading">
      <div className="records-section-heading">
        <div>
          <p className="kicker">Completion confirmation</p>
          <h2 id="settlement-acknowledgements-heading">Accepted exchanges</h2>
        </div>
        <span className="count-badge" aria-label={`${eligible.length} accepted exchanges`}>{eligible.length}</span>
      </div>
      <p className="muted">Your acknowledgement is a signed statement of completion. It never signs for the other participant or itself establishes a transfer, balance, replication, or network finality.</p>
      <ol className="proposal-list">
        {eligible.map((proposal) => {
          const confirmation = confirmationByProposalId.get(proposal.id);
          const progress = settlementProgress(proposal, confirmation, attestationsByProposalId.get(proposal.id), memberId, settledProposalIds);
          const isAcknowledging = acknowledgingId === proposal.id;
          const isAdvancing = advancingId === proposal.id;
          return (
            <li key={proposal.id} className="proposal-card">
              <div>
                <strong>{proposal.minutes} minutes</strong>
                <span>Provider: <code>{proposal.providerMemberId}</code></span>
                <span>Receiver: <code>{proposal.receiverMemberId}</code></span>
              </div>
              <div className="settlement-action">
                <p className="proposal-card__status">{settlementLifecycleMessage(progress.lifecycle)}</p>
                {progress.lifecycle === "ready-to-acknowledge" && <button type="button" disabled={acknowledgingId !== null} onClick={() => void acknowledge(proposal.id)}>{isAcknowledging ? "Signing acknowledgement…" : "Acknowledge completion"}</button>}
                {progress.lifecycle === "ready-to-attest" && <button type="button" disabled={advancingId !== null} onClick={() => void advanceSettlement(proposal.id)}>{isAdvancing ? "Signing attestation…" : "Sign transfer attestation"}</button>}
                {progress.lifecycle === "ready-to-publish" && <button type="button" disabled={advancingId !== null} onClick={() => void advanceSettlement(proposal.id)}>{isAdvancing ? "Publishing transfer…" : "Publish locally admitted transfer"}</button>}
              </div>
            </li>
          );
        })}
      </ol>
      {error && <p className="error-message" role="alert">{error}</p>}
    </section>
  );
}

/** Converts an unknown IPC failure into a concise, safe message for the member. */
function actionErrorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}
