import { app, BrowserWindow, dialog } from "electron";
import { autoUpdater } from "electron-updater";
import fs from "node:fs";
import path from "node:path";

function createUpdateBackup() {
  try {
    const userData = app.getPath("userData");
    const dbPath = path.join(userData, "almaktaba.sqlite");
    if (!fs.existsSync(dbPath)) return;
    const dir = path.join(userData, "backups");
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    fs.copyFileSync(dbPath, path.join(dir, `almaktaba-before-update-${stamp}.sqlite`));
  } catch (error) {
    console.error("update backup failed", error);
  }
}

function startUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (error) => {
    console.error("auto update error", error);
  });

  autoUpdater.on("update-available", async (info) => {
    const window = BrowserWindow.getAllWindows()[0];
    const result = await dialog.showMessageBox(window ?? undefined, {
      type: "info",
      title: "تحديث جديد متوفر",
      message: `يتوفر إصدار جديد من برنامج المكتبة: ${info.version}`,
      detail: "سيتم إنشاء نسخة احتياطية من قاعدة البيانات قبل تنزيل التحديث.",
      buttons: ["تحديث الآن", "لاحقًا"],
      defaultId: 0,
      cancelId: 1
    });

    if (result.response !== 0) return;

    createUpdateBackup();
    await autoUpdater.downloadUpdate();
  });

  autoUpdater.on("update-downloaded", async () => {
    const window = BrowserWindow.getAllWindows()[0];
    const result = await dialog.showMessageBox(window ?? undefined, {
      type: "info",
      title: "اكتمل تحميل التحديث",
      message: "تم تحميل التحديث بنجاح.",
      detail: "سيتم إغلاق البرنامج وإعادة تشغيله لتثبيت الإصدار الجديد.",
      buttons: ["إعادة التشغيل الآن", "لاحقًا"],
      defaultId: 0,
      cancelId: 1
    });

    if (result.response === 0) autoUpdater.quitAndInstall();
  });

  setTimeout(() => {
    void autoUpdater.checkForUpdates();
  }, 5000);
}

app.whenReady().then(startUpdater);
