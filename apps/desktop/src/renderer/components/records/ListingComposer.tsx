import { useState, type FormEvent } from "react";

/** Publishes a member-owned offer or request through the main-process signing boundary. */
export function ListingComposer({ onComplete }: { onComplete: () => Promise<void> }) {
  const [kind, setKind] = useState<"offer" | "request">("offer");
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("60");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Signs and publishes the entered listing before refreshing the parent workspace state. */
  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await window.peerHours.publishListing({ kind, title, minutes: Number(minutes) });
      setTitle("");
      await onComplete();
    } catch (reason) {
      setError(actionErrorMessage(reason, "The listing could not be published."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="listing-composer" onSubmit={(event) => void publish(event)}>
      <h2>Publish an offer or request</h2>
      <label>
        Type
        <select disabled={submitting} value={kind} onChange={(event) => setKind(event.target.value as "offer" | "request")}>
          <option value="offer">Offer</option>
          <option value="request">Request</option>
        </select>
      </label>
      <label>
        Title
        <input disabled={submitting} required value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        Minutes
        <input disabled={submitting} required min="1" type="number" value={minutes} onChange={(event) => setMinutes(event.target.value)} />
      </label>
      <button disabled={submitting}>{submitting ? "Signing and publishing…" : "Sign and publish"}</button>
      {error && <p className="error-message" role="alert">{error}</p>}
    </form>
  );
}

/** Converts an unknown IPC failure into a concise, safe message for the member. */
function actionErrorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}
