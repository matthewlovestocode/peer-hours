/** Renders a member-readable signed activity history with details available on demand. */
export function RawRecordList({ records }: { records: readonly unknown[] }) {
  if (!records.length) return <section className="raw-records" aria-labelledby="raw-records-heading"><h2 id="raw-records-heading">Activity history</h2><p className="empty-state">You have not recorded any activity yet. Set up your membership to share an offer or ask for help.</p></section>;

  return (
    <section className="raw-records" aria-labelledby="raw-records-heading">
      <div className="records-section-heading">
        <div>
          <p className="kicker">Your history</p>
          <h2 id="raw-records-heading">Activity history</h2>
        </div>
        <span className="count-badge" aria-label={`${records.length} signed activity records`}>{records.length}</span>
      </div>
      <p className="muted">Each item is a signed, permanent part of your history. Seeing it here does not by itself mean another peer received it or that an exchange is complete.</p>
      <ol className="record-list">
        {records.map((record, index) => (
          <li key={index}>
            <details>
              <summary>View signed record {index + 1}</summary>
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
