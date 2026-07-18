/** A stable identifier for a community-scoped settlement record. */
export type TransferId = string;

/** A stable identifier for a member account within one community ledger. */
export type MemberId = string;

/** A participant's attestation of the exact transfer supplied to a verifier. */
export interface TransferAttestation {
  readonly memberId: MemberId;
  readonly keyId: string;
  readonly payloadDigest: string;
  readonly signature: string;
}

/** An immutable, community-scoped transfer awaiting or carrying both attestations. */
export interface Transfer {
  readonly id: TransferId;
  readonly communityId: string;
  readonly sourceProposalId?: string;
  readonly providerMemberId: MemberId;
  readonly recipientMemberId: MemberId;
  readonly minutes: number;
  readonly attestations: readonly TransferAttestation[];
  readonly reversesTransferId?: TransferId;
}

/** One derived balance movement from a finalized transfer. */
export interface LedgerPosting {
  readonly transferId: TransferId;
  readonly memberId: MemberId;
  readonly minutes: number;
}

/** The deterministic, local view derived from a set of verified transfers. */
export interface Ledger {
  readonly communityId: string;
  readonly transfers: readonly Transfer[];
  readonly postings: readonly LedgerPosting[];
  readonly balances: Readonly<Record<MemberId, number>>;
}

/** Supplies the context needed to attest one transfer without coupling the ledger to a crypto library. */
export interface VerifyAttestationInput {
  readonly transfer: Transfer;
  readonly attestation: TransferAttestation;
}

/** Verifies that an attestation belongs to its participant and the exact transfer supplied. */
export type SignatureVerifier = (input: VerifyAttestationInput) => boolean;

/** Input used to deterministically derive one community ledger from replicated transfer records. */
export interface ApplyTransfersInput {
  readonly communityId: string;
  readonly transfers: readonly Transfer[];
  readonly verifyAttestation: SignatureVerifier;
}

/** Error raised when a transfer or ledger derivation violates a settlement invariant. */
export class LedgerRuleError extends Error {
  /** Creates a settlement-rule error with a readable explanation. */
  constructor(message: string) {
    super(message);
    this.name = "LedgerRuleError";
  }
}

/**
 * Creates a structurally valid immutable transfer with exactly two participant attestations.
 * Attestation signatures are intentionally verified later by the injected verifier.
 */
export function createTransfer(input: Transfer): Transfer {
  assertPresent(input.id, "Transfer id");
  assertPresent(input.communityId, "Community id");
  assertPresent(input.providerMemberId, "Provider member id");
  assertPresent(input.recipientMemberId, "Recipient member id");
  assertPositiveWholeMinutes(input.minutes);

  if (input.providerMemberId === input.recipientMemberId) {
    throw new LedgerRuleError("A transfer cannot have the same provider and recipient.");
  }

  if (input.reversesTransferId !== undefined) {
    assertPresent(input.reversesTransferId, "Reversed transfer id");
    if (input.reversesTransferId === input.id) {
      throw new LedgerRuleError("A transfer cannot reverse itself.");
    }
  }
  if (input.reversesTransferId === undefined) {
    assertPresent(input.sourceProposalId ?? "", "Source proposal id");
  }

  const attestations = normalizeAttestations(input);
  return Object.freeze({
    id: input.id,
    communityId: input.communityId,
    ...(input.sourceProposalId === undefined ? {} : { sourceProposalId: input.sourceProposalId }),
    providerMemberId: input.providerMemberId,
    recipientMemberId: input.recipientMemberId,
    minutes: input.minutes,
    attestations: Object.freeze(attestations),
    ...(input.reversesTransferId === undefined ? {} : { reversesTransferId: input.reversesTransferId }),
  });
}

/** Derives verified transfers, balanced postings, and member balances independent of input order. */
export function applyTransfers(input: ApplyTransfersInput): Ledger {
  assertPresent(input.communityId, "Community id");
  const transfersById = new Map<TransferId, Transfer>();

  for (const sourceTransfer of input.transfers) {
    const transfer = createTransfer(sourceTransfer);
    if (transfer.communityId !== input.communityId) {
      throw new LedgerRuleError("A ledger can only apply transfers from its own community.");
    }

    verifyTransfer(transfer, input.verifyAttestation);
    const existing = transfersById.get(transfer.id);
    if (existing !== undefined && !sameTransfer(existing, transfer)) {
      throw new LedgerRuleError("A transfer id cannot identify different transfer content.");
    }
    transfersById.set(transfer.id, transfer);
  }

  const transfers = [...transfersById.values()].sort((left, right) => left.id.localeCompare(right.id));
  assertUniqueSettlements(transfers);
  assertValidReversals(transfersById, transfers);
  const postings = transfers.flatMap(derivePostings);
  const balances = deriveBalances(postings);

  return Object.freeze({
    communityId: input.communityId,
    transfers: Object.freeze(transfers),
    postings: Object.freeze(postings),
    balances: Object.freeze(balances),
  });
}

/** Derives the two equal-and-opposite postings for one structurally valid transfer. */
export function derivePostings(transfer: Transfer): readonly LedgerPosting[] {
  const normalizedTransfer = createTransfer(transfer);
  return Object.freeze([
    Object.freeze({ transferId: normalizedTransfer.id, memberId: normalizedTransfer.providerMemberId, minutes: normalizedTransfer.minutes }),
    Object.freeze({ transferId: normalizedTransfer.id, memberId: normalizedTransfer.recipientMemberId, minutes: -normalizedTransfer.minutes }),
  ]);
}

/** Validates attestation identity and delegates cryptographic policy to the supplied verifier. */
function verifyTransfer(transfer: Transfer, verifyAttestation: SignatureVerifier): void {
  for (const attestation of transfer.attestations) {
    let verified = false;
    try {
      verified = verifyAttestation({ transfer, attestation });
    } catch {
      throw new LedgerRuleError("A participant attestation could not be verified.");
    }

    if (!verified) {
      throw new LedgerRuleError("Each participant attestation must verify before a transfer settles.");
    }
  }
}

/** Normalizes attestations into participant order and rejects missing, duplicate, or unrelated signers. */
function normalizeAttestations(transfer: Transfer): TransferAttestation[] {
  if (transfer.attestations.length !== 2) {
    throw new LedgerRuleError("A transfer requires exactly two participant attestations.");
  }

  const attestationsByMember = new Map<MemberId, TransferAttestation>();
  for (const attestation of transfer.attestations) {
    assertPresent(attestation.memberId, "Attesting member id");
    assertPresent(attestation.keyId, "Attestation signing key id");
    assertPresent(attestation.payloadDigest, "Attestation payload digest");
    assertPresent(attestation.signature, "Attestation signature");
    if (attestation.memberId !== transfer.providerMemberId && attestation.memberId !== transfer.recipientMemberId) {
      throw new LedgerRuleError("Only the provider and recipient may attest a transfer.");
    }
    if (attestationsByMember.has(attestation.memberId)) {
      throw new LedgerRuleError("Each transfer participant may attest only once.");
    }
    attestationsByMember.set(attestation.memberId, Object.freeze({ ...attestation }));
  }

  const providerAttestation = attestationsByMember.get(transfer.providerMemberId);
  const recipientAttestation = attestationsByMember.get(transfer.recipientMemberId);
  if (providerAttestation === undefined || recipientAttestation === undefined) {
    throw new LedgerRuleError("A transfer requires both provider and recipient attestations.");
  }

  return [providerAttestation, recipientAttestation];
}

/** Ensures a correction is a new transfer that exactly cancels an earlier transfer's participants and minutes. */
function assertValidReversals(transfersById: ReadonlyMap<TransferId, Transfer>, transfers: readonly Transfer[]): void {
  for (const transfer of transfers) {
    if (transfer.reversesTransferId === undefined) {
      continue;
    }

    const original = transfersById.get(transfer.reversesTransferId);
    if (original === undefined) {
      throw new LedgerRuleError("A compensating transfer must reference a transfer in the same ledger.");
    }
    if (
      transfer.providerMemberId !== original.recipientMemberId ||
      transfer.recipientMemberId !== original.providerMemberId ||
      transfer.minutes !== original.minutes
    ) {
      throw new LedgerRuleError("A compensating transfer must reverse the original participants and minute amount.");
    }
  }
}

/** Ensures one accepted proposal can produce at most one settlement transfer. */
function assertUniqueSettlements(transfers: readonly Transfer[]): void {
  const settlementIds = new Set<string>();
  for (const transfer of transfers) {
    if (transfer.reversesTransferId !== undefined) continue;
    const proposalId = transfer.sourceProposalId;
    if (proposalId === undefined) {
      throw new LedgerRuleError("A settlement transfer must reference an accepted proposal.");
    }
    if (settlementIds.has(proposalId)) {
      throw new LedgerRuleError("An accepted proposal can settle only once.");
    }
    settlementIds.add(proposalId);
  }
}

/** Adds all postings into a stable, member-keyed balance record. */
function deriveBalances(postings: readonly LedgerPosting[]): Record<MemberId, number> {
  const balances: Record<MemberId, number> = {};
  for (const posting of postings) {
    balances[posting.memberId] = (balances[posting.memberId] ?? 0) + posting.minutes;
  }
  return balances;
}

/** Checks whether two same-id transfers have identical canonical content. */
function sameTransfer(left: Transfer, right: Transfer): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Ensures a required text field is non-blank. */
function assertPresent(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new LedgerRuleError(`${label} is required.`);
  }
}

/** Ensures transfer minutes are positive finite integers. */
function assertPositiveWholeMinutes(minutes: number): void {
  if (!Number.isFinite(minutes) || !Number.isInteger(minutes) || minutes <= 0) {
    throw new LedgerRuleError("Transfer minutes must be a positive whole number.");
  }
}
