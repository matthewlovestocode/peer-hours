import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("peerHours", {
  platform: process.platform,
  getNetworkStatus: () => ipcRenderer.invoke("network:status"),
  getMemberRecords: () => ipcRenderer.invoke("member:records"),
  getMemberIdentityStatus: () => ipcRenderer.invoke("member:identity-status"),
  createAndAnnounceMemberIdentity: () => ipcRenderer.invoke("member:create-and-announce"),
  activateDeviceSigningKey: () => ipcRenderer.invoke("member:activate-device-signing-key"),
  revokeDeviceSigningKey: (keyId: string) => ipcRenderer.invoke("member:revoke-device-signing-key", keyId),
  publishListing: (input: { kind: "offer" | "request"; title: string; minutes: number }) => ipcRenderer.invoke("member:publish-listing", input),
  closeListing: (listingId: string) => ipcRenderer.invoke("member:close-listing", listingId),
  getResolvedMemberState: () => ipcRenderer.invoke("member:resolved"),
  createProposal: (input: { offerId: string; requestId: string; minutes: number }) => ipcRenderer.invoke("member:create-proposal", input),
  acceptProposal: (proposalId: string) => ipcRenderer.invoke("member:accept-proposal", proposalId),
  acknowledgeSettlement: (proposalId: string) => ipcRenderer.invoke("member:acknowledge-settlement", proposalId),
  advanceSettlement: (proposalId: string) => ipcRenderer.invoke("member:advance-settlement", proposalId),
  onNetworkStatusChanged: (listener: (status: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: unknown) => listener(status);
    ipcRenderer.on("network:status-changed", handler);
    return () => ipcRenderer.removeListener("network:status-changed", handler);
  },
});
