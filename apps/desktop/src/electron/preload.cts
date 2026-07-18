import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("peerHours", {
  platform: process.platform,
  getNetworkStatus: () => ipcRenderer.invoke("network:status"),
  getMemberRecords: () => ipcRenderer.invoke("member:records"),
  getMemberIdentityStatus: () => ipcRenderer.invoke("member:identity-status"),
  createAndAnnounceMemberIdentity: () => ipcRenderer.invoke("member:create-and-announce"),
  publishListing: (input: { kind: "offer" | "request"; title: string; minutes: number }) => ipcRenderer.invoke("member:publish-listing", input),
  getResolvedMemberState: () => ipcRenderer.invoke("member:resolved"),
  onNetworkStatusChanged: (listener: (status: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: unknown) => listener(status);
    ipcRenderer.on("network:status-changed", handler);
    return () => ipcRenderer.removeListener("network:status-changed", handler);
  },
});
