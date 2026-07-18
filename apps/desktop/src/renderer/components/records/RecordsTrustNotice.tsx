import type { ResolvedMemberState } from "./types.js";
import { recordsTrustStatus } from "./recordsTrustPresentation.js";

/** Summarizes how this device is interpreting raw member-feed data without presenting verification as network finality. */
export function RecordsTrustNotice({ resolved, rawRecordCount }: { resolved: ResolvedMemberState | null; rawRecordCount: number }) {
  const status = recordsTrustStatus(resolved, rawRecordCount);

  return (
    <aside className={`records-trust-notice records-trust-notice--${status.tone}`} aria-labelledby="records-trust-heading" role={status.tone === "blocked" ? "alert" : "status"}>
      <div>
        <p className="kicker">Local verification</p>
        <h2 id="records-trust-heading">{status.heading}</h2>
      </div>
      <p>{status.detail}</p>
    </aside>
  );
}
