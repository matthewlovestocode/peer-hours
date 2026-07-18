import { useState } from "react";

type Listing = { id: string; memberId: string; kind: string; title: string; minutes: number };

/** Creates a pending proposal from two previously accepted public listings. */
export function ProposalComposer({ listings, onComplete }: { listings: readonly Listing[]; onComplete: () => Promise<void> }) {
  const offers = listings.filter((listing) => listing.kind === "offer");
  const requests = listings.filter((listing) => listing.kind === "request");
  const [offerId, setOfferId] = useState(offers[0]?.id ?? "");
  const [requestId, setRequestId] = useState(requests[0]?.id ?? "");

  if (!offers.length || !requests.length) return null;

  /** Signs a proposal with the currently selected offer and request, then refreshes its parent. */
  const createProposal = () => {
    void window.peerHours.createProposal({ offerId, requestId, minutes: 60 }).then(onComplete);
  };

  return (
    <form
      className="listing-composer"
      onSubmit={(event) => {
        event.preventDefault();
        createProposal();
      }}
    >
      <h2>Create a proposal</h2>
      <p className="muted">A proposal awaits explicit acceptance; it is not a settlement.</p>
      <select value={offerId} onChange={(event) => setOfferId(event.target.value)}>
        {offers.map((item) => (
          <option key={item.id} value={item.id}>{item.title}</option>
        ))}
      </select>
      <select value={requestId} onChange={(event) => setRequestId(event.target.value)}>
        {requests.map((item) => (
          <option key={item.id} value={item.id}>{item.title}</option>
        ))}
      </select>
      <button>Sign and propose</button>
    </form>
  );
}
