import { ListingDraftForm } from "../components/records/ListingDraftForm.js";

/** Hosts the member-specific request creation and review flow. */
export function RequestCreationPage({ onCancel, onPublished }: { onCancel: () => void; onPublished: () => void }) {
  return <section className="listing-creation-page"><ListingDraftForm kind="request" onCancel={onCancel} onPublished={onPublished} /></section>;
}
