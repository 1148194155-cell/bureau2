import { app, BrowserWindow, Menu } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

let mainWindow = null;
let backendProcess = null;

const DEV_PORT = process.env.DEV_PORT || "5173";

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 680,
    title: "Local Canvas", backgroundColor: "#1a1b1e",
    show: !app.isPackaged,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false, contextIsolation: true,
    },
  });

  // 等页面加载完再显示窗口，避免白屏闪烁
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // 超时后备：5 秒后强制显示窗口，避免白屏卡死
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 5000);

  // 页面加载失败时也显示窗口
  mainWindow.webContents.on("did-fail-load", () => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  });

  // 保留 File > Exit 菜单，方便用户关闭窗口
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [
      { role: 'quit', label: 'Exit' }
    ]},
    { label: 'View', submenu: [
      { role: 'reload', label: 'Reload' },
      { role: 'forceReload', label: 'Force Reload' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' }
    ]}
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  // 彻底禁用 DevTools（覆写方法，任何调用都无效）
  mainWindow.webContents.openDevTools = () => {};

  // 拦截 DevTools 快捷键 (F12 / Ctrl+Shift+I / Ctrl+Shift+J)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' ||
        (input.control && input.shift && (input.key.toLowerCase() === 'i' || input.key.toLowerCase() === 'j'))) {
      event.preventDefault();
    }
  });

  // 万一 DevTools 还是打开了，立刻关掉
  mainWindow.webContents.on('devtools-opened', () => {
    mainWindow.webContents.closeDevTools();
  });

  if (!app.isPackaged) {
    mainWindow.loadURL("http://localhost:" + DEV_PORT);
    // 发布前去掉这行注释，开发时保留：
    // mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(ROOT_DIR, "public", "index.html"));
  }
  mainWindow.on("closed", () => { mainWindow = null; });
}

function startBackend() {
  return new Promise((resolve, reject) => {
    const backendPath = path.join(ROOT_DIR, "src", "index.js");

    // 优先使用自带便携版 node.exe，没有则用系统 PATH 上的 node
    const bundledNode = path.join(ROOT_DIR, "node_portable", "node.exe");
    const nodeCmd = fs.existsSync(bundledNode) ? bundledNode : "node";
    console.log("[Electron] Spawning backend via:", nodeCmd);

    backendProcess = spawn(nodeCmd, [backendPath], {
      cwd: ROOT_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PORT: "3001", HOST: "127.0.0.1" },
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