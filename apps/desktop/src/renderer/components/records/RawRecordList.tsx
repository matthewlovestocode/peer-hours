/** Renders immutable feed entries strictly as raw inspection data. */
export function RawRecordList({ records }: { records: readonly unknown[] }) {
  if (!records.length) return <section className="raw-records" aria-labelledby="raw-records-heading"><h2 id="raw-records-heading">Raw feed history</h2><p className="empty-state">No records have been added to this member feed yet.</p></section>;

  return (
    <section className="raw-records" aria-labelledby="raw-records-heading">
      <div className="records-section-heading">
        <div>
          <p className="kicker">Inspection only</p>
          <h2 id="raw-records-heading">Raw feed history</h2>
        </div>
        <span className="count-badge" aria-label={`${records.length} raw records`}>{records.length}</span>
      </div>
      <p className="muted">Raw entries are immutable feed data. Their presence does not mean this device accepted them or that an exchange is settled.</p>
      <ol className="record-list">
        {records.map((record, index) => (
          <li key={index}>
            <details>
              <summary>Raw record {index + 1}</summary>
              <pre>{formatRawRecord(record)}</pre>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Serializes an unknown feed entry defensively so inspection cannot break the records workspace. */
function formatRawRecord(record: unknown): string {
  try {
    return JSON.stringify(record, null, 2) ?? "undefined";
  } catch {
    return "This raw record cannot be displayed as JSON.";
  }
}
