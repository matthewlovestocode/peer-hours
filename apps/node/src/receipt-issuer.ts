import { createReplicationReceipt, replicationReceiptTransferDigest, type SignedReplicationReceipt } from "@peer-hours/peer-runtime";
import { resolveTimebankRecords, type MemberSignedRecord, type RecordEnvelope } from "@peer-hours/timebank-records";
import type { PeerRuntime } from "@peer-hours/peer-runtime";
import type { ReceiptIdentity } from "./receipt-identity.js";

/** Read-only service that signs an availability receipt only after this node can independently resolve a retained transfer. */
export class ReplicationReceiptIssuer {
  /** Creates an issuer bound to a durable node signing identity and its local replicated record cache. */
  constructor(
    private readonly runtime: PeerRuntime,
    private readonly identity: ReceiptIdentity,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns public identity metadata for status only; it exposes no private key or authority over records. */
  status(): { readonly nodeId: string; readonly publicKey: string; readonly claim: "retained-locally" } {
    return Object.freeze({ nodeId: this.identity.nodeId, publicKey: this.identity.publicKey, claim: "retained-locally" as const });
  }

  /** Returns a receipt for one locally admitted transfer, or null when this node cannot independently retain and resolve it. */
  async receiptFor(transferId: string): Promise<SignedReplicationReceipt | null> {
    if (!validTransferId(transferId)) return null;
    const communityId = this.runtime.status().community?.communityId;
    if (!communityId) return null;
    const records = await this.retainedRecords();
    let resolved;
    try {
      resolved = resolveTimebankRecords(communityId, records as readonly (RecordEnvelope | MemberSignedRecord)[]);
    } catch {
      return null;
    }
    const transfer = resolved.ledger.transfers.find((candidate) => candidate.id === transferId);
    if (!transfer) return null;
    return createReplicationReceipt({
      communityId,
      transferId: transfer.id,
      transferDigest: replicationReceiptTransferDigest(transfer),
      retainedAt: new Date(this.now()).toISOString(),
      privateKey: this.identity.privateKey,
      publicKey: this.identity.publicKey,
    });
  }

  /** Reads every announced member feed already present in this node's local Corestore without requesting or modifying records. */
  private async retainedRecords(): Promise<readonly unknown[]> {
    const records: unknown[] = [];
    for (const feed of this.runtime.knownMemberFeeds()) {
      try {
        records.push(...await this.runtime.readMemberRecordsFromFeed(feed.feedPublicKey));
      } catch {
        // A feed may be announced but not fully replicated yet; it is not evidence of retained settlement history.
      }
    }
    return records;
  }
}

/** Bounds URL path identifiers before a lookup can trigger record scanning. */
function validTransferId(value: string): boolean {
  return value.length > 0 && value.length <= 512 && !value.includes("/") && !value.includes("\\") && value === value.trim();
}
