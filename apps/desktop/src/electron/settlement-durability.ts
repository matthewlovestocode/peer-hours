import {
  replicationReceiptTransferDigest,
  verifyReplicationReceipt,
  type CommunityManifest,
} from "@peer-hours/peer-runtime";

const MAX_RECEIPT_LOOKUPS = 256;
const MAX_RECEIPT_RESPONSE_BYTES = 8 * 1024;
const RECEIPT_LOOKUP_TIMEOUT_MS = 5_000;
const RECEIPT_TRANSFER_LOOKUP_CONCURRENCY = 4;

/** The narrow receipt outcome that can cross from the trusted main process to the renderer. */
export type VerifiedSettlementDurability = {
  readonly proposalId: string;
  readonly verifiedPinnedReceiptCount: number;
};

/** Fetches one untrusted receipt response without exposing HTTP details to renderer code. */
export type ReceiptFetcher = (url: string) => Promise<unknown>;

/**
 * The minimum transfer shape used for lookup selection. Values are passed through unchanged to
 * `replicationReceiptTransferDigest`, so the receipt remains bound to every transfer term and
 * attestation present on the resolved ledger object.
 */
type SettlementTransfer = { readonly id: string; readonly sourceProposalId?: string };

/**
 * Counts distinct valid retention receipts for locally admitted settlement transfers.
 *
 * Receipts are availability statements from identities pinned in bootstrap metadata. A receipt
 * failure, malformed response, or missing manifest leaves the transfer locally admitted rather
 * than altering its validity, balance, or workflow history.
 */
export async function collectVerifiedSettlementDurability(input: {
  readonly community: CommunityManifest | null;
  readonly transfers: readonly SettlementTransfer[];
  readonly fetchReceipt?: ReceiptFetcher;
}): Promise<readonly VerifiedSettlementDurability[]> {
  const { community } = input;
  if (community === null || community.receiptNodes.length === 0) return Object.freeze([]);

  const fetchReceipt = input.fetchReceipt ?? fetchReceiptJson;
  const settlementTransfers = input.transfers.filter((transfer) => transfer.sourceProposalId !== undefined).slice(0, MAX_RECEIPT_LOOKUPS);
  const durability = await mapWithConcurrency(settlementTransfers, RECEIPT_TRANSFER_LOOKUP_CONCURRENCY, async (transfer) => {
    const transferDigest = replicationReceiptTransferDigest(transfer);
    const receipts = await Promise.all(community.receiptNodes.map(async (node) => {
      try {
        const receipt = await fetchReceipt(receiptLookupUrl(node.receiptUrl, transfer.id));
        return receiptClaimsPinnedNode(receipt, node.nodeId) && verifyReplicationReceipt({
          receipt,
          trustedNodes: community.receiptNodes,
          communityId: community.communityId,
          transferId: transfer.id,
          transferDigest,
        }) ? node.nodeId : null;
      } catch {
        return null;
      }
    }));
    return {
      proposalId: transfer.sourceProposalId!,
      verifiedPinnedReceiptCount: new Set(receipts.filter((nodeId): nodeId is string => nodeId !== null)).size,
    };
  });
  return Object.freeze(durability.map((entry) => Object.freeze(entry)));
}

/** Limits parallel community-node reads so a large local history cannot create an HTTP burst. */
async function mapWithConcurrency<Input, Output>(
  values: readonly Input[],
  concurrency: number,
  map: (value: Input) => Promise<Output>,
): Promise<Output[]> {
  const results = new Array<Output>(values.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) return;
      results[index] = await map(values[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

/** Ensures one receipt URL cannot replay another pinned node's valid availability statement. */
function receiptClaimsPinnedNode(receipt: unknown, nodeId: string): boolean {
  return typeof receipt === "object" && receipt !== null && !Array.isArray(receipt) &&
    Object.getPrototypeOf(receipt) === Object.prototype &&
    (receipt as Record<string, unknown>).nodeId === nodeId;
}

/** Appends a transfer identifier to the pinned read-only receipt collection URL. */
export function receiptLookupUrl(receiptUrl: string, transferId: string): string {
  const url = new URL(receiptUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/${encodeURIComponent(transferId)}`;
  url.search = "";
  return url.toString();
}

/** Reads a bounded JSON response so an unavailable community node cannot exhaust desktop memory. */
async function fetchReceiptJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RECEIPT_LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`Receipt endpoint returned HTTP ${response.status}.`);
    const contentLength = response.headers.get("content-length");
    if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_RECEIPT_RESPONSE_BYTES)) {
      throw new Error("Receipt endpoint returned an oversized response.");
    }
    if (response.body === null) throw new Error("Receipt endpoint returned no response body.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RECEIPT_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("Receipt endpoint returned an oversized response.");
      }
      chunks.push(value);
    }
    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}
