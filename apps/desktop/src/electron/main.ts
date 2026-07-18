import { app, BrowserWindow, ipcMain, safeStorage } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PeerRuntime } from "@peer-hours/peer-runtime";
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
