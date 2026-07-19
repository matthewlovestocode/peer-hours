/** The lifecycle state for the records workspace's independently read local snapshot. */
export type RecordsWorkspacePhase = "loading" | "refreshing" | "ready" | "error";

/** Describes whether the records workspace has a usable snapshot while a refresh is in progress or has failed. */
export type RecordsWorkspaceStatusProps = {
  phase: RecordsWorkspacePhase;
  hasSnapshot: boolean;
  error: string | null;
  onRefresh: () => void;
};

/** Explains local-feed loading truthfully and provides a retry without discarding the last usable snapshot. */
export function RecordsWorkspaceStatus({ phase, hasSnapshot, error, onRefresh }: RecordsWorkspaceStatusProps) {
  if (phase === "ready") {
    return (
      <div className="records-workspace-status" role="status" aria-live="polite">
        <span>Your activity is up to date.</span>
        <button className="secondary-button" type="button" onClick={onRefresh}>Check for updates</button>
      </div>
    );
  }

  if (phase === "loading") {
    return <p className="empty-state" role="status" aria-live="polite">Preparing your activity…</p>;
  }

  if (phase === "refreshing") {
    return <p className="empty-state" role="status" aria-live="polite">Checking for updates. Your current activity remains visible…</p>;
  }

  return (
    <div className="records-workspace-status records-workspace-status--error" role="alert">
      <div>
        <strong>Could not update your activity.</strong>
        <p>{error ?? "Your activity could not be read right now. Nothing was changed."}</p>
        {hasSnapshot && <p>Your last checked activity remains visible below and may be out of date.</p>}
      </div>
      <button type="button" onClick={onRefresh}>Try again</button>
    </div>
  );
}
