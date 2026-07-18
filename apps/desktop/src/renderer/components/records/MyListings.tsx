import { useState } from "react";
import type { ResolvedListing } from "./types.js";

/** Presents only the current member's active listings and safely requests an immutable withdrawal. */
export function MyListings({ listings, memberId, onComplete }: { listings: readonly ResolvedListing[]; memberId: string; onComplete: () => Promise<void> }) {
  const [closingId, setClosingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mine = listings.filter((listing) => listing.memberId === memberId);

  /** Requests that Electron verify ownership and sign the listing-closure record. */
  const closeListing = async (listingId: string) => {
    setClosingId(listingId);
    setError(null);
    try {
      await window.peerHours.closeListing(listingId);
      await onComplete();
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : "The listing could not be closed.");
    } finally {
      setClosingId(null);
    }
  };

  return (
    <section className="my-listings" aria-labelledby="my-listings-heading">
      <div className="records-section-heading">
        <div>
          <p className="kicker">Member-owned</p>
          <h2 id="my-listings-heading">Your active listings</h2>
        </div>
      </div>
      <p className="muted">Closing a listing publishes an immutable, owner-signed withdrawal. It prevents new proposals after peers receive it; it does not erase history or change existing exchanges.</p>
      {mine.length === 0 ? (
        <p className="empty-state">You have no active listings.</p>
      ) : (
        <ul className="accepted-listings">
          {mine.map((listing) => (
            <li key={listing.id}>
              <div>
                <strong>{listing.title}</strong>
                <span>{listing.kind} · {listing.minutes} minutes</span>
              </div>
              <button type="button" disabled={closingId !== null} onClick={() => void closeListing(listing.id)}>
                {closingId === listing.id ? "Signing withdrawal…" : "Close listing"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error-message" role="alert">{error}</p>}
    </section>
  );
}
