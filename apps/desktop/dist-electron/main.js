import { app, BrowserWindow } from "electron";
import { join } from "node:path";
const createWindow = () => {
    const window = new BrowserWindow({
        width: 1100,
        height: 760,
        minWidth: 720,
        minHeight: 480,
        webPreferences: {
            preload: join(import.meta.dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    if (process.env.VITE_DEV_SERVER_URL) {
        void window.loadURL(process.env.VITE_DEV_SERVER_URL);
    }
    else {
        void window.loadFile(join(import.meta.dirname, "../dist/index.html"));
    }
};
app.whenReady().then(() => {
    createWindow();
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        app.quit();
});
//# sourceMappingURL=main.js.map