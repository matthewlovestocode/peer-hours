/** Renders immutable feed entries strictly as raw inspection data. */
export function RawRecordList({ records }: { records: readonly unknown[] }) {
  if (!records.length) return <p className="empty-state">No records have been added to this member feed yet.</p>;

  return (
    <ol className="record-list">
      {records.map((record, index) => (
        <li key={index}>
          <span className="kicker">Raw record {index + 1}</span>
          <pre>{JSON.stringify(record, null, 2)}</pre>
        </li>
      ))}
    </ol>
  );
}
