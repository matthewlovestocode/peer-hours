import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("peerHours", {
  platform: process.platform,
});
