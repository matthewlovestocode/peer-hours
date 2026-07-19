import { Panel } from "../components/Primitive.js";
import { RawRecordList } from "../components/records/RawRecordList.js";
import { RecordsTrustNotice } from "../components/records/RecordsTrustNotice.js";
import { RecordsWorkspaceStatus } from "../components/records/RecordsWorkspaceStatus.js";
import { ResolvedState } from "../components/records/ResolvedState.js";
import { useRecordsWorkspace } from "../components/records/useRecordsWorkspace.js";
import { WorkspaceHeader } from "../components/WorkspaceHeader.js";

/** Separates a member's current verified activity and permanent signed history from exchange actions. */
export function HistoryPage() {
  const { snapshot, phase, refreshError, refresh } = useRecordsWorkspace();
  const resolved = snapshot?.resolved ?? null;

  return (
    <section className="history-page">
      <WorkspaceHeader eyebrow="My history" title="Your timebank history" description="Review what this device has checked and the signed history it keeps for you." />
      <Panel>
        <RecordsWorkspaceStatus phase={phase} hasSnapshot={snapshot !== null} error={refreshError} onRefresh={() => void refresh()} />
        <RecordsTrustNotice resolved={resolved} rawRecordCount={snapshot?.records.length ?? 0} />
        {snapshot && <ResolvedState state={resolved} />}
        {snapshot && <RawRecordList records={snapshot.records} />}
      </Panel>
    </section>
  );
}
