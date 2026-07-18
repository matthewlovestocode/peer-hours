import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { canonicalMemberFeedAnnouncementPayload, canonicalMemberFeedDeclarationPayload, createMemberFeedAnnouncement, createMemberFeedDeclaration, createSelfOwnedMemberIdentity, type MemberFeedAnnouncement, type MemberFeedDeclaration } from "@peer-hours/timebank-identity";
import { MEMBER_FEED_DECLARATION_RECORD_KIND, memberFeedDeclarationFromRecord, memberFeedDeclarationToRecord } from "@peer-hours/timebank-records";
import type { JsonValue } from "@peer-hours/peer-runtime";

/** Defines the encrypted identity material persisted only by the Electron main process. */
export type StoredMemberIdentity = { privateKeyCiphertext: string; publicKeyPem: string };
export type MemberIdentityStatus = { state: "unavailable" | "not-created" | "ready"; memberId: string | null; communityId: string | null };

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
