import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save } from "@tauri-apps/plugin-dialog";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

// =====================
// titlebar controls
// =====================
const appWindow = getCurrentWindow();
document.getElementById("titlebar-minimize")?.addEventListener("click", () => appWindow.minimize());
document.getElementById("titlebar-maximize")?.addEventListener("click", () => appWindow.toggleMaximize());
document.getElementById("titlebar-close")?.addEventListener("click", () => appWindow.close());

const titlebar = document.querySelector(".titlebar");
if (titlebar) {
  titlebar.addEventListener("mousedown", (e) => {
    const target = e.target as HTMLElement;
    // do not initiate drag if clicking on a button, input, or inside them
    if (target.closest("button") || target.closest("input") || target.tagName === "BUTTON" || target.tagName === "INPUT") {
      return;
    }
    appWindow.startDragging();
  });
}

// =====================
// global drag & drop prevention
// =====================
["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
  window.addEventListener(eventName, (e) => e.preventDefault(), false);
  document.addEventListener(eventName, (e) => e.preventDefault(), false);
});

// =====================
// toast notifications
// =====================
function showToast(message: string, durationMs = 6000) {
  // reuse an existing container or create one
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.style.cssText = [
      "position:fixed", "bottom:20px", "right:20px", "z-index:9999",
      "display:flex", "flex-direction:column", "gap:8px", "align-items:flex-end",
    ].join(";");
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.style.cssText = [
    "background:var(--color-error,#e53e3e)", "color:#fff",
    "padding:10px 14px", "border-radius:8px", "font-size:13px",
    "max-width:360px", "word-break:break-word",
    "box-shadow:0 4px 12px rgba(0,0,0,.35)",
    "opacity:1", "transition:opacity .3s ease",
    "cursor:pointer", "line-height:1.4",
  ].join(";");
  toast.textContent = message;
  toast.title = "Click to dismiss";
  toast.addEventListener("click", () => toast.remove());
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, durationMs);
}

// =====================
// settings (localStorage)
// =====================
interface AppSettings {
  outputDir: string;
  alwaysAskSave: boolean;
  theme: "dark" | "light";
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem("justtools-settings");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { outputDir: "", alwaysAskSave: true, theme: "dark" };
}

function saveSettings(s: AppSettings) {
  localStorage.setItem("justtools-settings", JSON.stringify(s));
}

let settings: AppSettings = loadSettings();

// =====================
// platform detection
// =====================
interface PlatformEntry {
  name: string;
  pattern: RegExp;
}

const PLATFORMS: PlatformEntry[] = [
  { name: "YouTube", pattern: /(?:youtu\.be\/|youtube\.com\/(?:watch|shorts|embed|live))/i },
  { name: "Twitch", pattern: /twitch\.tv\//i },
  { name: "TikTok", pattern: /tiktok\.com\//i },
  { name: "SoundCloud", pattern: /soundcloud\.com\//i },
  { name: "Twitter / X", pattern: /(?:twitter\.com|x\.com)\//i },
];

function detectPlatform(url: string): string | null {
  try {
    new URL(url); // basic validity check
  } catch {
    return null;
  }
  for (const p of PLATFORMS) {
    if (p.pattern.test(url)) return p.name;
  }
  return null;
}

function isUrlValid(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// =====================
// DOM references
// =====================

// sidebar
const navItems = document.querySelectorAll<HTMLButtonElement>(".nav-item");
const tabViews = document.querySelectorAll<HTMLDivElement>(".tab-view");

// theme
const themePillToggle = document.getElementById("theme-pill-toggle") as HTMLDivElement;

// URL downloader
const fetchForm = document.getElementById("fetch-form") as HTMLFormElement;
const mediaUrlInput = document.getElementById("media-url-input") as HTMLInputElement;
const clearUrlBtn = document.getElementById("clear-url-btn") as HTMLButtonElement;
const urlStatusBadge = document.getElementById("url-status-badge") as HTMLDivElement;
const fetchBtn = document.getElementById("fetch-btn") as HTMLButtonElement;
const fetchBtnText = fetchBtn.querySelector<HTMLSpanElement>(".btn-text")!;
const fetchBtnLoader = fetchBtn.querySelector<SVGElement>(".loader-icon")!;
const platformSelect = document.getElementById("platform-select") as HTMLSelectElement;

// media preview
const mediaPreviewSection = document.getElementById("media-preview-section") as HTMLElement;
const mediaThumbnail = document.getElementById("media-thumbnail") as HTMLImageElement;
const mediaDuration = document.getElementById("media-duration") as HTMLSpanElement;
const mediaTitle = document.getElementById("media-title") as HTMLElement;
const mediaChannel = document.getElementById("media-channel") as HTMLElement;
const qualitySelector = document.getElementById("quality-selector") as HTMLDivElement;
const downloadBtn = document.getElementById("download-btn") as HTMLButtonElement;

// download progress
const downloadProgressSection = document.getElementById("download-progress-section") as HTMLElement;
const downloadProgressPercentage = document.getElementById("download-progress-percentage") as HTMLSpanElement;
const downloadProgressFill = document.getElementById("download-progress-fill") as HTMLDivElement;
const downloadProgressSpeed = document.getElementById("download-progress-speed") as HTMLSpanElement;
const downloadProgressEta = document.getElementById("download-progress-eta") as HTMLSpanElement;

// local converter
const dropZone = document.getElementById("drop-zone") as HTMLDivElement;
const browseBtn = document.getElementById("browse-btn") as HTMLButtonElement;
const selectedFileInfo = document.getElementById("selected-file-info") as HTMLDivElement;
const selectedFileName = document.getElementById("selected-file-name") as HTMLSpanElement;
const clearFileBtn = document.getElementById("clear-file-btn") as HTMLButtonElement;
const convertOptionsSection = document.getElementById("convert-options-section") as HTMLElement;
const convertBtn = document.getElementById("convert-btn") as HTMLButtonElement;
const targetFormatPills = document.querySelectorAll<HTMLButtonElement>("#target-format-selector .quality-pill");

// convert progress
const convertProgressSection = document.getElementById("convert-progress-section") as HTMLElement;
const convertProgressPercentage = document.getElementById("convert-progress-percentage") as HTMLSpanElement;
const convertProgressFill = document.getElementById("convert-progress-fill") as HTMLDivElement;
const convertProgressTime = document.getElementById("convert-progress-time") as HTMLSpanElement;

// settings
const outputDirInput = document.getElementById("output-dir-input") as HTMLInputElement;
const browseOutputDirBtn = document.getElementById("browse-output-dir-btn") as HTMLButtonElement;
const alwaysAskToggle = document.getElementById("always-ask-toggle") as HTMLInputElement;
const checkUpdatesBtn = document.getElementById("check-updates-btn") as HTMLButtonElement;

// =====================
// state
// =====================
let selectedFormatId = "";
let selectedFilePath = "";
let selectedTargetFormat = "mp4";

// =====================
// theme
// =====================
function applyTheme(theme: "dark" | "light") {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

applyTheme(settings.theme);

themePillToggle.addEventListener("click", () => {
  settings.theme = settings.theme === "light" ? "dark" : "light";
  saveSettings(settings);
  applyTheme(settings.theme);
});

themePillToggle.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    settings.theme = settings.theme === "light" ? "dark" : "light";
    saveSettings(settings);
    applyTheme(settings.theme);
  }
});

// =====================
// updater
// =====================
const updateNotification = document.getElementById("update-notification") as HTMLDivElement;
const stateChecking = document.getElementById("update-state-checking") as HTMLDivElement;
const stateAvailable = document.getElementById("update-state-available") as HTMLDivElement;
const stateDownloading = document.getElementById("update-state-downloading") as HTMLDivElement;
const updateVersionText = document.getElementById("update-version-text") as HTMLSpanElement;
const updateInstallBtn = document.getElementById("update-install-btn") as HTMLButtonElement;
const updateCancelBtn = document.getElementById("update-cancel-btn") as HTMLButtonElement;

function setUpdateState(state: "checking" | "available" | "downloading") {
  stateChecking.classList.remove("active");
  stateAvailable.classList.remove("active");
  stateDownloading.classList.remove("active");
  
  if (state === "checking") stateChecking.classList.add("active");
  else if (state === "available") stateAvailable.classList.add("active");
  else if (state === "downloading") stateDownloading.classList.add("active");
}

let activeUpdate: any = null;

async function doUpdateCheck(manual = false) {
  if (checkUpdatesBtn) {
    checkUpdatesBtn.textContent = "Checking...";
    checkUpdatesBtn.disabled = true;
  }
  
  updateNotification.classList.remove("hidden");
  setUpdateState("checking");

  try {
    const update = await check();
    if (update) {
      activeUpdate = update;
      updateVersionText.textContent = `v${update.version}`;
      setUpdateState("available");
    } else {
      if (manual) {
        showToast("You are on the latest version.");
      }
      setTimeout(() => {
        updateNotification.classList.add("hidden");
      }, 2000);
    }
  } catch (err) {
    console.error(err);
    if (manual) {
      showToast(`Failed to check for updates: ${err}`);
    }
    setTimeout(() => {
      updateNotification.classList.add("hidden");
    }, 2000);
  } finally {
    if (checkUpdatesBtn) {
      checkUpdatesBtn.textContent = "Check for updates";
      checkUpdatesBtn.disabled = false;
    }
  }
}

updateCancelBtn.addEventListener("click", () => {
  updateNotification.classList.add("hidden");
});

updateInstallBtn.addEventListener("click", async () => {
  if (!activeUpdate) return;
  setUpdateState("downloading");
  
  try {
    await activeUpdate.downloadAndInstall();
    await relaunch();
  } catch (err) {
    console.error("Failed to install update:", err);
    showToast(`Failed to install update: ${err}`);
    updateNotification.classList.add("hidden");
  }
});

// Run automatically on startup
setTimeout(() => {
  doUpdateCheck(false);
}, 500);

if (checkUpdatesBtn) {
  checkUpdatesBtn.addEventListener("click", () => doUpdateCheck(true));
}

// =====================
// tab navigation
// =====================
function switchTab(tabId: string) {
  tabViews.forEach((v) => v.classList.remove("active"));
  navItems.forEach((n) => n.classList.remove("active"));

  const target = document.getElementById(`tab-${tabId}`);
  target?.classList.add("active");

  navItems.forEach((n) => {
    if (n.dataset.tab === tabId) n.classList.add("active");
  });
}

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    const tab = item.dataset.tab;
    if (tab) switchTab(tab);
  });
});

// =====================
// settings UI
// =====================
function applySettingsUI() {
  outputDirInput.value = settings.outputDir || "";
  outputDirInput.placeholder = settings.outputDir ? settings.outputDir : "~/Downloads";
  alwaysAskToggle.checked = settings.alwaysAskSave;
}

applySettingsUI();

browseOutputDirBtn.addEventListener("click", async () => {
  const dir = await open({ directory: true, multiple: false, title: "Select Output Folder" });
  if (dir && typeof dir === "string") {
    settings.outputDir = dir;
    saveSettings(settings);
    applySettingsUI();
  }
});

alwaysAskToggle.addEventListener("change", () => {
  settings.alwaysAskSave = alwaysAskToggle.checked;
  saveSettings(settings);
});

// =====================
// URL status badge
// =====================
function showBadge(state: "ok" | "err" | "hidden", label?: string) {
  if (state === "hidden") {
    urlStatusBadge.classList.add("hidden");
    urlStatusBadge.className = "url-status-badge hidden";
    mediaUrlInput.classList.remove("valid", "invalid");
    return;
  }

  urlStatusBadge.classList.remove("hidden", "badge-ok", "badge-err");
  mediaUrlInput.classList.remove("valid", "invalid");

  if (state === "ok") {
    urlStatusBadge.classList.add("badge-ok");
    urlStatusBadge.textContent = `✓ ${label ?? "Supported"}`;
    mediaUrlInput.classList.add("valid");
  } else {
    urlStatusBadge.classList.add("badge-err");
    urlStatusBadge.textContent = label ?? "Invalid URL";
    mediaUrlInput.classList.add("invalid");
  }
}

// =====================
// clear URL
// =====================
function updateClearBtn() {
  if (mediaUrlInput.value.trim()) {
    clearUrlBtn.classList.remove("hidden");
  } else {
    clearUrlBtn.classList.add("hidden");
  }
}

clearUrlBtn.addEventListener("click", () => {
  mediaUrlInput.value = "";
  showBadge("hidden");
  updateClearBtn();
  mediaPreviewSection.classList.add("hidden");
  qualitySelector.innerHTML = "";
  downloadBtn.disabled = true;
  mediaUrlInput.focus();
});

// =====================
// platform / URL validation on input
// =====================
function evaluateUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) {
    showBadge("hidden");
    return;
  }

  const platform = platformSelect.value;

  if (platform !== "auto") {
    // manual selection — trust the user
    if (isUrlValid(trimmed)) {
      showBadge("ok", platformSelect.options[platformSelect.selectedIndex].text);
    } else {
      showBadge("err", "Invalid URL");
    }
    return;
  }

  // auto-detect mode
  if (!isUrlValid(trimmed)) {
    showBadge("err", "Invalid URL");
    return;
  }

  const detected = detectPlatform(trimmed);
  if (detected) {
    showBadge("ok", detected);
  } else {
    showBadge("err", "Unsupported platform");
  }
}

mediaUrlInput.addEventListener("input", () => {
  updateClearBtn();
  evaluateUrl(mediaUrlInput.value);
});

platformSelect.addEventListener("change", () => {
  evaluateUrl(mediaUrlInput.value);
});

// =====================
// URL fetch (yt-dlp)
// =====================
function setFetchLoading(loading: boolean) {
  fetchBtn.disabled = loading;
  if (loading) {
    fetchBtnText.classList.add("hidden");
    fetchBtnLoader.classList.remove("hidden");
    fetchBtnLoader.classList.add("spin");
  } else {
    fetchBtnText.classList.remove("hidden");
    fetchBtnLoader.classList.add("hidden");
    fetchBtnLoader.classList.remove("spin");
  }
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function buildFormatPills(info: Record<string, unknown>) {
  qualitySelector.innerHTML = "";
  selectedFormatId = "";
  downloadBtn.disabled = true;

  const formats = info.formats as Record<string, unknown>[] | undefined;
  if (!formats) return;

  interface DisplayFormat {
    id: string;
    label: string;
    quality: number;
  }

  const seen = new Set<string>();
  const display: DisplayFormat[] = [];

  for (const f of formats) {
    const ext = f.ext as string;
    const vcodec = f.vcodec as string;
    const height = f.height as number | null;
    const hasVideo = vcodec && vcodec !== "none";

    if (!ext) continue;

    if (hasVideo && height) {
      const key = `${height}p`;
      if (!seen.has(key)) {
        seen.add(key);
        display.push({ id: `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`, label: key, quality: height });
      }
    } else if (!hasVideo) {
      const acodec = f.acodec as string;
      const abr = f.abr as number | null;
      if (acodec && acodec !== "none") {
        const key = "Audio MP3";
        if (!seen.has(key)) {
          seen.add(key);
          display.push({ id: "bestaudio/best", label: key, quality: abr ?? 0 });
        }
      }
    }
  }

  display.sort((a, b) => b.quality - a.quality);

  // add "Best" option first
  const bestPill = document.createElement("button");
  bestPill.className = "quality-pill active";
  bestPill.textContent = "Best";
  bestPill.dataset.formatId = "bestvideo+bestaudio/best";
  bestPill.addEventListener("click", () => selectPill(bestPill, "bestvideo+bestaudio/best"));
  qualitySelector.appendChild(bestPill);
  selectedFormatId = "bestvideo+bestaudio/best";
  downloadBtn.disabled = false;

  display.forEach((d) => {
    const pill = document.createElement("button");
    pill.className = "quality-pill";
    pill.textContent = d.label;
    pill.dataset.formatId = d.id;
    pill.addEventListener("click", () => selectPill(pill, d.id));
    qualitySelector.appendChild(pill);
  });
}

function selectPill(clickedPill: HTMLButtonElement, formatId: string) {
  qualitySelector.querySelectorAll(".quality-pill").forEach((p) => p.classList.remove("active"));
  clickedPill.classList.add("active");
  selectedFormatId = formatId;
  downloadBtn.disabled = false;
}

fetchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = mediaUrlInput.value.trim();
  if (!url) return;

  setFetchLoading(true);
  mediaPreviewSection.classList.add("hidden");
  downloadProgressSection.classList.add("hidden");

  try {
    const raw = await invoke<string>("get_video_info", { url });
    const info = JSON.parse(raw) as Record<string, unknown>;

    mediaThumbnail.src = (info.thumbnail as string) ?? "";
    mediaTitle.textContent = (info.title as string) ?? "Unknown Title";
    mediaTitle.title = (info.title as string) ?? "";
    mediaChannel.textContent = (info.uploader as string) ?? (info.channel as string) ?? "";
    const dur = info.duration as number | null;
    mediaDuration.textContent = dur ? formatDuration(dur) : "";

    buildFormatPills(info);

    // show the detected platform if auto
    const platform = platformSelect.value;
    if (platform === "auto") {
      const detected = detectPlatform(url);
      if (detected) {
        showBadge("ok", detected);
      }
    }

    mediaPreviewSection.classList.remove("hidden");
  } catch (err) {
    // err is the Err(String) returned from Rust — show the real message
    const msg = typeof err === "string" ? err : String(err);
    console.error("Sidecar Error:", err);
    // show first non-empty line in the badge (truncated), full message in toast
    const firstLine = msg.split("\n").find((l) => l.trim()) ?? "yt-dlp failed";
    showBadge("err", firstLine.slice(0, 72));
    if (msg.length > 72 || msg.includes("\n")) {
      showToast(msg);
    }
  } finally {
    setFetchLoading(false);
  }
});

// =====================
// download
// =====================
downloadBtn.addEventListener("click", async () => {
  const url = mediaUrlInput.value.trim();
  if (!url || !selectedFormatId) return;

  let outputPath: string;

  if (settings.alwaysAskSave) {
    const chosen = await save({
      title: "Save Media File",
      defaultPath: "%(title)s.%(ext)s",
      filters: [{ name: "Media", extensions: ["mp4", "mkv", "webm", "mp3", "m4a", "wav"] }],
    });
    if (!chosen) return;
    outputPath = chosen;
  } else {
    const dir = settings.outputDir || ".";
    outputPath = `${dir}/%(title)s.%(ext)s`;
  }

  downloadProgressSection.classList.remove("hidden");
  downloadProgressFill.style.width = "0%";
  downloadProgressPercentage.textContent = "0%";
  downloadProgressSpeed.textContent = "-- MiB/s";
  downloadProgressEta.textContent = "ETA: --:--";
  downloadBtn.disabled = true;

  try {
    await invoke("download_media", { url, formatId: selectedFormatId, outputPath });
  } catch (err) {
    const msg = typeof err === "string" ? err : String(err);
    console.error("Sidecar Error:", err);
    downloadProgressSection.classList.add("hidden");
    downloadBtn.disabled = false;
    showToast(`Download failed:\n${msg}`);
  }
});

listen<string>("download-error", (event) => {
  const msg = event.payload;
  console.error("Download Error:", msg);
  downloadProgressSection.classList.add("hidden");
  downloadBtn.disabled = false;
  showToast(`Download failed:\n${msg}`);
});

listen<{ progress_percent: number; speed: string; eta: string }>("download-progress", (event) => {
  const { progress_percent, speed, eta } = event.payload;
  const pct = Math.min(100, Math.round(progress_percent));
  downloadProgressFill.style.width = `${pct}%`;
  downloadProgressPercentage.textContent = `${pct}%`;
  downloadProgressSpeed.textContent = speed;
  downloadProgressEta.textContent = `ETA: ${eta}`;

  if (pct >= 100) {
    setTimeout(() => {
      downloadProgressSection.classList.add("hidden");
      downloadBtn.disabled = false;
    }, 1500);
  }
});

// =====================
// local converter
// =====================
function handleSelectedFile(filePath: string, fileName: string) {
  selectedFilePath = filePath;
  selectedFileName.textContent = fileName;
  selectedFileInfo.classList.remove("hidden");
  convertOptionsSection.classList.remove("hidden");
  convertBtn.disabled = false;

  dropZone.classList.add("drop-success");
  setTimeout(() => {
    dropZone.classList.remove("drop-success");
  }, 2000);
}

function clearSelectedFile() {
  selectedFilePath = "";
  selectedFileInfo.classList.add("hidden");
  convertOptionsSection.classList.add("hidden");
  convertProgressSection.classList.add("hidden");
  convertBtn.disabled = true;
}

clearFileBtn.addEventListener("click", clearSelectedFile);

dropZone.addEventListener("click", async () => {
  const file = await open({
    multiple: false,
    filters: [
      { name: "Video / Audio", extensions: ["mp4", "mkv", "avi", "webm", "mov", "mp3", "wav", "aac", "flac"] },
    ],
  });
  if (file && typeof file === "string") {
    const fileName = file.replace(/\\/g, "/").split("/").pop() ?? file;
    handleSelectedFile(file, fileName);
  }
});

browseBtn.addEventListener("click", async (e) => {
  e.stopPropagation();
  const file = await open({
    multiple: false,
    filters: [
      { name: "Video / Audio", extensions: ["mp4", "mkv", "avi", "webm", "mov", "mp3", "wav", "aac", "flac"] },
    ],
  });
  if (file && typeof file === "string") {
    const fileName = file.replace(/\\/g, "/").split("/").pop() ?? file;
    handleSelectedFile(file, fileName);
  }
});

getCurrentWebview().onDragDropEvent((event) => {
  if (event.payload.type === "over" || event.payload.type === "enter") {
    dropZone.classList.add("drag-active");
  } else if (event.payload.type === "leave") {
    dropZone.classList.remove("drag-active");
  } else if (event.payload.type === "drop") {
    dropZone.classList.remove("drag-active");
    if (event.payload.paths && event.payload.paths.length > 0) {
      const path = event.payload.paths[0];
      const name = path.replace(/\\/g, "/").split("/").pop() ?? path;
      handleSelectedFile(path, name);
    }
  }
});

// target format pills
targetFormatPills.forEach((pill) => {
  pill.addEventListener("click", () => {
    targetFormatPills.forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    selectedTargetFormat = pill.dataset.format ?? "mp4";
  });
});

convertBtn.addEventListener("click", async () => {
  if (!selectedFilePath) return;

  let outputPath: string;
  const base = selectedFilePath.replace(/\.[^/.]+$/, "");

  if (settings.alwaysAskSave) {
    const chosen = await save({
      title: "Save Converted File",
      defaultPath: `${base}.${selectedTargetFormat}`,
      filters: [{ name: "Output", extensions: [selectedTargetFormat] }],
    });
    if (!chosen) return;
    outputPath = chosen;
  } else {
    const dir = settings.outputDir || ".";
    const name = selectedFilePath.replace(/\\/g, "/").split("/").pop()?.replace(/\.[^/.]+$/, "") ?? "output";
    outputPath = `${dir}/${name}.${selectedTargetFormat}`;
  }

  convertProgressSection.classList.remove("hidden");
  convertProgressFill.style.width = "0%";
  convertProgressPercentage.textContent = "0%";
  convertProgressTime.textContent = "Time: 00:00:00";
  convertBtn.disabled = true;

  try {
    await invoke("convert_local_file", {
      inputPath: selectedFilePath,
      outputPath,
      targetFormat: selectedTargetFormat,
    });
  } catch (err) {
    const msg = typeof err === "string" ? err : String(err);
    console.error("Sidecar Error:", err);
    convertProgressSection.classList.add("hidden");
    convertBtn.disabled = false;
    showToast(`Conversion failed:\n${msg}`);
  }
});

listen<{ progress_percent: number; time_str: string }>("conversion-progress", (event) => {
  const { progress_percent, time_str } = event.payload;
  const pct = Math.min(100, Math.round(progress_percent));
  convertProgressFill.style.width = `${pct}%`;
  convertProgressPercentage.textContent = `${pct}%`;
  convertProgressTime.textContent = `Time: ${time_str}`;

  if (pct >= 100) {
    setTimeout(() => {
      convertProgressSection.classList.add("hidden");
      convertBtn.disabled = false;
    }, 1500);
  }
});