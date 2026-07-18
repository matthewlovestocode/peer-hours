import { readFile, writeFile } from "node:fs/promises";
import { generateKeyPairSync, sign } from "node:crypto";
import { join } from "node:path";
import { safeStorage } from "electron";
import { canonicalMemberFeedAnnouncementPayload, canonicalMemberFeedDeclarationPayload, createMemberFeedAnnouncement, createMemberFeedDeclaration, createSelfOwnedMemberIdentity, type MemberFeedDeclaration } from "@peer-hours/timebank-identity";
import { MEMBER_FEED_DECLARATION_RECORD_KIND, memberFeedDeclarationFromRecord, memberFeedDeclarationToRecord } from "@peer-hours/timebank-records";
import type { JsonValue, PeerRuntime } from "@peer-hours/peer-runtime";

type StoredIdentity = { privateKeyCiphertext: string; publicKeyPem: string };
export type MemberIdentityStatus = { state: "unavailable" | "not-created" | "ready"; memberId: string | null; communityId: string | null };

/** Owns encrypted root-key persistence and explicit declaration/announcement actions in Electron's main process. */
export class MemberIdentityService {
  /** Creates a service bound to the app's local data directory and embedded peer runtime. */
  constructor(private readonly dataDirectory: string, private readonly runtime: PeerRuntime) {}

  /** Reports whether a local root identity can safely operate in the current discovery community. */
  async status(): Promise<MemberIdentityStatus> {
    const communityId = this.runtime.status().community?.communityId ?? null;
    if (!safeStorage.isEncryptionAvailable()) return { state: "unavailable", memberId: null, communityId };
    const stored = await this.readStoredIdentity();
    if (stored === null) return { state: "not-created", memberId: null, communityId };
    return { state: "ready", memberId: createSelfOwnedMemberIdentity({ rootPublicKeyPem: stored.publicKeyPem }).memberId, communityId };
  }

  /** Creates a Keychain-protected root identity, declares its local feed, and announces it to current peers. */
  async createAndAnnounce(): Promise<MemberIdentityStatus> {
    const communityId = this.runtime.status().community?.communityId;
    if (!communityId) throw new Error("Connect to a bootstrap discovery scope before creating an identity.");
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Secure operating-system key storage is unavailable on this device.");
    const stored = await this.readStoredIdentity() ?? await this.createStoredIdentity();
    const existingDeclaration = await this.existingDeclaration(communityId);
    const declaration = existingDeclaration ?? this.createDeclaration(stored, communityId);
    if (existingDeclaration === null) await this.runtime.appendMemberRecord(memberFeedDeclarationToRecord(declaration) as unknown as JsonValue);
    this.runtime.publishMemberFeedAnnouncement(this.createAnnouncement(stored, declaration));
    return this.status();
  }

  /** Loads encrypted local identity material without ever exposing its private half outside this process. */
  private async readStoredIdentity(): Promise<StoredIdentity | null> {
    try { return JSON.parse(await readFile(this.identityPath(), "utf8")) as StoredIdentity; } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  /** Generates an Ed25519 root key and persists only its Keychain-encrypted private PEM. */
  private async createStoredIdentity(): Promise<StoredIdentity> {
    const keys = generateKeyPairSync("ed25519");
    const privateKeyPem = keys.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const stored = { privateKeyCiphertext: safeStorage.encryptString(privateKeyPem).toString("base64"), publicKeyPem: keys.publicKey.export({ format: "pem", type: "spki" }).toString() };
    await writeFile(this.identityPath(), JSON.stringify(stored), { encoding: "utf8", mode: 0o600 });
    return stored;
  }

  /** Builds and signs the immutable declaration binding this root identity to the runtime's own feed. */
  private createDeclaration(stored: StoredIdentity, communityId: string): MemberFeedDeclaration {
    const identity = createSelfOwnedMemberIdentity({ rootPublicKeyPem: stored.publicKeyPem });
    const unsigned = { schema: "peer-hours/member-feed-declaration/v1" as const, memberId: identity.memberId, communityId, feedPublicKey: this.runtime.memberRecordFeedKey, occurredAt: new Date().toISOString(), rootPublicKeyPem: stored.publicKeyPem };
    return createMemberFeedDeclaration({ ...unsigned, signature: this.sign(stored, canonicalMemberFeedDeclarationPayload(unsigned)) });
  }

  /** Finds this feed's valid earlier declaration so retrying an announcement never appends a duplicate identity record. */
  private async existingDeclaration(communityId: string): Promise<MemberFeedDeclaration | null> {
    for (const record of await this.runtime.readMemberRecords()) {
      if (typeof record !== "object" || record === null || (record as { kind?: unknown }).kind !== MEMBER_FEED_DECLARATION_RECORD_KIND) continue;
      try {
        const declaration = memberFeedDeclarationFromRecord(record as never);
        if (declaration.communityId === communityId && declaration.feedPublicKey === this.runtime.memberRecordFeedKey) return declaration;
      } catch { /* Invalid local data must not become an identity declaration. */ }
    }
    return null;
  }

  /** Builds and signs a short-lived, explicit discovery announcement for a valid local declaration. */
  private createAnnouncement(stored: StoredIdentity, declaration: MemberFeedDeclaration) {
    const announcedAt = new Date().toISOString();
    const unsigned = { schema: "peer-hours/member-feed-announcement/v1" as const, declaration, announcedAt, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() };
    return createMemberFeedAnnouncement({ ...unsigned, signature: this.sign(stored, canonicalMemberFeedAnnouncementPayload(unsigned)) });
  }

  /** Decrypts the root key only long enough to sign exact canonical protocol bytes. */
  private sign(stored: StoredIdentity, payload: Uint8Array): string {
    return sign(null, payload, safeStorage.decryptString(Buffer.from(stored.privateKeyCiphertext, "base64"))).toString("base64url");
  }

  /** Returns the private application-state file path for encrypted identity material. */
  private identityPath(): string { return join(this.dataDirectory, "member-root-identity.json"); }
}
