import { useState, type FormEvent } from "react";
import type { ResolvedListing } from "./types.js";

/** Creates a pending proposal from two previously accepted public listings. */
export function ProposalComposer({ listings, onComplete }: { listings: readonly ResolvedListing[]; onComplete: () => Promise<void> }) {
  const offers = listings.filter((listing) => listing.kind === "offer");
  const requests = listings.filter((listing) => listing.kind === "request");
  const [offerId, setOfferId] = useState(offers[0]?.id ?? "");
  const [requestId, setRequestId] = useState(requests[0]?.id ?? "");
  const [minutes, setMinutes] = useState("60");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!offers.length || !requests.length) return null;

  /** Signs a proposal with the currently selected offer and request, then refreshes its parent. */
  const createProposal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await window.peerHours.createProposal({ offerId, requestId, minutes: Number(minutes) });
      await onComplete();
    } catch (reason) {
      setError(actionErrorMessage(reason, "The proposal could not be created."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      className="listing-composer"
      onSubmit={(event) => void createProposal(event)}
    >
      <h2>Create a proposal</h2>
      <p className="muted">A proposal awaits explicit acceptance; it is not a settlement.</p>
      <label>
        Offer
        <select disabled={submitting} value={offerId} onChange={(event) => setOfferId(event.target.value)}>
        {offers.map((item) => (
          <option key={item.id} value={item.id}>{item.title}</option>
        ))}
        </select>
      </label>
      <label>
        Request
        <select disabled={submitting} value={requestId} onChange={(event) => setRequestId(event.target.value)}>
        {requests.map((item) => (
          <option key={item.id} value={item.id}>{item.title}</option>
        ))}
        </select>
      </label>
      <label>
        Minutes
        <input disabled={submitting} min="1" required type="number" value={minutes} onChange={(event) => setMinutes(event.target.value)} />
      </label>
      <button disabled={submitting}>{submitting ? "Signing proposal…" : "Sign and propose"}</button>
      {error && <p className="error-message" role="alert">{error}</p>}
    </form>
  );
}

/** Converts an unknown IPC failure into a concise, safe message for the member. */
function actionErrorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}
