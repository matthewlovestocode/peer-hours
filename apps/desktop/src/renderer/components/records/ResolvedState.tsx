import type { ResolvedMemberState } from "./types.js";

/** Displays the local verifier's accepted conclusion separately from raw replicated records. */
export function ResolvedState({ state }: { state: ResolvedMemberState | null }) {
  if (state?.state === "rejected") return <p className="error-message" role="alert">Raw records are present but not accepted locally: {state.reason}</p>;
  if (state?.state === "unavailable") return <p className="empty-state">Verified shared state is unavailable: {state.reason}</p>;
  if (state?.state !== "ready") return <p className="empty-state">Verifying local member records…</p>;

  return (
    <>
      <p className="empty-state">
        Locally accepted: {state.publishedListings.length} listings, {state.proposedProposals.length} pending proposals, {state.acceptedProposals.length} accepted proposals, {state.transfers.length} settlements.
      </p>
      <ol className="accepted-listings">
        {state.publishedListings.map((listing) => (
          <li key={listing.id}>
            <strong>{listing.title}</strong>
            <span>{listing.kind} · {listing.minutes} minutes</span>
            <code>{listing.memberId}</code>
          </li>
        ))}
      </ol>
    </>
  );
}
