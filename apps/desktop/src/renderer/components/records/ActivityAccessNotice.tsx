/** Explains why membership setup is required before a member can create timebank activity. */
export function ActivityAccessNotice({ onOpenWelcome }: { onOpenWelcome: () => void }) {
  return (
    <section className="activity-access-notice" aria-labelledby="activity-access-heading">
      <p className="kicker">One step first</p>
      <h2 id="activity-access-heading">Set up your membership</h2>
      <p className="muted">Your membership gives this device a secure way to create offers, requests, and exchange confirmations in your community.</p>
      <button type="button" onClick={onOpenWelcome}>Set up membership</button>
    </section>
  );
}
