import { app, BrowserWindow, Menu } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

let mainWindow = null;
let backendProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 680,
    title: "Local Canvas", backgroundColor: "#1a1b1e",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false, contextIsolation: true,
    },
  });

  if (!app.isPackaged) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(ROOT_DIR, "public", "index.html"));
  }
  mainWindow.on("closed", () => { mainWindow = null; });
}

function startBackend() {
  return new Promise((resolve, reject) => {
    const backendPath = path.join(ROOT_DIR, "src", "index.js");
    console.log("[Electron] Spawning backend:", backendPath);

    backendProcess = spawn("node", [backendPath], {
      cwd: ROOT_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PORT: "3001", HOST: "0.0.0.0" },
    });

    backendProcess.stdout.on("data", (d) => console.log("[backend]", d.toString().trim()));
    backendProcess.stderr.on("data", (d) => console.error("[backend:err]", d.toString().trim()));
    backendProcess.on("error", reject);
    backendProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) console.error("[backend] exited with code", code);
    });

    // Poll until backend is ready
    const maxAttempts = 60;
    let attempts = 0;
    const check = () => {
      attempts++;
      const req = http.get("http://127.0.0.1:3001/api/health", (res) => {
        if (res.statusCode === 200) {
          console.log("[Electron] Backend ready");
          resolve();
        } else if (attempts < maxAttempts) {
          setTimeout(check, 500);
        } else {
          reject(new Error("Backend health check failed"));
        }
      });
      req.on("error", () => {
        if (attempts < maxAttempts) setTimeout(check, 500);
        else reject(new Error("Backend not reachable after " + maxAttempts + " attempts"));
      });
      req.setTimeout(2000, () => { req.destroy(); if (attempts < maxAttempts) setTimeout(check, 500); });
    };
    setTimeout(check, 1000);
  });
}

app.whenReady().then(async () => {
  try {
    if (app.isPackaged) { await startBackend(); }
    else { console.log("[Electron] Dev mode - backend runs separately"); }
    createWindow();
  } catch (err) {
    console.error("[Electron] Failed:", err.message);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  if (backendProcess && !backendProcess.killed) {
    console.log("[Electron] Killing backend...");
    backendProcess.kill("SIGTERM");
  }
});