import { app, BrowserWindow, ipcMain, safeStorage } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PeerRuntime } from "@peer-hours/peer-runtime";
import { resolveTimebankMemberFeeds } from "@peer-hours/timebank-records";
import { MemberIdentityService, type StoredMemberIdentity } from "./member-identity.js";
import { presentResolvedMemberState } from "./resolved-member-state.js";
import { collectVerifiedSettlementDurability } from "./settlement-durability.js";
import { parseCreateProposalRequest, parseDeviceSigningKeyId, parseListingId, parsePublishListingRequest, parseRecordId } from "./ipc-inputs.js";

const dataDirectory = join(app.getPath("userData"), "peer-hours");
const runtime = new PeerRuntime(
  dataDirectory,
  process.env.PEER_HOURS_BOOTSTRAP_KEY,
  process.env.PEER_HOURS_BOOTSTRAP_URL ?? "http://127.0.0.1:10001/bootstrap",
);
const memberIdentityPath = join(dataDirectory, "member-root-identity.json");
const memberIdentity = new MemberIdentityService(
  {
    isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
    encryptString: (value) => safeStorage.encryptString(value).toString("base64"),
    decryptString: (value) => safeStorage.decryptString(Buffer.from(value, "base64")),
  },
  {
    async read(): Promise<StoredMemberIdentity | null> {
      try { return JSON.parse(await readFile(memberIdentityPath, "utf8")) as StoredMemberIdentity; } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async write(identity): Promise<void> {
      await writeFile(memberIdentityPath, JSON.stringify(identity), { encoding: "utf8", mode: 0o600 });
    },
  },
  {
    communityId: () => runtime.status().community?.communityId ?? null,
    feedPublicKey: () => runtime.memberRecordFeedKey,
    readRecords: () => runtime.readMemberRecords(),
    appendRecord: (record) => runtime.appendMemberRecord(record),
    publishAnnouncement: (announcement) => runtime.publishMemberFeedAnnouncement(announcement),
  },
);

/** Creates the desktop window and loads either the Vite development UI or built renderer. */
const createWindow = () => {
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    webPreferences: {
      preload: join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(join(import.meta.dirname, "../dist/index.html"));
  }
};

app.whenReady().then(() => {
  void runtime.start();
  ipcMain.handle("network:status", () => runtime.status());
  ipcMain.handle("member:records", () => runtime.readMemberRecords());
  ipcMain.handle("member:identity-status", () => memberIdentity.status());
  ipcMain.handle("member:create-and-announce", () => memberIdentity.createAndAnnounce());
  ipcMain.handle("member:activate-device-signing-key", () => memberIdentity.activateDeviceSigningKey());
  ipcMain.handle("member:revoke-device-signing-key", (_event, keyId: unknown) => memberIdentity.revokeDeviceSigningKey(parseDeviceSigningKeyId(keyId)));
  ipcMain.handle("member:publish-listing", (_event, input) => memberIdentity.publishListing(parsePublishListingRequest(input)));
  ipcMain.handle("member:close-listing", async (_event, listingId: unknown) => {
    const closedListingId = parseListingId(listingId);
    const communityId = runtime.status().community?.communityId;
    if (!communityId) throw new Error("Connect to a bootstrap discovery scope before closing a listing.");
    const identity = await memberIdentity.status();
    if (identity.state !== "ready" || identity.memberId === null) throw new Error("Create your self-owned identity before closing a listing.");
    const feedKeys = new Set([runtime.memberRecordFeedKey, ...runtime.knownMemberFeeds().filter((feed) => feed.communityId === communityId).map((feed) => feed.feedPublicKey)]);
    const histories = await Promise.all([...feedKeys].map(async (feedPublicKey) => ({ feedPublicKey, records: (feedPublicKey === runtime.memberRecordFeedKey ? await runtime.readMemberRecords() : await runtime.readMemberRecordsFromFeed(feedPublicKey)) as never })));
    const resolved = resolveTimebankMemberFeeds(communityId, histories);
    const listing = resolved.publishedListings.find((item) => item.id === closedListingId);
    if (!listing || listing.memberId !== identity.memberId) throw new Error("Choose one of your locally accepted active listings to close.");
    await memberIdentity.closeListing({ listing });
  });
  ipcMain.handle("member:create-proposal", async (_event, input: { offerId?: unknown; requestId?: unknown; minutes?: unknown }) => {
    const request = parseCreateProposalRequest(input);
    const communityId = runtime.status().community?.communityId;
    if (!communityId) throw new Error("Connect to a bootstrap discovery scope before creating a proposal.");
    const feedKeys = new Set([runtime.memberRecordFeedKey, ...runtime.knownMemberFeeds().filter((feed) => feed.communityId === communityId).map((feed) => feed.feedPublicKey)]);
    const histories = await Promise.all([...feedKeys].map(async (feedPublicKey) => ({ feedPublicKey, records: (feedPublicKey === runtime.memberRecordFeedKey ? await runtime.readMemberRecords() : await runtime.readMemberRecordsFromFeed(feedPublicKey)) as never })));
    const resolved = resolveTimebankMemberFeeds(communityId, histories);
    const offer = resolved.publishedListings.find((listing) => listing.id === request.offerId && listing.kind === "offer");
    const requestListing = resolved.publishedListings.find((listing) => listing.id === request.requestId && listing.kind === "request");
    if (!offer || !requestListing) throw new Error("Choose locally accepted published offer and request listings.");
    await memberIdentity.createProposal({ offer, request: requestListing, minutes: request.minutes });
  });
  ipcMain.handle("member:accept-proposal", async (_event, proposalId: unknown) => {
    const acceptedProposalId = parseRecordId(proposalId, "Proposal id");
    const communityId = runtime.status().community?.communityId;
    if (!communityId) throw new Error("Connect to a bootstrap discovery scope before accepting a proposal.");
    const keys = new Set([runtime.memberRecordFeedKey, ...runtime.knownMemberFeeds().filter((feed) => feed.communityId === communityId).map((feed) => feed.feedPublicKey)]);
    const histories = await Promise.all([...keys].map(async (feedPublicKey) => ({ feedPublicKey, records: (feedPublicKey === runtime.memberRecordFeedKey ? await runtime.readMemberRecords() : await runtime.readMemberRecordsFromFeed(feedPublicKey)) as never })));
    const resolved = resolveTimebankMemberFeeds(communityId, histories); const proposal = resolved.proposedProposals.find((item) => item.id === acceptedProposalId);
    const offer = proposal && resolved.publishedListings.find((item) => item.id === proposal.offerId); const request = proposal && resolved.publishedListings.find((item) => item.id === proposal.requestId);
    if (!proposal || !offer || !request) throw new Error("Choose a locally accepted pending proposal with accepted listings.");
    await memberIdentity.acceptProposal({ proposal, offer, request });
  });
  ipcMain.handle("member:acknowledge-settlement", async (_event, proposalId: unknown) => {
    const acknowledgedProposalId = parseRecordId(proposalId, "Proposal id");
    const communityId = runtime.status().community?.communityId;
    if (!communityId) throw new Error("Connect to a bootstrap discovery scope before acknowledging a settlement.");
    const feedKeys = new Set([runtime.memberRecordFeedKey, ...runtime.knownMemberFeeds().filter((feed) => feed.communityId === communityId).map((feed) => feed.feedPublicKey)]);
    const histories = await Promise.all([...feedKeys].map(async (feedPublicKey) => ({ feedPublicKey, records: (feedPublicKey === runtime.memberRecordFeedKey ? await runtime.readMemberRecords() : await runtime.readMemberRecordsFromFeed(feedPublicKey)) as never })));
    const resolved = resolveTimebankMemberFeeds(communityId, histories);
    const proposal = resolved.acceptedProposals.find((item) => item.id === acknowledgedProposalId);
    if (!proposal) throw new Error("Choose a locally accepted proposal before acknowledging its settlement.");
    const identity = await memberIdentity.status();
    if (identity.state !== "ready" || identity.memberId === null) throw new Error("Create your self-owned identity before acknowledging a settlement.");
    const confirmation = resolved.settlementConfirmations.find((item) => item.proposalId === acknowledgedProposalId);
    if (confirmation?.acknowledgements.some((item) => item.acknowledgedByMemberId === identity.memberId)) {
      throw new Error("You have already acknowledged completion of this exchange.");
    }
    await memberIdentity.acknowledgeSettlement(proposal);
  });
  ipcMain.handle("member:advance-settlement", async (_event, proposalId: unknown) => {
    const settlementProposalId = parseRecordId(proposalId, "Proposal id");
    const communityId = runtime.status().community?.communityId;
    if (!communityId) throw new Error("Connect to a bootstrap discovery scope before advancing a settlement.");
    const feedKeys = new Set([runtime.memberRecordFeedKey, ...runtime.knownMemberFeeds().filter((feed) => feed.communityId === communityId).map((feed) => feed.feedPublicKey)]);
    const histories = await Promise.all([...feedKeys].map(async (feedPublicKey) => ({ feedPublicKey, records: (feedPublicKey === runtime.memberRecordFeedKey ? await runtime.readMemberRecords() : await runtime.readMemberRecordsFromFeed(feedPublicKey)) as never })));
    const resolved = resolveTimebankMemberFeeds(communityId, histories);
    const proposal = resolved.acceptedProposals.find((item) => item.id === settlementProposalId);
    if (!proposal) throw new Error("Choose a locally accepted proposal before advancing its settlement.");
    if (resolved.ledger.transfers.some((transfer) => transfer.sourceProposalId === proposal.id)) {
      throw new Error("This settlement is already locally admitted; it is not a claim of network finality.");
    }
    const confirmation = resolved.settlementConfirmations.find((item) => item.proposalId === proposal.id);
    if (confirmation?.status !== "dual-confirmed") throw new Error("Both participants must acknowledge completion before signing settlement terms.");
    const attestationState = resolved.settlementAttestations.find((item) => item.proposalId === proposal.id);
    await memberIdentity.advanceSettlement({ proposal, acknowledgements: confirmation.acknowledgements, attestations: attestationState?.attestations ?? [] });
  });
  ipcMain.handle("member:resolved", async () => {
    const communityId = runtime.status().community?.communityId;
    if (!communityId) return { state: "unavailable" as const, reason: "No bootstrap discovery community is configured." };
    try {
      const feedKeys = new Set([runtime.memberRecordFeedKey, ...runtime.knownMemberFeeds()
        .filter((feed) => feed.communityId === communityId)
        .map((feed) => feed.feedPublicKey)]);
      const histories = await Promise.all([...feedKeys].map(async (feedPublicKey) => ({
        feedPublicKey,
        records: (feedPublicKey === runtime.memberRecordFeedKey
          ? await runtime.readMemberRecords()
          : await runtime.readMemberRecordsFromFeed(feedPublicKey)) as never,
      })));
      const resolved = resolveTimebankMemberFeeds(communityId, histories);
      const settlementDurability = await collectVerifiedSettlementDurability({
        community: runtime.status().community,
        transfers: resolved.ledger.transfers,
      });
      return presentResolvedMemberState(resolved, settlementDurability);
    } catch (error) {
      return { state: "rejected" as const, reason: error instanceof Error ? error.message : "Local records could not be verified." };
    }
  });
  runtime.onStatusChange((status) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send("network:status-changed", status);
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => void runtime.stop());
