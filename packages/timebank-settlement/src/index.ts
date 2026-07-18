import { type ExchangeProposal } from "@peer-hours/timebank-domain";
import {
  createTransfer,
  type Transfer,
  type TransferAttestation,
  type TransferTerms,
} from "@peer-hours/timebank-ledger";
import {
  assertAuthorizedTransferAttestations,
  transferPayloadDigest,
  type MemberSigningKeyAuthorization,
} from "@peer-hours/timebank-identity";
import {
  resolveSettlementAcknowledgements,
  type SettlementAcknowledgement,
} from "./settlement-acknowledgement.js";

/** Input used to verify that one settlement transfer honors its accepted exchange proposal. */
export interface ValidateSettlementTransferInput {
  readonly proposal: ExchangeProposal;
  readonly transfer: Transfer;
}

/** Error raised when a signed settlement transfer does not honor its source proposal. */
export class SettlementRuleError extends Error {
  /** Creates a readable settlement-integration rule error. */
  constructor(message: string) {
    super(message);
    this.name = "SettlementRuleError";
  }
}

/** Input required to compose the only normal transfer for a dual-confirmed exchange. */
export interface CreateDualConfirmedSettlementTransferInput {
  /** The accepted proposal whose exact terms become the transfer terms. */
  readonly proposal: ExchangeProposal;
  /** The replicated participant acknowledgements for that accepted proposal. */
  readonly acknowledgements: readonly SettlementAcknowledgement[];
  /** Both participant attestations over the resulting deterministic transfer terms. */
  readonly attestations: readonly TransferAttestation[];
}

/** Input required to derive deterministic, signable settlement terms after dual confirmation. */
export interface CreateDualConfirmedSettlementTransferTermsInput {
  /** The accepted proposal whose exact terms become the transfer terms. */
  readonly proposal: ExchangeProposal;
  /** The replicated participant acknowledgements for that accepted proposal. */
  readonly acknowledgements: readonly SettlementAcknowledgement[];
}

/** Input used to admit a composed normal transfer from replicated completion evidence. */
export interface ValidateDualConfirmedSettlementTransferInput extends ValidateSettlementTransferInput {
  /** The participant acknowledgements replicated for the transfer's source proposal. */
  readonly acknowledgements: readonly SettlementAcknowledgement[];
}

/** Input used to cryptographically admit a protocol-valid dual-confirmed settlement transfer. */
export interface ValidateAuthorizedDualConfirmedSettlementTransferInput extends ValidateDualConfirmedSettlementTransferInput {
  /** Active, community-scoped Ed25519 authorizations used to verify both participant signatures. */
  readonly authorizations: readonly MemberSigningKeyAuthorization[];
}

/** One participant's independently replicated signature over deterministic settlement terms. */
export interface SettlementTransferAttestation {
  /** Lifecycle-specific identity for this participant's immutable attestation. */
  readonly id: string;
  /** Community in which the source proposal was accepted. */
  readonly communityId: string;
  /** Accepted proposal that deterministically defines the signed transfer terms. */
  readonly sourceProposalId: string;
  /** The participant-owned cryptographic attestation. */
  readonly attestation: TransferAttestation;
}

/** Resolved signature collection state for one accepted, dual-confirmed proposal. */
export interface SettlementAttestationState {
  /** Accepted proposal whose deterministic transfer terms are being attested. */
  readonly proposalId: string;
  /** Confirmation and attestation progress; neither state establishes replication finality. */
  readonly status: "awaiting-confirmation" | "awaiting-attestations" | "dual-attested";
  /** Valid immutable attestations, sorted by participant identifier. */
  readonly attestations: readonly SettlementTransferAttestation[];
}

/**
 * Validates that a non-reversal transfer is the exact settlement for one accepted proposal.
 *
 * This bridge intentionally does not verify signatures or derive balances: those concerns remain
 * in the identity and ledger packages. It prevents independent callers from treating an arbitrary
 * transfer that merely names a proposal as an authorized settlement for that proposal.
 */
export function validateSettlementTransfer(input: ValidateSettlementTransferInput): Transfer {
  const { proposal } = input;
  const transfer = createTransfer(input.transfer);

  if (proposal.status !== "accepted" || proposal.acceptedByMemberId === undefined) {
    throw new SettlementRuleError("Only an accepted proposal can produce a settlement transfer.");
  }
  if (transfer.reversesTransferId !== undefined) {
    throw new SettlementRuleError("A compensating reversal cannot settle an exchange proposal.");
  }
  if (transfer.sourceProposalId !== proposal.id) {
    throw new SettlementRuleError("A settlement transfer must reference its accepted proposal.");
  }
  if (transfer.communityId !== proposal.communityId) {
    throw new SettlementRuleError("A settlement transfer must remain in its proposal community.");
  }
  if (
    transfer.providerMemberId !== proposal.providerMemberId ||
    transfer.recipientMemberId !== proposal.receiverMemberId
  ) {
    throw new SettlementRuleError("A settlement transfer must preserve its proposal participants.");
  }
  if (transfer.minutes !== proposal.minutes) {
    throw new SettlementRuleError("A settlement transfer must preserve its proposal minute amount.");
  }

  return transfer;
}

/**
 * Composes the deterministic normal transfer for an accepted exchange after both participants
 * acknowledged its completion.
 *
 * This is deliberately a composition boundary, not a finality decision. It checks that the
 * acknowledgements are mutually consistent and makes the transfer id deterministic per proposal,
 * but it cannot verify the supplied signatures or prove durable replication. Callers must verify
 * the resulting attestations through `@peer-hours/timebank-identity` and satisfy their explicit
 * replication acknowledgement policy before presenting the exchange as settled.
 */
export function createDualConfirmedSettlementTransfer(
  input: CreateDualConfirmedSettlementTransferInput,
): Transfer {
  const terms = createDualConfirmedSettlementTransferTerms(input);
  const transfer = createTransfer({
    ...terms,
    attestations: input.attestations,
  });
  return validateDualConfirmedSettlementTransfer({
    proposal: input.proposal,
    acknowledgements: input.acknowledgements,
    transfer,
  });
}

/**
 * Derives the deterministic, attestation-free terms for one dual-confirmed settlement.
 *
 * Participants sign these exact terms independently before either participant can publish the
 * completed transfer. This does not assert signature validity or durable replication.
 */
export function createDualConfirmedSettlementTransferTerms(
  input: CreateDualConfirmedSettlementTransferTermsInput,
): TransferTerms {
  const confirmation = resolveSettlementAcknowledgements(input.proposal, input.acknowledgements);
  if (confirmation.status !== "dual-confirmed") {
    throw new SettlementRuleError("Both exchange participants must acknowledge completion before deriving settlement terms.");
  }
  return Object.freeze({
    id: settlementTransferId(input.proposal.id),
    communityId: input.proposal.communityId,
    sourceProposalId: input.proposal.id,
    providerMemberId: input.proposal.providerMemberId,
    recipientMemberId: input.proposal.receiverMemberId,
    minutes: input.proposal.minutes,
  });
}

/** Creates one participant-owned attestation container for a dual-confirmed settlement. */
export function createSettlementTransferAttestation(
  input: CreateDualConfirmedSettlementTransferTermsInput & { readonly attestation: TransferAttestation },
): SettlementTransferAttestation {
  const terms = createDualConfirmedSettlementTransferTerms(input);
  const { attestation } = input;
  if (attestation.memberId !== terms.providerMemberId && attestation.memberId !== terms.recipientMemberId) {
    throw new SettlementRuleError("Only an exchange participant may attest deterministic settlement terms.");
  }
  if (attestation.payloadDigest !== transferPayloadDigest(terms)) {
    throw new SettlementRuleError("A settlement attestation must name the deterministic transfer payload digest.");
  }
  return Object.freeze({
    id: settlementTransferAttestationId(terms.sourceProposalId ?? "", attestation.memberId),
    communityId: terms.communityId,
    sourceProposalId: terms.sourceProposalId ?? "",
    attestation: Object.freeze({ ...attestation }),
  });
}

/** Resolves independently replicated participant attestations without claiming transfer finality. */
export function resolveSettlementTransferAttestations(
  input: CreateDualConfirmedSettlementTransferTermsInput & { readonly attestations: readonly SettlementTransferAttestation[] },
): SettlementAttestationState {
  const confirmation = resolveSettlementAcknowledgements(input.proposal, input.acknowledgements);
  if (confirmation.status !== "dual-confirmed") {
    if (input.attestations.length > 0) {
      throw new SettlementRuleError("Settlement transfer attestations require both participant acknowledgements.");
    }
    return Object.freeze({ proposalId: input.proposal.id, status: "awaiting-confirmation", attestations: Object.freeze([]) });
  }
  const terms = createDualConfirmedSettlementTransferTerms(input);
  const byParticipant = new Map<string, SettlementTransferAttestation>();
  for (const attestation of input.attestations) {
    const normalized = validateSettlementTransferAttestation(input, attestation);
    const existing = byParticipant.get(normalized.attestation.memberId);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(normalized)) {
      throw new SettlementRuleError("A participant cannot publish conflicting settlement attestations.");
    }
    byParticipant.set(normalized.attestation.memberId, normalized);
  }
  const attestations = Object.freeze([...byParticipant.values()].sort((left, right) =>
    left.attestation.memberId.localeCompare(right.attestation.memberId),
  ));
  const dualAttested = byParticipant.has(terms.providerMemberId) && byParticipant.has(terms.recipientMemberId);
  return Object.freeze({ proposalId: terms.sourceProposalId ?? "", status: dualAttested ? "dual-attested" : "awaiting-attestations", attestations });
}

/** Validates an attestation container against one accepted, dual-confirmed settlement. */
export function validateSettlementTransferAttestation(
  input: CreateDualConfirmedSettlementTransferTermsInput,
  settlementAttestation: SettlementTransferAttestation,
): SettlementTransferAttestation {
  const expected = createSettlementTransferAttestation({ ...input, attestation: settlementAttestation.attestation });
  if (
    settlementAttestation.id !== expected.id ||
    settlementAttestation.communityId !== expected.communityId ||
    settlementAttestation.sourceProposalId !== expected.sourceProposalId
  ) {
    throw new SettlementRuleError("A settlement attestation must preserve its proposal, community, and participant identity.");
  }
  return expected;
}

/**
 * Verifies that a normal settlement transfer was deterministically composed from an accepted
 * proposal after both participants acknowledged completion.
 *
 * This validates protocol evidence only. It does not verify transfer signatures, establish a
 * ledger policy outcome, or claim that the records have replicated durably to any particular
 * set of peers.
 */
export function validateDualConfirmedSettlementTransfer(
  input: ValidateDualConfirmedSettlementTransferInput,
): Transfer {
  const confirmation = resolveSettlementAcknowledgements(input.proposal, input.acknowledgements);
  if (confirmation.status !== "dual-confirmed") {
    throw new SettlementRuleError("Both exchange participants must acknowledge completion before composing a settlement transfer.");
  }

  const transfer = validateSettlementTransfer(input);
  if (transfer.id !== settlementTransferId(input.proposal.id)) {
    throw new SettlementRuleError("A settlement transfer must use its proposal's deterministic transfer id.");
  }
  return transfer;
}

/**
 * Admits a deterministic dual-confirmed settlement transfer only after both exact participant
 * attestations verify with currently supplied active Ed25519 authorizations.
 *
 * This admission check deliberately does not establish ledger acceptance, durable replication,
 * or any form of network finality.
 */
export function validateAuthorizedDualConfirmedSettlementTransfer(
  input: ValidateAuthorizedDualConfirmedSettlementTransferInput,
): Transfer {
  const transfer = validateDualConfirmedSettlementTransfer(input);
  return assertAuthorizedTransferAttestations(transfer, input.authorizations);
}

/**
 * Derives the unique normal-transfer identity for one accepted proposal.
 *
 * Ledger duplicate-settlement checks remain authoritative, while this deterministic id gives
 * independent publishers the same immutable record identity instead of competing alternatives.
 */
export function settlementTransferId(proposalId: string): string {
  if (proposalId.trim().length === 0) {
    throw new SettlementRuleError("Proposal id is required.");
  }
  return `${proposalId}/settlement`;
}

/** Derives the unique append-only identity for one participant transfer attestation. */
export function settlementTransferAttestationId(proposalId: string, memberId: string): string {
  if (proposalId.trim().length === 0 || memberId.trim().length === 0) {
    throw new SettlementRuleError("Proposal id and attesting member id are required.");
  }
  return `${proposalId}/settlement-attestation/${memberId}`;
}

export * from "./settlement-acknowledgement.js";
