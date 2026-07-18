import type { ResolvedMemberState } from "./types.js";

/** Displays the local verifier's accepted conclusion separately from raw replicated records. */
export function ResolvedState({ state }: { state: ResolvedMemberState | null }) {
  if (state?.state === "rejected") return <section className="records-state records-state--rejected" aria-labelledby="accepted-state-heading"><h2 id="accepted-state-heading">Locally accepted state</h2><p className="error-message" role="alert">Raw records are present, but this device did not accept them: {state.reason}</p></section>;
  if (state?.state === "unavailable") return <section className="records-state" aria-labelledby="accepted-state-heading"><h2 id="accepted-state-heading">Locally accepted state</h2><p className="empty-state">Verified shared state is unavailable: {state.reason}</p></section>;
  if (state?.state !== "ready") return <section className="records-state" aria-labelledby="accepted-state-heading"><h2 id="accepted-state-heading">Locally accepted state</h2><p className="empty-state">Verifying local member records…</p></section>;

  return (
    <section className="records-state" aria-labelledby="accepted-state-heading">
      <div className="records-section-heading">
        <div>
          <p className="kicker">Verified on this device</p>
          <h2 id="accepted-state-heading">Locally accepted state</h2>
        </div>
      </div>
      <p className="muted">These are the records this device could verify from the replicated feed. They are distinct from the raw feed history below.</p>
      <dl className="records-state__summary">
        <div><dt>Listings</dt><dd>{state.publishedListings.length}</dd></div>
        <div><dt>Awaiting acceptance</dt><dd>{state.proposedProposals.length}</dd></div>
        <div><dt>Accepted exchanges</dt><dd>{state.acceptedProposals.length}</dd></div>
        <div><dt>Transfers</dt><dd>{state.transfers.length}</dd></div>
      </dl>
      <ol className="accepted-listings">
        {state.publishedListings.map((listing) => (
          <li key={listing.id}>
            <strong>{listing.title}</strong>
            <span>{listing.kind} · {listing.minutes} minutes</span>
            <code>{listing.memberId}</code>
          </li>
        ))}
      </ol>
    </section>
  );
}
