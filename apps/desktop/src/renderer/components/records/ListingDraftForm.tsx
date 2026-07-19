import { useState, type FormEvent } from "react";
import { RichTextEditor } from "./RichTextEditor.js";

type ListingDraftKind = "offer" | "request";

type ListingDraftFormProps = {
  kind: ListingDraftKind;
  onCancel: () => void;
  onPublished: () => void;
};

/** Guides one member through drafting, reviewing, and publishing a single offer or request. */
export function ListingDraftForm({ kind, onCancel, onPublished }: ListingDraftFormProps) {
  const isOffer = kind === "offer";
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [minutes, setMinutes] = useState(isOffer ? "60" : "30");
  const [reviewing, setReviewing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Moves a complete draft into a member-visible review without creating a record. */
  const review = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!description.trim()) return;
    setReviewing(true);
  };

  /** Signs and publishes only the listing that the member has just reviewed. */
  const publish = async () => {
    setPublishing(true);
    setError(null);
    try {
      await window.peerHours.publishListing({ kind, title, description, minutes: Number(minutes) });
      onPublished();
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : "Your listing could not be published.");
    } finally {
      setPublishing(false);
    }
  };

  const label = isOffer ? "Offer your time" : "Ask for help";
  const titlePlaceholder = isOffer ? "e.g. Help with garden planting" : "e.g. Help moving a bookcase";
  const descriptionPrompt = isOffer ? "What can you help with? Include useful limits, preferred timing, and anything people should know before responding." : "What help do you need? Include useful context, timing, and any access or safety needs.";

  if (reviewing) {
    return (
      <section className="listing-review" aria-labelledby="listing-review-heading">
        <p className="kicker">Review before publishing</p>
        <h1 id="listing-review-heading">{label}</h1>
        <p className="muted">This is how your listing will appear to community members.</p>
        <article className="listing-review__card">
          <span>{isOffer ? "Offering" : "Requesting"} · {minutes} minutes</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </article>
        <div className="listing-review__actions">
          <button className="secondary-button" type="button" disabled={publishing} onClick={() => setReviewing(false)}>Edit listing</button>
          <button type="button" disabled={publishing} onClick={() => void publish()}>{publishing ? "Publishing…" : `Publish ${isOffer ? "offer" : "request"}`}</button>
        </div>
        {error && <p className="error-message" role="alert">{error}</p>}
      </section>
    );
  }

  return (
    <form className="listing-draft-form" onSubmit={review}>
      <p className="eyebrow">{isOffer ? "Create an offer" : "Create a request"}</p>
      <h1>{label}</h1>
      <p className="muted">{descriptionPrompt}</p>
      <label>Short title<input required maxLength={500} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={titlePlaceholder} /></label>
      <label>Description<RichTextEditor value={description} disabled={false} onChange={setDescription} /></label>
      <label>Time<input required min="1" type="number" value={minutes} onChange={(event) => setMinutes(event.target.value)} /><span>minutes</span></label>
      <div className="listing-draft-form__actions"><button className="secondary-button" type="button" onClick={onCancel}>Cancel</button><button type="submit">Review listing</button></div>
    </form>
  );
}
