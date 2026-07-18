import { useState } from "react";
import type { AcceptedProposal, SettlementConfirmation } from "./types.js";
import { settlementLifecycleMessage, settlementProgress } from "./settlementPresentation.js";

/**
 * Presents eligible accepted exchanges and publishes only the local participant's signed
 * completion acknowledgement, never a purported counterparty attestation or finality claim.
 */
export function SettlementAcknowledgementList({ proposals, confirmations, settledProposalIds, memberId, onComplete }: {
  proposals: readonly AcceptedProposal[];
  confirmations: readonly SettlementConfirmation[];
  settledProposalIds: readonly string[];
  memberId: string;
  onComplete: () => Promise<void>;
}) {
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eligible = proposals.filter((proposal) => proposal.providerMemberId === memberId || proposal.receiverMemberId === memberId);
  const confirmationByProposalId = new Map(confirmations.map((confirmation) => [confirmation.proposalId, confirmation]));

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
          const progress = settlementProgress(proposal, confirmation, memberId, settledProposalIds);
          const isAcknowledging = acknowledgingId === proposal.id;
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
