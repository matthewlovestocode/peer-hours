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
      <div className="records-workspace-status" role="status">
        <span>Local snapshot is current.</span>
        <button className="secondary-button" type="button" onClick={onRefresh}>Refresh records</button>
      </div>
    );
  }

  if (phase === "loading") {
    return <p className="empty-state" role="status">Opening your local member feed and verifying its records…</p>;
  }

  if (phase === "refreshing") {
    return <p className="empty-state" role="status">Refreshing the local member feed…</p>;
  }

  return (
    <div className="records-workspace-status records-workspace-status--error" role="alert">
      <div>
        <strong>Could not refresh local records.</strong>
        <p>{error ?? "The local member feed could not be read. No records were changed."}</p>
        {hasSnapshot && <p>Your previously verified snapshot remains visible below and may be out of date.</p>}
      </div>
      <button type="button" onClick={onRefresh}>Try again</button>
    </div>
  );
}
