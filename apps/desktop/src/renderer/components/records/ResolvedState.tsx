import type { ResolvedMemberState } from "./types.js";

/** Displays activity this device can use safely without presenting it as network-wide finality. */
export function ResolvedState({ state }: { state: ResolvedMemberState | null }) {
  if (state?.state === "rejected") return <section className="records-state records-state--rejected" aria-labelledby="accepted-state-heading"><h2 id="accepted-state-heading">Your activity</h2><p className="error-message" role="alert">Some signed activity could not be used safely: {state.reason}</p></section>;
  if (state?.state === "unavailable") return <section className="records-state" aria-labelledby="accepted-state-heading"><h2 id="accepted-state-heading">Your activity</h2><p className="empty-state">Your activity is unavailable right now: {state.reason}</p></section>;
  if (state?.state !== "ready") return <section className="records-state" aria-labelledby="accepted-state-heading"><h2 id="accepted-state-heading">Your activity</h2><p className="empty-state">Checking your activity…</p></section>;

  return (
    <section className="records-state" aria-labelledby="accepted-state-heading">
      <div className="records-section-heading">
        <div>
          <p className="kicker">Your activity</p>
          <h2 id="accepted-state-heading">What you can do now</h2>
        </div>
      </div>
      <p className="muted">These offers, requests, and exchanges passed this device’s checks. They are distinct from the signed history shown below.</p>
      <dl className="records-state__summary">
        <div><dt>Listings</dt><dd>{state.publishedListings.length}</dd></div>
        <div><dt>Awaiting acceptance</dt><dd>{state.proposedProposals.length}</dd></div>
        <div><dt>Accepted exchanges</dt><dd>{state.acceptedProposals.length}</dd></div>
        <div><dt>Recorded exchanges</dt><dd>{state.transferCount}</dd></div>
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
