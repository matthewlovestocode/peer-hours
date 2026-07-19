import { useState } from "react";
import type { PendingProposal } from "./types.js";

/** Renders pending proposals and lets only the non-creator locally countersign one. */
export function PendingProposalList({ proposals, memberId, onComplete }: {
  proposals: readonly PendingProposal[];
  memberId: string;
  onComplete: () => Promise<void>;
}) {
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Countersigns a verified proposal through the main-process boundary, then refreshes verified state. */
  const accept = async (proposalId: string) => {
    setAcceptingId(proposalId);
    setError(null);

    try {
      await window.peerHours.acceptProposal(proposalId);
      await onComplete();
    } catch (reason) {
      setError(actionErrorMessage(reason, "The proposal could not be accepted. It may no longer be valid."));
    } finally {
      setAcceptingId(null);
    }
  };

  if (!proposals.length) {
    return <p className="empty-state">No proposals are waiting for acceptance.</p>;
  }

  return (
    <section className="proposal-queue" aria-labelledby="pending-proposals-heading">
      <div className="records-section-heading">
        <div>
          <p className="kicker">Awaiting confirmation</p>
          <h2 id="pending-proposals-heading">Pending proposals</h2>
        </div>
        <span className="count-badge" aria-label={`${proposals.length} pending proposals`}>{proposals.length}</span>
      </div>
      <p className="muted">A proposal is not settled until its other participant accepts the exact terms.</p>
      <ol className="proposal-list">
        {proposals.map((proposal) => {
          const canAccept = proposal.creatorMemberId !== memberId;
          const isAccepting = acceptingId === proposal.id;
          return (
            <li key={proposal.id} className="proposal-card">
              <div>
                <strong>{proposal.minutes} minutes</strong>
                <span>Provider: <code>{proposal.providerMemberId}</code></span>
                <span>Receiver: <code>{proposal.receiverMemberId}</code></span>
              </div>
              {canAccept ? (
                <button type="button" disabled={acceptingId !== null} onClick={() => void accept(proposal.id)}>
                  {isAccepting ? "Accepting proposal…" : "Accept proposal"}
                </button>
              ) : (
                <p className="proposal-card__status">Waiting for the other participant to accept.</p>
              )}
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
