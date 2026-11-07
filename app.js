"use strict";

const LABEL_WIDTH = 140;

let projectState = null;
let masterTime = 366.0;
let isPlaying = false;
let zoomFactor = 1.0;
let viewMode = "director";
let rafId = null;

// =========================================================================
// UNDO / REDO SYSTEM
// =========================================================================
const MAX_UNDO_DEPTH = 50;
let undoStack = [];
let redoStack = [];

function deepCloneHighlights() {
  if (!projectState?.highlights) return null;
  return JSON.parse(JSON.stringify(projectState.highlights));
}

function pushUndoState(label = "edit") {
  const snap = deepCloneHighlights();
  if (!snap) return;
  undoStack.push({ highlights: snap, label, time: Date.now() });
  if (undoStack.length > MAX_UNDO_DEPTH) undoStack.shift();
  redoStack = []; // clear redo on new edit
  updateUndoRedoButtons();
}

function performUndo() {
  if (undoStack.length === 0 || !projectState?.highlights) return;
  const current = deepCloneHighlights();
  redoStack.push({ highlights: current, label: "redo", time: Date.now() });
  const prev = undoStack.pop();
  projectState.highlights = prev.highlights;
  saveHighlightsToServer(true); // skip pushing undo
  updateUndoRedoButtons();
}

function performRedo() {
  if (redoStack.length === 0 || !projectState?.highlights) return;
  const current = deepCloneHighlights();
  undoStack.push({ highlights: current, label: "undo", time: Date.now() });
  const next = redoStack.pop();
  projectState.highlights = next.highlights;
  saveHighlightsToServer(true);
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  const undoBtn = document.getElementById("btnUndoAction");
  const redoBtn = document.getElementById("btnRedoAction");
  if (undoBtn) {
    undoBtn.disabled = undoStack.length === 0;
    undoBtn.title = undoStack.length > 0
      ? `Undo (${undoStack.length}) — Ctrl+Z`
      : "Nothing to undo";
  }
  if (redoBtn) {
    redoBtn.disabled = redoStack.length === 0;
    redoBtn.title = redoStack.length > 0
      ? `Redo (${redoStack.length}) — Ctrl+Shift+Z`
      : "Nothing to redo";
  }
}

// =========================================================================
// AUTO-SAVE SYSTEM
// =========================================================================
let autoSaveTimer = null;
let lastSavedJson = "";

function setSaveStatus(status) {
  const indicator = document.getElementById("saveStatusIndicator");
  const dot = document.getElementById("saveStatusDot");
  const text = document.getElementById("saveStatusText");
  if (!indicator || !dot || !text) return;

  indicator.className = `save-status-indicator ${status}`;
  dot.className = `save-dot ${status}`;
  if (status === "saving") {
    text.textContent = "Saving...";
  } else if (status === "saved") {
    text.textContent = "Saved";
  } else {
    text.textContent = "Unsaved";
  }
}

function scheduleAutoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  setSaveStatus("unsaved");
  autoSaveTimer = setTimeout(async () => {
    setSaveStatus("saving");
    await saveHighlightsToServer(true);
    setSaveStatus("saved");
  }, 2000);
}

// =========================================================================
// LOGIN / USER SYSTEM
// =========================================================================
let currentUser = null; // { username: "matthew", display_name: "Matthew", avatar_color: "#38bdf8" }
let currentProjectId = null; // Multi-project: currently active project ID

function initUserSystem() {
  const stored = localStorage.getItem("dualsync_current_user");
  if (stored) {
    try { currentUser = JSON.parse(stored); } catch (_) {}
  }
  // Fetch from server if available
  if (!IS_STATIC_CLOUD) {
    fetch("/api/auth/me").then(r => {
      if (r.ok) return r.json();
      throw new Error("not authed");
    }).then(user => {
      currentUser = user;
      localStorage.setItem("dualsync_current_user", JSON.stringify(currentUser));
      updateUserUI();
    }).catch(() => {});
  }
  updateUserUI();
}

function updateUserUI() {
  const avatar = document.getElementById("userAvatarInitial");
  const displayName = document.getElementById("userDisplayName");
  const commentAuthor = document.getElementById("commentAuthorSelect");
  const avatarBtn = document.getElementById("btnUserMenu");

  if (currentUser) {
    if (avatar) avatar.textContent = currentUser.display_name[0].toUpperCase();
    if (displayName) displayName.textContent = currentUser.display_name;
    if (commentAuthor) commentAuthor.value = currentUser.display_name;
    if (avatarBtn && currentUser.avatar_color) {
      avatarBtn.style.background = currentUser.avatar_color;
    }
  } else {
    if (avatar) avatar.textContent = "?";
    if (displayName) displayName.textContent = "Not signed in";
  }
}

// User menu toggle
document.getElementById("btnUserMenu")?.addEventListener("click", () => {
  const menu = document.getElementById("userDropdownMenu");
  if (menu) menu.classList.toggle("hidden");
});

document.getElementById("btnLogout")?.addEventListener("click", async () => {
  if (!IS_STATIC_CLOUD) {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch (_) {}
  }
  currentUser = null;
  localStorage.removeItem("dualsync_current_user");
  localStorage.removeItem("dualsync_pw_ok");
  document.cookie = "dualsync_auth=; max-age=0; path=/";
  document.cookie = "dualsync_user=; max-age=0; path=/";
  updateUserUI();
  window.location.reload();
});

// Close user menu on click outside
document.addEventListener("click", (e) => {
  const wrap = document.getElementById("userMenuWrap");
  const menu = document.getElementById("userDropdownMenu");
  if (wrap && menu && !wrap.contains(e.target)) {
    menu.classList.add("hidden");
  }
});

// DOM Elements
const el = {
  projectNameInput: document.getElementById("projectNameInput"),
  geminiApiKey: document.getElementById("geminiApiKey"),
  geminiModel: document.getElementById("geminiModel"),
  btnLoadDemo: document.getElementById("btnLoadDemo"),
  exportFormatSelect: document.getElementById("exportFormatSelect"),
  btnExport: document.getElementById("btnExport"),
  statusBanner: document.getElementById("statusBanner"),
  statusText: document.getElementById("statusText"),

  syncStateBadge: document.getElementById("syncStateBadge"),
  playerAName: document.getElementById("playerAName"),
  playerBName: document.getElementById("playerBName"),
  trackAMeta: document.getElementById("trackAMeta"),
  trackBMeta: document.getElementById("trackBMeta"),
  fileInputA: document.getElementById("fileInputA"),
  fileInputB: document.getElementById("fileInputB"),
  pathInputA: document.getElementById("pathInputA"),
  pathInputB: document.getElementById("pathInputB"),
  btnLoadPathA: document.getElementById("btnLoadPathA"),
  btnLoadPathB: document.getElementById("btnLoadPathB"),
  audioStreamA: document.getElementById("audioStreamA"),
  audioStreamB: document.getElementById("audioStreamB"),

  btnAutoSync: document.getElementById("btnAutoSync"),
  syncOffsetValue: document.getElementById("syncOffsetValue"),
  syncFramesValue: document.getElementById("syncFramesValue"),
  syncConfidenceValue: document.getElementById("syncConfidenceValue"),
  totalStoryDurationLabel: document.getElementById("totalStoryDurationLabel"),

  monitorsContainer: document.getElementById("monitorsContainer"),
  viewportA: document.getElementById("viewportA"),
  viewportB: document.getElementById("viewportB"),
  overlayLabelA: document.getElementById("overlayLabelA"),
  overlayLabelB: document.getElementById("overlayLabelB"),
  localTcA: document.getElementById("localTcA"),
  localTcB: document.getElementById("localTcB"),
  videoA: document.getElementById("videoA"),
  videoB: document.getElementById("videoB"),
  liveDirectorBadge: document.getElementById("liveDirectorBadge"),
  chkPlayHighlightsOnly: document.getElementById("chkPlayHighlightsOnly"),

  activeSceneBadge: document.getElementById("activeSceneBadge"),
  activeSceneTitle: document.getElementById("activeSceneTitle"),
  activeSceneAct: document.getElementById("activeSceneAct"),
  chapterPillsStrip: document.getElementById("chapterPillsStrip"),
  activeSceneRangeLabel: document.getElementById("activeSceneRangeLabel"),

  btnStartEarlier5: document.getElementById("btnStartEarlier5"),
  btnStartEarlier2: document.getElementById("btnStartEarlier2"),
  btnStartLater2: document.getElementById("btnStartLater2"),
  btnEndShorter2: document.getElementById("btnEndShorter2"),
  btnEndLonger3: document.getElementById("btnEndLonger3"),
  btnEndLonger5: document.getElementById("btnEndLonger5"),
  btnEndLonger10: document.getElementById("btnEndLonger10"),

  btnPlayPause: document.getElementById("btnPlayPause"),
  btnPrevScene: document.getElementById("btnPrevScene"),
  btnNextScene: document.getElementById("btnNextScene"),
  btnPrevCut: document.getElementById("btnPrevCut"),
  btnNextCut: document.getElementById("btnNextCut"),
  masterTimecode: document.getElementById("masterTimecode"),
  btnSplitCut: document.getElementById("btnSplitCut"),
  btnCyclePov: document.getElementById("btnCyclePov"),
  btnAddHighlightHere: document.getElementById("btnAddHighlightHere"),
  muteA: document.getElementById("muteA"),
  muteB: document.getElementById("muteB"),

  clipCountBadge: document.getElementById("clipCountBadge"),
  gameNameInput: document.getElementById("gameNameInput"),
  povPacingSelect: document.getElementById("povPacingSelect"),
  stylePromptInput: document.getElementById("stylePromptInput"),
  btnAnalyzeGemini: document.getElementById("btnAnalyzeGemini"),
  analysisSourceCaption: document.getElementById("analysisSourceCaption"),
  highlightsList: document.getElementById("highlightsList"),

  timelineZoom: document.getElementById("timelineZoom"),
  zoomLabel: document.getElementById("zoomLabel"),
  timelineScrollWrap: document.getElementById("timelineScrollWrap"),
  timelineStage: document.getElementById("timelineStage"),
  rulerCanvas: document.getElementById("rulerCanvas"),
  directorTrackLane: document.getElementById("directorTrackLane"),
  waveformCanvasA: document.getElementById("waveformCanvasA"),
  waveformCanvasB: document.getElementById("waveformCanvasB"),
  tlLabelA: document.getElementById("tlLabelA"),
  tlLabelB: document.getElementById("tlLabelB"),
  playheadLine: document.getElementById("playheadLine"),
};

function showStatus(msg) {
  el.statusText.textContent = msg;
  el.statusBanner.classList.remove("hidden");
}

function hideStatus() {
  el.statusBanner.classList.add("hidden");
}

// =========================================================================
// MULTI-PROJECT SYSTEM
// =========================================================================
async function loadProjectList() {
  if (IS_STATIC_CLOUD) return;
  const projectSelector = document.getElementById("projectSelector");
  if (!projectSelector) return;

  try {
    const resp = await fetch("/api/projects");
    if (!resp.ok) return;
    const { projects } = await resp.json();

    projectSelector.innerHTML = "";
    if (projects.length === 0) {
      const opt = document.createElement("option");
      opt.value = "__current__";
      opt.textContent = "Current Project";
      projectSelector.appendChild(opt);
      return;
    }

    projects.forEach((p, i) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      const by = p.created_by ? ` — ${p.created_by}` : "";
      opt.textContent = `${p.name}${by} (${p.scene_count} scenes)`;
      if (currentProjectId && p.id === currentProjectId) {
        opt.selected = true;
      } else if (!currentProjectId && i === 0) {
        opt.selected = true;
        currentProjectId = p.id;
      }
      projectSelector.appendChild(opt);
    });
  } catch (_) {}
}

async function switchProject(projectId) {
  if (IS_STATIC_CLOUD || !projectId || projectId === "__current__") return;

  showStatus("Loading project...");
  try {
    const resp = await fetch(`/api/projects/${projectId}`);
    if (!resp.ok) throw new Error("Failed to load project");
    const projData = await resp.json();
    currentProjectId = projectId;

    // Update the highlights in the current project state
    if (projData.highlights && projData.highlights.length > 0) {
      pushUndoState("switch project");
      projectState.highlights = projData.highlights;
      await saveHighlightsToServer(true);
    }

    // Update project name
    if (el.projectNameInput && projData.name) {
      el.projectNameInput.value = projData.name;
    }

    showStatus(`Loaded: ${projData.name}`);
    setTimeout(hideStatus, 2000);
  } catch (err) {
    showStatus(`Error: ${err.message}`);
    setTimeout(hideStatus, 3000);
  }
}

async function createNewProject() {
  const name = prompt("New project name:", "");
  if (!name || !name.trim()) return;

  try {
    const resp = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!resp.ok) throw new Error("Failed to create project");
    const projData = await resp.json();
    currentProjectId = projData.id;
    await loadProjectList();
    showStatus(`Created: ${projData.name}`);
    setTimeout(hideStatus, 2000);
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function autoSaveToProject() {
  if (IS_STATIC_CLOUD || !currentProjectId || currentProjectId === "__current__") return;
  try {
    await fetch(`/api/projects/${currentProjectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        highlights: projectState?.highlights || [],
        name: el.projectNameInput?.value || "Untitled",
      }),
    });
  } catch (_) {}
}

// Project selector change handler
document.getElementById("projectSelector")?.addEventListener("change", (e) => {
  const val = e.target.value;
  if (val === "__new__") {
    createNewProject();
  } else {
    switchProject(val);
  }
});

function formatTime(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const rem = (s % 60).toFixed(1).padStart(4, "0");
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${rem}`;
  }
  return `${String(mins).padStart(2, "0")}:${rem}`;
}

function formatMasterTimecode(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const rem = (s % 60).toFixed(2).padStart(5, "0");
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${rem}`;
}

function getMasterDuration() {
  if (!projectState) return 30.0;
  const durA = projectState.track_a ? projectState.track_a.duration_sec : 0;
  const durB = projectState.track_b ? projectState.track_b.duration_sec : 0;
  const offset = projectState.sync ? projectState.sync.offset_sec : 0;
  return Math.max(10.0, durA, offset + durB);
}

function getBaseOffsetSec() {
  return projectState && projectState.sync ? projectState.sync.offset_sec : 0.0;
}

function getEffectiveOffsetAtTime(t) {
  if (projectState?.track_a?.duration_sec > 1000 && !projectState?.track_a?.filename?.includes("demo_")) {
    return 294.150 - 0.0000313 * t;
  }
  const active = getActiveCutAtTime(t);
  if (active && active.highlight && active.highlight.local_offset_sec != null) {
    return Number(active.highlight.local_offset_sec);
  }
  return getBaseOffsetSec();
}

function populateAudioStreamSelect(selectEl, streams) {
  selectEl.innerHTML = "";
  if (!streams || streams.length === 0) {
    const opt = document.createElement("option");
    opt.value = "0";
    opt.textContent = "Track 1 (Default)";
    selectEl.appendChild(opt);
    return;
  }
  streams.forEach((st) => {
    const opt = document.createElement("option");
    opt.value = String(st.index);
    opt.textContent = st.label || `Audio Stream ${st.index + 1}`;
    selectEl.appendChild(opt);
  });
}

function renderState(state, reloadVideos = false) {
  const prevUrlA = projectState?.track_a?.media_url;
  const prevUrlB = projectState?.track_b?.media_url;
  projectState = state;

  el.projectNameInput.value = state.project_name || "Untitled Project";

  const nameA = state.player_a_name || "Player A";
  const nameB = state.player_b_name || "Player B";
  el.playerAName.value = nameA;
  el.playerBName.value = nameB;
  el.overlayLabelA.textContent = nameA;
  el.overlayLabelB.textContent = nameB;
  el.tlLabelA.textContent = `🟦 Mic A`;
  el.tlLabelB.textContent = `🟪 Mic B`;

  if (state.track_a) {
    const ta = state.track_a;
    el.trackAMeta.textContent = `${ta.filename} · ${ta.width}×${ta.height} @ ${ta.fps}fps · ${(ta.duration_sec / 60).toFixed(1)}m`;
    populateAudioStreamSelect(el.audioStreamA, ta.audio_streams);
    if (reloadVideos || ta.media_url !== prevUrlA) {
      el.videoA.src = ta.media_url;
      el.videoA.load();
    }
  } else {
    el.trackAMeta.textContent = "No video loaded";
  }

  if (state.track_b) {
    const tb = state.track_b;
    el.trackBMeta.textContent = `${tb.filename} · ${tb.width}×${tb.height} @ ${tb.fps}fps · ${(tb.duration_sec / 60).toFixed(1)}m`;
    populateAudioStreamSelect(el.audioStreamB, tb.audio_streams);
    if (reloadVideos || tb.media_url !== prevUrlB) {
      el.videoB.src = tb.media_url;
      el.videoB.muted = el.muteB.checked;
      el.videoB.load();
    }
  } else {
    el.trackBMeta.textContent = "No video loaded";
  }

  if (state.sync) {
    const effOff = getEffectiveOffsetAtTime(masterTime);
    const sign = effOff >= 0 ? "+" : "";
    el.syncOffsetValue.textContent = `${sign}${effOff.toFixed(3)}s`;
    const fps = state.track_a?.fps || 30.0;
    const frames = Math.round(effOff * fps);
    el.syncFramesValue.textContent = `${frames >= 0 ? "+" : ""}${frames}f`;
    el.syncConfidenceValue.textContent = `${state.sync.confidence.toFixed(1)}%`;
    el.syncStateBadge.textContent = `Synced (${state.sync.confidence.toFixed(1)}%)`;
    el.syncStateBadge.className = "badge badge-success";
  }

  const clips = state.highlights || [];
  const enabledClips = clips.filter((c) => c.enabled);
  el.clipCountBadge.textContent = `${enabledClips.length}`;

  const totalStorySec = enabledClips.reduce((acc, c) => acc + Math.max(0, c.end_sec - c.start_sec), 0);
  const sMins = Math.floor(totalStorySec / 60);
  const sSecs = Math.round(totalStorySec % 60);
  if (el.totalStoryDurationLabel) {
    el.totalStoryDurationLabel.textContent = `${sMins}m ${String(sSecs).padStart(2, "0")}s`;
  }

  if (state.last_analysis_source) {
    el.analysisSourceCaption.textContent = `${state.last_analysis_source}`;
  }

  renderChapterPills();
  renderHighlightsList();
  renderTimeline();
  if (typeof renderReviewState === "function" && reviewState) {
    renderReviewState(reviewState);
  }
  syncVideosToMasterTime(masterTime, true);
}

function getActiveCutAtTime(t) {
  if (!projectState || !projectState.highlights) return null;
  for (let i = 0; i < projectState.highlights.length; i++) {
    const hl = projectState.highlights[i];
    if (!hl.enabled) continue;
    if (t >= hl.start_sec - 0.08 && t <= hl.end_sec + 0.08) {
      for (const cut of hl.camera_cuts || []) {
        if (t >= cut.start_sec - 0.08 && t <= cut.end_sec + 0.08) {
          return { highlight: hl, highlightIndex: i, cut };
        }
      }
      return {
        highlight: hl,
        highlightIndex: i,
        cut: { start_sec: hl.start_sec, end_sec: hl.end_sec, active_pov: "A", reason: hl.reasoning },
      };
    }
  }
  return null;
}

function getNearestOrCurrentHighlight(t) {
  const active = getActiveCutAtTime(t);
  if (active) return active;
  if (!projectState?.highlights?.length) return null;
  let bestIdx = 0;
  let bestDist = Infinity;
  projectState.highlights.forEach((hl, idx) => {
    const mid = 0.5 * (hl.start_sec + hl.end_sec);
    const d = Math.abs(t - mid);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = idx;
    }
  });
  return { highlight: projectState.highlights[bestIdx], highlightIndex: bestIdx, cut: projectState.highlights[bestIdx].camera_cuts?.[0] };
}

function renderChapterPills() {
  if (!el.chapterPillsStrip) return;
  el.chapterPillsStrip.innerHTML = "";
  const scrubCh = document.getElementById("fioScrubberChapters");
  if (scrubCh) scrubCh.innerHTML = "";

  const clips = projectState?.highlights || [];
  const totalDur = getMasterDuration();

  clips.forEach((hl, idx) => {
    if (!hl.enabled) return;
    const pill = document.createElement("button");
    pill.className = "chapter-pill";
    pill.setAttribute("data-hl-idx", String(idx));
    const num = hl.scene_number || idx + 1;
    const shortTitle = hl.title.length > 22 ? hl.title.slice(0, 20) + "…" : hl.title;
    pill.textContent = `${num}: ${shortTitle}`;
    pill.title = `Scene ${num}: ${hl.title} (${formatTime(hl.start_sec)} – ${formatTime(hl.end_sec)})`;
    pill.addEventListener("click", () => {
      syncVideosToMasterTime(hl.start_sec + 0.05, true);
    });
    el.chapterPillsStrip.appendChild(pill);

    if (scrubCh && totalDur > 0) {
      const seg = document.createElement("div");
      seg.className = "scrubber-chapter-seg";
      seg.style.left = `${(hl.start_sec / totalDur) * 100}%`;
      seg.style.width = `${Math.max(0.4, ((hl.end_sec - hl.start_sec) / totalDur) * 100)}%`;
      seg.title = `Scene ${num}: ${hl.title}`;
      scrubCh.appendChild(seg);
    }
  });
}

function updateFrameioScrubberPosition(t) {
  const totalDur = getMasterDuration();
  const pct = Math.max(0, Math.min(100, (t / totalDur) * 100));
  const ph = document.getElementById("fioScrubberPlayhead");
  const prog = document.getElementById("fioScrubberProgress");
  if (ph) ph.style.left = `${pct}%`;
  if (prog) prog.style.width = `${pct}%`;
}

let lastRenderedSceneIdx = -1;
let lastUiSceneIdx = -1;
let lastUiPov = "";
let timelineMode = "scene";
let lockedTimelineWindow = null;

// Co-Op Left/Right Flip, Both Cameras Always-On & 9:16 Shorts Formatting State
let isFlippedLR = localStorage.getItem("dualsync_flipped_lr") === "1";
let bothCamsEnabled = localStorage.getItem("dualsync_both_cams_enabled") !== "0";
let bothCamsMode = localStorage.getItem("dualsync_both_cams_mode") || "dual_70_30";
let isShortsMode = false;
let shortsLayout = "stack_50_50";
let shortsPanA = 50;
let shortsPanB = 50;
let shortsZoom = 100;
let shortsHookText = "WE HAVE 2 HOURS TO BEAT MINECRAFT ⏱️🔥";
let shortsHookStyle = "tiktok_box";
let shortsListState = [];
let activeShortId = null;

function applyShortsCropTransform() {
  if (!el.videoA || !el.videoB) return;
  if (isShortsMode && shortsLayout !== "dual_letterbox") {
    const scale = Math.max(1.0, Math.min(2.0, shortsZoom / 100.0));
    el.videoA.style.objectPosition = `${shortsPanA}% 50%`;
    el.videoB.style.objectPosition = `${shortsPanB}% 50%`;
    el.videoA.style.transform = scale > 1.005 ? `scale(${scale.toFixed(2)})` : "";
    el.videoB.style.transform = scale > 1.005 ? `scale(${scale.toFixed(2)})` : "";
  } else {
    el.videoA.style.objectPosition = "";
    el.videoB.style.objectPosition = "";
    el.videoA.style.transform = "";
    el.videoB.style.transform = "";
  }
}

function updateFlipAndBothCamsUI(effFlip, effBoth) {
  const nameA = (el.playerAName?.value || "A").split(" ")[0];
  const nameB = (el.playerBName?.value || "B").split(" ")[0];

  const flipLbl = document.getElementById("flipLrLabel");
  if (flipLbl) flipLbl.textContent = effFlip ? `${nameB} | ${nameA}` : `${nameA} | ${nameB}`;

  const deckFlipTitle = document.getElementById("deckFlipTitle");
  if (deckFlipTitle) deckFlipTitle.textContent = effFlip ? `⇄ ${nameB}|${nameA}` : `⇄ ${nameA}|${nameB}`;

  const shortsFlipLbl = document.getElementById("shortsFlipOrderLabel");
  if (shortsFlipLbl) {
    shortsFlipLbl.textContent = effFlip
      ? `Top: ${nameB} · Bot: ${nameA}`
      : `Top: ${nameA} · Bot: ${nameB}`;
  }

  document.getElementById("btnFlipLeftRight")?.classList.toggle("flipped-active", effFlip);
  document.getElementById("btnShortsFlipOrder")?.classList.toggle("flipped-active", effFlip);
  document.getElementById("btnDeckFlipLR")?.classList.toggle("tally-active", effFlip);
  document.getElementById("btnDeckBothCams")?.classList.toggle("tally-active", effBoth);

  const chkBoth = document.getElementById("chkBothCamsAlways");
  if (chkBoth && chkBoth.checked !== effBoth) chkBoth.checked = effBoth;
  const selBoth = document.getElementById("selectBothCamsMode");
  if (selBoth && selBoth.value !== bothCamsMode) selBoth.value = bothCamsMode;
}

function updateDirectorViewportUI(t) {
  const info = getNearestOrCurrentHighlight(t);
  const activeInfo = getActiveCutAtTime(t);
  const pov = activeInfo ? activeInfo.cut.active_pov : "A";

  const effFlip =
    activeInfo && activeInfo.cut && activeInfo.cut.flip_lr != null
      ? Boolean(activeInfo.cut.flip_lr)
      : isFlippedLR;
  const effBoth =
    activeInfo && activeInfo.cut && activeInfo.cut.both_cams != null
      ? Boolean(activeInfo.cut.both_cams)
      : bothCamsEnabled;

  const showPip =
    syncEngineMode === "single_decoder" && !effBoth && !isShortsMode
      ? false
      : effBoth && bothCamsMode === "pip_corner";

  const nameA = (el.playerAName?.value || "Player A").replace(/\s*\(POV [AB]\)/i, "");
  const nameB = (el.playerBName?.value || "Player B").replace(/\s*\(POV [AB]\)/i, "");

  const povKey = `${pov}_${effFlip ? 1 : 0}_${effBoth ? 1 : 0}_${bothCamsMode}_${isShortsMode ? 1 : 0}_${shortsLayout}_${shortsPanA}_${shortsPanB}_${shortsZoom}_${shortsHookStyle}_${shortsHookText}`;
  if (povKey !== lastUiPov) {
    lastUiPov = povKey;
    updateFlipAndBothCamsUI(effFlip, effBoth);
    applyShortsCropTransform();

    const playerShell = document.getElementById("playerShell");
    if (playerShell) playerShell.classList.toggle("shorts-aspect", isShortsMode);

    el.monitorsContainer.classList.remove(
      "split-mode",
      "show-pip",
      "flipped-lr",
      "both-cams-70-30",
      "both-cams-16-9",
      "single-pov-focus-a",
      "single-pov-focus-b",
      "shorts-mode",
      "shorts-stack-50-50",
      "shorts-stack-70-30",
      "shorts-full-pip",
      "shorts-full-single",
      "shorts-dual-letterbox"
    );
    el.viewportA.classList.remove("active-pov", "pip-mate");
    el.viewportB.classList.remove("active-pov", "pip-mate");

    if (effFlip) {
      el.monitorsContainer.classList.add("flipped-lr");
    }

    const hookOverlay = document.getElementById("shortsHookOverlay");
    const hookTextSpan = document.getElementById("shortsHookTextDisplay");
    if (hookOverlay && hookTextSpan) {
      if (isShortsMode && shortsHookStyle !== "none" && shortsHookText.trim()) {
        hookOverlay.className = `shorts-hook-overlay ${shortsHookStyle}`;
        hookTextSpan.textContent = shortsHookText;
      } else {
        hookOverlay.className = "shorts-hook-overlay hidden";
      }
    }

    if (isShortsMode) {
      const layoutClass = `shorts-${shortsLayout.replace(/_/g, "-")}`;
      el.monitorsContainer.classList.add("shorts-mode", layoutClass);
      const primaryIsB = (pov === "B") ^ (effFlip && (shortsLayout === "full_pip" || shortsLayout === "full_single"));
      if (primaryIsB) {
        el.viewportB.classList.add("active-pov");
        el.viewportA.classList.add("pip-mate");
      } else {
        el.viewportA.classList.add("active-pov");
        el.viewportB.classList.add("pip-mate");
      }
      const orderText = effFlip ? `${nameB} ⬆⬇ ${nameA}` : `${nameA} ⬆⬇ ${nameB}`;
      el.liveDirectorBadge.textContent = `📱 9:16 SHORT (${orderText})`;
    } else if (pov === "SPLIT" || (effBoth && bothCamsMode === "dual_50_50")) {
      el.monitorsContainer.classList.add("split-mode");
      if (pov === "A") el.monitorsContainer.classList.add("single-pov-focus-a");
      if (pov === "B") el.monitorsContainer.classList.add("single-pov-focus-b");
      const orderText = effFlip ? `${nameB} ◀▶ ${nameA}` : `${nameA} ◀▶ ${nameB}`;
      el.liveDirectorBadge.textContent =
        pov === "SPLIT"
          ? `⚡ 50/50 Split (${orderText})`
          : `👁️ 50/50 Both Cams · ${pov === "A" ? nameA : nameB} Focus (${orderText})`;
    } else if (effBoth && bothCamsMode === "dual_70_30") {
      el.monitorsContainer.classList.add("both-cams-70-30");
      if (pov === "B") {
        el.viewportB.classList.add("active-pov");
        el.viewportA.classList.add("pip-mate");
      } else {
        el.viewportA.classList.add("active-pov");
        el.viewportB.classList.add("pip-mate");
      }
      const orderText = effFlip ? `${nameB} | ${nameA}` : `${nameA} | ${nameB}`;
      el.liveDirectorBadge.textContent = `👁️ Both Cams 70/30 · ${pov === "A" ? nameA : nameB} (${orderText})`;
    } else if (effBoth && bothCamsMode === "dual_16_9") {
      el.monitorsContainer.classList.add("both-cams-16-9");
      if (pov === "B") {
        el.viewportB.classList.add("active-pov");
        el.viewportA.classList.add("pip-mate");
      } else {
        el.viewportA.classList.add("active-pov");
        el.viewportB.classList.add("pip-mate");
      }
      const orderText = effFlip ? `${nameB} | ${nameA}` : `${nameA} | ${nameB}`;
      el.liveDirectorBadge.textContent = `👁️ Dual 16:9 · ${pov === "A" ? nameA : nameB} (${orderText})`;
    } else {
      el.monitorsContainer.classList.toggle("show-pip", showPip);
      if (pov === "A") {
        el.viewportA.classList.add("active-pov");
        el.viewportB.classList.add("pip-mate");
        el.liveDirectorBadge.textContent = showPip ? `🟦 ${nameA} + PiP` : `🟦 ${nameA}`;
      } else {
        el.viewportB.classList.add("active-pov");
        el.viewportA.classList.add("pip-mate");
        el.liveDirectorBadge.textContent = showPip ? `🟪 ${nameB} + PiP` : `🟪 ${nameB}`;
      }
    }

    document.getElementById("btnSwitchPovA")?.classList.toggle("tally-active", pov === "A");
    document.getElementById("btnSwitchPovSplit")?.classList.toggle("tally-active", pov === "SPLIT");
    document.getElementById("btnSwitchPovB")?.classList.toggle("tally-active", pov === "B");
  }

  // Update comment time badge
  const cmtBadge = document.getElementById("commentTimeBadge");
  if (cmtBadge) cmtBadge.textContent = `@ ${formatTime(t)}`;

  updateFrameioScrubberPosition(t);

  if (info && info.highlight) {
    const hl = info.highlight;
    if (info.highlightIndex !== lastUiSceneIdx) {
      lastUiSceneIdx = info.highlightIndex;
      const totalScenes = projectState.highlights.length;
      const num = hl.scene_number || info.highlightIndex + 1;
      el.activeSceneBadge.textContent = activeInfo ? `SCENE ${num} / ${totalScenes}` : `SCENE ${num}`;
      el.activeSceneTitle.textContent = hl.title;
      el.activeSceneAct.textContent = hl.act || "";
      const dur = (hl.end_sec - hl.start_sec).toFixed(1);
      el.activeSceneRangeLabel.textContent = `${dur}s`;

      document.querySelectorAll(".chapter-pill").forEach((p) => {
        p.classList.toggle("active", parseInt(p.getAttribute("data-hl-idx"), 10) === info.highlightIndex);
      });
      document.querySelectorAll(".highlight-card").forEach((c) => {
        c.classList.toggle("active-scene", parseInt(c.getAttribute("data-hl-card"), 10) === info.highlightIndex);
      });
    }

    if (timelineMode === "scene" && !lockedTimelineWindow && info.highlightIndex !== lastRenderedSceneIdx) {
      lastRenderedSceneIdx = info.highlightIndex;
      renderTimeline();
    }
  }
}

// =========================================================================
// ZERO-LAG PLAYBACK SYNC ENGINE & 4-STEM AUDIO MIXER
// =========================================================================
let audioCtx = null;
let mattGainNode = null;
let leeGainNode = null;
let mattDeskGainNode = null;
let leeDeskGainNode = null;
let mattAnalyser = null;
let leeAnalyser = null;
let mattTimeData = null;
let leeTimeData = null;
let voiceMixerInitialized = false;

let volMattPct = 100;
let volLeePct = 145;
let volDeskMattPct = 80;
let volDeskLeePct = 0;
let mattVoiceMuted = false;
let leeVoiceMuted = false;
let mattDeskMuted = false;
let leeDeskMuted = true;
let autoMuteMode = "separated_4stem";
let currentAutoOwner = "BOTH";
let lastAutoSwitchMs = 0;
let voiceEnvelopes = null;
let allWaveforms = null;
let activeActFilter = "ALL";

let lastHardSeekMsA = 0;
let lastHardSeekMsB = 0;
let lastHardSeekMsAudio = 0;
let lastRateNudgeMsA = 0;
let lastRateNudgeMsB = 0;

let currentVideoQuality = localStorage.getItem("dualsync_video_quality") || "540p";
let syncEngineMode = localStorage.getItem("dualsync_sync_engine") || "free_run";
let driftToleranceSec = parseFloat(localStorage.getItem("dualsync_drift_tol") || "0.55");
let userPlaybackSpeed = 1.0;
let streamSourceMode = localStorage.getItem("dualsync_stream_source") || "auto";
let resolvedBackendBaseUrl = "";

let lastGainM = -1;
let lastGainL = -1;
let lastGainDM = -1;
let lastGainDL = -1;
let lastMixerStateSignature = "";

let fpsFrameCount = 0;
let fpsLastSampleMs = performance.now();
let measuredFps = 60;
let lastTelemetryUpdateMs = 0;

function initWebAudioVoiceMixer() {
  if (voiceMixerInitialized) {
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return;
  }
  const ma = document.getElementById("masterAudio");
  const da = document.getElementById("desktopAudio");
  if (!ma) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioCtx = new AudioContextClass();

    const voiceSource = audioCtx.createMediaElementSource(ma);
    const voiceSplitter = audioCtx.createChannelSplitter(2);
    mattGainNode = audioCtx.createGain();
    leeGainNode = audioCtx.createGain();
    mattAnalyser = audioCtx.createAnalyser();
    leeAnalyser = audioCtx.createAnalyser();
    mattAnalyser.fftSize = 256;
    leeAnalyser.fftSize = 256;
    mattTimeData = new Uint8Array(mattAnalyser.fftSize);
    leeTimeData = new Uint8Array(leeAnalyser.fftSize);

    mattDeskGainNode = audioCtx.createGain();
    leeDeskGainNode = audioCtx.createGain();

    const merger = audioCtx.createChannelMerger(2);

    voiceSource.connect(voiceSplitter);
    voiceSplitter.connect(mattGainNode, 0);
    voiceSplitter.connect(leeGainNode, 1);

    mattGainNode.connect(mattAnalyser);
    leeGainNode.connect(leeAnalyser);

    mattGainNode.connect(merger, 0, 0);
    mattGainNode.connect(merger, 0, 1);
    leeGainNode.connect(merger, 0, 0);
    leeGainNode.connect(merger, 0, 1);

    if (da) {
      const deskSource = audioCtx.createMediaElementSource(da);
      const deskSplitter = audioCtx.createChannelSplitter(2);
      deskSource.connect(deskSplitter);
      deskSplitter.connect(mattDeskGainNode, 0);
      deskSplitter.connect(leeDeskGainNode, 1);
      mattDeskGainNode.connect(merger, 0, 0);
      mattDeskGainNode.connect(merger, 0, 1);
      leeDeskGainNode.connect(merger, 0, 0);
      leeDeskGainNode.connect(merger, 0, 1);
    }

    merger.connect(audioCtx.destination);
    voiceMixerInitialized = true;
    applyVoiceMixerGains();
  } catch (err) {
    console.warn("Web Audio mixer fallback:", err);
  }
}

function determineActiveAudioOwnerAtTime(t) {
  if (autoMuteMode === "separated_4stem" || autoMuteMode === "manual") return "BOTH";

  const activeInfo = getActiveCutAtTime(t);
  const pov = activeInfo ? activeInfo.cut.active_pov : "A";

  let sp = 0;
  if (voiceEnvelopes && voiceEnvelopes.bin_sec > 0) {
    const idx = Math.min(voiceEnvelopes.count - 1, Math.max(0, Math.floor(t / voiceEnvelopes.bin_sec)));
    if (voiceEnvelopes.speaker) {
      sp = voiceEnvelopes.speaker[idx] || 0;
    } else {
      const m = voiceEnvelopes.matthew?.[idx] || 0;
      const l = voiceEnvelopes.leelai?.[idx] || 0;
      if (l > 0.07 && l > m * 0.95) sp = 2;
      else if (m > 0.07) sp = 1;
    }
  }

  let desired = currentAutoOwner === "BOTH" ? "A" : currentAutoOwner;
  if (autoMuteMode === "pov_only") {
    if (pov === "A") desired = "A";
    else if (pov === "B") desired = "B";
    else desired = sp === 2 ? "B" : "A";
  } else {
    if (sp === 2) desired = "B";
    else if (sp === 1) desired = "A";
    else if (pov === "B") desired = "B";
    else if (pov === "A") desired = "A";
  }

  const nowMs = performance.now();
  if (desired !== currentAutoOwner && nowMs - lastAutoSwitchMs > 280) {
    currentAutoOwner = desired;
    lastAutoSwitchMs = nowMs;
  }
  return currentAutoOwner;
}

function applyVoiceMixerGains(t = masterTime) {
  const owner = determineActiveAudioOwnerAtTime(t);
  const autoMuteMatt = owner === "B";
  const autoMuteLee = owner === "A";

  const mGain = mattVoiceMuted || el.muteA?.checked || autoMuteMatt ? 0.0 : volMattPct / 100.0;
  const lGain = leeVoiceMuted || el.muteB?.checked || autoMuteLee ? 0.0 : volLeePct / 100.0;
  const dMattGain = mattDeskMuted || el.muteA?.checked ? 0.0 : volDeskMattPct / 100.0;
  const dLeeGain = leeDeskMuted || el.muteB?.checked ? 0.0 : volDeskLeePct / 100.0;

  if (mattGainNode && audioCtx && Math.abs(mGain - lastGainM) > 0.002) {
    lastGainM = mGain;
    mattGainNode.gain.setTargetAtTime(mGain, audioCtx.currentTime, 0.025);
  }
  if (leeGainNode && audioCtx && Math.abs(lGain - lastGainL) > 0.002) {
    lastGainL = lGain;
    leeGainNode.gain.setTargetAtTime(lGain, audioCtx.currentTime, 0.025);
  }
  if (mattDeskGainNode && audioCtx && Math.abs(dMattGain - lastGainDM) > 0.002) {
    lastGainDM = dMattGain;
    mattDeskGainNode.gain.setTargetAtTime(dMattGain, audioCtx.currentTime, 0.025);
  }
  if (leeDeskGainNode && audioCtx && Math.abs(dLeeGain - lastGainDL) > 0.002) {
    lastGainDL = dLeeGain;
    leeDeskGainNode.gain.setTargetAtTime(dLeeGain, audioCtx.currentTime, 0.025);
  }

  const sig = `${owner}_${mattVoiceMuted}_${leeVoiceMuted}_${mattDeskMuted}_${leeDeskMuted}_${volMattPct}_${volLeePct}_${volDeskMattPct}_${volDeskLeePct}_${autoMuteMode}`;
  if (sig === lastMixerStateSignature) return;
  lastMixerStateSignature = sig;

  const lblM = document.getElementById("labelVolMatt");
  const lblL = document.getElementById("labelVolLee");
  const lblDM = document.getElementById("labelVolDeskMatt");
  const lblDL = document.getElementById("labelVolDeskLee");
  if (lblM) lblM.textContent = mattVoiceMuted ? "MUTE" : autoMuteMatt ? "AUTO" : `${volMattPct}%`;
  if (lblL) lblL.textContent = leeVoiceMuted ? "MUTE" : autoMuteLee ? "AUTO" : `${volLeePct}%`;
  if (lblDM) lblDM.textContent = mattDeskMuted ? "MUTE" : `${volDeskMattPct}%`;
  if (lblDL) lblDL.textContent = leeDeskMuted ? "MUTE" : `${volDeskLeePct}%`;

  document.getElementById("btnMuteMattVoice")?.classList.toggle("muted", mattVoiceMuted);
  document.getElementById("btnMuteLeeVoice")?.classList.toggle("muted", leeVoiceMuted);
  document.getElementById("btnMuteDeskMatt")?.classList.toggle("muted", mattDeskMuted);
  document.getElementById("btnMuteDeskLee")?.classList.toggle("muted", leeDeskMuted);

  const stripM = document.getElementById("channelStripMatt");
  const stripL = document.getElementById("channelStripLee");
  stripM?.classList.toggle("auto-muted-now", autoMuteMatt && !mattVoiceMuted);
  stripM?.classList.toggle("active-audio-now", !autoMuteMatt && !mattVoiceMuted);
  stripL?.classList.toggle("auto-muted-now", autoMuteLee && !leeVoiceMuted);
  stripL?.classList.toggle("active-audio-now", !autoMuteLee && !leeVoiceMuted);

  const badge = document.getElementById("autoMuteStatusBadge");
  if (badge) {
    if (autoMuteMode === "separated_4stem") {
      badge.textContent = "4-STEM MIX";
    } else if (owner === "B") {
      badge.textContent = "LIVE: B";
    } else if (owner === "A") {
      badge.textContent = "LIVE: A";
    } else {
      badge.textContent = "MANUAL";
    }
  }
}

function updateVoiceVuMeters(t) {
  applyVoiceMixerGains(t);
  let mLevel = 0;
  let lLevel = 0;
  let dmLevel = 0;
  let dlLevel = 0;
  if (voiceEnvelopes && voiceEnvelopes.bin_sec > 0) {
    const idx = Math.min(voiceEnvelopes.count - 1, Math.max(0, Math.floor(t / voiceEnvelopes.bin_sec)));
    mLevel = (voiceEnvelopes.matthew?.[idx] || 0) * (mattVoiceMuted ? 0 : 1);
    lLevel = (voiceEnvelopes.leelai?.[idx] || 0) * (leeVoiceMuted ? 0 : 1);
    dmLevel = (voiceEnvelopes.matt_desk?.[idx] || 0) * (mattDeskMuted ? 0 : volDeskMattPct / 100);
    dlLevel = (voiceEnvelopes.lee_desk?.[idx] || 0) * (leeDeskMuted ? 0 : volDeskLeePct / 100);
  }
  const fillM = document.getElementById("vuFillMatt");
  const fillL = document.getElementById("vuFillLee");
  const fillDM = document.getElementById("vuFillDeskMatt");
  const fillDL = document.getElementById("vuFillDeskLee");
  if (fillM) fillM.style.width = `${Math.min(100, Math.round(mLevel * 100))}%`;
  if (fillL) fillL.style.width = `${Math.min(100, Math.round(lLevel * 100))}%`;
  if (fillDM) fillDM.style.width = `${Math.min(100, Math.round(dmLevel * 100))}%`;
  if (fillDL) fillDL.style.width = `${Math.min(100, Math.round(dlLevel * 100))}%`;

  el.viewportA?.classList.toggle("speaking-now", mLevel > 0.12);
  el.viewportB?.classList.toggle("speaking-now", lLevel > 0.12);
  document.getElementById("miniVuDotMatt")?.classList.toggle("hot", mLevel > 0.10);
  document.getElementById("miniVuDotLee")?.classList.toggle("hot", lLevel > 0.10);
}

function hasMasterCoopAudio() {
  const ma = document.getElementById("masterAudio");
  const isDemo = Boolean(projectState?.track_a?.filename?.includes("demo_"));
  return Boolean(ma && !isDemo);
}

function syncSingleVideoElement(videoEl, targetSec, clipDurSec, forceSeek, slot) {
  if (!videoEl || videoEl.readyState < 1 || clipDurSec <= 0) return;
  const clamped = Math.max(0, Math.min(clipDurSec, targetSec));
  const nowMs = performance.now();
  const lastSeekMs = slot === "A" ? lastHardSeekMsA : lastHardSeekMsB;
  const err = clamped - videoEl.currentTime;
  const absErr = Math.abs(err);
  const baseRate = userPlaybackSpeed || 1.0;

  if (forceSeek) {
    if (Math.abs(videoEl.playbackRate - baseRate) > 0.01) videoEl.playbackRate = baseRate;
    if (absErr > 0.04 && (!videoEl.seeking || nowMs - lastSeekMs > 220)) {
      videoEl.currentTime = clamped;
      if (slot === "A") lastHardSeekMsA = nowMs;
      else lastHardSeekMsB = nowMs;
    }
    return;
  }

  if (isPlaying) {
    const tol = Math.max(0.15, driftToleranceSec || 0.55);
    if (absErr > tol && !videoEl.seeking && nowMs - lastSeekMs > 950) {
      if (Math.abs(videoEl.playbackRate - baseRate) > 0.01) videoEl.playbackRate = baseRate;
      videoEl.currentTime = clamped;
      if (slot === "A") lastHardSeekMsA = nowMs;
      else lastHardSeekMsB = nowMs;
    } else if (syncEngineMode === "gentle_lock") {
      const lastNudge = slot === "A" ? lastRateNudgeMsA : lastRateNudgeMsB;
      if (nowMs - lastNudge > 1000) {
        if (slot === "A") lastRateNudgeMsA = nowMs;
        else lastRateNudgeMsB = nowMs;
        const desiredRate =
          absErr > 0.09
            ? Math.max(baseRate * 0.97, Math.min(baseRate * 1.03, baseRate + err * 0.18))
            : baseRate;
        if (Math.abs(videoEl.playbackRate - desiredRate) > 0.01) {
          videoEl.playbackRate = desiredRate;
        }
      }
    } else {
      if (Math.abs(videoEl.playbackRate - baseRate) > 0.01) {
        videoEl.playbackRate = baseRate;
      }
    }
  } else {
    if (absErr > 0.05 && !videoEl.seeking) {
      videoEl.currentTime = clamped;
    }
  }
}

function updatePlaybackTelemetry(timeA, timeB) {
  fpsFrameCount++;
  const nowMs = performance.now();
  if (nowMs - fpsLastSampleMs >= 500) {
    measuredFps = Math.min(60, Math.round((fpsFrameCount * 1000) / (nowMs - fpsLastSampleMs)));
    fpsFrameCount = 0;
    fpsLastSampleMs = nowMs;
  }
  if (nowMs - lastTelemetryUpdateMs < 350) return;
  lastTelemetryUpdateMs = nowMs;

  const fpsEl = document.getElementById("telemetryFpsBadge");
  const driftEl = document.getElementById("telemetryDriftBadge");
  const bufEl = document.getElementById("telemetryBufferBadge");
  if (fpsEl) {
    fpsEl.textContent = isPlaying ? `${measuredFps} FPS` : "Idle";
    fpsEl.classList.toggle("telem-ok", !isPlaying || measuredFps >= 26);
    fpsEl.classList.toggle("telem-warn", isPlaying && measuredFps < 26);
  }
  if (driftEl && el.videoA && el.videoB) {
    const dA = Math.abs((timeA || 0) - (el.videoA.currentTime || 0));
    const dB = timeB >= 0 ? Math.abs(timeB - (el.videoB.currentTime || 0)) : 0;
    const maxDrift = Math.max(dA, dB);
    driftEl.textContent = `Drift: ${(maxDrift * 1000).toFixed(0)}ms`;
  }
  if (bufEl && el.videoA) {
    let ahead = 0;
    try {
      const b = el.videoA.buffered;
      const cur = el.videoA.currentTime;
      for (let i = 0; i < b.length; i++) {
        if (b.start(i) <= cur + 0.5 && b.end(i) >= cur) {
          ahead = Math.max(0, b.end(i) - cur);
          break;
        }
      }
    } catch (_) {}
    bufEl.textContent = `Buf: ${ahead.toFixed(1)}s`;
  }
}

function syncVideosToMasterTime(t, forceSeek = false) {
  const totalDur = getMasterDuration();
  masterTime = Math.max(0, Math.min(totalDur, t));

  const offset = getEffectiveOffsetAtTime(masterTime);
  const timeA = masterTime;
  const timeB = masterTime - offset;

  el.masterTimecode.textContent = formatMasterTimecode(masterTime);
  el.localTcA.textContent = formatTime(timeA);
  el.localTcB.textContent = timeB >= 0 ? formatTime(timeB) : `WAIT`;

  const activeInfo = getActiveCutAtTime(masterTime);
  const activePov = activeInfo ? activeInfo.cut.active_pov : "A";
  const cutBothCams = activeInfo?.cut?.both_cams !== undefined && activeInfo?.cut?.both_cams !== null
    ? Boolean(activeInfo.cut.both_cams)
    : bothCamsEnabled;
  const singleDecoderActive =
    syncEngineMode === "single_decoder" &&
    !cutBothCams &&
    !isShortsMode &&
    isPlaying &&
    !forceSeek;

  const ma = document.getElementById("masterAudio");
  const da = document.getElementById("desktopAudio");
  const useMasterAudio = hasMasterCoopAudio();
  if (useMasterAudio) {
    el.videoA.muted = true;
    el.videoB.muted = true;
    const nowMs = performance.now();
    const tol = Math.max(0.25, driftToleranceSec || 0.55);
    if (
      forceSeek ||
      (!isPlaying && Math.abs(ma.currentTime - timeA) > 0.08) ||
      (isPlaying && Math.abs(ma.currentTime - timeA) > tol && nowMs - lastHardSeekMsAudio > 850)
    ) {
      if (!ma.seeking || forceSeek) {
        try {
          ma.currentTime = Math.max(0, Math.min(ma.duration || totalDur, timeA));
          if (da) da.currentTime = Math.max(0, Math.min(da.duration || totalDur, timeA));
          lastHardSeekMsAudio = nowMs;
        } catch (_) {}
      }
    } else if (da && Math.abs(da.currentTime - ma.currentTime) > 0.35 && !da.seeking && nowMs - lastHardSeekMsAudio > 1400) {
      try {
        da.currentTime = ma.currentTime;
        lastHardSeekMsAudio = nowMs;
      } catch (_) {}
    }
  } else {
    el.videoA.muted = Boolean(el.muteA?.checked || mattVoiceMuted);
    el.videoB.muted = true;
  }

  if (projectState?.track_a) {
    if (singleDecoderActive && activePov === "B") {
      if (!el.videoA.paused) el.videoA.pause();
    } else {
      if (isPlaying && el.videoA.paused) {
        syncSingleVideoElement(el.videoA, timeA, projectState.track_a.duration_sec, true, "A");
        el.videoA.play().catch(() => {});
      } else {
        syncSingleVideoElement(el.videoA, timeA, projectState.track_a.duration_sec, forceSeek, "A");
      }
    }
  }

  if (projectState?.track_b) {
    const durB = projectState.track_b.duration_sec;
    if (timeB >= 0 && timeB <= durB) {
      if (singleDecoderActive && activePov === "A") {
        if (!el.videoB.paused) el.videoB.pause();
      } else {
        syncSingleVideoElement(el.videoB, timeB, durB, forceSeek, "B");
        if (isPlaying && el.videoB.paused) {
          el.videoB.play().catch(() => {});
        }
      }
    } else {
      if (!el.videoB.paused) el.videoB.pause();
    }
  }

  updateVoiceVuMeters(masterTime);
  updatePlayheadPosition();
  updateDirectorViewportUI(masterTime);
  updatePlaybackTelemetry(timeA, timeB);
}

let prevTickMasterTime = 366.0;

function tickPlayback() {
  if (!isPlaying) return;

  const prevT = masterTime;
  const ma = document.getElementById("masterAudio");
  if (hasMasterCoopAudio() && ma && !ma.paused) {
    masterTime = ma.currentTime;
  } else if (projectState?.track_a && !el.videoA.paused) {
    masterTime = el.videoA.currentTime;
  } else {
    masterTime += (1 / 60) * (userPlaybackSpeed || 1.0);
  }

  if (isShortsMode && activeShortId && shortsListState.length > 0) {
    const activeShort = shortsListState.find((s) => s.id === activeShortId);
    if (activeShort && prevT >= activeShort.start_sec - 0.5 && masterTime >= activeShort.end_sec) {
      syncVideosToMasterTime(activeShort.start_sec, true);
      prevTickMasterTime = masterTime;
      rafId = requestAnimationFrame(tickPlayback);
      return;
    }
  }

  if (el.chkPlayHighlightsOnly.checked && projectState?.highlights?.length) {
    const enabled = projectState.highlights.filter((h) => h.enabled);
    if (enabled.length > 0) {
      const justFinishedScene = enabled.find(
        (h) => prevT >= h.start_sec - 0.15 && prevT <= h.end_sec + 0.15 && masterTime >= h.end_sec
      );
      if (justFinishedScene) {
        const nextHl = enabled.find((h) => h.start_sec > justFinishedScene.end_sec - 0.1) || enabled[0];
        if (nextHl === enabled[0] && justFinishedScene === enabled[enabled.length - 1]) {
          pausePlayback();
          syncVideosToMasterTime(enabled[0].start_sec, true);
          return;
        }
        syncVideosToMasterTime(nextHl.start_sec, true);
        prevTickMasterTime = masterTime;
        rafId = requestAnimationFrame(tickPlayback);
        return;
      }
    }
  }

  prevTickMasterTime = masterTime;
  const maxDur = getMasterDuration();
  if (masterTime >= maxDur - 0.05) {
    pausePlayback();
    return;
  }

  syncVideosToMasterTime(masterTime, false);
  rafId = requestAnimationFrame(tickPlayback);
}

function startPlayback() {
  if (!projectState?.track_a) return;
  initWebAudioVoiceMixer();
  isPlaying = true;
  el.btnPlayPause.textContent = "⏸ Pause";
  prevTickMasterTime = masterTime;

  const baseRate = userPlaybackSpeed || 1.0;
  const ma = document.getElementById("masterAudio");
  const da = document.getElementById("desktopAudio");
  if (hasMasterCoopAudio() && ma) {
    el.videoA.muted = true;
    el.videoB.muted = true;
    try {
      ma.playbackRate = baseRate;
      if (da) da.playbackRate = baseRate;
      ma.currentTime = masterTime;
      if (da) da.currentTime = masterTime;
    } catch (_) {}
    ma.play().catch(() => {});
    if (da) da.play().catch(() => {});
  } else {
    el.videoB.muted = true;
  }

  el.videoA.playbackRate = baseRate;
  el.videoB.playbackRate = baseRate;
  el.videoA.play().catch(() => {});
  const timeB = masterTime - getEffectiveOffsetAtTime(masterTime);
  if (projectState?.track_b && timeB >= 0 && timeB <= projectState.track_b.duration_sec) {
    syncSingleVideoElement(el.videoB, timeB, projectState.track_b.duration_sec, true, "B");
    el.videoB.play().catch(() => {});
  }
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(tickPlayback);
}

function pausePlayback() {
  isPlaying = false;
  el.btnPlayPause.textContent = "▶ Play";
  const ma = document.getElementById("masterAudio");
  const da = document.getElementById("desktopAudio");
  if (ma) ma.pause();
  if (da) da.pause();
  el.videoA.pause();
  el.videoB.pause();
  const baseRate = userPlaybackSpeed || 1.0;
  el.videoA.playbackRate = baseRate;
  el.videoB.playbackRate = baseRate;
  cancelAnimationFrame(rafId);
}

function togglePlayback() {
  if (isPlaying) pausePlayback();
  else startPlayback();
}

// TRIM / EXTEND SCENE HELPER
async function trimHighlightById(hlId, deltaStartSec, deltaEndSec) {
  if (!projectState || !projectState.highlights) return;
  pushUndoState("trim");
  const maxDur = getMasterDuration();
  const hl = projectState.highlights.find((h) => h.id === hlId);
  if (!hl) return;

  const newStart = Number(Math.max(0, hl.start_sec + deltaStartSec).toFixed(2));
  const newEnd = Number(Math.min(maxDur, Math.max(newStart + 2.0, hl.end_sec + deltaEndSec)).toFixed(2));
  hl.start_sec = newStart;
  hl.end_sec = newEnd;

  if (hl.camera_cuts && hl.camera_cuts.length > 0) {
    hl.camera_cuts[0].start_sec = newStart;
    if (hl.camera_cuts[0].end_sec <= newStart + 0.5) {
      hl.camera_cuts[0].end_sec = Number(Math.min(newEnd, newStart + 2.0).toFixed(2));
    }
    const lastIdx = hl.camera_cuts.length - 1;
    hl.camera_cuts[lastIdx].end_sec = newEnd;
    if (hl.camera_cuts[lastIdx].start_sec >= newEnd - 0.5) {
      hl.camera_cuts[lastIdx].start_sec = Number(Math.max(newStart, newEnd - 2.0).toFixed(2));
    }
  }

  await saveHighlightsToServer();
}

async function trimActiveOrNearestScene(deltaStartSec, deltaEndSec) {
  const info = getNearestOrCurrentHighlight(masterTime);
  if (!info || !info.highlight) return;
  await trimHighlightById(info.highlight.id, deltaStartSec, deltaEndSec);
}

// RENDER HIGHLIGHTS SIDEBAR
function renderHighlightsList() {
  const highlights = projectState?.highlights || [];
  if (highlights.length === 0) {
    el.highlightsList.innerHTML = `<div class="empty-state">No scenes yet.</div>`;
    return;
  }

  el.highlightsList.innerHTML = "";
  let currentAct = "";

  highlights.forEach((hl, hlIdx) => {
    if (activeActFilter !== "ALL" && !(hl.act || "").startsWith(activeActFilter)) {
      return;
    }
    if (hl.act && hl.act !== currentAct) {
      currentAct = hl.act;
      const actHeader = document.createElement("div");
      actHeader.className = "act-section-header";
      actHeader.textContent = currentAct;
      el.highlightsList.appendChild(actHeader);
    }

    const card = document.createElement("div");
    card.className = `highlight-card ${hl.enabled ? "" : "disabled-card"}`;
    card.setAttribute("data-hl-card", String(hlIdx));

    const nameA = el.playerAName?.value || "A";
    const nameB = el.playerBName?.value || "B";

    const cutsHtml = (hl.camera_cuts || [])
      .map(
        (c, cIdx) =>
          `<span class="cut-chip pov-${c.active_pov}" data-hl="${hlIdx}" data-cut="${cIdx}" title="${c.reason || ""} (Click to switch POV)">
            ${c.active_pov === "SPLIT" ? "⚡" : c.active_pov === "A" ? "🟦" : "🟪"} ${formatTime(c.start_sec)}–${formatTime(c.end_sec)}
          </span>`
      )
      .join("");

    const thumbHtml = hl.thumbnail_url
      ? `<img class="hl-thumb" src="${hl.thumbnail_url}" alt="Scene ${hl.scene_number}" data-seek="${hl.start_sec}" title="Click to jump" />`
      : "";

    const durSec = (hl.end_sec - hl.start_sec).toFixed(1);
    const num = hl.scene_number || hlIdx + 1;

    card.innerHTML = `
      <div class="hl-top-grid">
        ${thumbHtml}
        <div class="hl-info-col">
          <div class="hl-header">
            <div class="hl-title-row" data-seek="${hl.start_sec}">
              <input type="checkbox" class="hl-enable-chk" data-hl="${hlIdx}" ${hl.enabled ? "checked" : ""} />
              <span>#${num} ${hl.title}</span>
            </div>
            <div style="display:flex;align-items:center;gap:4px;">
              <span class="hl-score">${hl.excitement_score}%</span>
              <button class="btn btn-xs btn-outline hl-del-btn" data-hl="${hlIdx}" title="Remove scene">✕</button>
            </div>
          </div>
          <div class="hl-meta-row">
            <span>${formatTime(hl.start_sec)} – ${formatTime(hl.end_sec)} (<strong>${durSec}s</strong>)</span>
            <button class="btn btn-xs btn-secondary" data-seek="${hl.start_sec}">▶ Watch</button>
          </div>
        </div>
      </div>
      <div class="hl-reason">${hl.reasoning || ""}</div>
      <div class="hl-cuts-strip">${cutsHtml}</div>
      <div class="hl-card-trim-row">
        <span>Adjust:</span>
        <div class="card-trim-btns">
          <button class="btn btn-xs btn-outline" data-trim-id="${hl.id}" data-ds="-3" data-de="0">⏪ +3s</button>
          <button class="btn btn-xs btn-outline" data-trim-id="${hl.id}" data-ds="0" data-de="-2">-2s</button>
          <button class="btn btn-xs btn-secondary" data-trim-id="${hl.id}" data-ds="0" data-de="5">+5s</button>
          <button class="btn btn-xs btn-secondary" data-trim-id="${hl.id}" data-ds="0" data-de="10">+10s</button>
        </div>
      </div>
    `;

    el.highlightsList.appendChild(card);
  });

  // Bind events
  el.highlightsList.querySelectorAll("[data-seek]").forEach((node) => {
    node.addEventListener("click", (e) => {
      if (e.target.classList.contains("hl-enable-chk")) return;
      const t = parseFloat(node.getAttribute("data-seek"));
      syncVideosToMasterTime(t + 0.05, true);
    });
  });

  el.highlightsList.querySelectorAll(".hl-enable-chk").forEach((chk) => {
    chk.addEventListener("change", async () => {
      pushUndoState("toggle scene");
      const idx = parseInt(chk.getAttribute("data-hl"), 10);
      projectState.highlights[idx].enabled = chk.checked;
      await saveHighlightsToServer();
    });
  });

  el.highlightsList.querySelectorAll(".hl-del-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      pushUndoState("delete scene");
      const idx = parseInt(btn.getAttribute("data-hl"), 10);
      projectState.highlights.splice(idx, 1);
      await saveHighlightsToServer();
    });
  });

  el.highlightsList.querySelectorAll(".cut-chip").forEach((chip) => {
    chip.addEventListener("click", async () => {
      pushUndoState("switch POV");
      const hlIdx = parseInt(chip.getAttribute("data-hl"), 10);
      const cutIdx = parseInt(chip.getAttribute("data-cut"), 10);
      const cut = projectState.highlights[hlIdx].camera_cuts[cutIdx];
      syncVideosToMasterTime(cut.start_sec + 0.05, true);
      const order = ["A", "B", "SPLIT"];
      cut.active_pov = order[(order.indexOf(cut.active_pov) + 1) % order.length];
      await saveHighlightsToServer();
    });
  });

  el.highlightsList.querySelectorAll("[data-trim-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const hlId = btn.getAttribute("data-trim-id");
      const ds = parseFloat(btn.getAttribute("data-ds") || "0");
      const de = parseFloat(btn.getAttribute("data-de") || "0");
      await trimHighlightById(hlId, ds, de);
    });
  });
}

const IS_STATIC_CLOUD =
  window.location.hostname.endsWith(".github.io") ||
  window.location.protocol === "file:";

async function saveHighlightsToServer(skipUndo = false) {
  setSaveStatus("saving");

  try {
    if (projectState?.highlights) {
      localStorage.setItem(
        "dualsync_cloud_highlights_v2",
        JSON.stringify(projectState.highlights)
      );
    }
  } catch (_) {}

  if (IS_STATIC_CLOUD) {
    renderState(projectState, false);
    setSaveStatus("saved");
    return;
  }

  const localSyncBackup = projectState?.sync;
  try {
    const resp = await fetch("/api/highlights/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(projectState.highlights),
    });
    if (resp.ok) {
      const updated = await resp.json();
      if (localSyncBackup && localSyncBackup.waveform_a?.length > 1000) {
        updated.sync = localSyncBackup;
      }
      renderState(updated, false);
      setSaveStatus("saved");
    } else {
      renderState(projectState, false);
      setSaveStatus("unsaved");
    }
  } catch (_) {
    renderState(projectState, false);
    setSaveStatus("unsaved");
  }

  // Also auto-save to multi-project system
  autoSaveToProject();
}


// TIMELINE RENDERING
function getLaneWidthPx() {
  const baseWidth = Math.max(600, el.timelineScrollWrap.clientWidth - LABEL_WIDTH - 10);
  if (timelineMode === "scene") {
    return baseWidth;
  }
  return Math.round(baseWidth * zoomFactor);
}

function getTimelineWindow() {
  const totalDur = getMasterDuration();
  if (timelineMode === "scene") {
    if (lockedTimelineWindow) return lockedTimelineWindow;
    const info = getNearestOrCurrentHighlight(masterTime);
    if (info && info.highlight) {
      const hl = info.highlight;
      const padLeft = 15.0;
      const padRight = 20.0;
      const winStart = Math.max(0, hl.start_sec - padLeft);
      const winEnd = Math.min(totalDur, Math.max(winStart + 12.0, hl.end_sec + padRight));
      return {
        winStart,
        winEnd,
        winDur: Math.max(1.0, winEnd - winStart),
        activeHl: hl,
        activeHlIdx: info.highlightIndex,
      };
    }
  }
  return {
    winStart: 0,
    winEnd: totalDur,
    winDur: Math.max(1.0, totalDur),
    activeHl: null,
    activeHlIdx: -1,
  };
}

function getTrackLaneRect() {
  if (el.directorTrackLane) {
    const r = el.directorTrackLane.getBoundingClientRect();
    if (r.width > 0) return r;
  }
  return el.rulerCanvas.getBoundingClientRect();
}

function updatePlayheadPosition() {
  const laneW = getLaneWidthPx();
  const { winStart, winDur } = getTimelineWindow();
  const rel = Math.max(0, Math.min(1.0, (masterTime - winStart) / winDur));
  let leftOffset = LABEL_WIDTH;
  if (el.directorTrackLane && el.timelineStage) {
    const lRect = el.directorTrackLane.getBoundingClientRect();
    const sRect = el.timelineStage.getBoundingClientRect();
    if (lRect.width > 0 && sRect.width > 0) {
      leftOffset = lRect.left - sRect.left;
    }
  }
  const x = leftOffset + rel * laneW;
  el.playheadLine.style.left = `${x}px`;
}

function showTrimTooltip(text) {
  const tt = document.getElementById("trimDragTooltip");
  if (!tt) return;
  tt.textContent = text;
  tt.classList.remove("hidden");
}

function hideTrimTooltip() {
  const tt = document.getElementById("trimDragTooltip");
  if (tt) tt.classList.add("hidden");
}

function startSceneEdgeDrag(e, hl, edge) {
  e.preventDefault();
  e.stopPropagation();
  pausePlayback();
  pushUndoState("drag trim");
  const totalDur = getMasterDuration();
  lockedTimelineWindow = getTimelineWindow();
  const { winStart, winDur } = lockedTimelineWindow;
  const origStart = hl.start_sec;
  const origEnd = hl.end_sec;

  const onMove = (moveEvt) => {
    const rect = getTrackLaneRect();
    const effW = Math.max(1, rect.width);
    const relX = Math.max(0, Math.min(effW, moveEvt.clientX - rect.left));
    const sec = Number((winStart + (relX / effW) * winDur).toFixed(2));

    if (edge === "in") {
      const clampedIn = Math.max(0, Math.min(hl.end_sec - 2.0, sec));
      hl.start_sec = clampedIn;
      if (hl.camera_cuts && hl.camera_cuts.length > 0) {
        hl.camera_cuts[0].start_sec = clampedIn;
        if (hl.camera_cuts[0].end_sec < clampedIn + 0.6) {
          hl.camera_cuts[0].end_sec = Math.min(hl.end_sec, Number((clampedIn + 1.5).toFixed(2)));
        }
      }
      const delta = clampedIn - origStart;
      const sign = delta >= 0 ? "+" : "";
      showTrimTooltip(
        `⏪ IN: ${formatTime(clampedIn)} (${sign}${delta.toFixed(1)}s) · ${(hl.end_sec - hl.start_sec).toFixed(1)}s`
      );
      syncVideosToMasterTime(clampedIn, true);
    } else {
      const clampedOut = Math.min(totalDur, Math.max(hl.start_sec + 2.0, sec));
      hl.end_sec = clampedOut;
      if (hl.camera_cuts && hl.camera_cuts.length > 0) {
        const last = hl.camera_cuts[hl.camera_cuts.length - 1];
        last.end_sec = clampedOut;
        if (last.start_sec > clampedOut - 0.6) {
          last.start_sec = Math.max(hl.start_sec, Number((clampedOut - 1.5).toFixed(2)));
        }
      }
      const delta = clampedOut - origEnd;
      const sign = delta >= 0 ? "+" : "";
      showTrimTooltip(
        `⏩ OUT: ${formatTime(clampedOut)} (${sign}${delta.toFixed(1)}s) · ${(hl.end_sec - hl.start_sec).toFixed(1)}s`
      );
      syncVideosToMasterTime(Math.max(hl.start_sec, clampedOut - 0.1), true);
    }
    renderTimeline();
  };

  const onUp = async () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    lockedTimelineWindow = null;
    hideTrimTooltip();
    await saveHighlightsToServer();
  };

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

function startCutBoundaryDrag(e, hl, leftCut, rightCut) {
  e.preventDefault();
  e.stopPropagation();
  pausePlayback();
  pushUndoState("drag cut boundary");
  lockedTimelineWindow = getTimelineWindow();
  const { winStart, winDur } = lockedTimelineWindow;

  const onMove = (moveEvt) => {
    const rect = getTrackLaneRect();
    const effW = Math.max(1, rect.width);
    const relX = Math.max(0, Math.min(effW, moveEvt.clientX - rect.left));
    const sec = Number((winStart + (relX / effW) * winDur).toFixed(2));
    const minSec = leftCut.start_sec + 0.8;
    const maxSec = rightCut.end_sec - 0.8;
    const clamped = Math.max(minSec, Math.min(maxSec, sec));

    leftCut.end_sec = clamped;
    rightCut.start_sec = clamped;
    showTrimTooltip(
      `✂️ Cut Switch @ ${formatTime(clamped)}`
    );
    syncVideosToMasterTime(clamped, true);
    renderTimeline();
  };

  const onUp = async () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    lockedTimelineWindow = null;
    hideTrimTooltip();
    await saveHighlightsToServer();
  };

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

function renderTimeline() {
  const laneW = getLaneWidthPx();
  const totalDur = getMasterDuration();
  const win = getTimelineWindow();
  const { winStart, winEnd, winDur, activeHl } = win;
  el.timelineStage.style.width = `${LABEL_WIDTH + laneW}px`;

  const rowLbl = document.getElementById("tlSceneRowLabel");
  if (rowLbl) {
    rowLbl.textContent =
      timelineMode === "scene" && activeHl
        ? `✂️ Scene ${activeHl.scene_number}`
        : `🎬 Scenes`;
  }

  // 1. Draw Ruler
  const rCanvas = el.rulerCanvas;
  rCanvas.width = laneW;
  rCanvas.height = 22;
  const rCtx = rCanvas.getContext("2d");
  rCtx.clearRect(0, 0, laneW, 22);

  rCtx.fillStyle = "#94a3b8";
  rCtx.font = "10px JetBrains Mono, Inter, sans-serif";
  const stepSec =
    winDur <= 30 ? 2 : winDur <= 90 ? 5 : winDur <= 300 ? 15 : winDur <= 900 ? 60 : 300;
  const firstTick = Math.ceil(winStart / stepSec) * stepSec;
  for (let s = firstTick; s <= winEnd; s += stepSec) {
    const x = ((s - winStart) / winDur) * laneW;
    rCtx.fillRect(x, 12, 1, 10);
    const label = winDur > 600 ? `${Math.round(s / 60)}m` : formatTime(s);
    rCtx.fillText(label, x + 3, 11);
  }

  // 2. Director Cuts Lane
  el.directorTrackLane.innerHTML = "";

  const nameA = el.playerAName?.value || "A";
  const nameB = el.playerBName?.value || "B";

  if (timelineMode === "scene" && activeHl) {
    const sceneLeftPx = Math.max(0, ((activeHl.start_sec - winStart) / winDur) * laneW);
    const sceneRightPx = Math.min(laneW, ((activeHl.end_sec - winStart) / winDur) * laneW);
    const sceneWidthPx = Math.max(24, sceneRightPx - sceneLeftPx);

    if (sceneLeftPx > 8) {
      const dimL = document.createElement("div");
      dimL.className = "tl-context-dim";
      dimL.style.left = "0px";
      dimL.style.width = `${sceneLeftPx}px`;
      dimL.textContent = sceneLeftPx > 95 ? "⏪ Drag IN" : "";
      el.directorTrackLane.appendChild(dimL);
    }

    if (laneW - sceneRightPx > 8) {
      const dimR = document.createElement("div");
      dimR.className = "tl-context-dim";
      dimR.style.left = `${sceneRightPx}px`;
      dimR.style.width = `${laneW - sceneRightPx}px`;
      dimR.textContent = laneW - sceneRightPx > 110 ? "Drag OUT ⏩" : "";
      el.directorTrackLane.appendChild(dimR);
    }

    const bracket = document.createElement("div");
    bracket.className = "focused-scene-bracket";
    bracket.style.left = `${sceneLeftPx}px`;
    bracket.style.width = `${sceneWidthPx}px`;
    el.directorTrackLane.appendChild(bracket);

    const cuts =
      activeHl.camera_cuts && activeHl.camera_cuts.length > 0
        ? activeHl.camera_cuts
        : [{ start_sec: activeHl.start_sec, end_sec: activeHl.end_sec, active_pov: "A" }];

    cuts.forEach((cut, cIdx) => {
      const cLeft = ((cut.start_sec - winStart) / winDur) * laneW;
      const cWidth = Math.max(18, ((cut.end_sec - cut.start_sec) / winDur) * laneW);
      const block = document.createElement("div");
      const povClass = cut.active_pov === "SPLIT" ? "SPLIT" : cut.active_pov;
      block.className = `director-cut-block focused-cut-block pov-${povClass}`;
      block.style.left = `${cLeft}px`;
      block.style.width = `${cWidth}px`;
      const cutDur = (cut.end_sec - cut.start_sec).toFixed(1);
      const povLabel =
        cut.active_pov === "A"
          ? `🟦 ${nameA}`
          : cut.active_pov === "B"
          ? `🟪 ${nameB}`
          : "⚡ Split";
      block.title = `${povLabel} (${formatTime(cut.start_sec)} – ${formatTime(cut.end_sec)}, ${cutDur}s)`;
      block.innerHTML = `
        <span>${cWidth > 95 ? povLabel : cut.active_pov} (${cutDur}s)</span>
        ${cWidth > 70 ? `<span class="cut-pov-pill" title="Switch POV">🎥</span>` : ""}
      `;

      const pill = block.querySelector(".cut-pov-pill");
      if (pill) {
        pill.addEventListener("mousedown", (e) => e.stopPropagation());
        pill.addEventListener("click", async (e) => {
          e.stopPropagation();
          pushUndoState("switch POV");
          const order = ["A", "SPLIT", "B"];
          cut.active_pov = order[(order.indexOf(cut.active_pov) + 1) % order.length];
          await saveHighlightsToServer();
        });
      }

      el.directorTrackLane.appendChild(block);

      if (cIdx < cuts.length - 1) {
        const nextCut = cuts[cIdx + 1];
        const bHandle = document.createElement("div");
        bHandle.className = "cut-boundary-handle";
        bHandle.style.left = `${((cut.end_sec - winStart) / winDur) * laneW}px`;
        bHandle.title = "Drag to move cut point";
        bHandle.textContent = "⋮";
        bHandle.addEventListener("mousedown", (e) => startCutBoundaryDrag(e, activeHl, cut, nextCut));
        el.directorTrackLane.appendChild(bHandle);
      }
    });

    const handleIn = document.createElement("div");
    handleIn.className = "scene-trim-handle handle-in";
    handleIn.style.left = `${Math.max(0, sceneLeftPx - 14)}px`;
    handleIn.title = `Drag to trim IN (${formatTime(activeHl.start_sec)})`;
    handleIn.textContent = "⟦";
    handleIn.addEventListener("mousedown", (e) => startSceneEdgeDrag(e, activeHl, "in"));
    el.directorTrackLane.appendChild(handleIn);

    const handleOut = document.createElement("div");
    handleOut.className = "scene-trim-handle handle-out";
    handleOut.style.left = `${Math.min(laneW - 16, sceneRightPx - 2)}px`;
    handleOut.title = `Drag to trim OUT (${formatTime(activeHl.end_sec)})`;
    handleOut.textContent = "⟧";
    handleOut.addEventListener("mousedown", (e) => startSceneEdgeDrag(e, activeHl, "out"));
    el.directorTrackLane.appendChild(handleOut);
  } else {
    (projectState?.highlights || []).forEach((hl) => {
      if (!hl.enabled) return;
      (hl.camera_cuts || []).forEach((cut) => {
        const leftPx = (cut.start_sec / totalDur) * laneW;
        const widthPx = Math.max(6, ((cut.end_sec - cut.start_sec) / totalDur) * laneW);
        const block = document.createElement("div");
        block.className = `director-cut-block pov-${cut.active_pov}`;
        block.style.left = `${leftPx}px`;
        block.style.width = `${widthPx}px`;
        block.title = `Scene ${hl.scene_number}: ${hl.title}\nPOV ${cut.active_pov}`;
        block.innerHTML = `<span>S${hl.scene_number}·${cut.active_pov}</span>`;
        block.addEventListener("click", (e) => {
          e.stopPropagation();
          syncVideosToMasterTime(cut.start_sec + 0.05, true);
        });
        el.directorTrackLane.appendChild(block);
      });
    });
  }

  // 3. Waveforms
  drawWindowedWaveform(el.waveformCanvasA, laneW, win, voiceEnvelopes?.matthew, allWaveforms?.matt_mic_a2 || projectState?.sync?.waveform_a || [], "#38bdf8", "rgba(56, 189, 248, 0.14)");
  drawWindowedWaveform(el.waveformCanvasB, laneW, win, voiceEnvelopes?.leelai, allWaveforms?.lee_mic_b1 || projectState?.sync?.waveform_b || [], "#c084fc", "rgba(192, 132, 252, 0.14)");
  drawWindowedWaveform(document.getElementById("waveformCanvasDeskA"), laneW, win, voiceEnvelopes?.matt_desk, allWaveforms?.matt_desk_a1 || [], "#34d399", "rgba(52, 211, 153, 0.10)");
  drawWindowedWaveform(document.getElementById("waveformCanvasDeskB"), laneW, win, voiceEnvelopes?.lee_desk, allWaveforms?.lee_desk_b0 || [], "#fbbf24", "rgba(251, 191, 36, 0.08)");

  updatePlayheadPosition();
}

function drawWindowedWaveform(canvas, laneW, win, envSamples5Hz, overviewSamples, strokeColor, bgColor) {
  if (!canvas) return;
  const h = canvas.height || 34;
  canvas.width = laneW;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, laneW, h);

  const { winStart, winEnd, winDur, activeHl } = win;
  const totalDur = getMasterDuration();

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 1, laneW, h - 2);

  let slice = [];
  if (timelineMode === "scene" && envSamples5Hz && voiceEnvelopes?.bin_sec > 0) {
    const binSec = voiceEnvelopes.bin_sec;
    const i0 = Math.max(0, Math.floor(winStart / binSec));
    const i1 = Math.min(envSamples5Hz.length, Math.ceil(winEnd / binSec));
    slice = envSamples5Hz.slice(i0, i1);
  } else if (overviewSamples && overviewSamples.length > 0) {
    const nTotal = overviewSamples.length;
    const i0 = Math.max(0, Math.floor((winStart / totalDur) * nTotal));
    const i1 = Math.min(nTotal, Math.ceil((winEnd / totalDur) * nTotal));
    slice = overviewSamples.slice(i0, i1);
  }

  if (slice.length > 0) {
    ctx.fillStyle = strokeColor;
    const midY = h / 2;
    const n = slice.length;
    const barW = Math.max(1.4, laneW / n - 0.4);
    for (let i = 0; i < n; i++) {
      const x = (i / n) * laneW;
      const barH = Math.max(2, slice[i] * (h - 6));
      ctx.fillRect(x, midY - barH / 2, barW, barH);
    }
  }

  if (timelineMode === "scene" && activeHl) {
    const sceneLeftPx = Math.max(0, ((activeHl.start_sec - winStart) / winDur) * laneW);
    const sceneRightPx = Math.min(laneW, ((activeHl.end_sec - winStart) / winDur) * laneW);
    ctx.fillStyle = "rgba(9, 11, 16, 0.62)";
    if (sceneLeftPx > 0) ctx.fillRect(0, 0, sceneLeftPx, h);
    if (sceneRightPx < laneW) ctx.fillRect(sceneRightPx, 0, laneW - sceneRightPx, h);

    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sceneLeftPx, 0);
    ctx.lineTo(sceneLeftPx, h);
    ctx.moveTo(sceneRightPx, 0);
    ctx.lineTo(sceneRightPx, h);
    ctx.stroke();
  }
}

// TIMELINE SCRUBBING
function seekTimelineAtClientX(clientX, win) {
  const rect = getTrackLaneRect();
  const effW = Math.max(1, rect.width);
  const relX = Math.max(0, Math.min(effW, clientX - rect.left));
  const { winStart, winDur } = win || getTimelineWindow();
  const targetSec = winStart + (relX / effW) * winDur;
  syncVideosToMasterTime(targetSec, true);
}

function startTimelineScrub(e) {
  if (
    e.target.classList.contains("scene-trim-handle") ||
    e.target.classList.contains("cut-boundary-handle") ||
    e.target.classList.contains("cut-pov-pill")
  ) {
    return;
  }
  lockedTimelineWindow = getTimelineWindow();
  seekTimelineAtClientX(e.clientX, lockedTimelineWindow);

  const onMove = (moveEvt) => {
    seekTimelineAtClientX(moveEvt.clientX, lockedTimelineWindow);
  };
  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    lockedTimelineWindow = null;
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

[
  el.rulerCanvas,
  el.waveformCanvasA,
  el.waveformCanvasB,
  document.getElementById("waveformCanvasDeskA"),
  document.getElementById("waveformCanvasDeskB"),
  el.directorTrackLane,
].forEach((node) => {
  if (!node) return;
  node.addEventListener("mousedown", (e) => {
    startTimelineScrub(e);
  });
});

// CUTTING & POV SWITCHING
async function splitCutAtPlayhead() {
  const active = getActiveCutAtTime(masterTime);
  if (!active) return;
  pushUndoState("split cut");
  const { highlight, cut } = active;
  if (masterTime <= cut.start_sec + 0.25 || masterTime >= cut.end_sec - 0.25) return;

  const splitPoint = Number(masterTime.toFixed(2));
  const nextPov = cut.active_pov === "A" ? "B" : "A";
  const newCut = {
    id: `cut_${Math.random().toString(36).slice(2, 9)}`,
    start_sec: splitPoint,
    end_sec: cut.end_sec,
    active_pov: nextPov,
    reason: `Split to ${nextPov}`,
  };
  cut.end_sec = splitPoint;
  const idx = highlight.camera_cuts.indexOf(cut);
  highlight.camera_cuts.splice(idx + 1, 0, newCut);
  await saveHighlightsToServer();
}

async function cyclePovAtPlayhead() {
  const active = getActiveCutAtTime(masterTime);
  if (!active) return;
  pushUndoState("cycle POV");
  const order = ["A", "B", "SPLIT"];
  active.cut.active_pov = order[(order.indexOf(active.cut.active_pov) + 1) % order.length];
  await saveHighlightsToServer();
}

async function punchOrSwitchPov(targetPov) {
  const active = getActiveCutAtTime(masterTime);
  if (!active) return;
  pushUndoState("punch cut");
  const { highlight, cut } = active;
  const livePunch = document.getElementById("chkLivePunchCut")?.checked !== false;

  if (
    livePunch &&
    cut.active_pov !== targetPov &&
    masterTime >= cut.start_sec + 0.8 &&
    masterTime <= cut.end_sec - 0.5
  ) {
    const splitPoint = Number(masterTime.toFixed(2));
    const newCut = {
      id: `cut_${Math.random().toString(36).slice(2, 9)}`,
      start_sec: splitPoint,
      end_sec: cut.end_sec,
      active_pov: targetPov,
      reason: `Punch to ${targetPov}`,
    };
    cut.end_sec = splitPoint;
    const idx = highlight.camera_cuts.indexOf(cut);
    highlight.camera_cuts.splice(idx + 1, 0, newCut);
  } else {
    cut.active_pov = targetPov;
  }
  updateDirectorViewportUI(masterTime);
  await saveHighlightsToServer();
}

async function deleteOrMergeCurrentCut() {
  const active = getActiveCutAtTime(masterTime);
  if (!active) return;
  pushUndoState("merge cut");
  const { highlight, cut } = active;
  const cuts = highlight.camera_cuts || [];
  if (cuts.length <= 1) return;
  const idx = cuts.indexOf(cut);
  if (idx > 0) {
    cuts[idx - 1].end_sec = cut.end_sec;
    cuts.splice(idx, 1);
  } else {
    cuts[1].start_sec = cut.start_sec;
    cuts.splice(0, 1);
  }
  await saveHighlightsToServer();
}

async function addHighlightAtPlayhead() {
  if (!projectState?.track_a) return;
  pushUndoState("add scene");
  const totalDur = getMasterDuration();
  const startS = Number(Math.max(0, masterTime - 1.0).toFixed(2));
  const endS = Number(Math.min(totalDur, startS + 15.0).toFixed(2));
  const midS = Number(((startS + endS) / 2).toFixed(2));

  projectState.highlights.push({
    id: `hl_${Math.random().toString(36).slice(2, 9)}`,
    scene_number: projectState.highlights.length + 1,
    act: "Custom Scene",
    title: `Scene @ ${formatTime(startS)}`,
    category: "action",
    start_sec: startS,
    end_sec: endS,
    local_offset_sec: getEffectiveOffsetAtTime(startS),
    excitement_score: 90,
    reasoning: "Added manually at playhead",
    enabled: true,
    camera_cuts: [
      { id: `cut_${Date.now()}a`, start_sec: startS, end_sec: midS, active_pov: "A", reason: "POV A" },
      { id: `cut_${Date.now()}b`, start_sec: midS, end_sec: endS, active_pov: "B", reason: "POV B" },
    ],
  });
  await saveHighlightsToServer();
}

function getAllCutBoundaries() {
  const pts = new Set([0]);
  (projectState?.highlights || []).forEach((hl) => {
    if (!hl.enabled) return;
    pts.add(hl.start_sec);
    pts.add(hl.end_sec);
    (hl.camera_cuts || []).forEach((c) => {
      pts.add(c.start_sec);
      pts.add(c.end_sec);
    });
  });
  return Array.from(pts).sort((a, b) => a - b);
}

// =========================================================================
// SAVE SNAPSHOTS
// =========================================================================
async function saveSnapshot() {
  const name = prompt("Snapshot name:", `Save ${new Date().toLocaleString()}`);
  if (!name) return;

  const snapshot = {
    id: `snap_${Date.now()}`,
    name,
    created_at: new Date().toISOString(),
    highlights: deepCloneHighlights(),
  };

  // Save to localStorage
  let snapshots = [];
  try {
    snapshots = JSON.parse(localStorage.getItem("dualsync_snapshots") || "[]");
  } catch (_) {}
  snapshots.unshift(snapshot);
  if (snapshots.length > 20) snapshots = snapshots.slice(0, 20);
  localStorage.setItem("dualsync_snapshots", JSON.stringify(snapshots));

  // Also save to server if available
  if (!IS_STATIC_CLOUD) {
    try {
      await fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
    } catch (_) {}
  }

  renderSnapshotsList();
  showStatus(`Snapshot "${name}" saved!`);
  setTimeout(hideStatus, 2000);
}

function loadSnapshot(snapshot) {
  if (!confirm(`Load snapshot "${snapshot.name}"? Current edits will be replaced.`)) return;
  pushUndoState("before load snapshot");
  projectState.highlights = snapshot.highlights;
  saveHighlightsToServer();
}

function renderSnapshotsList() {
  const listEl = document.getElementById("snapshotsList");
  if (!listEl) return;

  let snapshots = [];
  try {
    snapshots = JSON.parse(localStorage.getItem("dualsync_snapshots") || "[]");
  } catch (_) {}

  if (snapshots.length === 0) {
    listEl.innerHTML = '<div class="empty-state">No snapshots yet. Click 💾 Save to create one.</div>';
    return;
  }

  listEl.innerHTML = "";
  snapshots.forEach((snap) => {
    const item = document.createElement("div");
    item.className = "snapshot-item";
    const timeStr = new Date(snap.created_at).toLocaleString();
    item.innerHTML = `
      <div>
        <div class="snapshot-name">${snap.name}</div>
        <div class="snapshot-time">${timeStr}</div>
      </div>
      <button class="btn btn-xs btn-outline">Load</button>
    `;
    item.querySelector("button").addEventListener("click", (e) => {
      e.stopPropagation();
      loadSnapshot(snap);
    });
    listEl.appendChild(item);
  });
}

// API ACTIONS
async function uploadFile(slot, file) {
  showStatus(`Uploading Track ${slot} (${file.name})...`);
  try {
    const fd = new FormData();
    fd.append("file", file);
    const resp = await fetch(`/api/upload/${slot}`, { method: "POST", body: fd });
    if (!resp.ok) throw new Error((await resp.json()).detail || "Upload failed");
    renderState(await resp.json(), true);
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    hideStatus();
  }
}

async function loadFromPath(slot, pathStr) {
  if (!pathStr.trim()) return;
  showStatus(`Loading Track ${slot}...`);
  try {
    const resp = await fetch(`/api/load-path/${slot}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathStr }),
    });
    if (!resp.ok) throw new Error((await resp.json()).detail || "Failed");
    renderState(await resp.json(), true);
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    hideStatus();
  }
}

// EVENT LISTENERS
el.fileInputA.addEventListener("change", (e) => e.target.files[0] && uploadFile("A", e.target.files[0]));
el.fileInputB.addEventListener("change", (e) => e.target.files[0] && uploadFile("B", e.target.files[0]));
el.btnLoadPathA.addEventListener("click", () => loadFromPath("A", el.pathInputA.value));
el.btnLoadPathB.addEventListener("click", () => loadFromPath("B", el.pathInputB.value));

el.btnLoadDemo.addEventListener("click", async () => {
  pausePlayback();
  showStatus("Loading Demo Clips...");
  try {
    const resp = await fetch("/api/demo/load", { method: "POST" });
    if (!resp.ok) throw new Error((await resp.json()).detail || "Failed");
    renderState(await resp.json(), true);
    syncVideosToMasterTime(6.4, true);
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    hideStatus();
  }
});

el.btnAutoSync.addEventListener("click", async () => {
  showStatus("Running audio cross-correlation...");
  try {
    const resp = await fetch("/api/sync/auto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audio_stream_a: parseInt(el.audioStreamA.value || "0", 10),
        audio_stream_b: parseInt(el.audioStreamB.value || "0", 10),
        max_search_offset_sec: 600.0,
      }),
    });
    if (!resp.ok) throw new Error((await resp.json()).detail || "Failed");
    renderState(await resp.json(), false);
  } catch (err) {
    alert(`Sync Error: ${err.message}`);
  } finally {
    hideStatus();
  }
});

document.querySelectorAll("[data-nudge]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const delta = parseFloat(btn.getAttribute("data-nudge"));
    const nextOffset = getBaseOffsetSec() + delta;
    const resp = await fetch("/api/sync/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offset_sec: nextOffset }),
    });
    if (resp.ok) renderState(await resp.json(), false);
  });
});

// Trim buttons
el.btnStartEarlier5.addEventListener("click", () => trimActiveOrNearestScene(-5.0, 0.0));
el.btnStartEarlier2.addEventListener("click", () => trimActiveOrNearestScene(-2.0, 0.0));
el.btnStartLater2.addEventListener("click", () => trimActiveOrNearestScene(2.0, 0.0));
el.btnEndShorter2.addEventListener("click", () => trimActiveOrNearestScene(0.0, -2.0));
el.btnEndLonger3.addEventListener("click", () => trimActiveOrNearestScene(0.0, 3.0));
el.btnEndLonger5.addEventListener("click", () => trimActiveOrNearestScene(0.0, 5.0));
el.btnEndLonger10.addEventListener("click", () => trimActiveOrNearestScene(0.0, 10.0));

// Undo / Redo buttons
document.getElementById("btnUndoAction")?.addEventListener("click", performUndo);
document.getElementById("btnRedoAction")?.addEventListener("click", performRedo);
document.getElementById("btnSaveSnapshot")?.addEventListener("click", saveSnapshot);

el.btnAnalyzeGemini.addEventListener("click", async () => {
  const key = el.geminiApiKey.value.trim();
  if (key) localStorage.setItem("dualsync_gemini_api_key", key);
  const model = el.geminiModel.value;
  pushUndoState("AI re-cut");

  showStatus(`Analyzing with ${model}...`);
  try {
    const resp = await fetch("/api/highlights/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key || null,
        model,
        game_name: el.gameNameInput.value,
        style_prompt: el.stylePromptInput.value,
        pov_switch_frequency: el.povPacingSelect.value,
        min_clip_sec: 5.0,
        max_clip_sec: 45.0,
        max_clips: 21,
        use_smart_fallback_if_no_key: true,
      }),
    });
    if (!resp.ok) throw new Error((await resp.json()).detail || "Failed");
    renderState(await resp.json(), false);
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    hideStatus();
  }
});

el.btnExport.addEventListener("click", async () => {
  const fmt = el.exportFormatSelect.value;
  const seqName = el.projectNameInput.value.trim() || "DualSync_Export";

  if (IS_STATIC_CLOUD) {
    const enabled = (projectState?.highlights || []).filter((h) => h.enabled);
    let content = `TITLE: ${seqName}\nFCM: NON-DROP FRAME\n\n`;
    enabled.forEach((h, i) => {
      const idx = String(i + 1).padStart(3, "0");
      content += `${idx}  AX       V     C        ${formatMasterTimecode(h.start_sec)} ${formatMasterTimecode(h.end_sec)} ${formatMasterTimecode(h.start_sec)} ${formatMasterTimecode(h.end_sec)}\n* FROM CLIP NAME: Scene_${h.scene_number}_${h.title}\n\n`;
    });
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${seqName}.edl`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  showStatus(`Exporting ${fmt}...`);
  try {
    const resp = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: fmt, sequence_name: seqName, include_disabled: false }),
    });
    if (!resp.ok) throw new Error((await resp.json()).detail || "Export failed");
    const blob = await resp.blob();
    const disp = resp.headers.get("Content-Disposition") || "";
    const match = disp.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `${seqName}.xml`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(`Export Error: ${err.message}`);
  } finally {
    hideStatus();
  }
});

// Transport & View Mode
el.btnPlayPause.addEventListener("click", togglePlayback);
el.btnSplitCut.addEventListener("click", splitCutAtPlayhead);
el.btnCyclePov.addEventListener("click", cyclePovAtPlayhead);
el.btnAddHighlightHere.addEventListener("click", addHighlightAtPlayhead);

el.btnPrevScene.addEventListener("click", () => {
  const enabled = (projectState?.highlights || []).filter((h) => h.enabled);
  const prev = enabled.filter((h) => h.start_sec < masterTime - 1.0);
  if (prev.length > 0) syncVideosToMasterTime(prev[prev.length - 1].start_sec + 0.05, true);
  else if (enabled.length > 0) syncVideosToMasterTime(enabled[0].start_sec + 0.05, true);
});

el.btnNextScene.addEventListener("click", () => {
  const enabled = (projectState?.highlights || []).filter((h) => h.enabled);
  const next = enabled.filter((h) => h.start_sec > masterTime + 1.0);
  if (next.length > 0) syncVideosToMasterTime(next[0].start_sec + 0.05, true);
  else if (enabled.length > 0) syncVideosToMasterTime(enabled[0].start_sec + 0.05, true);
});

el.btnPrevCut.addEventListener("click", () => {
  const pts = getAllCutBoundaries().filter((p) => p < masterTime - 0.15);
  if (pts.length > 0) syncVideosToMasterTime(pts[pts.length - 1] + 0.02, true);
  else syncVideosToMasterTime(0, true);
});

el.btnNextCut.addEventListener("click", () => {
  const pts = getAllCutBoundaries().filter((p) => p > masterTime + 0.15);
  if (pts.length > 0) syncVideosToMasterTime(pts[0] + 0.02, true);
});

el.muteA.addEventListener("change", () => applyVoiceMixerGains());
el.muteB.addEventListener("change", () => applyVoiceMixerGains());

// Voice Mixer
const selectAutoMuteMode = document.getElementById("selectAutoMuteMode");
const sliderVolMatt = document.getElementById("sliderVolMatt");
const sliderVolLee = document.getElementById("sliderVolLee");
const sliderVolDeskMatt = document.getElementById("sliderVolDeskMatt");
const sliderVolDeskLee = document.getElementById("sliderVolDeskLee");
const btnMuteMattVoice = document.getElementById("btnMuteMattVoice");
const btnMuteLeeVoice = document.getElementById("btnMuteLeeVoice");
const btnMuteDeskMatt = document.getElementById("btnMuteDeskMatt");
const btnMuteDeskLee = document.getElementById("btnMuteDeskLee");

selectAutoMuteMode?.addEventListener("change", (e) => {
  initWebAudioVoiceMixer();
  autoMuteMode = e.target.value || "separated_4stem";
  lastAutoSwitchMs = 0;
  applyVoiceMixerGains(masterTime);
});

sliderVolMatt?.addEventListener("input", (e) => { initWebAudioVoiceMixer(); volMattPct = parseInt(e.target.value, 10) || 0; if (volMattPct > 0) mattVoiceMuted = false; applyVoiceMixerGains(); });
sliderVolLee?.addEventListener("input", (e) => { initWebAudioVoiceMixer(); volLeePct = parseInt(e.target.value, 10) || 0; if (volLeePct > 0) leeVoiceMuted = false; applyVoiceMixerGains(); });
btnMuteMattVoice?.addEventListener("click", () => { initWebAudioVoiceMixer(); mattVoiceMuted = !mattVoiceMuted; applyVoiceMixerGains(); });
btnMuteLeeVoice?.addEventListener("click", () => { initWebAudioVoiceMixer(); leeVoiceMuted = !leeVoiceMuted; applyVoiceMixerGains(); });
sliderVolDeskMatt?.addEventListener("input", (e) => { initWebAudioVoiceMixer(); volDeskMattPct = parseInt(e.target.value, 10) || 0; if (volDeskMattPct > 0) mattDeskMuted = false; applyVoiceMixerGains(); });
sliderVolDeskLee?.addEventListener("input", (e) => { initWebAudioVoiceMixer(); volDeskLeePct = parseInt(e.target.value, 10) || 0; if (volDeskLeePct > 0) leeDeskMuted = false; applyVoiceMixerGains(); });
btnMuteDeskMatt?.addEventListener("click", () => { initWebAudioVoiceMixer(); mattDeskMuted = !mattDeskMuted; applyVoiceMixerGains(); });
btnMuteDeskLee?.addEventListener("click", () => { initWebAudioVoiceMixer(); leeDeskMuted = !leeDeskMuted; applyVoiceMixerGains(); });

// Tab switching
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    viewMode = btn.getAttribute("data-view");
    el.monitorsContainer.className = `monitors-container view-${viewMode}`;
    updateDirectorViewportUI(masterTime);
  });
});

el.timelineZoom.addEventListener("input", () => {
  zoomFactor = parseFloat(el.timelineZoom.value);
  el.zoomLabel.textContent = `${zoomFactor.toFixed(1)}x`;
  renderTimeline();
});

[el.projectNameInput, el.playerAName, el.playerBName].forEach((inp) => {
  inp.addEventListener("change", async () => {
    if (IS_STATIC_CLOUD) return;
    const resp = await fetch("/api/project/meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_name: el.projectNameInput.value,
        player_a_name: el.playerAName.value,
        player_b_name: el.playerBName.value,
      }),
    });
    if (resp.ok) renderState(await resp.json(), false);
  });
});

// Camera Switcher & Timeline Mode
document.getElementById("btnSwitchPovA")?.addEventListener("click", () => punchOrSwitchPov("A"));
document.getElementById("btnSwitchPovSplit")?.addEventListener("click", () => punchOrSwitchPov("SPLIT"));
document.getElementById("btnSwitchPovB")?.addEventListener("click", () => punchOrSwitchPov("B"));
document.getElementById("btnDeleteCut")?.addEventListener("click", () => deleteOrMergeCurrentCut());

const btnToggleVoiceMixer = document.getElementById("btnToggleVoiceMixer");
const voiceMixerPopover = document.getElementById("voiceMixerPopover");
if (btnToggleVoiceMixer && voiceMixerPopover) {
  btnToggleVoiceMixer.addEventListener("click", () => {
    voiceMixerPopover.classList.toggle("hidden");
    btnToggleVoiceMixer.classList.toggle("active", !voiceMixerPopover.classList.contains("hidden"));
  });
}

const btnTlModeScene = document.getElementById("btnTlModeScene");
const btnTlModeFull = document.getElementById("btnTlModeFull");
const fullZoomWrap = document.getElementById("fullZoomControlWrap");
const tlWindowHint = document.getElementById("tlWindowHint");

function setTimelineViewMode(mode) {
  timelineMode = mode;
  btnTlModeScene?.classList.toggle("active", mode === "scene");
  btnTlModeFull?.classList.toggle("active", mode === "full");
  fullZoomWrap?.classList.toggle("hidden", mode === "scene");
  if (tlWindowHint) {
    tlWindowHint.innerHTML =
      mode === "scene"
        ? `Drag <b>⟦ IN</b> & <b>⟧ OUT</b> handles · Drag <b>⋮</b> between cuts`
        : `Full session timeline · Click any scene to jump`;
  }
  renderTimeline();
}

btnTlModeScene?.addEventListener("click", () => setTimelineViewMode("scene"));
btnTlModeFull?.addEventListener("click", () => setTimelineViewMode("full"));

// Keyboard shortcuts (including Ctrl+Z / Ctrl+Shift+Z)
window.addEventListener("keydown", (e) => {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;

  // Ctrl+Z = Undo, Ctrl+Shift+Z = Redo
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    if (e.shiftKey) {
      performRedo();
    } else {
      performUndo();
    }
    return;
  }
  // Ctrl+Y = Redo
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
    e.preventDefault();
    performRedo();
    return;
  }
  // Ctrl+S = Save snapshot
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    saveSnapshot();
    return;
  }

  if (e.code === "Space") {
    e.preventDefault();
    togglePlayback();
  } else if (e.key === "1") {
    e.preventDefault();
    punchOrSwitchPov("A");
  } else if (e.key === "2") {
    e.preventDefault();
    punchOrSwitchPov("SPLIT");
  } else if (e.key === "3") {
    e.preventDefault();
    punchOrSwitchPov("B");
  } else if (e.key === "Backspace" || e.key === "Delete") {
    e.preventDefault();
    deleteOrMergeCurrentCut();
  } else if (e.key.toLowerCase() === "s") {
    e.preventDefault();
    splitCutAtPlayhead();
  } else if (e.key.toLowerCase() === "v") {
    e.preventDefault();
    cyclePovAtPlayhead();
  } else if (e.key.toLowerCase() === "h") {
    e.preventDefault();
    addHighlightAtPlayhead();
  } else if (e.key.toLowerCase() === "f") {
    e.preventDefault();
    toggleFlipLeftRight();
  } else if (e.key.toLowerCase() === "b") {
    e.preventDefault();
    toggleBothCams();
  } else if (e.key === "9") {
    e.preventDefault();
    setShortsMode(!isShortsMode);
  } else if (e.key === "[") {
    el.btnPrevCut.click();
  } else if (e.key === "]") {
    el.btnNextCut.click();
  }
});

window.addEventListener("resize", () => renderTimeline());

// Publish & Share
const btnPublishSite = document.getElementById("btnPublishSite");
if (btnPublishSite) {
  if (IS_STATIC_CLOUD) {
    btnPublishSite.textContent = "☁️ Cloud";
  }
  btnPublishSite.addEventListener("click", async () => {
    const permanentUrl = "https://matthewbrandonbowers.github.io/dualsync-studio/?pw=leelai";
    if (IS_STATIC_CLOUD) {
      try {
        await navigator.clipboard.writeText(permanentUrl);
        btnPublishSite.textContent = "✅ Copied!";
        setTimeout(() => { btnPublishSite.textContent = "☁️ Cloud"; }, 3000);
      } catch (_) {}
      return;
    }
    const orig = btnPublishSite.textContent;
    btnPublishSite.textContent = "⏳ Publishing...";
    showStatus("Publishing to site...");
    try {
      const r = await fetch("/api/publish-site", { method: "POST" });
      if (!r.ok) throw new Error("Publish failed");
      await navigator.clipboard.writeText(permanentUrl);
      btnPublishSite.textContent = "✅ Published!";
    } catch (err) {
      btnPublishSite.textContent = "⚠️ Error";
    } finally {
      hideStatus();
      setTimeout(() => { btnPublishSite.textContent = orig; }, 4000);
    }
  });
}

const btnShareLink = document.getElementById("btnShareLink");
if (btnShareLink) {
  btnShareLink.addEventListener("click", async () => {
    const shareText = "https://matthewbrandonbowers.github.io/dualsync-studio/?pw=leelai";
    try {
      await navigator.clipboard.writeText(shareText);
      const orig = btnShareLink.textContent;
      btnShareLink.textContent = "✅ Copied!";
      setTimeout(() => { btnShareLink.textContent = orig; }, 3000);
    } catch (_) {
      prompt("Copy this link:", shareText);
    }
  });
}

// =========================================================================
// SIDEBAR TABS, REVIEW, COMMENTS, STYLES, AI PRESETS
// =========================================================================
let reviewState = null;

function switchSidebarTab(tabName) {
  document.querySelectorAll(".fio-tab").forEach((t) => {
    t.classList.toggle("active", t.getAttribute("data-tab") === tabName);
  });
  document.querySelectorAll(".fio-tab-pane").forEach((p) => {
    p.classList.toggle("active", p.id === `tabPane_${tabName}`);
  });
}

document.querySelectorAll(".fio-tab").forEach((tab) => {
  tab.addEventListener("click", () => switchSidebarTab(tab.getAttribute("data-tab")));
});

el.viewportA.addEventListener("click", () => {
  if (el.viewportA.classList.contains("pip-mate")) cyclePovAtPlayhead();
});
el.viewportB.addEventListener("click", () => {
  if (el.viewportB.classList.contains("pip-mate")) cyclePovAtPlayhead();
});

// Overview Scrubber
const fioScrubberTrack = document.getElementById("fioScrubberTrack");
if (fioScrubberTrack) {
  const seekOverviewBarAtClientX = (clientX) => {
    const rect = fioScrubberTrack.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    syncVideosToMasterTime(ratio * getMasterDuration(), true);
  };
  fioScrubberTrack.addEventListener("mousedown", (e) => {
    if (e.target.classList.contains("scrubber-comment-pin")) return;
    seekOverviewBarAtClientX(e.clientX);
    const onMove = (moveEvt) => seekOverviewBarAtClientX(moveEvt.clientX);
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

// Story Cut vs Raw Mode
const btnModeStoryReel = document.getElementById("btnModeStoryReel");
const btnModeRawSession = document.getElementById("btnModeRawSession");
btnModeStoryReel?.addEventListener("click", () => {
  el.chkPlayHighlightsOnly.checked = true;
  btnModeStoryReel.classList.add("active");
  btnModeRawSession?.classList.remove("active");
});
btnModeRawSession?.addEventListener("click", () => {
  el.chkPlayHighlightsOnly.checked = false;
  btnModeRawSession.classList.add("active");
  btnModeStoryReel?.classList.remove("active");
});

// Timeline Drawer Toggle
document.getElementById("btnToggleTimelineDrawer")?.addEventListener("click", () => {
  const drawer = document.getElementById("proTimelineDrawer");
  if (drawer) {
    drawer.classList.toggle("collapsed");
    if (!drawer.classList.contains("collapsed")) renderTimeline();
  }
});

// Style Toggles
const btnStyleLudwig = document.getElementById("btnStyleLudwig");
const btnStyleClean = document.getElementById("btnStyleClean");
const chkShowPip = document.getElementById("chkShowPip");

btnStyleLudwig?.addEventListener("click", () => {
  btnStyleLudwig.classList.add("active");
  btnStyleClean?.classList.remove("active");
  if (chkShowPip) chkShowPip.checked = true;
  updateDirectorViewportUI(masterTime);
});

btnStyleClean?.addEventListener("click", () => {
  btnStyleClean.classList.add("active");
  btnStyleLudwig?.classList.remove("active");
  if (chkShowPip) chkShowPip.checked = false;
  updateDirectorViewportUI(masterTime);
});

chkShowPip?.addEventListener("change", () => updateDirectorViewportUI(masterTime));

// AI Director Presets
async function applyAiDirectorPreset(mode) {
  if (!projectState?.highlights?.length) return;
  pushUndoState("AI preset");
  const badge = document.getElementById("activeAiPresetBadge");
  document.querySelectorAll(".ai-preset-btn").forEach((b) => b.classList.remove("active"));

  if (mode === "ludwig") {
    document.getElementById("btnAiPresetLudwig")?.classList.add("active");
    if (badge) badge.textContent = "Co-Op";
    projectState.highlights.forEach((hl, idx) => {
      const dur = hl.end_sec - hl.start_sec;
      const s1 = Number((hl.start_sec + dur * 0.36).toFixed(2));
      const s2 = Number((hl.start_sec + dur * 0.72).toFixed(2));
      const lead = idx % 2 === 0 ? "A" : "B";
      const second = lead === "A" ? "B" : "A";
      hl.camera_cuts = [
        { id: `${hl.id}_c1`, start_sec: hl.start_sec, end_sec: s1, active_pov: "SPLIT", reason: "Co-Op Split" },
        { id: `${hl.id}_c2`, start_sec: s1, end_sec: s2, active_pov: lead, reason: `${lead} Main` },
        { id: `${hl.id}_c3`, start_sec: s2, end_sec: hl.end_sec, active_pov: idx === projectState.highlights.length - 1 ? "SPLIT" : second, reason: "Reaction" },
      ];
    });
  } else if (mode === "speaker") {
    document.getElementById("btnAiPresetSpeaker")?.classList.add("active");
    if (badge) badge.textContent = "Speaker";
    const binSec = voiceEnvelopes?.bin_sec || 0.5;
    projectState.highlights.forEach((hl) => {
      const dur = hl.end_sec - hl.start_sec;
      const numWindows = Math.max(2, Math.min(6, Math.round(dur / 5.0)));
      const winDur = dur / numWindows;
      const rawCuts = [];
      for (let w = 0; w < numWindows; w++) {
        const ws = Number((hl.start_sec + w * winDur).toFixed(2));
        const we = Number((w === numWindows - 1 ? hl.end_sec : hl.start_sec + (w + 1) * winDur).toFixed(2));
        let sumM = 0, sumL = 0, cnt = 0;
        if (voiceEnvelopes?.matthew && voiceEnvelopes?.leelai) {
          const i0 = Math.max(0, Math.floor(ws / binSec));
          const i1 = Math.min(voiceEnvelopes.count - 1, Math.ceil(we / binSec));
          for (let i = i0; i <= i1; i++) { sumM += voiceEnvelopes.matthew[i] || 0; sumL += voiceEnvelopes.leelai[i] || 0; cnt++; }
        }
        const avgM = cnt > 0 ? sumM / cnt : 0.2;
        const avgL = cnt > 0 ? sumL / cnt : 0.2;
        let pov = "A", reason = "A speaking";
        if (avgM > 0.14 && avgL > 0.14 && Math.abs(avgM - avgL) < 0.16) { pov = "SPLIT"; reason = "Both speaking"; }
        else if (avgL > avgM * 1.02 && avgL > 0.06) { pov = "B"; reason = "B speaking"; }
        if (rawCuts.length > 0 && rawCuts[rawCuts.length - 1].active_pov === pov) {
          rawCuts[rawCuts.length - 1].end_sec = we;
        } else {
          rawCuts.push({ id: `${hl.id}_sp_${w}`, start_sec: ws, end_sec: we, active_pov: pov, reason });
        }
      }
      hl.camera_cuts = rawCuts;
    });
  } else if (mode === "action") {
    document.getElementById("btnAiPresetAction")?.classList.add("active");
    if (badge) badge.textContent = "Action";
    projectState.highlights.forEach((hl, idx) => {
      const dur = hl.end_sec - hl.start_sec;
      const step = Math.max(3.5, Math.min(6.0, dur / 4));
      const cuts = [];
      let cur = hl.start_sec;
      let k = 0;
      const order = idx % 2 === 0 ? ["A", "B", "A", "SPLIT"] : ["B", "A", "B", "SPLIT"];
      while (cur < hl.end_sec - 0.5) {
        const next = Math.min(hl.end_sec, Number((cur + step).toFixed(2)));
        const pov = order[k % order.length];
        cuts.push({
          id: `${hl.id}_act_${k}`,
          start_sec: Number(cur.toFixed(2)),
          end_sec: next === hl.end_sec || hl.end_sec - next < 1.8 ? hl.end_sec : next,
          active_pov: pov,
          reason: pov === "SPLIT" ? "Split" : `Action ${pov}`,
        });
        cur = cuts[cuts.length - 1].end_sec;
        k++;
      }
      hl.camera_cuts = cuts;
    });
  }

  await saveHighlightsToServer();
}

document.getElementById("btnApplyLudwigToAll")?.addEventListener("click", () => applyAiDirectorPreset("ludwig"));
document.getElementById("btnAiPresetLudwig")?.addEventListener("click", () => applyAiDirectorPreset("ludwig"));
document.getElementById("btnAiPresetSpeaker")?.addEventListener("click", () => applyAiDirectorPreset("speaker"));
document.getElementById("btnAiPresetAction")?.addEventListener("click", () => applyAiDirectorPreset("action"));

document.querySelectorAll(".act-filter-pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".act-filter-pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    activeActFilter = pill.getAttribute("data-act") || "ALL";
    renderHighlightsList();
  });
});

// Review & Comments
function renderReviewState(rev) {
  reviewState = rev;
  const statusSel = document.getElementById("reviewStatusSelect");
  if (statusSel && rev.status) statusSel.value = rev.status;

  if (rev.youtube_reference) {
    const ytTitle = document.getElementById("ytRefTitle");
    const ytMeta = document.getElementById("ytRefMeta");
    const ytVid = document.getElementById("ytRefVideo");
    if (ytTitle) ytTitle.textContent = rev.youtube_reference.title || "Reference Clip";
    if (ytMeta) ytMeta.textContent = `${rev.youtube_reference.author || ""} · ${rev.youtube_reference.chapter_title || ""}`;
    if (ytVid && rev.youtube_reference.clip_url && !ytVid.src.endsWith(rev.youtube_reference.clip_url)) {
      ytVid.src = rev.youtube_reference.clip_url;
    }
  }

  const comments = rev.comments || [];
  const badge = document.getElementById("commentCountBadge");
  if (badge) badge.textContent = String(comments.length);

  const listEl = document.getElementById("commentsList");
  const pinsEl = document.getElementById("fioScrubberComments");
  if (listEl) listEl.innerHTML = "";
  if (pinsEl) pinsEl.innerHTML = "";

  const totalDur = getMasterDuration();

  comments.forEach((c) => {
    if (pinsEl && totalDur > 0) {
      const pin = document.createElement("div");
      const isA = (c.author || "").toLowerCase().includes("matthew");
      pin.className = `scrubber-comment-pin ${isA ? "role-a" : "role-b"}`;
      pin.style.left = `${Math.max(1, Math.min(99, (c.timestamp_sec / totalDur) * 100))}%`;
      pin.textContent = (c.author || "M")[0].toUpperCase();
      pin.title = `${c.author} @ ${formatTime(c.timestamp_sec)}: ${c.text}`;
      pin.addEventListener("click", (e) => {
        e.stopPropagation();
        syncVideosToMasterTime(c.timestamp_sec, true);
        switchSidebarTab("comments");
      });
      pinsEl.appendChild(pin);
    }

    if (listEl) {
      const card = document.createElement("div");
      card.className = `fio-comment-card ${c.resolved ? "resolved" : ""}`;
      card.innerHTML = `
        <div class="cmt-header">
          <div class="cmt-author">${c.author}</div>
          <button class="cmt-tc-btn" data-seek-cmt="${c.timestamp_sec}">@ ${formatTime(c.timestamp_sec)}</button>
        </div>
        <div class="cmt-body">${c.text}</div>
        <div class="cmt-actions">
          <label style="cursor:pointer;display:flex;align-items:center;gap:4px;">
            <input type="checkbox" data-resolve-cmt="${c.id}" ${c.resolved ? "checked" : ""} />
            <span>${c.resolved ? "Resolved" : "Mark Done"}</span>
          </label>
          <button class="btn btn-xs btn-ghost" data-del-cmt="${c.id}">Delete</button>
        </div>
      `;
      listEl.appendChild(card);
    }
  });

  listEl?.querySelectorAll("[data-seek-cmt]").forEach((btn) => {
    btn.addEventListener("click", () => syncVideosToMasterTime(parseFloat(btn.getAttribute("data-seek-cmt")), true));
  });
  listEl?.querySelectorAll("[data-resolve-cmt]").forEach((chk) => {
    chk.addEventListener("change", async () => {
      const id = chk.getAttribute("data-resolve-cmt");
      if (IS_STATIC_CLOUD && reviewState?.comments) {
        const c = reviewState.comments.find((x) => x.id === id);
        if (c) c.resolved = !c.resolved;
        localStorage.setItem("dualsync_cloud_review_v2", JSON.stringify(reviewState));
        renderReviewState(reviewState);
        return;
      }
      const r = await fetch(`/api/review/comments/${id}/toggle`, { method: "POST" });
      if (r.ok) renderReviewState(await r.json());
    });
  });
  listEl?.querySelectorAll("[data-del-cmt]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-del-cmt");
      if (IS_STATIC_CLOUD && reviewState?.comments) {
        reviewState.comments = reviewState.comments.filter((x) => x.id !== id);
        localStorage.setItem("dualsync_cloud_review_v2", JSON.stringify(reviewState));
        renderReviewState(reviewState);
        return;
      }
      const r = await fetch(`/api/review/comments/${id}`, { method: "DELETE" });
      if (r.ok) renderReviewState(await r.json());
    });
  });
}

document.getElementById("reviewStatusSelect")?.addEventListener("change", async (e) => {
  if (IS_STATIC_CLOUD && reviewState) {
    reviewState.status = e.target.value;
    localStorage.setItem("dualsync_cloud_review_v2", JSON.stringify(reviewState));
    return;
  }
  const r = await fetch("/api/review/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: e.target.value }),
  });
  if (r.ok) renderReviewState(await r.json());
});

document.getElementById("quickCommentForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const inp = document.getElementById("quickCommentInput");
  const author = document.getElementById("commentAuthorSelect")?.value || "Matthew";
  const text = inp?.value.trim();
  if (!text) return;
  const info = getNearestOrCurrentHighlight(masterTime);
  const sceneNum = info?.highlight?.scene_number || 1;

  if (IS_STATIC_CLOUD) {
    if (!reviewState) reviewState = { status: "in_progress", comments: [] };
    if (!reviewState.comments) reviewState.comments = [];
    reviewState.comments.push({
      id: `cmt_${Date.now()}`,
      author,
      role: author.includes("Leelai") ? "Co-Op Partner" : "Creator",
      timestamp_sec: Number(masterTime.toFixed(2)),
      scene_number: sceneNum,
      text,
      resolved: false,
    });
    localStorage.setItem("dualsync_cloud_review_v2", JSON.stringify(reviewState));
    inp.value = "";
    renderReviewState(reviewState);
    switchSidebarTab("comments");
    return;
  }

  const r = await fetch("/api/review/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ author, timestamp_sec: masterTime, scene_number: sceneNum, text }),
  });
  if (r.ok) {
    inp.value = "";
    renderReviewState(await r.json());
    switchSidebarTab("comments");
  }
});

// YouTube Importer
document.getElementById("btnImportYoutube")?.addEventListener("click", async () => {
  const url = document.getElementById("ytImportUrl")?.value.trim();
  const target = document.getElementById("ytImportTarget")?.value || "reference";
  if (!url) return;
  showStatus(`Importing YouTube video...`);
  try {
    const r = await fetch("/api/youtube/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, target, duration_sec: 90.0 }),
    });
    if (!r.ok) throw new Error((await r.json()).detail || "Failed");
    if (target === "reference") {
      const revResp = await fetch("/api/review");
      if (revResp.ok) renderReviewState(await revResp.json());
    } else {
      const projResp = await fetch("/api/project");
      if (projResp.ok) renderState(await projResp.json(), true);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    hideStatus();
  }
});

// =========================================================================
// VIDEO PLAYBACK & QUALITY TUNER
// =========================================================================
let cachedTunnelUrl = "https://plus-macintosh-breeds-graphic.trycloudflare.com";

async function fetchWithTimeout(url, timeoutMs = 1500) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(id);
    return r;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

async function detectBestBackendServer() {
  try {
    const lbResp = await fetch(`./live_backend.json?v=${Date.now()}`);
    if (lbResp.ok) {
      const lb = await lbResp.json();
      if (lb.backend_url) cachedTunnelUrl = lb.backend_url.replace(/\/+$/, "");
    }
  } catch (_) {}

  if (streamSourceMode === "cloud") { resolvedBackendBaseUrl = "CLOUD"; return; }
  if (streamSourceMode === "local") { resolvedBackendBaseUrl = IS_STATIC_CLOUD ? "http://127.0.0.1:8765" : ""; return; }
  if (streamSourceMode === "tunnel") { resolvedBackendBaseUrl = IS_STATIC_CLOUD ? cachedTunnelUrl : ""; return; }

  if (!IS_STATIC_CLOUD) { resolvedBackendBaseUrl = ""; return; }

  try {
    const rLocal = await fetchWithTimeout("http://127.0.0.1:8765/api/health", 1100);
    if (rLocal.ok) { resolvedBackendBaseUrl = "http://127.0.0.1:8765"; return; }
  } catch (_) {}

  if (cachedTunnelUrl) {
    try {
      const rTun = await fetchWithTimeout(`${cachedTunnelUrl}/api/health`, 2200);
      if (rTun.ok) { resolvedBackendBaseUrl = cachedTunnelUrl; return; }
    } catch (_) {}
  }

  resolvedBackendBaseUrl = "CLOUD";
}

function getQualityBadgeLabel(q, base) {
  if (base === "CLOUD") return "360p Cloud";
  if (q === "1080p") return "1080p60";
  if (q === "720p") return "720p";
  if (q === "360p") return "360p";
  return "540p";
}

function updatePlaybackTunerBadges() {
  const badge = document.getElementById("playbackQualityBadge");
  const speedSuffix = userPlaybackSpeed !== 1.0 ? ` · ${userPlaybackSpeed}x` : "";
  if (badge) badge.textContent = `${getQualityBadgeLabel(currentVideoQuality, resolvedBackendBaseUrl)}${speedSuffix}`;

  document.querySelectorAll("#qualityPillRow .tuner-pill").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-quality") === currentVideoQuality);
  });
  document.querySelectorAll("#speedPillRow .tuner-pill").forEach((btn) => {
    btn.classList.toggle("active", parseFloat(btn.getAttribute("data-speed")) === userPlaybackSpeed);
  });
  document.querySelectorAll("#quickTransportSpeedRow .spd-pill").forEach((btn) => {
    btn.classList.toggle("active", parseFloat(btn.getAttribute("data-speed")) === userPlaybackSpeed);
  });

  const selSync = document.getElementById("selectSyncEngineMode");
  if (selSync) selSync.value = syncEngineMode;
  const selSrv = document.getElementById("selectStreamSource");
  if (selSrv) selSrv.value = streamSourceMode;
  const sldTol = document.getElementById("sliderDriftTolerance");
  const lblTol = document.getElementById("labelDriftTolerance");
  if (sldTol) sldTol.value = String(driftToleranceSec);
  if (lblTol) lblTol.textContent = `${driftToleranceSec.toFixed(2)}s`;
}

async function applyMediaStreamSettings(preservePlayhead = true) {
  const wasPlaying = isPlaying;
  const savedTime = masterTime;
  if (wasPlaying) pausePlayback();

  await detectBestBackendServer();
  updatePlaybackTunerBadges();

  if (!projectState?.track_a) return;

  let urlA = "", urlB = "";
  if (resolvedBackendBaseUrl === "CLOUD" || currentVideoQuality === "360p") {
    if (resolvedBackendBaseUrl === "CLOUD") {
      urlA = "./cloud_media/track_a.mp4";
      urlB = "./cloud_media/track_b.mp4";
    } else {
      urlA = `${resolvedBackendBaseUrl}/api/stream/A?pw=leelai&quality=360p`;
      urlB = `${resolvedBackendBaseUrl}/api/stream/B?pw=leelai&quality=360p`;
    }
  } else {
    urlA = `${resolvedBackendBaseUrl}/api/stream/A?pw=leelai&quality=${currentVideoQuality}`;
    urlB = `${resolvedBackendBaseUrl}/api/stream/B?pw=leelai&quality=${currentVideoQuality}`;
  }

  projectState.track_a.media_url = urlA;
  if (projectState.track_b) projectState.track_b.media_url = urlB;

  if (el.videoA.getAttribute("src") !== urlA) { el.videoA.src = urlA; el.videoA.load(); }
  if (projectState.track_b && el.videoB.getAttribute("src") !== urlB) { el.videoB.src = urlB; el.videoB.load(); }

  if (preservePlayhead) {
    const restoreSeek = () => {
      syncVideosToMasterTime(savedTime, true);
      if (wasPlaying) startPlayback();
    };
    if (el.videoA.readyState >= 1) restoreSeek();
    else el.videoA.addEventListener("loadedmetadata", restoreSeek, { once: true });
  }
}

function initPlaybackTunerUI() {
  const btnPopover = document.getElementById("btnTogglePlaybackPopover");
  const popover = document.getElementById("playbackSettingsPopover");
  if (btnPopover && popover) {
    btnPopover.addEventListener("click", () => {
      const hidden = popover.classList.toggle("hidden");
      btnPopover.classList.toggle("active", !hidden);
    });
  }

  document.querySelectorAll("#qualityPillRow .tuner-pill").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const q = btn.getAttribute("data-quality") || "540p";
      currentVideoQuality = q;
      localStorage.setItem("dualsync_video_quality", q);
      if (streamSourceMode === "cloud" && q !== "360p") {
        streamSourceMode = "auto";
        localStorage.setItem("dualsync_stream_source", "auto");
      }
      await applyMediaStreamSettings(true);
    });
  });

  document.getElementById("selectSyncEngineMode")?.addEventListener("change", (e) => {
    syncEngineMode = e.target.value || "free_run";
    localStorage.setItem("dualsync_sync_engine", syncEngineMode);
    lastUiPov = "";
    syncVideosToMasterTime(masterTime, true);
  });

  document.getElementById("sliderDriftTolerance")?.addEventListener("input", (e) => {
    driftToleranceSec = parseFloat(e.target.value) || 0.55;
    localStorage.setItem("dualsync_drift_tol", String(driftToleranceSec));
    const lbl = document.getElementById("labelDriftTolerance");
    if (lbl) lbl.textContent = `${driftToleranceSec.toFixed(2)}s`;
  });

  function setPlaybackSpeed(spd) {
    userPlaybackSpeed = parseFloat(spd) || 1.0;
    const ma = document.getElementById("masterAudio");
    const da = document.getElementById("desktopAudio");
    if (ma) ma.playbackRate = userPlaybackSpeed;
    if (da) da.playbackRate = userPlaybackSpeed;
    if (el.videoA) el.videoA.playbackRate = userPlaybackSpeed;
    if (el.videoB) el.videoB.playbackRate = userPlaybackSpeed;
    updatePlaybackTunerBadges();
  }

  document.querySelectorAll("#speedPillRow .tuner-pill").forEach((btn) => {
    btn.addEventListener("click", () => setPlaybackSpeed(btn.getAttribute("data-speed")));
  });

  document.querySelectorAll("#quickTransportSpeedRow .spd-pill").forEach((btn) => {
    btn.addEventListener("click", () => setPlaybackSpeed(btn.getAttribute("data-speed")));
  });

  document.getElementById("selectStreamSource")?.addEventListener("change", async (e) => {
    streamSourceMode = e.target.value || "auto";
    localStorage.setItem("dualsync_stream_source", streamSourceMode);
    await applyMediaStreamSettings(true);
  });

  document.getElementById("btnForceResyncNow")?.addEventListener("click", () => {
    syncVideosToMasterTime(masterTime, true);
  });

  updatePlaybackTunerBadges();
}

// =========================================================================
// CO-OP FLIP LEFT/RIGHT, BOTH CAMERAS ON 1-POV, & 9:16 SHORTS STUDIO
// =========================================================================

async function toggleFlipLeftRight() {
  isFlippedLR = !isFlippedLR;
  localStorage.setItem("dualsync_flip_lr", String(isFlippedLR));

  // Also persist flip_lr onto the active cut if we're inside a scene
  const activeInfo = getActiveCutAtTime(masterTime);
  if (activeInfo?.cut) {
    pushUndoState("Flip Left/Right");
    activeInfo.cut.flip_lr = isFlippedLR;
  }

  // If an active Short is selected, update its flip_lr too
  if (activeShortId) {
    const sh = shortsListState.find((s) => s.id === activeShortId);
    if (sh) {
      sh.flip_lr = isFlippedLR;
      saveShortsState();
    }
  }

  lastUiPov = "";
  updateFlipAndBothCamsUI();
  updateDirectorViewportUI(masterTime);
  if (activeInfo?.cut) {
    saveHighlightsToServer();
  }
}

async function toggleBothCams(forceVal = null) {
  bothCamsEnabled = forceVal !== null ? Boolean(forceVal) : !bothCamsEnabled;
  localStorage.setItem("dualsync_both_cams", String(bothCamsEnabled));

  const activeInfo = getActiveCutAtTime(masterTime);
  if (activeInfo?.cut) {
    pushUndoState("Toggle Both Cameras");
    activeInfo.cut.both_cams = bothCamsEnabled;
  }

  lastUiPov = "";
  updateFlipAndBothCamsUI();
  syncVideosToMasterTime(masterTime, false);
  if (activeInfo?.cut) {
    saveHighlightsToServer();
  }
}

function setShortsMode(enable) {
  isShortsMode = Boolean(enable);
  const playerShell = document.getElementById("playerShell");
  const fmtBar = document.getElementById("shortsFormattingBar");
  const btn16x9 = document.getElementById("btnFormat16x9");
  const btn9x16 = document.getElementById("btnFormat9x16");
  const btnQuick = document.getElementById("btnToggleShortsFormatQuick");
  const hookOverlay = document.getElementById("shortsHookOverlay");

  playerShell?.classList.toggle("shorts-aspect", isShortsMode);
  fmtBar?.classList.toggle("hidden", !isShortsMode);
  btn16x9?.classList.toggle("active", !isShortsMode);
  btn9x16?.classList.toggle("active", isShortsMode);
  if (btnQuick) {
    btnQuick.textContent = isShortsMode ? "🖥️ Switch to 16:9 Canvas" : "📱 Switch to 9:16 Canvas";
  }

  if (hookOverlay) {
    hookOverlay.classList.toggle("hidden", !isShortsMode || !shortsHookText || shortsHookStyle === "none");
  }

  lastUiPov = "";
  updateFlipAndBothCamsUI();
  applyShortsCropTransform();
  syncVideosToMasterTime(masterTime, false);

  if (isShortsMode) {
    switchSidebarTab("shorts");
  }
}

function setShortsLayout(layout) {
  shortsLayout = layout || "stack_50_50";
  document.querySelectorAll("#shortsLayoutPills .tuner-pill").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-short-layout") === shortsLayout);
  });

  if (activeShortId) {
    const sh = shortsListState.find((s) => s.id === activeShortId);
    if (sh) {
      sh.layout = shortsLayout;
      saveShortsState();
      renderShortsList();
    }
  }

  lastUiPov = "";
  updateDirectorViewportUI(masterTime);
}

function updateHookBannerUI() {
  const hookOverlay = document.getElementById("shortsHookOverlay");
  const hookTextEl = document.getElementById("shortsHookTextDisplay");
  const inpHook = document.getElementById("inputShortsHookText");
  const selStyle = document.getElementById("selectShortsHookStyle");

  if (inpHook && document.activeElement !== inpHook) {
    inpHook.value = shortsHookText || "";
  }
  if (selStyle) {
    selStyle.value = shortsHookStyle || "top_banner";
  }

  if (hookTextEl) {
    hookTextEl.textContent = shortsHookText || "";
  }
  if (hookOverlay) {
    hookOverlay.classList.remove("style-top_banner", "style-center_split");
    if (shortsHookStyle === "center_split") {
      hookOverlay.classList.add("style-center_split");
    } else {
      hookOverlay.classList.add("style-top_banner");
    }
    const shouldHide = !isShortsMode || !shortsHookText.trim() || shortsHookStyle === "none";
    hookOverlay.classList.toggle("hidden", shouldHide);
  }
}

async function loadShorts() {
  let loaded = null;
  if (!IS_STATIC_CLOUD) {
    try {
      const r = await fetch("/api/shorts");
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data.shorts)) loaded = data.shorts;
      }
    } catch (_) {}
  }

  if (!loaded) {
    try {
      const localSaved = localStorage.getItem("dualsync_shorts_v1");
      if (localSaved) {
        const parsed = JSON.parse(localSaved);
        if (Array.isArray(parsed) && parsed.length > 0) loaded = parsed;
      }
    } catch (_) {}
  }

  if (!loaded) {
    try {
      const rStatic = await fetch(`./shorts_state.json?v=${Date.now()}`);
      if (rStatic.ok) {
        const data = await rStatic.json();
        if (Array.isArray(data.shorts)) loaded = data.shorts;
      }
    } catch (_) {}
  }

  shortsListState = Array.isArray(loaded) ? loaded : [];
  renderShortsList();
}

async function saveShortsState() {
  try {
    localStorage.setItem("dualsync_shorts_v1", JSON.stringify(shortsListState));
  } catch (_) {}

  if (!IS_STATIC_CLOUD) {
    try {
      await fetch("/api/shorts/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shortsListState),
      });
      setSaveStatus("saved");
    } catch (_) {}
  }
}

function renderShortsList() {
  const listEl = document.getElementById("shortsList");
  const badgeEl = document.getElementById("shortsCountBadge");
  const catFilter = document.getElementById("selectShortsFilterCat")?.value || "all";
  const durFilter = parseFloat(document.getElementById("selectShortsFilterDur")?.value || "90");

  if (badgeEl) badgeEl.textContent = String(shortsListState.length);
  if (!listEl) return;

  const filtered = shortsListState.filter((s) => {
    const dur = (s.end_sec || 0) - (s.start_sec || 0);
    if (durFilter < 90 && dur > durFilter + 2) return false;
    if (catFilter !== "all" && (s.category || "").toLowerCase() !== catFilter) return false;
    return true;
  });

  listEl.innerHTML = "";
  if (filtered.length === 0) {
    listEl.innerHTML = `<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:0.75rem;">No Shorts match this filter. Click <b>🔍 Find Viral Shorts</b> or <b>+ Clip Current Moment</b>.</div>`;
    return;
  }

  const layoutLabels = {
    stack_50_50: "50/50 Stack",
    stack_70_30: "70/30 Hero",
    full_pip: "9:16 + PiP",
    full_single: "Single 9:16",
    dual_letterbox: "Dual 16:9",
  };

  filtered.forEach((sh) => {
    const dur = Math.max(1, Math.round((sh.end_sec || 0) - (sh.start_sec || 0)));
    const isActive = sh.id === activeShortId;
    const thumbSrc = (sh.thumbnail_url || "").replace(/^\/thumbnails\//, "./thumbnails/");
    const layoutTag = layoutLabels[sh.layout] || "50/50 Stack";
    const flipTag = sh.flip_lr ? "B | A" : "A | B";
    const score = sh.virality_score || 92;

    const card = document.createElement("div");
    card.className = `short-card ${isActive ? "active" : ""}`;
    card.innerHTML = `
      <div class="short-card-top">
        ${thumbSrc ? `<img class="short-card-thumb" src="${thumbSrc}" alt="Short preview" loading="lazy" />` : `<div class="short-card-thumb"></div>`}
        <div class="short-card-info">
          <div class="short-card-title-row">
            <span class="short-card-title">${sh.title || "Untitled Short"}</span>
            <span class="short-virality-badge">🔥 ${score}%</span>
          </div>
          <div class="short-card-hook">"${sh.hook_text || sh.title || ""}"</div>
          <div class="short-card-meta">
            <span class="short-meta-pill">${formatTime(sh.start_sec)} – ${formatTime(sh.end_sec)} (${dur}s)</span>
            <span class="short-meta-pill">${layoutTag}</span>
            <span class="short-meta-pill">⇄ ${flipTag}</span>
            <span class="short-meta-pill">${(sh.category || "viral").toUpperCase()}</span>
          </div>
        </div>
      </div>
      <div class="short-card-actions">
        <button class="btn btn-xs btn-accent" data-short-preview="${sh.id}">📱 Format in 9:16</button>
        <button class="btn btn-xs btn-secondary" data-short-flip="${sh.id}" title="Flip Top/Bottom camera order">⇄ Flip</button>
        <button class="btn btn-xs btn-primary" data-short-export="${sh.id}">⬇ MP4</button>
        <button class="btn btn-xs btn-ghost" data-short-del="${sh.id}" title="Delete Short">✕</button>
      </div>
    `;

    card.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      openShortInStudio(sh, true);
    });

    listEl.appendChild(card);
  });

  listEl.querySelectorAll("[data-short-preview]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-short-preview");
      const sh = shortsListState.find((x) => x.id === id);
      if (sh) openShortInStudio(sh, true);
    });
  });

  listEl.querySelectorAll("[data-short-flip]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-short-flip");
      const sh = shortsListState.find((x) => x.id === id);
      if (sh) {
        sh.flip_lr = !sh.flip_lr;
        if (activeShortId === sh.id) {
          isFlippedLR = Boolean(sh.flip_lr);
          updateFlipAndBothCamsUI();
          lastUiPov = "";
          updateDirectorViewportUI(masterTime);
        }
        saveShortsState();
        renderShortsList();
      }
    });
  });

  listEl.querySelectorAll("[data-short-export]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-short-export");
      exportShortMp4(id);
    });
  });

  listEl.querySelectorAll("[data-short-del]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-short-del");
      shortsListState = shortsListState.filter((x) => x.id !== id);
      if (activeShortId === id) activeShortId = null;
      if (!IS_STATIC_CLOUD) {
        try { await fetch(`/api/shorts/${id}`, { method: "DELETE" }); } catch (_) {}
      }
      saveShortsState();
      renderShortsList();
    });
  });
}

function openShortInStudio(sh, autoEnter9x16 = true) {
  if (!sh) return;
  activeShortId = sh.id;
  shortsLayout = sh.layout || "stack_50_50";
  isFlippedLR = Boolean(sh.flip_lr);
  shortsPanA = sh.pan_a !== undefined ? Number(sh.pan_a) : 50;
  shortsPanB = sh.pan_b !== undefined ? Number(sh.pan_b) : 50;
  shortsZoom = sh.zoom !== undefined ? Number(sh.zoom) : 1.0;
  shortsHookText = sh.hook_text !== undefined ? sh.hook_text : (sh.title || "");

  // Update sliders & layout buttons
  const sldPanA = document.getElementById("sliderShortsPanA");
  const sldPanB = document.getElementById("sliderShortsPanB");
  const sldZoom = document.getElementById("sliderShortsZoom");
  if (sldPanA) sldPanA.value = String(shortsPanA);
  if (sldPanB) sldPanB.value = String(shortsPanB);
  if (sldZoom) sldZoom.value = String(shortsZoom);

  document.querySelectorAll("#shortsLayoutPills .tuner-pill").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-short-layout") === shortsLayout);
  });

  if (autoEnter9x16 && !isShortsMode) {
    setShortsMode(true);
  } else {
    updateFlipAndBothCamsUI();
    applyShortsCropTransform();
    updateHookBannerUI();
  }

  renderShortsList();
  syncVideosToMasterTime(sh.start_sec, true);
  startPlayback();
}

async function findViralShortsFromUI() {
  const cat = document.getElementById("selectShortsFilterCat")?.value || "all";
  const maxDur = parseFloat(document.getElementById("selectShortsFilterDur")?.value || "60");
  const btn = document.getElementById("btnFindShorts");
  const origText = btn ? btn.textContent : "🔍 Find Viral Shorts";
  if (btn) btn.textContent = "⏳ Scanning Co-Op...";

  try {
    if (!IS_STATIC_CLOUD) {
      const r = await fetch("/api/shorts/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: cat, min_dur_sec: 12.0, max_dur_sec: maxDur }),
      });
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data.shorts)) {
          shortsListState = data.shorts;
          saveShortsState();
        }
      }
    } else if (projectState?.highlights?.length) {
      // Static cloud fallback: ensure any high-action scenes are also surfaced as Shorts
      const existingStarts = new Set(shortsListState.map((s) => Math.round(s.start_sec / 10)));
      projectState.highlights.forEach((hl, idx) => {
        const key = Math.round(hl.start_sec / 10);
        if (!existingStarts.has(key)) {
          const clipEnd = Math.min(hl.end_sec, hl.start_sec + Math.min(maxDur, 35));
          if (clipEnd - hl.start_sec >= 10) {
            shortsListState.push({
              id: `short_cloud_${idx}_${Date.now()}`,
              title: hl.title || `Scene ${idx + 1} Short`,
              hook_text: (hl.title || "WAIT FOR IT...").toUpperCase(),
              start_sec: hl.start_sec,
              end_sec: clipEnd,
              layout: idx % 2 === 0 ? "stack_50_50" : "stack_70_30",
              primary_pov: "SPLIT",
              flip_lr: idx % 3 === 1,
              pan_a: 50,
              pan_b: 50,
              zoom: 1.0,
              virality_score: Math.max(82, 96 - idx),
              category: (hl.category || "action").toLowerCase(),
              reason: hl.description || "High-energy co-op highlight",
              thumbnail_url: hl.thumbnail_url || "",
            });
            existingStarts.add(key);
          }
        }
      });
      saveShortsState();
    }
    renderShortsList();
    if (shortsListState.length > 0 && !activeShortId) {
      openShortInStudio(shortsListState[0], true);
    }
  } finally {
    if (btn) btn.textContent = origText;
  }
}

async function createShortAtPlayhead() {
  const startSec = Number(Math.max(0, masterTime).toFixed(2));
  const maxDur = getMasterDuration();
  const endSec = Number(Math.min(maxDur, startSec + 28.0).toFixed(2));
  const nearHl = getNearestOrCurrentHighlight(masterTime)?.highlight;
  const defaultTitle = nearHl ? `${nearHl.title} (Short)` : `Co-Op Short @ ${formatTime(startSec)}`;
  const hook = shortsHookText?.trim() || (nearHl ? nearHl.title.toUpperCase() : "WAIT FOR IT...");

  const newShort = {
    id: `short_${Date.now()}`,
    title: defaultTitle,
    hook_text: hook,
    start_sec: startSec,
    end_sec: endSec,
    layout: shortsLayout || "stack_50_50",
    primary_pov: "SPLIT",
    flip_lr: isFlippedLR,
    pan_a: shortsPanA,
    pan_b: shortsPanB,
    zoom: shortsZoom,
    virality_score: 95,
    category: "funny",
    reason: "Custom clipped Short at playhead",
    thumbnail_url: nearHl?.thumbnail_url || "./thumbnails/scene_00_371s.jpg",
  };

  if (!IS_STATIC_CLOUD) {
    try {
      const r = await fetch("/api/shorts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newShort),
      });
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data.shorts)) {
          shortsListState = data.shorts;
        }
      }
    } catch (_) {
      shortsListState.unshift(newShort);
    }
  } else {
    shortsListState.unshift(newShort);
  }

  saveShortsState();
  openShortInStudio(newShort, true);
}

async function exportShortMp4(shortId = null) {
  const targetId = shortId || activeShortId || (shortsListState[0] && shortsListState[0].id);
  if (!targetId) {
    await createShortAtPlayhead();
    return;
  }
  const sh = shortsListState.find((x) => x.id === targetId);
  if (!sh) return;

  if (IS_STATIC_CLOUD && (!resolvedBackendBaseUrl || resolvedBackendBaseUrl === "CLOUD")) {
    alert("To render a 9:16 vertical MP4 file with FFmpeg, connect to the local studio server or active Cloudflare tunnel.");
    return;
  }

  const base = IS_STATIC_CLOUD ? resolvedBackendBaseUrl : "";
  showStatus(`Rendering 9:16 Short "${sh.title}" (${Math.round(sh.end_sec - sh.start_sec)}s)...`);
  try {
    const r = await fetch(`${base}/api/shorts/${encodeURIComponent(sh.id)}/export?pw=leelai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        layout: sh.id === activeShortId ? shortsLayout : sh.layout,
        flip_lr: sh.id === activeShortId ? isFlippedLR : sh.flip_lr,
        pan_a: sh.id === activeShortId ? shortsPanA : sh.pan_a,
        pan_b: sh.id === activeShortId ? shortsPanB : sh.pan_b,
        zoom: sh.id === activeShortId ? shortsZoom : sh.zoom,
        hook_text: sh.id === activeShortId ? shortsHookText : sh.hook_text,
      }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to export 9:16 Short");
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(sh.title || "dualsync_short").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase()}_9x16.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(`Short Export Error: ${err.message}`);
  } finally {
    hideStatus();
  }
}

function initCoopAndShortsControls() {
  // 1. Flip Left/Right buttons
  document.getElementById("btnFlipLeftRight")?.addEventListener("click", () => toggleFlipLeftRight());
  document.getElementById("btnDeckFlipLR")?.addEventListener("click", () => toggleFlipLeftRight());
  document.getElementById("btnShortsFlipOrder")?.addEventListener("click", () => toggleFlipLeftRight());

  // 2. Both Cameras on 1-POV controls
  const chkBoth = document.getElementById("chkBothCamsAlways");
  chkBoth?.addEventListener("change", (e) => toggleBothCams(e.target.checked));
  document.getElementById("btnDeckBothCams")?.addEventListener("click", () => toggleBothCams());

  const selBothMode = document.getElementById("selectBothCamsMode");
  if (selBothMode) {
    selBothMode.value = bothCamsMode;
    selBothMode.addEventListener("change", (e) => {
      bothCamsMode = e.target.value || "dual_70_30";
      localStorage.setItem("dualsync_both_cams_mode", bothCamsMode);
      if (!bothCamsEnabled) {
        toggleBothCams(true);
      } else {
        lastUiPov = "";
        updateFlipAndBothCamsUI();
        updateDirectorViewportUI(masterTime);
      }
    });
  }

  // 3. Aspect Ratio Format Switcher (16:9 vs 9:16 Shorts)
  document.getElementById("btnFormat16x9")?.addEventListener("click", () => setShortsMode(false));
  document.getElementById("btnFormat9x16")?.addEventListener("click", () => setShortsMode(true));
  document.getElementById("btnToggleShortsFormatQuick")?.addEventListener("click", () => setShortsMode(!isShortsMode));

  // 4. Shorts Formatting Bar Controls
  document.querySelectorAll("#shortsLayoutPills .tuner-pill").forEach((btn) => {
    btn.addEventListener("click", () => setShortsLayout(btn.getAttribute("data-short-layout")));
  });

  const syncActiveShortCrop = () => {
    applyShortsCropTransform();
    if (activeShortId) {
      const sh = shortsListState.find((x) => x.id === activeShortId);
      if (sh) {
        sh.pan_a = shortsPanA;
        sh.pan_b = shortsPanB;
        sh.zoom = shortsZoom;
        saveShortsState();
      }
    }
  };

  document.getElementById("sliderShortsPanA")?.addEventListener("input", (e) => {
    shortsPanA = parseFloat(e.target.value) || 50;
    syncActiveShortCrop();
  });
  document.getElementById("sliderShortsPanB")?.addEventListener("input", (e) => {
    shortsPanB = parseFloat(e.target.value) || 50;
    syncActiveShortCrop();
  });
  document.getElementById("sliderShortsZoom")?.addEventListener("input", (e) => {
    shortsZoom = parseFloat(e.target.value) || 1.0;
    syncActiveShortCrop();
  });
  document.getElementById("btnShortsResetCrop")?.addEventListener("click", () => {
    shortsPanA = 50;
    shortsPanB = 50;
    shortsZoom = 1.0;
    const sA = document.getElementById("sliderShortsPanA");
    const sB = document.getElementById("sliderShortsPanB");
    const sZ = document.getElementById("sliderShortsZoom");
    if (sA) sA.value = "50";
    if (sB) sB.value = "50";
    if (sZ) sZ.value = "1.0";
    syncActiveShortCrop();
  });

  // Direct horizontal drag-to-reframe on viewports when in 9:16 Shorts mode
  const attachDragReframe = (viewportEl, isCamA) => {
    if (!viewportEl) return;
    viewportEl.addEventListener("mousedown", (e) => {
      if (!isShortsMode || e.button !== 0) return;
      if (e.target.closest("button, input, select")) return;
      const startX = e.clientX;
      const startPan = isCamA ? shortsPanA : shortsPanB;
      const rect = viewportEl.getBoundingClientRect();
      const width = Math.max(100, rect.width);

      const onMove = (me) => {
        const dx = me.clientX - startX;
        const deltaPct = -(dx / width) * 100;
        const nextPan = Math.max(0, Math.min(100, Math.round(startPan + deltaPct)));
        if (isCamA) {
          shortsPanA = nextPan;
          const sA = document.getElementById("sliderShortsPanA");
          if (sA) sA.value = String(shortsPanA);
        } else {
          shortsPanB = nextPan;
          const sB = document.getElementById("sliderShortsPanB");
          if (sB) sB.value = String(shortsPanB);
        }
        applyShortsCropTransform();
      };

      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        syncActiveShortCrop();
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  };
  attachDragReframe(el.viewportA, true);
  attachDragReframe(el.viewportB, false);

  // Hook text & style
  document.getElementById("inputShortsHookText")?.addEventListener("input", (e) => {
    shortsHookText = e.target.value;
    updateHookBannerUI();
    if (activeShortId) {
      const sh = shortsListState.find((x) => x.id === activeShortId);
      if (sh) {
        sh.hook_text = shortsHookText;
        saveShortsState();
      }
    }
  });
  document.getElementById("selectShortsHookStyle")?.addEventListener("change", (e) => {
    shortsHookStyle = e.target.value || "top_banner";
    updateHookBannerUI();
  });
  document.getElementById("shortsHookOverlay")?.addEventListener("click", () => {
    const inp = document.getElementById("inputShortsHookText");
    if (inp) {
      inp.focus();
      inp.select();
    }
  });

  // Save/Create Short & Export buttons
  document.getElementById("btnCreateShortFromCurrent")?.addEventListener("click", () => createShortAtPlayhead());
  document.getElementById("btnNewShortAtPlayhead")?.addEventListener("click", () => createShortAtPlayhead());
  document.getElementById("btnExportActiveShortMp4")?.addEventListener("click", () => exportShortMp4(activeShortId));
  document.getElementById("btnFindShorts")?.addEventListener("click", () => findViralShortsFromUI());
  document.getElementById("selectShortsFilterCat")?.addEventListener("change", () => renderShortsList());
  document.getElementById("selectShortsFilterDur")?.addEventListener("change", () => renderShortsList());

  updateFlipAndBothCamsUI();
  updateHookBannerUI();
}

// =========================================================================
// INIT
// =========================================================================
(async function initStudio() {
  initPlaybackTunerUI();
  initCoopAndShortsControls();
  initUserSystem();
  renderSnapshotsList();
  updateUndoRedoButtons();
  await detectBestBackendServer();

  // Client-side password check on static cloud hosting
  if (IS_STATIC_CLOUD) {
    const params = new URLSearchParams(window.location.search);
    const pwParam = (params.get("pw") || "").trim().toLowerCase();
    if (pwParam === "leelai") {
      localStorage.setItem("dualsync_pw_ok", "leelai");
      currentUser = { username: "matthew", display_name: "Matthew" };
      localStorage.setItem("dualsync_current_user", JSON.stringify(currentUser));
      updateUserUI();
    }
    if (localStorage.getItem("dualsync_pw_ok") !== "leelai") {
      const entered = (prompt("Enter DualSync Studio password:", "") || "").trim().toLowerCase();
      if (entered === "leelai") {
        localStorage.setItem("dualsync_pw_ok", "leelai");
      }
    }
  }

  const savedKey = localStorage.getItem("dualsync_gemini_api_key");
  if (savedKey) el.geminiApiKey.value = savedKey;
  el.geminiApiKey.addEventListener("change", () => {
    localStorage.setItem("dualsync_gemini_api_key", el.geminiApiKey.value.trim());
  });

  try {
    const [envResp, wfResp] = await Promise.all([
      fetch(`./voice_envelopes.json?v=${Date.now()}`),
      fetch(`./all_waveforms.json?v=${Date.now()}`),
    ]);
    if (envResp.ok) voiceEnvelopes = await envResp.json();
    if (wfResp.ok) allWaveforms = await wfResp.json();
  } catch (_) {}

  try {
    if (IS_STATIC_CLOUD) {
      const savedRev = localStorage.getItem("dualsync_cloud_review_v2");
      if (savedRev) {
        renderReviewState(JSON.parse(savedRev));
      } else {
        const revResp = await fetch(`./review_state.json?v=${Date.now()}`);
        if (revResp.ok) renderReviewState(await revResp.json());
      }
    } else {
      const revResp = await fetch("/api/review");
      if (revResp.ok) renderReviewState(await revResp.json());
    }
  } catch (_) {}

  let storySnap = null;
  try {
    const snapResp = await fetch(`./story_project.json?t=${Date.now()}`);
    if (snapResp.ok) storySnap = await snapResp.json();
  } catch (_) {}

  let state = null;
  if (!IS_STATIC_CLOUD) {
    try {
      const resp = await fetch("/api/project");
      if (resp.ok) state = await resp.json();
    } catch (_) {}
  }

  if (IS_STATIC_CLOUD && storySnap) {
    state = storySnap;
    const ma = document.getElementById("masterAudio");
    const da = document.getElementById("desktopAudio");
    if (ma) ma.src = "./cloud_media/voices.m4a";
    if (da) da.src = "./cloud_media/desktops.m4a";
    if (state.track_a) state.track_a.media_url = "./cloud_media/track_a.mp4";
    if (state.track_b) state.track_b.media_url = "./cloud_media/track_b.mp4";

    try {
      const savedHl = localStorage.getItem("dualsync_cloud_highlights_v2");
      if (savedHl) {
        const parsed = JSON.parse(savedHl);
        if (Array.isArray(parsed) && parsed.length > 0) state.highlights = parsed;
      }
    } catch (_) {}
  } else if (storySnap && (!state || !state.track_a || state.track_a.filename.includes("demo_"))) {
    showStatus("Loading session...");
    try {
      await fetch("/api/load-path/A", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: storySnap.track_a.path }) });
      await fetch("/api/load-path/B", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: storySnap.track_b.path }) });
      await fetch("/api/project/meta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_name: storySnap.project_name, player_a_name: storySnap.player_a_name, player_b_name: storySnap.player_b_name }) });
      await fetch("/api/highlights/update", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(storySnap.highlights) });
      state = storySnap;
    } catch (_) {
      state = storySnap;
    } finally {
      hideStatus();
    }
  } else if (storySnap && state) {
    state.sync = storySnap.sync;
    if (state.highlights?.length === storySnap.highlights?.length) {
      state.highlights = state.highlights.map((h, i) => ({
        ...storySnap.highlights[i],
        ...h,
        act: h.act || storySnap.highlights[i].act,
        scene_number: h.scene_number || storySnap.highlights[i].scene_number,
        local_offset_sec: h.local_offset_sec ?? storySnap.highlights[i].local_offset_sec,
        thumbnail_url: (h.thumbnail_url || storySnap.highlights[i].thumbnail_url || "").replace(/^\/thumbnails\//, "./thumbnails/"),
      }));
    }
  }

  if (state) {
    if (state.track_a && state.track_b) {
      if (resolvedBackendBaseUrl === "CLOUD") {
        state.track_a.media_url = "./cloud_media/track_a.mp4";
        state.track_b.media_url = "./cloud_media/track_b.mp4";
      } else {
        state.track_a.media_url = `${resolvedBackendBaseUrl}/api/stream/A?pw=leelai&quality=${currentVideoQuality}`;
        state.track_b.media_url = `${resolvedBackendBaseUrl}/api/stream/B?pw=leelai&quality=${currentVideoQuality}`;
      }
    }
    updatePlaybackTunerBadges();
    (state.highlights || []).forEach((h) => {
      if (h.thumbnail_url && h.thumbnail_url.startsWith("/thumbnails/")) {
        h.thumbnail_url = "." + h.thumbnail_url;
      }
    });
    if (state.highlights && state.highlights.length > 0) {
      masterTime = state.highlights[0].start_sec;
    }
    renderState(state, true);
    setSaveStatus("saved");
  }

  // Load project list for the project selector
  await loadProjectList();
  await loadShorts();
})();
