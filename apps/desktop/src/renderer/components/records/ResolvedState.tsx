type Resolved = Awaited<ReturnType<typeof window.peerHours.getResolvedMemberState>>;

/** Displays the local verifier's accepted conclusion separately from raw replicated records. */
export function ResolvedState({ state }: { state: Resolved | null }) {
  if (state?.state === "rejected") return <p className="error-message">Raw records are present but not accepted locally: {state.reason}</p>;
  if (state?.state !== "ready") return null;

  return (
    <>
      <p className="empty-state">
        Locally accepted: {state.publishedListings.length} listings, {state.proposedProposals.length} proposals, {state.acceptedProposals.length} accepted proposals, {state.transfers.length} settlements.
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
