import { app, BrowserWindow, ipcMain, safeStorage } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PeerRuntime } from "@peer-hours/peer-runtime";
import { resolveTimebankMemberFeeds } from "@peer-hours/timebank-records";
import { MemberIdentityService, type StoredMemberIdentity } from "./member-identity.js";

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
  ipcMain.handle("member:publish-listing", (_event, input) => memberIdentity.publishListing(input));
  ipcMain.handle("member:create-proposal", async (_event, input: { offerId?: unknown; requestId?: unknown; minutes?: unknown }) => {
    const communityId = runtime.status().community?.communityId;
    if (!communityId) throw new Error("Connect to a bootstrap discovery scope before creating a proposal.");
    if (typeof input.offerId !== "string" || typeof input.requestId !== "string" || typeof input.minutes !== "number") throw new Error("Proposal details are invalid.");
    const feedKeys = new Set([runtime.memberRecordFeedKey, ...runtime.knownMemberFeeds().filter((feed) => feed.communityId === communityId).map((feed) => feed.feedPublicKey)]);
    const histories = await Promise.all([...feedKeys].map(async (feedPublicKey) => ({ feedPublicKey, records: (feedPublicKey === runtime.memberRecordFeedKey ? await runtime.readMemberRecords() : await runtime.readMemberRecordsFromFeed(feedPublicKey)) as never })));
    const resolved = resolveTimebankMemberFeeds(communityId, histories);
    const offer = resolved.publishedListings.find((listing) => listing.id === input.offerId && listing.kind === "offer");
    const request = resolved.publishedListings.find((listing) => listing.id === input.requestId && listing.kind === "request");
    if (!offer || !request) throw new Error("Choose locally accepted published offer and request listings.");
    await memberIdentity.createProposal({ offer, request, minutes: input.minutes });
  });
  ipcMain.handle("member:accept-proposal", async (_event, proposalId: unknown) => {
    if (typeof proposalId !== "string") throw new Error("Proposal id is invalid.");
    const communityId = runtime.status().community?.communityId;
    if (!communityId) throw new Error("Connect to a bootstrap discovery scope before accepting a proposal.");
    const keys = new Set([runtime.memberRecordFeedKey, ...runtime.knownMemberFeeds().filter((feed) => feed.communityId === communityId).map((feed) => feed.feedPublicKey)]);
    const histories = await Promise.all([...keys].map(async (feedPublicKey) => ({ feedPublicKey, records: (feedPublicKey === runtime.memberRecordFeedKey ? await runtime.readMemberRecords() : await runtime.readMemberRecordsFromFeed(feedPublicKey)) as never })));
    const resolved = resolveTimebankMemberFeeds(communityId, histories); const proposal = resolved.proposedProposals.find((item) => item.id === proposalId);
    const offer = proposal && resolved.publishedListings.find((item) => item.id === proposal.offerId); const request = proposal && resolved.publishedListings.find((item) => item.id === proposal.requestId);
    if (!proposal || !offer || !request) throw new Error("Choose a locally accepted pending proposal with accepted listings.");
    await memberIdentity.acceptProposal({ proposal, offer, request });
  });
  ipcMain.handle("member:acknowledge-settlement", async (_event, proposalId: unknown) => {
    if (typeof proposalId !== "string") throw new Error("Proposal id is invalid.");
    const communityId = runtime.status().community?.communityId;
    if (!communityId) throw new Error("Connect to a bootstrap discovery scope before acknowledging a settlement.");
    const feedKeys = new Set([runtime.memberRecordFeedKey, ...runtime.knownMemberFeeds().filter((feed) => feed.communityId === communityId).map((feed) => feed.feedPublicKey)]);
    const histories = await Promise.all([...feedKeys].map(async (feedPublicKey) => ({ feedPublicKey, records: (feedPublicKey === runtime.memberRecordFeedKey ? await runtime.readMemberRecords() : await runtime.readMemberRecordsFromFeed(feedPublicKey)) as never })));
    const resolved = resolveTimebankMemberFeeds(communityId, histories);
    const proposal = resolved.acceptedProposals.find((item) => item.id === proposalId);
    if (!proposal) throw new Error("Choose a locally accepted proposal before acknowledging its settlement.");
    const identity = await memberIdentity.status();
    if (identity.state !== "ready" || identity.memberId === null) throw new Error("Create your self-owned identity before acknowledging a settlement.");
    const confirmation = resolved.settlementConfirmations.find((item) => item.proposalId === proposalId);
    if (confirmation?.acknowledgements.some((item) => item.acknowledgedByMemberId === identity.memberId)) {
      throw new Error("You have already acknowledged completion of this exchange.");
    }
    await memberIdentity.acknowledgeSettlement(proposal);
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
      return { state: "ready" as const, publishedListings: resolved.publishedListings, proposedProposals: resolved.proposedProposals, acceptedProposals: resolved.acceptedProposals, settlementConfirmations: resolved.settlementConfirmations, transfers: resolved.transfers };
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
