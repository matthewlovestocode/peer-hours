import { useState, type FormEvent } from "react";

/** Publishes a member-owned offer or request through the main-process signing boundary. */
export function ListingComposer({ onComplete }: { onComplete: () => Promise<void> }) {
  const [kind, setKind] = useState<"offer" | "request">("offer");
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("60");
  const [error, setError] = useState(false);

  /** Signs and publishes the entered listing before refreshing the parent workspace state. */
  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      await window.peerHours.publishListing({ kind, title, minutes: Number(minutes) });
      setTitle("");
      await onComplete();
    } catch {
      setError(true);
    }
  };

  return (
    <form className="listing-composer" onSubmit={(event) => void publish(event)}>
      <h2>Publish an offer or request</h2>
      <label>
        Type
        <select value={kind} onChange={(event) => setKind(event.target.value as "offer" | "request")}>
          <option value="offer">Offer</option>
          <option value="request">Request</option>
        </select>
      </label>
      <label>
        Title
        <input required value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        Minutes
        <input required min="1" type="number" value={minutes} onChange={(event) => setMinutes(event.target.value)} />
      </label>
      <button>Sign and publish</button>
      {error && <p className="error-message">The listing could not be published.</p>}
    </form>
  );
}
