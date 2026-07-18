import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { PeerRuntime } from "@peer-hours/peer-runtime";

const runtime = new PeerRuntime(
  join(app.getPath("userData"), "peer-hours"),
  process.env.PEER_HOURS_BOOTSTRAP_KEY,
  process.env.PEER_HOURS_BOOTSTRAP_URL ?? "http://127.0.0.1:10000/bootstrap",
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
