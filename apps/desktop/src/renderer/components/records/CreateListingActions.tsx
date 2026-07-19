/** Provides dashboard entry points for the distinct offer and request publishing flows. */
export function CreateListingActions({ onCreateOffer, onCreateRequest }: { onCreateOffer: () => void; onCreateRequest: () => void }) {
  return (
    <section className="create-listing-actions" aria-labelledby="create-listing-actions-heading">
      <div>
        <p className="kicker">Share with your community</p>
        <h2 id="create-listing-actions-heading">What would you like to do?</h2>
        <p className="muted">Create one clear listing, then review exactly what community members will see before you publish it.</p>
      </div>
      <div className="create-listing-actions__choices">
        <button type="button" onClick={onCreateOffer}><strong>Offer your time</strong><span>Share a skill, service, or kind of help you can give.</span></button>
        <button type="button" onClick={onCreateRequest}><strong>Ask for help</strong><span>Describe the support you need and any useful context.</span></button>
      </div>
    </section>
  );
}
