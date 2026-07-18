import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { acceptExchangeProposal, createMemberProfile, createOffer, createRequest, proposeExchange, publishListing, type ExchangeProposal, type Listing, type ListingKind } from "@peer-hours/timebank-domain";
import { canonicalMemberFeedAnnouncementPayload, canonicalMemberFeedDeclarationPayload, createMemberFeedAnnouncement, createMemberFeedDeclaration, createParticipantTransferAttestation, createSelfOwnedMemberIdentity, type MemberFeedAnnouncement, type MemberFeedDeclaration } from "@peer-hours/timebank-identity";
import { canonicalMemberSignedRecordPayload, createMemberSignedRecord, decodeLedgerTransferRecord, decodeSettlementAcknowledgementRecord, MEMBER_FEED_DECLARATION_RECORD_KIND, memberFeedDeclarationFromRecord, memberFeedDeclarationToRecord, rootKeyIdForMember, toAcceptedExchangeProposalRecord, toDualConfirmedSettlementTransferRecord, toProposedExchangeProposalRecord, toPublishedListingRecord, toSettlementAcknowledgementRecord, toSettlementTransferAttestationRecord, type JsonObject, type RecordEnvelope } from "@peer-hours/timebank-records";
import { createDualConfirmedSettlementTransferTerms, createSettlementAcknowledgement, createSettlementTransferAttestation, type SettlementAcknowledgement, type SettlementTransferAttestation } from "@peer-hours/timebank-settlement";
import type { JsonValue } from "@peer-hours/peer-runtime";

/** Defines the encrypted identity material persisted only by the Electron main process. */
export type StoredMemberIdentity = { privateKeyCiphertext: string; publicKeyPem: string };
export type MemberIdentityStatus = { state: "unavailable" | "not-created" | "ready"; memberId: string | null; communityId: string | null };
export type PublishListingInput = { kind: ListingKind; title: string; minutes: number };
export type CreateProposalInput = { offer: Listing; request: Listing; minutes: number };
export type AcceptProposalInput = { proposal: ExchangeProposal; offer: Listing; request: Listing };
/** Verified replicated evidence needed to advance one settlement from attestation to publication. */
export type AdvanceSettlementInput = { proposal: ExchangeProposal; acknowledgements: readonly SettlementAcknowledgement[]; attestations: readonly SettlementTransferAttestation[] };

/** Provides OS-backed encryption without exposing Electron to identity domain behavior. */
export type SecureStorageAdapter = {
  readonly isEncryptionAvailable: () => boolean;
  readonly encryptString: (value: string) => string;
  readonly decryptString: (value: string) => string;
};

/** Persists encrypted identity material while keeping filesystem choices outside the service. */
export type MemberIdentityStore = {
  readonly read: () => Promise<StoredMemberIdentity | null>;
  readonly write: (identity: StoredMemberIdentity) => Promise<void>;
};

/** Narrows the embedded peer runtime to the member-feed operations required for identity publication. */
export type MemberFeedRuntime = {
  readonly communityId: () => string | null;
  readonly feedPublicKey: () => string;
  readonly readRecords: () => Promise<readonly JsonValue[]>;
  readonly appendRecord: (record: JsonValue) => Promise<number>;
  readonly publishAnnouncement: (announcement: MemberFeedAnnouncement) => void;
};

/** Owns root-key persistence and explicit declaration and announcement actions in Electron's main process. */
export class MemberIdentityService {
  /** Tracks local acknowledgement appends so concurrent IPC calls cannot create conflicting envelopes. */
  private readonly settlementAcknowledgementsInProgress = new Set<string>();
  /** Serializes a participant's attestation and deterministic transfer publication for one proposal. */
  private readonly settlementAdvancementsInProgress = new Set<string>();
  /** Shares one identity setup operation so repeated renderer clicks cannot create competing root identities. */
  private identitySetupInProgress: Promise<MemberIdentityStatus> | null = null;

  /** Creates a service from narrow secure-storage, persistence, and member-feed adapters. */
  constructor(
    private readonly secureStorage: SecureStorageAdapter,
    private readonly identityStore: MemberIdentityStore,
    private readonly memberFeed: MemberFeedRuntime,
  ) {}

  /** Reports whether a local root identity can safely operate in the current discovery community. */
  async status(): Promise<MemberIdentityStatus> {
    const communityId = this.memberFeed.communityId();
    if (!this.secureStorage.isEncryptionAvailable()) return { state: "unavailable", memberId: null, communityId };
    const stored = await this.identityStore.read();
    if (stored === null) return { state: "not-created", memberId: null, communityId };
    this.assertStoredIdentity(stored);
    return { state: "ready", memberId: createSelfOwnedMemberIdentity({ rootPublicKeyPem: stored.publicKeyPem }).memberId, communityId };
  }

  /** Creates a protected root identity, declares its local feed, and announces it to current peers. */
  async createAndAnnounce(): Promise<MemberIdentityStatus> {
    if (this.identitySetupInProgress !== null) return this.identitySetupInProgress;
    const operation = this.createAndAnnounceOnce();
    this.identitySetupInProgress = operation;
    try {
      return await operation;
    } finally {
      if (this.identitySetupInProgress === operation) this.identitySetupInProgress = null;
    }
  }

  /** Performs one serialized identity setup without allowing an overlapping call to replace its root key. */
  private async createAndAnnounceOnce(): Promise<MemberIdentityStatus> {
    const communityId = this.memberFeed.communityId();
    if (!communityId) throw new Error("Connect to a bootstrap discovery scope before creating an identity.");
    if (!this.secureStorage.isEncryptionAvailable()) throw new Error("Secure operating-system key storage is unavailable on this device.");
    const stored = await this.identityStore.read() ?? await this.createStoredIdentity();
    this.assertStoredIdentity(stored);
    const existingDeclaration = await this.existingDeclaration(communityId);
    const declaration = existingDeclaration ?? this.createDeclaration(stored, communityId);
    if (existingDeclaration === null) await this.memberFeed.appendRecord(memberFeedDeclarationToRecord(declaration) as unknown as JsonValue);
    this.memberFeed.publishAnnouncement(this.createAnnouncement(stored, declaration));
    return this.status();
  }

  /** Publishes one root-signed offer or request from this member's independently owned feed. */
  async publishListing(input: PublishListingInput): Promise<void> {
    if (input.kind !== "offer" && input.kind !== "request") throw new Error("Listing kind must be an offer or request.");
    const communityId = this.memberFeed.communityId();
    if (!communityId) throw new Error("Connect to a bootstrap discovery scope before publishing a listing.");
    if (!this.secureStorage.isEncryptionAvailable()) throw new Error("Secure operating-system key storage is unavailable on this device.");
    const stored = await this.identityStore.read();
    if (stored === null) throw new Error("Create your self-owned identity before publishing a listing.");
    this.assertStoredIdentity(stored);
    const memberId = createSelfOwnedMemberIdentity({ rootPublicKeyPem: stored.publicKeyPem }).memberId;
    const owner = createMemberProfile({ id: memberId, communityId, displayName: memberId });
    const draft = (input.kind === "offer" ? createOffer : createRequest)({
      id: crypto.randomUUID(), communityId, memberId, title: input.title, minutes: input.minutes,
    });
    const record = toPublishedListingRecord(publishListing({ listing: draft, owner }), { occurredAt: new Date().toISOString(), authorId: memberId });
    const signed = createMemberSignedRecord({
      ...record,
      signingKeyId: rootKeyIdForMember(memberId),
      signature: this.sign(stored, canonicalMemberSignedRecordPayload(record)),
    });
    await this.memberFeed.appendRecord(signed as unknown as JsonValue);
  }

  /** Creates and root-signs a proposal after main-process resolution supplies verified published listings. */
  async createProposal(input: CreateProposalInput): Promise<void> {
    const communityId = this.memberFeed.communityId();
    if (!communityId) throw new Error("Connect to a bootstrap discovery scope before creating a proposal.");
    if (!this.secureStorage.isEncryptionAvailable()) throw new Error("Secure operating-system key storage is unavailable on this device.");
    const stored = await this.identityStore.read();
    if (stored === null) throw new Error("Create your self-owned identity before creating a proposal.");
    this.assertStoredIdentity(stored);
    const memberId = createSelfOwnedMemberIdentity({ rootPublicKeyPem: stored.publicKeyPem }).memberId;
    const proposal = proposeExchange({
      id: crypto.randomUUID(), offer: input.offer, request: input.request,
      provider: createMemberProfile({ id: input.offer.memberId, communityId, displayName: input.offer.memberId }),
      recipient: createMemberProfile({ id: input.request.memberId, communityId, displayName: input.request.memberId }),
      creatorMemberId: memberId, minutes: input.minutes,
    });
    const record = toProposedExchangeProposalRecord(proposal, { occurredAt: new Date().toISOString(), authorId: memberId });
    await this.memberFeed.appendRecord(createMemberSignedRecord({ ...record, signingKeyId: rootKeyIdForMember(memberId), signature: this.sign(stored, canonicalMemberSignedRecordPayload(record)) }) as unknown as JsonValue);
  }

  /** Accepts a verified proposal only as its other participant and signs a separate acceptance record. */
  async acceptProposal(input: AcceptProposalInput): Promise<void> {
    const communityId = this.memberFeed.communityId(); const stored = await this.identityStore.read();
    if (!communityId || stored === null || !this.secureStorage.isEncryptionAvailable()) throw new Error("A protected identity and community scope are required to accept a proposal.");
    this.assertStoredIdentity(stored); const memberId = createSelfOwnedMemberIdentity({ rootPublicKeyPem: stored.publicKeyPem }).memberId;
    const accepted = acceptExchangeProposal({ proposal: input.proposal, offer: input.offer, request: input.request, provider: createMemberProfile({ id: input.offer.memberId, communityId, displayName: input.offer.memberId }), recipient: createMemberProfile({ id: input.request.memberId, communityId, displayName: input.request.memberId }), acceptedByMemberId: memberId });
    const record = toAcceptedExchangeProposalRecord(accepted, { occurredAt: new Date().toISOString(), authorId: memberId });
    await this.memberFeed.appendRecord(createMemberSignedRecord({ ...record, signingKeyId: rootKeyIdForMember(memberId), signature: this.sign(stored, canonicalMemberSignedRecordPayload(record)) }) as unknown as JsonValue);
  }

  /** Publishes this participant's signed acknowledgement for one already accepted exchange. */
  async acknowledgeSettlement(proposal: ExchangeProposal): Promise<void> {
    const communityId = this.memberFeed.communityId(); const stored = await this.identityStore.read();
    if (!communityId || stored === null || !this.secureStorage.isEncryptionAvailable()) throw new Error("A protected identity and community scope are required to acknowledge a settlement.");
    this.assertStoredIdentity(stored); const memberId = createSelfOwnedMemberIdentity({ rootPublicKeyPem: stored.publicKeyPem }).memberId;
    if (proposal.communityId !== communityId) throw new Error("The accepted proposal is outside the current community scope.");
    const acknowledgement = createSettlementAcknowledgement(proposal, memberId);
    if (this.settlementAcknowledgementsInProgress.has(acknowledgement.id)) {
      throw new Error("This member is already acknowledging completion of this exchange.");
    }
    this.settlementAcknowledgementsInProgress.add(acknowledgement.id);
    try {
      if (await this.hasSettlementAcknowledgement(acknowledgement.id)) {
        throw new Error("This member has already acknowledged completion of this exchange.");
      }
      const record = toSettlementAcknowledgementRecord(acknowledgement, { occurredAt: new Date().toISOString(), authorId: memberId });
      await this.memberFeed.appendRecord(createMemberSignedRecord({ ...record, signingKeyId: rootKeyIdForMember(memberId), signature: this.sign(stored, canonicalMemberSignedRecordPayload(record)) }) as unknown as JsonValue);
    } finally {
      this.settlementAcknowledgementsInProgress.delete(acknowledgement.id);
    }
  }

  /**
   * Signs this participant's deterministic transfer terms and, once both valid participant
   * attestations are available, publishes the one settlement transfer. Private keys remain here.
   */
  async advanceSettlement(input: AdvanceSettlementInput): Promise<void> {
    const communityId = this.memberFeed.communityId();
    const stored = await this.identityStore.read();
    if (!communityId || stored === null || !this.secureStorage.isEncryptionAvailable()) throw new Error("A protected identity and community scope are required to advance a settlement.");
    this.assertStoredIdentity(stored);
    const memberId = createSelfOwnedMemberIdentity({ rootPublicKeyPem: stored.publicKeyPem }).memberId;
    if (input.proposal.communityId !== communityId) throw new Error("The accepted proposal is outside the current community scope.");
    if (memberId !== input.proposal.providerMemberId && memberId !== input.proposal.receiverMemberId) throw new Error("Only an exchange participant may attest or publish its settlement.");
    if (this.settlementAdvancementsInProgress.has(input.proposal.id)) throw new Error("This settlement is already being advanced.");
    this.settlementAdvancementsInProgress.add(input.proposal.id);
    try {
      const terms = createDualConfirmedSettlementTransferTerms({ proposal: input.proposal, acknowledgements: input.acknowledgements });
      const ownExisting = input.attestations.find(({ attestation }) => attestation.memberId === memberId);
      const ownAttestation = ownExisting ?? createSettlementTransferAttestation({
        proposal: input.proposal,
        acknowledgements: input.acknowledgements,
        attestation: createParticipantTransferAttestation({
          transfer: terms,
          memberId,
          keyId: rootKeyIdForMember(memberId),
          signCanonicalPayload: (payload) => this.sign(stored, payload),
        }),
      });
      if (ownExisting === undefined) {
        const record = toSettlementTransferAttestationRecord(ownAttestation, { occurredAt: new Date().toISOString(), authorId: memberId });
        await this.memberFeed.appendRecord(this.signRecord(stored, memberId, record));
      }
      const attestations = [...input.attestations.filter(({ attestation }) => attestation.memberId !== memberId), ownAttestation];
      const participantIds = new Set(attestations.map(({ attestation }) => attestation.memberId));
      if (!participantIds.has(input.proposal.providerMemberId) || !participantIds.has(input.proposal.receiverMemberId)) return;
      if (await this.hasLedgerTransfer(terms.id)) return;
      const record = toDualConfirmedSettlementTransferRecord({ proposal: input.proposal, acknowledgements: input.acknowledgements, attestations: attestations.map(({ attestation }) => attestation), metadata: { occurredAt: new Date().toISOString(), authorId: memberId } });
      await this.memberFeed.appendRecord(this.signRecord(stored, memberId, record));
    } finally {
      this.settlementAdvancementsInProgress.delete(input.proposal.id);
    }
  }

  /** Checks the member-owned feed for a prior immutable acknowledgement before appending again. */
  private async hasSettlementAcknowledgement(acknowledgementId: string): Promise<boolean> {
    const records = await this.memberFeed.readRecords();
    return records.some((record) => {
      try {
        return decodeSettlementAcknowledgementRecord(record).id === acknowledgementId;
      } catch {
        return false;
      }
    });
  }

  /** Checks this feed for an already published deterministic transfer before appending again. */
  private async hasLedgerTransfer(transferId: string): Promise<boolean> {
    const records = await this.memberFeed.readRecords();
    return records.some((record) => {
      try {
        return decodeLedgerTransferRecord(record).id === transferId;
      } catch {
        return false;
      }
    });
  }

  /** Signs one immutable record envelope with the member root key without exposing that key. */
  private signRecord(stored: StoredMemberIdentity, memberId: string, record: RecordEnvelope<JsonObject>): JsonValue {
    return createMemberSignedRecord({ ...record, signingKeyId: rootKeyIdForMember(memberId), signature: this.sign(stored, canonicalMemberSignedRecordPayload(record)) }) as unknown as JsonValue;
  }

  /** Generates an Ed25519 root key and persists only its encrypted private PEM. */
  private async createStoredIdentity(): Promise<StoredMemberIdentity> {
    const keys = generateKeyPairSync("ed25519");
    const privateKeyPem = keys.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const stored = {
      privateKeyCiphertext: this.secureStorage.encryptString(privateKeyPem),
      publicKeyPem: keys.publicKey.export({ format: "pem", type: "spki" }).toString(),
    };
    await this.identityStore.write(stored);
    return stored;
  }

  /** Rejects malformed persisted material rather than silently replacing an established member identity. */
  private assertStoredIdentity(stored: StoredMemberIdentity): void {
    if (!stored.privateKeyCiphertext || !stored.publicKeyPem) throw new Error("Stored member identity material is corrupted.");
    try {
      const privateKey = createPrivateKey(this.secureStorage.decryptString(stored.privateKeyCiphertext));
      const publicKey = createPublicKey(stored.publicKeyPem);
      const proof = Buffer.from("peer-hours/member-identity-integrity/v1");
      if (!verify(null, proof, publicKey, sign(null, proof, privateKey))) throw new Error("Public key does not match private key.");
    } catch (error) {
      throw new Error("Stored member identity material is corrupted.", { cause: error });
    }
  }

  /** Builds and signs the immutable declaration binding this root identity to the runtime's own feed. */
  private createDeclaration(stored: StoredMemberIdentity, communityId: string): MemberFeedDeclaration {
    const identity = createSelfOwnedMemberIdentity({ rootPublicKeyPem: stored.publicKeyPem });
    const unsigned = { schema: "peer-hours/member-feed-declaration/v1" as const, memberId: identity.memberId, communityId, feedPublicKey: this.memberFeed.feedPublicKey(), occurredAt: new Date().toISOString(), rootPublicKeyPem: stored.publicKeyPem };
    return createMemberFeedDeclaration({ ...unsigned, signature: this.sign(stored, canonicalMemberFeedDeclarationPayload(unsigned)) });
  }

  /** Finds this feed's valid earlier declaration so retrying an announcement never appends a duplicate identity record. */
  private async existingDeclaration(communityId: string): Promise<MemberFeedDeclaration | null> {
    for (const record of await this.memberFeed.readRecords()) {
      if (typeof record !== "object" || record === null || (record as { kind?: unknown }).kind !== MEMBER_FEED_DECLARATION_RECORD_KIND) continue;
      try {
        const declaration = memberFeedDeclarationFromRecord(record as never);
        if (declaration.communityId === communityId && declaration.feedPublicKey === this.memberFeed.feedPublicKey()) return declaration;
      } catch { /* Invalid local data must not become an identity declaration. */ }
    }
    return null;
  }

  /** Builds and signs a short-lived, explicit discovery announcement for a valid local declaration. */
  private createAnnouncement(stored: StoredMemberIdentity, declaration: MemberFeedDeclaration): MemberFeedAnnouncement {
    const announcedAt = new Date().toISOString();
    const unsigned = { schema: "peer-hours/member-feed-announcement/v1" as const, declaration, announcedAt, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() };
    return createMemberFeedAnnouncement({ ...unsigned, signature: this.sign(stored, canonicalMemberFeedAnnouncementPayload(unsigned)) });
  }

  /** Decrypts the root key only long enough to sign exact canonical protocol bytes. */
  private sign(stored: StoredMemberIdentity, payload: Uint8Array): string {
    return sign(null, payload, this.secureStorage.decryptString(stored.privateKeyCiphertext)).toString("base64url");
  }
}
