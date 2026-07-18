import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("peerHours", {
  platform: process.platform,
  getNetworkStatus: () => ipcRenderer.invoke("network:status"),
  onNetworkStatusChanged: (listener: (status: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: unknown) => listener(status);
    ipcRenderer.on("network:status-changed", handler);
    return () => ipcRenderer.removeListener("network:status-changed", handler);
  },
});
