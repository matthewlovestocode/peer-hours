import { Panel } from "../components/Primitive.js";
import { RawRecordList } from "../components/records/RawRecordList.js";
import { RecordsTrustNotice } from "../components/records/RecordsTrustNotice.js";
import { RecordsWorkspaceStatus } from "../components/records/RecordsWorkspaceStatus.js";
import { ResolvedState } from "../components/records/ResolvedState.js";
import { useRecordsWorkspace } from "../components/records/useRecordsWorkspace.js";

/** Separates a member's current verified activity and permanent signed history from exchange actions. */
export function HistoryPage() {
  const { snapshot, phase, refreshError, refresh } = useRecordsWorkspace();
  const resolved = snapshot?.resolved ?? null;

  return (
    <section className="history-page">
      <header className="records-page__header">
        <p className="eyebrow">My history</p>
        <h1>Your timebank history</h1>
        <p className="muted">Review what this device has checked and the signed history it keeps for you.</p>
      </header>
      <Panel>
        <RecordsWorkspaceStatus phase={phase} hasSnapshot={snapshot !== null} error={refreshError} onRefresh={() => void refresh()} />
        <RecordsTrustNotice resolved={resolved} rawRecordCount={snapshot?.records.length ?? 0} />
        {snapshot && <ResolvedState state={resolved} />}
        {snapshot && <RawRecordList records={snapshot.records} />}
      </Panel>
    </section>
  );
}
