import { ListingDraftForm } from "../components/records/ListingDraftForm.js";

/** Hosts the member-specific offer creation and review flow. */
export function OfferCreationPage({ onCancel, onPublished }: { onCancel: () => void; onPublished: () => void }) {
  return <section className="listing-creation-page"><ListingDraftForm kind="offer" onCancel={onCancel} onPublished={onPublished} /></section>;
}
