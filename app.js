"use strict";

const LABEL_WIDTH = 140;

let projectState = null;
let masterTime = 366.0;
let isPlaying = false;
let zoomFactor = 1.0;
let viewMode = "director"; // Default to Final Product View
let rafId = null;

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
    // Exact forensic crystal clock drift formula across the 2-hour session (-31.3 ppm),
    // aligned to the exact millisecond Leelai HEARS Matthew's voice (294.150s, eliminating the 690ms hearing lag & slapback echo!):
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

  el.projectNameInput.value = state.project_name || "Dual-POV Session";
  el.playerAName.value = state.player_a_name || "Player A";
  el.playerBName.value = state.player_b_name || "Player B";
  el.overlayLabelA.textContent = `POV A — ${el.playerAName.value}`;
  el.overlayLabelB.textContent = `POV B — ${el.playerBName.value}`;
  el.tlLabelA.textContent = `🟦 Matt Mic (0:a:2)`;
  el.tlLabelB.textContent = `🟪 Leelai Mic (0:a:1)`;

  if (state.track_a) {
    const ta = state.track_a;
    el.trackAMeta.textContent = `${ta.filename} • ${ta.width}x${ta.height} @ ${ta.fps}fps • ${(ta.duration_sec / 60).toFixed(1)}m (${ta.file_size_mb} MB)`;
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
    el.trackBMeta.textContent = `${tb.filename} • ${tb.width}x${tb.height} @ ${tb.fps}fps • ${(tb.duration_sec / 60).toFixed(1)}m (${tb.file_size_mb} MB)`;
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
    el.syncFramesValue.textContent = `${frames >= 0 ? "+" : ""}${frames} f`;
    el.syncConfidenceValue.textContent = `${state.sync.confidence.toFixed(1)}%`;
    el.syncStateBadge.textContent = `Synced (${state.sync.confidence.toFixed(1)}%)`;
    el.syncStateBadge.className = "badge badge-success";
  }

  const clips = state.highlights || [];
  const enabledClips = clips.filter((c) => c.enabled);
  el.clipCountBadge.textContent = `${enabledClips.length}/${clips.length} Scenes`;

  const totalStorySec = enabledClips.reduce((acc, c) => acc + Math.max(0, c.end_sec - c.start_sec), 0);
  const sMins = Math.floor(totalStorySec / 60);
  const sSecs = Math.round(totalStorySec % 60);
  if (el.totalStoryDurationLabel) {
    el.totalStoryDurationLabel.textContent = `${sMins}m ${String(sSecs).padStart(2, "0")}s (${enabledClips.length} Scenes)`;
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
    pill.textContent = `S${num}: ${shortTitle}`;
    pill.title = `[${hl.act}] Scene ${num}: ${hl.title} (${formatTime(hl.start_sec)} – ${formatTime(hl.end_sec)})`;
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

const CHALLENGE_MILESTONES = [
  { t: 0, label: "Spawn & Iron Gear" },
  { t: 1800, label: "Enter The Nether" },
  { t: 3600, label: "Blaze Rods & Pearls" },
  { t: 5000, label: "Locate Stronghold" },
  { t: 5900, label: "Slay Ender Dragon" },
];

function updateLudwigHudAtTime(t) {
  const hudTimer = document.getElementById("hudRunTimer");
  const hudFrac = document.getElementById("hudProgressFraction");
  const hudStack = document.getElementById("hudMilestoneStack");
  const cmtBadge = document.getElementById("commentTimeBadge");

  // Run timer relative to challenge start (366s)
  const runSec = Math.max(0, t - 366.0);
  if (hudTimer) hudTimer.textContent = formatMasterTimecode(runSec);
  if (cmtBadge) cmtBadge.textContent = `@ ${formatTime(t)}`;

  let stageIdx = 0;
  for (let i = 0; i < CHALLENGE_MILESTONES.length; i++) {
    if (t >= CHALLENGE_MILESTONES[i].t) stageIdx = i;
  }
  if (hudFrac) hudFrac.textContent = `${stageIdx + 1}/${CHALLENGE_MILESTONES.length}`;
  if (hudStack) {
    const prev = stageIdx > 0 ? CHALLENGE_MILESTONES[stageIdx - 1].label : "2-Hour Timer Started";
    const curr = CHALLENGE_MILESTONES[stageIdx].label;
    const next =
      stageIdx + 1 < CHALLENGE_MILESTONES.length
        ? CHALLENGE_MILESTONES[stageIdx + 1].label
        : "Challenge Complete! 🏆";
    hudStack.innerHTML = `
      <div class="hud-ms prev">✓ ${prev}</div>
      <div class="hud-ms current">▶ ${curr}</div>
      <div class="hud-ms next">○ ${next}</div>
    `;
  }
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
let timelineMode = "scene"; // "scene" (Focused Scene Trim with Draggable Handles) or "full" (Full 2h Map)
let lockedTimelineWindow = null; // Locked [winStart, winEnd] while dragging a trim handle

function updateDirectorViewportUI(t) {
  const info = getNearestOrCurrentHighlight(t);
  const activeInfo = getActiveCutAtTime(t);
  const pov = activeInfo ? activeInfo.cut.active_pov : "A";
  const showPip =
    syncEngineMode === "single_decoder"
      ? false
      : document.getElementById("chkShowPip")?.checked !== false;

  const povKey = `${pov}_${showPip ? 1 : 0}`;
  if (povKey !== lastUiPov) {
    lastUiPov = povKey;
    el.monitorsContainer.classList.toggle("show-pip", showPip);
    el.monitorsContainer.classList.remove("split-mode");
    el.viewportA.classList.remove("active-pov", "pip-mate");
    el.viewportB.classList.remove("active-pov", "pip-mate");

    if (pov === "A") {
      el.viewportA.classList.add("active-pov");
      el.viewportB.classList.add("pip-mate");
      el.liveDirectorBadge.textContent = showPip
        ? `🟦 MATTHEW MAIN + LEELAI PIP`
        : `🟦 MATTHEW POV`;
    } else if (pov === "B") {
      el.viewportB.classList.add("active-pov");
      el.viewportA.classList.add("pip-mate");
      el.liveDirectorBadge.textContent = showPip
        ? `🟪 LEELAI MAIN + MATTHEW PIP`
        : `🟪 LEELAI POV`;
    } else {
      el.monitorsContainer.classList.add("split-mode");
      el.liveDirectorBadge.textContent = "🔥 50/50 CO-OP SPLIT (MATTHEW + LEELAI)";
    }

    // Update Live Broadcast Camera Switcher Deck tally lights
    document.getElementById("btnSwitchPovA")?.classList.toggle("tally-active", pov === "A");
    document.getElementById("btnSwitchPovSplit")?.classList.toggle("tally-active", pov === "SPLIT");
    document.getElementById("btnSwitchPovB")?.classList.toggle("tally-active", pov === "B");
  }

  updateLudwigHudAtTime(t);
  updateFrameioScrubberPosition(t);

  if (info && info.highlight) {
    const hl = info.highlight;
    if (info.highlightIndex !== lastUiSceneIdx) {
      lastUiSceneIdx = info.highlightIndex;
      const totalScenes = projectState.highlights.length;
      const num = hl.scene_number || info.highlightIndex + 1;
      el.activeSceneBadge.textContent = activeInfo ? `SCENE ${num} / ${totalScenes}` : `SCENE ${num}`;
      el.activeSceneTitle.textContent = hl.title;
      el.activeSceneAct.textContent = hl.act || "Story Scene";
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
// ZERO-LAG PLAYBACK SYNC ENGINE & 4-STEM SEPARATED WEB AUDIO MIXER
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
let volDeskLeePct = 0; // Muted at 0% by default so Leelai's desktop Discord echo is 100% eliminated!
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

// User-Adjustable Video Playback & Quality Tuner State
let currentVideoQuality = localStorage.getItem("dualsync_video_quality") || "540p";
let syncEngineMode = localStorage.getItem("dualsync_sync_engine") || "free_run"; // "free_run" | "single_decoder" | "gentle_lock"
let driftToleranceSec = parseFloat(localStorage.getItem("dualsync_drift_tol") || "0.55");
let userPlaybackSpeed = 1.0;
let streamSourceMode = localStorage.getItem("dualsync_stream_source") || "auto"; // "auto" | "local" | "tunnel" | "cloud"
let resolvedBackendBaseUrl = ""; // "" (same-origin), "http://127.0.0.1:8765", tunnel URL, or "CLOUD"

// Cached WebAudio gains to avoid 60fps AudioParam automation queue spam
let lastGainM = -1;
let lastGainL = -1;
let lastGainDM = -1;
let lastGainDL = -1;
let lastMixerStateSignature = "";

// FPS & Telemetry state
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

    // 1. masterAudio (/api/stream/VOICES): Left = Matthew Isolated Mic (A2), Right = Leelai Studio Mic (B1)
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

    // 2. desktopAudio (/api/stream/DESKTOPS): Left = Matthew Desktop (A1), Right = Leelai Desktop (B0)
    mattDeskGainNode = audioCtx.createGain();
    leeDeskGainNode = audioCtx.createGain();

    const merger = audioCtx.createChannelMerger(2);

    voiceSource.connect(voiceSplitter);
    voiceSplitter.connect(mattGainNode, 0);
    voiceSplitter.connect(leeGainNode, 1);

    mattGainNode.connect(mattAnalyser);
    leeGainNode.connect(leeAnalyser);

    // Center both isolated microphones in Left (0) and Right (1)
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

  let sp = 0; // 0 = silent, 1 = Matthew talking, 2 = Leelai talking
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
  if (lblM) lblM.textContent = mattVoiceMuted ? "MUTE" : autoMuteMatt ? "AUTO-MUTE" : `${volMattPct}%`;
  if (lblL) lblL.textContent = leeVoiceMuted ? "MUTE" : autoMuteLee ? "AUTO-MUTE" : `${volLeePct}%`;
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
      badge.textContent = `✨ 4-STEMS (Leelai Mic ${volLeePct}% · Lee Desk ${leeDeskMuted ? "0%" : volDeskLeePct + "%"})`;
    } else if (owner === "B") {
      badge.textContent = "🔊 LIVE: LEELAI (Matthew Auto-Muted)";
    } else if (owner === "A") {
      badge.textContent = "🔊 LIVE: MATTHEW (Leelai Auto-Muted)";
    } else {
      badge.textContent = "🎚️ MANUAL 4-TRACK MIX";
    }
  }
}

function computeAnalyserRms(analyser, buf) {
  if (!analyser || !buf) return 0;
  analyser.getByteTimeDomainData(buf);
  let sumSq = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128.0;
    sumSq += v * v;
  }
  return Math.sqrt(sumSq / buf.length);
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
      // Only nudge playbackRate at most once every 1000ms to prevent Chromium frame drops
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
      // "free_run" or "single_decoder": keep hardware decoder at pure constant baseRate — zero stutter!
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
    fpsEl.textContent = isPlaying ? `${measuredFps} FPS` : "60 FPS (Idle)";
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
    bufEl.textContent = `Buffer: ${ahead.toFixed(1)}s`;
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
  el.localTcB.textContent = timeB >= 0 ? formatTime(timeB) : `WAIT (${timeB.toFixed(1)}s)`;

  const activeInfo = getActiveCutAtTime(masterTime);
  const activePov = activeInfo ? activeInfo.cut.active_pov : "A";
  const singleDecoderActive = syncEngineMode === "single_decoder" && isPlaying && !forceSeek;

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

function tickPlayback() {
  if (!isPlaying) return;

  const ma = document.getElementById("masterAudio");
  if (hasMasterCoopAudio() && ma && !ma.paused) {
    masterTime = ma.currentTime;
  } else if (projectState?.track_a && !el.videoA.paused) {
    masterTime = el.videoA.currentTime;
  } else {
    masterTime += 1 / 60;
  }

  // Handle "Play Edited Story Reel Only" preview mode
  if (el.chkPlayHighlightsOnly.checked && projectState?.highlights?.length) {
    const enabled = projectState.highlights.filter((h) => h.enabled);
    if (enabled.length > 0) {
      const inside = enabled.find((h) => masterTime >= h.start_sec - 0.08 && masterTime <= h.end_sec + 0.05);
      if (!inside) {
        const nextHl = enabled.find((h) => h.start_sec > masterTime) || enabled[0];
        if (nextHl === enabled[0] && masterTime > enabled[enabled.length - 1].end_sec) {
          pausePlayback();
          syncVideosToMasterTime(enabled[0].start_sec, true);
          return;
        }
        syncVideosToMasterTime(nextHl.start_sec, true);
      }
    }
  }

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

  if (el.chkPlayHighlightsOnly.checked && projectState?.highlights?.length) {
    const enabled = projectState.highlights.filter((h) => h.enabled);
    if (enabled.length > 0) {
      const inside = enabled.find((h) => masterTime >= h.start_sec - 0.08 && masterTime <= h.end_sec);
      if (!inside) {
        const nextHl = enabled.find((h) => h.start_sec > masterTime) || enabled[0];
        syncVideosToMasterTime(nextHl.start_sec, true);
      }
    }
  }

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

// TRIM / EXTEND SCENE HELPER ("make sections longer I think need it")
async function trimHighlightById(hlId, deltaStartSec, deltaEndSec) {
  if (!projectState || !projectState.highlights) return;
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

// RENDER HIGHLIGHTS SIDEBAR GROUPED BY STORY ACT
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

    const cutsHtml = (hl.camera_cuts || [])
      .map(
        (c, cIdx) =>
          `<span class="cut-chip pov-${c.active_pov}" data-hl="${hlIdx}" data-cut="${cIdx}" title="${c.reason || ""} (Click to jump &amp; switch POV)">
            POV ${c.active_pov}: ${formatTime(c.start_sec)}–${formatTime(c.end_sec)}
          </span>`
      )
      .join("");

    const thumbHtml = hl.thumbnail_url
      ? `<img class="hl-thumb" src="${hl.thumbnail_url}" alt="Scene ${hl.scene_number}" data-seek="${hl.start_sec}" title="Click to jump to Scene ${hl.scene_number}" />`
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
        <span>Adjust Length:</span>
        <div class="card-trim-btns">
          <button class="btn btn-xs btn-outline" data-trim-id="${hl.id}" data-ds="-3" data-de="0" title="Start 3s earlier">⏪ +3s Start</button>
          <button class="btn btn-xs btn-outline" data-trim-id="${hl.id}" data-ds="0" data-de="-2" title="Trim 2s off end">-2s End</button>
          <button class="btn btn-xs btn-secondary" data-trim-id="${hl.id}" data-ds="0" data-de="5" title="Extend end by 5 seconds">+5s Longer</button>
          <button class="btn btn-xs btn-secondary" data-trim-id="${hl.id}" data-ds="0" data-de="10" title="Extend end by 10 seconds">+10s Longer</button>
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
      const idx = parseInt(chk.getAttribute("data-hl"), 10);
      projectState.highlights[idx].enabled = chk.checked;
      await saveHighlightsToServer();
    });
  });

  el.highlightsList.querySelectorAll(".hl-del-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const idx = parseInt(btn.getAttribute("data-hl"), 10);
      projectState.highlights.splice(idx, 1);
      await saveHighlightsToServer();
    });
  });

  el.highlightsList.querySelectorAll(".cut-chip").forEach((chip) => {
    chip.addEventListener("click", async () => {
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

async function saveHighlightsToServer() {
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
    } else {
      renderState(projectState, false);
    }
  } catch (_) {
    renderState(projectState, false);
  }
}

// TIMELINE RENDERING (FOCUSED SCENE DRAG-TRIM MODE + FULL 2H OVERVIEW MODE)
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

function updatePlayheadPosition() {
  const laneW = getLaneWidthPx();
  const { winStart, winDur } = getTimelineWindow();
  const rel = (masterTime - winStart) / winDur;
  const x = LABEL_WIDTH + Math.max(0, Math.min(1.0, rel)) * laneW;
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
  const laneW = getLaneWidthPx();
  const totalDur = getMasterDuration();
  lockedTimelineWindow = getTimelineWindow();
  const { winStart, winDur } = lockedTimelineWindow;
  const origStart = hl.start_sec;
  const origEnd = hl.end_sec;

  const onMove = (moveEvt) => {
    const rect = el.rulerCanvas.getBoundingClientRect();
    const relX = Math.max(0, Math.min(laneW, moveEvt.clientX - rect.left));
    const sec = Number((winStart + (relX / laneW) * winDur).toFixed(2));

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
        `⏪ IN: ${formatTime(clampedIn)} (${sign}${delta.toFixed(1)}s) • Scene Dur: ${(hl.end_sec - hl.start_sec).toFixed(1)}s`
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
        `⏩ OUT: ${formatTime(clampedOut)} (${sign}${delta.toFixed(1)}s) • Scene Dur: ${(hl.end_sec - hl.start_sec).toFixed(1)}s`
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
  const laneW = getLaneWidthPx();
  lockedTimelineWindow = getTimelineWindow();
  const { winStart, winDur } = lockedTimelineWindow;

  const onMove = (moveEvt) => {
    const rect = el.rulerCanvas.getBoundingClientRect();
    const relX = Math.max(0, Math.min(laneW, moveEvt.clientX - rect.left));
    const sec = Number((winStart + (relX / laneW) * winDur).toFixed(2));
    const minSec = leftCut.start_sec + 0.8;
    const maxSec = rightCut.end_sec - 0.8;
    const clamped = Math.max(minSec, Math.min(maxSec, sec));

    leftCut.end_sec = clamped;
    rightCut.start_sec = clamped;
    showTrimTooltip(
      `✂️ Cut Switch (${leftCut.active_pov} → ${rightCut.active_pov}) @ ${formatTime(clamped)}`
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
        : `🎬 21 Scenes`;
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

  // 2. Render Director Cuts Lane
  el.directorTrackLane.innerHTML = "";

  if (timelineMode === "scene" && activeHl) {
    const sceneLeftPx = Math.max(0, ((activeHl.start_sec - winStart) / winDur) * laneW);
    const sceneRightPx = Math.min(laneW, ((activeHl.end_sec - winStart) / winDur) * laneW);
    const sceneWidthPx = Math.max(24, sceneRightPx - sceneLeftPx);

    // Dimmed left lead-in context zone
    if (sceneLeftPx > 8) {
      const dimL = document.createElement("div");
      dimL.className = "tl-context-dim";
      dimL.style.left = "0px";
      dimL.style.width = `${sceneLeftPx}px`;
      dimL.textContent = sceneLeftPx > 95 ? "⏪ Drag IN Left to Start Earlier" : "";
      el.directorTrackLane.appendChild(dimL);
    }

    // Dimmed right lead-out context zone
    if (laneW - sceneRightPx > 8) {
      const dimR = document.createElement("div");
      dimR.className = "tl-context-dim";
      dimR.style.left = `${sceneRightPx}px`;
      dimR.style.width = `${laneW - sceneRightPx}px`;
      dimR.textContent = laneW - sceneRightPx > 110 ? "Drag OUT Right to Make Longer ⏩" : "";
      el.directorTrackLane.appendChild(dimR);
    }

    // Active Scene Golden Bracket Frame
    const bracket = document.createElement("div");
    bracket.className = "focused-scene-bracket";
    bracket.style.left = `${sceneLeftPx}px`;
    bracket.style.width = `${sceneWidthPx}px`;
    el.directorTrackLane.appendChild(bracket);

    // Render Camera Cuts inside the Active Scene
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
          ? "🟦 Matt + PiP"
          : cut.active_pov === "B"
          ? "🟪 Leelai + PiP"
          : "⚡ 50/50 Split";
      block.title = `${povLabel} (${formatTime(cut.start_sec)} – ${formatTime(cut.end_sec)}, ${cutDur}s)\nClick to jump • Click badge to switch POV`;
      block.innerHTML = `
        <span>${cWidth > 95 ? povLabel : cut.active_pov} (${cutDur}s)</span>
        ${cWidth > 70 ? `<span class="cut-pov-pill" title="Click to switch POV">🎥</span>` : ""}
      `;

      block.addEventListener("mousedown", (e) => {
        if (e.target.classList.contains("cut-pov-pill")) return;
        e.stopPropagation();
        syncVideosToMasterTime(cut.start_sec + 0.05, true);
      });

      const pill = block.querySelector(".cut-pov-pill");
      if (pill) {
        pill.addEventListener("click", async (e) => {
          e.stopPropagation();
          const order = ["A", "SPLIT", "B"];
          cut.active_pov = order[(order.indexOf(cut.active_pov) + 1) % order.length];
          await saveHighlightsToServer();
        });
      }

      el.directorTrackLane.appendChild(block);

      // Draggable Boundary Handle between cut[cIdx] and cut[cIdx + 1]
      if (cIdx < cuts.length - 1) {
        const nextCut = cuts[cIdx + 1];
        const bHandle = document.createElement("div");
        bHandle.className = "cut-boundary-handle";
        bHandle.style.left = `${((cut.end_sec - winStart) / winDur) * laneW}px`;
        bHandle.title = "Drag left or right to move camera switch point";
        bHandle.textContent = "⋮";
        bHandle.addEventListener("mousedown", (e) => startCutBoundaryDrag(e, activeHl, cut, nextCut));
        el.directorTrackLane.appendChild(bHandle);
      }
    });

    // Left Draggable IN Handle (⟦)
    const handleIn = document.createElement("div");
    handleIn.className = "scene-trim-handle handle-in";
    handleIn.style.left = `${Math.max(0, sceneLeftPx - 14)}px`;
    handleIn.title = `Drag Left/Right to Trim Scene Start (${formatTime(activeHl.start_sec)})`;
    handleIn.textContent = "⟦";
    handleIn.addEventListener("mousedown", (e) => startSceneEdgeDrag(e, activeHl, "in"));
    el.directorTrackLane.appendChild(handleIn);

    // Right Draggable OUT Handle (⟧)
    const handleOut = document.createElement("div");
    handleOut.className = "scene-trim-handle handle-out";
    handleOut.style.left = `${Math.min(laneW - 16, sceneRightPx - 2)}px`;
    handleOut.title = `Drag Left/Right to Trim Scene End (${formatTime(activeHl.end_sec)})`;
    handleOut.textContent = "⟧";
    handleOut.addEventListener("mousedown", (e) => startSceneEdgeDrag(e, activeHl, "out"));
    el.directorTrackLane.appendChild(handleOut);
  } else {
    // Full 2-Hour Overview Mode
    (projectState?.highlights || []).forEach((hl) => {
      if (!hl.enabled) return;
      (hl.camera_cuts || []).forEach((cut) => {
        const leftPx = (cut.start_sec / totalDur) * laneW;
        const widthPx = Math.max(6, ((cut.end_sec - cut.start_sec) / totalDur) * laneW);
        const block = document.createElement("div");
        block.className = `director-cut-block pov-${cut.active_pov}`;
        block.style.left = `${leftPx}px`;
        block.style.width = `${widthPx}px`;
        block.title = `[${hl.act}] Scene ${hl.scene_number}: ${hl.title}\nPOV ${cut.active_pov} (${formatTime(cut.start_sec)}–${formatTime(cut.end_sec)})\nClick to jump & zoom into scene`;
        block.innerHTML = `<span>S${hl.scene_number}•${cut.active_pov}</span>`;

        block.addEventListener("click", (e) => {
          e.stopPropagation();
          syncVideosToMasterTime(cut.start_sec + 0.05, true);
        });

        el.directorTrackLane.appendChild(block);
      });
    });
  }

  // 3. Draw all 4 separated OBS audio track waveforms (Word-level 5Hz in Focused Scene mode, 1800-pt in Full mode!)
  drawWindowedWaveform(
    el.waveformCanvasA,
    laneW,
    win,
    voiceEnvelopes?.matthew,
    allWaveforms?.matt_mic_a2 || projectState?.sync?.waveform_a || [],
    "#38bdf8",
    "rgba(56, 189, 248, 0.14)"
  );
  drawWindowedWaveform(
    el.waveformCanvasB,
    laneW,
    win,
    voiceEnvelopes?.leelai,
    allWaveforms?.lee_mic_b1 || projectState?.sync?.waveform_b || [],
    "#c084fc",
    "rgba(192, 132, 252, 0.14)"
  );
  drawWindowedWaveform(
    document.getElementById("waveformCanvasDeskA"),
    laneW,
    win,
    voiceEnvelopes?.matt_desk,
    allWaveforms?.matt_desk_a1 || [],
    "#34d399",
    "rgba(52, 211, 153, 0.10)"
  );
  drawWindowedWaveform(
    document.getElementById("waveformCanvasDeskB"),
    laneW,
    win,
    voiceEnvelopes?.lee_desk,
    allWaveforms?.lee_desk_b0 || [],
    "#fbbf24",
    "rgba(251, 191, 36, 0.08)"
  );

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

  // Pick 5Hz (0.2s) high-res samples in Focused Scene mode, or 1800-pt overview in Full mode
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

  // Dim outside active scene boundaries in Focused Scene mode so speech in/out points pop visually
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
function handleTimelineClick(e) {
  const rect = el.rulerCanvas.getBoundingClientRect();
  const relX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
  const laneW = getLaneWidthPx();
  const { winStart, winDur } = getTimelineWindow();
  const targetSec = winStart + (relX / laneW) * winDur;
  syncVideosToMasterTime(targetSec, true);
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
    handleTimelineClick(e);
  });
});

// CUTTING & POV SWITCHING ACTIONS AT PLAYHEAD
async function splitCutAtPlayhead() {
  const active = getActiveCutAtTime(masterTime);
  if (!active) return;
  const { highlight, cut } = active;
  if (masterTime <= cut.start_sec + 0.25 || masterTime >= cut.end_sec - 0.25) return;

  const splitPoint = Number(masterTime.toFixed(2));
  const nextPov = cut.active_pov === "A" ? "B" : "A";
  const newCut = {
    id: `cut_${Math.random().toString(36).slice(2, 9)}`,
    start_sec: splitPoint,
    end_sec: cut.end_sec,
    active_pov: nextPov,
    reason: `Manual split switch to POV ${nextPov}`,
  };
  cut.end_sec = splitPoint;
  const idx = highlight.camera_cuts.indexOf(cut);
  highlight.camera_cuts.splice(idx + 1, 0, newCut);
  await saveHighlightsToServer();
}

async function cyclePovAtPlayhead() {
  const active = getActiveCutAtTime(masterTime);
  if (!active) return;
  const order = ["A", "B", "SPLIT"];
  active.cut.active_pov = order[(order.indexOf(active.cut.active_pov) + 1) % order.length];
  await saveHighlightsToServer();
}

// LIVE BROADCAST CAMERA SWITCHER DECK (Keys 1 = Matt+PiP, 2 = 50/50 Split, 3 = Leelai+PiP)
async function punchOrSwitchPov(targetPov) {
  const active = getActiveCutAtTime(masterTime);
  if (!active) return;
  const { highlight, cut } = active;
  const livePunch = document.getElementById("chkLivePunchCut")?.checked !== false;

  // If Live Punch-In is enabled and playhead is at least 0.8s into the cut, split and switch!
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
      reason: `Live switcher punch-in to ${targetPov}`,
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
  const totalDur = getMasterDuration();
  const startS = Number(Math.max(0, masterTime - 1.0).toFixed(2));
  const endS = Number(Math.min(totalDur, startS + 15.0).toFixed(2));
  const midS = Number(((startS + endS) / 2).toFixed(2));

  projectState.highlights.push({
    id: `hl_${Math.random().toString(36).slice(2, 9)}`,
    scene_number: projectState.highlights.length + 1,
    act: "Custom Scene",
    title: `Custom Highlight @ ${formatTime(startS)}`,
    category: "action",
    start_sec: startS,
    end_sec: endS,
    local_offset_sec: getEffectiveOffsetAtTime(startS),
    excitement_score: 90,
    reasoning: "Added manually by editor at playhead",
    enabled: true,
    camera_cuts: [
      { id: `cut_${Date.now()}a`, start_sec: startS, end_sec: midS, active_pov: "A", reason: "POV A Lead" },
      { id: `cut_${Date.now()}b`, start_sec: midS, end_sec: endS, active_pov: "B", reason: "POV B Switch" },
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

// API ACTIONS
async function uploadFile(slot, file) {
  showStatus(`Uploading & probing Track ${slot} (${file.name})...`);
  try {
    const fd = new FormData();
    fd.append("file", file);
    const resp = await fetch(`/api/upload/${slot}`, { method: "POST", body: fd });
    if (!resp.ok) throw new Error((await resp.json()).detail || "Upload failed");
    renderState(await resp.json(), true);
  } catch (err) {
    alert(`Error loading Track ${slot}: ${err.message}`);
  } finally {
    hideStatus();
  }
}

async function loadFromPath(slot, pathStr) {
  if (!pathStr.trim()) return;
  showStatus(`Probing local file for Track ${slot}...`);
  try {
    const resp = await fetch(`/api/load-path/${slot}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathStr }),
    });
    if (!resp.ok) throw new Error((await resp.json()).detail || "Failed to load path");
    renderState(await resp.json(), true);
  } catch (err) {
    alert(`Error loading path: ${err.message}`);
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
  showStatus("Loading synthetic 30s Demo POV Clips...");
  try {
    const resp = await fetch("/api/demo/load", { method: "POST" });
    if (!resp.ok) throw new Error((await resp.json()).detail || "Failed to load demo");
    const state = await resp.json();
    renderState(state, true);
    syncVideosToMasterTime(6.4, true);
  } catch (err) {
    alert(`Demo load error: ${err.message}`);
  } finally {
    hideStatus();
  }
});

el.btnAutoSync.addEventListener("click", async () => {
  showStatus("Extracting audio streams & running FFT + fine waveform cross-correlation...");
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
    if (!resp.ok) throw new Error((await resp.json()).detail || "Auto-sync failed");
    renderState(await resp.json(), false);
  } catch (err) {
    alert(`Auto-Sync Error: ${err.message}`);
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

// Human Judgment Trim Bar Buttons
el.btnStartEarlier5.addEventListener("click", () => trimActiveOrNearestScene(-5.0, 0.0));
el.btnStartEarlier2.addEventListener("click", () => trimActiveOrNearestScene(-2.0, 0.0));
el.btnStartLater2.addEventListener("click", () => trimActiveOrNearestScene(2.0, 0.0));
el.btnEndShorter2.addEventListener("click", () => trimActiveOrNearestScene(0.0, -2.0));
el.btnEndLonger3.addEventListener("click", () => trimActiveOrNearestScene(0.0, 3.0));
el.btnEndLonger5.addEventListener("click", () => trimActiveOrNearestScene(0.0, 5.0));
el.btnEndLonger10.addEventListener("click", () => trimActiveOrNearestScene(0.0, 10.0));

el.btnAnalyzeGemini.addEventListener("click", async () => {
  const key = el.geminiApiKey.value.trim();
  if (key) localStorage.setItem("dualsync_gemini_api_key", key);
  const model = el.geminiModel.value;

  showStatus(
    key
      ? `Building synchronized dual-POV proxy & analyzing highlights with ${model} using your quota...`
      : "Running Smart Audio-Energy Multi-Cam Director..."
  );
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
    if (!resp.ok) throw new Error((await resp.json()).detail || "Analysis failed");
    renderState(await resp.json(), false);
  } catch (err) {
    alert(`Highlight Analysis Error: ${err.message}`);
  } finally {
    hideStatus();
  }
});

el.btnExport.addEventListener("click", async () => {
  const fmt = el.exportFormatSelect.value;
  const seqName = el.projectNameInput.value.trim() || "Beat_Minecraft_In_2_Hours";

  if (IS_STATIC_CLOUD) {
    if (fmt === "stem_leelai" || fmt === "stem_matthew") {
      const a = document.createElement("a");
      a.href = "./cloud_media/voices.m4a";
      a.download = `${seqName}_voices_separated.m4a`;
      a.click();
      return;
    }
    // Client-side EDL / JSON export on GitHub Pages
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
    a.download = `${seqName}_21_Scenes.edl`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  showStatus(
    fmt === "mp4_reel"
      ? "Rendering stitched multi-POV MP4 story reel via FFmpeg..."
      : `Generating ${fmt} timeline with all 21 synced scenes for non-destructive NLE import...`
  );
  try {
    const resp = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: fmt,
        sequence_name: seqName,
        include_disabled: false,
      }),
    });
    if (!resp.ok) throw new Error((await resp.json()).detail || "Export failed");

    const blob = await resp.blob();
    const disp = resp.headers.get("Content-Disposition") || "";
    const match = disp.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `${seqName}.${fmt === "mp4_reel" ? "mp4" : "xml"}`;

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

// Transport & View Mode Listeners
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

el.muteA.addEventListener("change", () => {
  applyVoiceMixerGains();
});
el.muteB.addEventListener("change", () => {
  applyVoiceMixerGains();
});

// Per-Person Studio Voice Mixer + Auto-Mute Mode Listeners
const selectAutoMuteMode = document.getElementById("selectAutoMuteMode");
const sliderVolMatt = document.getElementById("sliderVolMatt");
const sliderVolLee = document.getElementById("sliderVolLee");
const btnMuteMattVoice = document.getElementById("btnMuteMattVoice");
const btnMuteLeeVoice = document.getElementById("btnMuteLeeVoice");
const btnPresetLeeBoost = document.getElementById("btnPresetLeeBoost");
const btnPresetEqualVoice = document.getElementById("btnPresetEqualVoice");

selectAutoMuteMode?.addEventListener("change", (e) => {
  initWebAudioVoiceMixer();
  autoMuteMode = e.target.value || "speaker_and_pov";
  lastAutoSwitchMs = 0;
  applyVoiceMixerGains(masterTime);
});

sliderVolMatt?.addEventListener("input", (e) => {
  initWebAudioVoiceMixer();
  volMattPct = parseInt(e.target.value, 10) || 0;
  if (volMattPct > 0) mattVoiceMuted = false;
  applyVoiceMixerGains();
});

sliderVolLee?.addEventListener("input", (e) => {
  initWebAudioVoiceMixer();
  volLeePct = parseInt(e.target.value, 10) || 0;
  if (volLeePct > 0) leeVoiceMuted = false;
  applyVoiceMixerGains();
});

btnMuteMattVoice?.addEventListener("click", () => {
  initWebAudioVoiceMixer();
  mattVoiceMuted = !mattVoiceMuted;
  applyVoiceMixerGains();
});

btnMuteLeeVoice?.addEventListener("click", () => {
  initWebAudioVoiceMixer();
  leeVoiceMuted = !leeVoiceMuted;
  applyVoiceMixerGains();
});

sliderVolDeskMatt?.addEventListener("input", (e) => {
  initWebAudioVoiceMixer();
  volDeskMattPct = parseInt(e.target.value, 10) || 0;
  if (volDeskMattPct > 0) mattDeskMuted = false;
  applyVoiceMixerGains();
});

sliderVolDeskLee?.addEventListener("input", (e) => {
  initWebAudioVoiceMixer();
  volDeskLeePct = parseInt(e.target.value, 10) || 0;
  if (volDeskLeePct > 0) leeDeskMuted = false;
  applyVoiceMixerGains();
});

btnMuteDeskMatt?.addEventListener("click", () => {
  initWebAudioVoiceMixer();
  mattDeskMuted = !mattDeskMuted;
  applyVoiceMixerGains();
});

btnMuteDeskLee?.addEventListener("click", () => {
  initWebAudioVoiceMixer();
  leeDeskMuted = !leeDeskMuted;
  applyVoiceMixerGains();
});

btnPresetLeeBoost?.addEventListener("click", () => {
  initWebAudioVoiceMixer();
  volMattPct = 100;
  volLeePct = 145;
  volDeskMattPct = 80;
  volDeskLeePct = 0;
  mattVoiceMuted = false;
  leeVoiceMuted = false;
  mattDeskMuted = false;
  leeDeskMuted = true;
  if (sliderVolMatt) sliderVolMatt.value = "100";
  if (sliderVolLee) sliderVolLee.value = "145";
  if (sliderVolDeskMatt) sliderVolDeskMatt.value = "80";
  if (sliderVolDeskLee) sliderVolDeskLee.value = "0";
  applyVoiceMixerGains();
});

btnPresetEqualVoice?.addEventListener("click", () => {
  initWebAudioVoiceMixer();
  volMattPct = 100;
  volLeePct = 125;
  volDeskMattPct = 80;
  volDeskLeePct = 0;
  mattVoiceMuted = false;
  leeVoiceMuted = false;
  mattDeskMuted = false;
  leeDeskMuted = true;
  if (sliderVolMatt) sliderVolMatt.value = "100";
  if (sliderVolLee) sliderVolLee.value = "125";
  if (sliderVolDeskMatt) sliderVolDeskMatt.value = "80";
  if (sliderVolDeskLee) sliderVolDeskLee.value = "0";
  applyVoiceMixerGains();
});

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

// Live Broadcast Camera Switcher Deck buttons & Timeline Mode Switcher & Audio Mixer Popover
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
        ? `Drag yellow <b>⟦ IN</b> &amp; <b>⟧ OUT</b> handles to make scene longer/shorter · Drag <b>⋮</b> between cuts`
        : `Showing all 21 scenes across the 2-hour session · Click any scene to jump`;
  }
  renderTimeline();
}

btnTlModeScene?.addEventListener("click", () => setTimelineViewMode("scene"));
btnTlModeFull?.addEventListener("click", () => setTimelineViewMode("full"));

// Keyboard shortcuts
window.addEventListener("keydown", (e) => {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
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
  } else if (e.key === "[") {
    el.btnPrevCut.click();
  } else if (e.key === "]") {
    el.btnNextCut.click();
  }
});

window.addEventListener("resize", () => renderTimeline());

const btnPublishSite = document.getElementById("btnPublishSite");
if (btnPublishSite) {
  if (IS_STATIC_CLOUD) {
    btnPublishSite.textContent = "☁️ Live Cloud Site";
    btnPublishSite.title = "Running on permanent GitHub Pages CDN — edits auto-save in browser & export via XML/JSON";
  }
  btnPublishSite.addEventListener("click", async () => {
    const permanentUrl = "https://matthewbrandonbowers.github.io/dualsync-studio/?pw=leelai";
    if (IS_STATIC_CLOUD) {
      try {
        await navigator.clipboard.writeText(`${permanentUrl} (Password: leelai)`);
        const orig = btnPublishSite.textContent;
        btnPublishSite.textContent = "✅ Link Copied!";
        setTimeout(() => {
          btnPublishSite.textContent = orig;
        }, 3000);
      } catch (_) {}
      return;
    }
    const orig = btnPublishSite.textContent;
    btnPublishSite.textContent = "⏳ Publishing...";
    showStatus("Publishing latest trims, cuts & review notes to https://matthewbrandonbowers.github.io/dualsync-studio/?pw=leelai...");
    try {
      const r = await fetch("/api/publish-site", { method: "POST" });
      if (!r.ok) throw new Error("Publish failed");
      await navigator.clipboard.writeText(`${permanentUrl} (Password: leelai)`);
      btnPublishSite.textContent = "✅ Published & Copied!";
    } catch (err) {
      btnPublishSite.textContent = "⚠️ Publish Error";
    } finally {
      hideStatus();
      setTimeout(() => {
        btnPublishSite.textContent = orig;
      }, 4000);
    }
  });
}

const btnShareLink = document.getElementById("btnShareLink");
if (btnShareLink) {
  btnShareLink.addEventListener("click", async () => {
    let url = "https://matthewbrandonbowers.github.io/dualsync-studio/?pw=leelai";
    let pw = "leelai";
    if (!IS_STATIC_CLOUD) {
      try {
        const r = await fetch("/api/share-url");
        if (r.ok) {
          const data = await r.json();
          if (data.password) pw = data.password;
        }
      } catch (_) {}
    }
    const shareText = `https://matthewbrandonbowers.github.io/dualsync-studio/?pw=${pw} (Password: ${pw})`;
    try {
      await navigator.clipboard.writeText(shareText);
      const orig = btnShareLink.textContent;
      btnShareLink.textContent = `✅ Copied Hosted Site Link!`;
      setTimeout(() => {
        btnShareLink.textContent = orig;
      }, 4000);
    } catch (_) {
      prompt("Copy this shareable hosted link & password for Leelai:", shareText);
    }
  });
}

// =========================================================================
// FRAME.IO REVIEW, SCRUBBER, LUDWIG CO-OP STYLE & YOUTUBE IMPORTER
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

document.getElementById("btnOpenRefTab")?.addEventListener("click", () => switchSidebarTab("reference"));

// Click corner PiP to swap active main POV
el.viewportA.addEventListener("click", () => {
  if (el.viewportA.classList.contains("pip-mate")) cyclePovAtPlayhead();
});
el.viewportB.addEventListener("click", () => {
  if (el.viewportB.classList.contains("pip-mate")) cyclePovAtPlayhead();
});

// Frame.io Scrubber click-to-seek
const fioScrubberTrack = document.getElementById("fioScrubberTrack");
if (fioScrubberTrack) {
  fioScrubberTrack.addEventListener("click", (e) => {
    const rect = fioScrubberTrack.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    syncVideosToMasterTime(ratio * getMasterDuration(), true);
  });
}

// Story Cut vs Raw 2h Mode Pills
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

// Toggle Pro Waveform Timeline Drawer
document.getElementById("btnToggleTimelineDrawer")?.addEventListener("click", () => {
  const drawer = document.getElementById("proTimelineDrawer");
  if (drawer) {
    drawer.classList.toggle("collapsed");
    if (!drawer.classList.contains("collapsed")) renderTimeline();
  }
});

// Ludwig Co-Op Style vs Clean Cinema Cut Toggles
const btnStyleLudwig = document.getElementById("btnStyleLudwig");
const btnStyleClean = document.getElementById("btnStyleClean");
const chkShowPip = document.getElementById("chkShowPip");
const chkShowHud = document.getElementById("chkShowHud");
const ludwigHudOverlay = document.getElementById("ludwigHudOverlay");

function applyStyleConfig() {
  const showHud = chkShowHud ? chkShowHud.checked : true;
  if (ludwigHudOverlay) ludwigHudOverlay.classList.toggle("hidden", !showHud);
  updateDirectorViewportUI(masterTime);
}

btnStyleLudwig?.addEventListener("click", () => {
  btnStyleLudwig.classList.add("active");
  btnStyleClean?.classList.remove("active");
  if (chkShowPip) chkShowPip.checked = true;
  if (chkShowHud) chkShowHud.checked = true;
  applyStyleConfig();
});

btnStyleClean?.addEventListener("click", () => {
  btnStyleClean.classList.add("active");
  btnStyleLudwig?.classList.remove("active");
  if (chkShowPip) chkShowPip.checked = false;
  if (chkShowHud) chkShowHud.checked = false;
  applyStyleConfig();
});

chkShowPip?.addEventListener("change", applyStyleConfig);
chkShowHud?.addEventListener("change", applyStyleConfig);

// Apply Ludwig Co-Op Pacing across all 21 scenes
async function applyAiDirectorPreset(mode) {
  if (!projectState?.highlights?.length) return;
  const badge = document.getElementById("activeAiPresetBadge");
  document.querySelectorAll(".ai-preset-btn").forEach((b) => b.classList.remove("active"));

  if (mode === "ludwig") {
    document.getElementById("btnAiPresetLudwig")?.classList.add("active");
    if (badge) badge.textContent = "Ludwig Co-Op";
    showStatus("Applying Ludwig Co-Op 50/50 Vertical Split + Action Teammate PiP cuts across all 21 scenes...");
    projectState.highlights.forEach((hl, idx) => {
      const dur = hl.end_sec - hl.start_sec;
      const s1 = Number((hl.start_sec + dur * 0.36).toFixed(2));
      const s2 = Number((hl.start_sec + dur * 0.72).toFixed(2));
      const lead = idx % 2 === 0 ? "A" : "B";
      const second = lead === "A" ? "B" : "A";
      hl.camera_cuts = [
        { id: `${hl.id}_c1`, start_sec: hl.start_sec, end_sec: s1, active_pov: "SPLIT", reason: "Ludwig 50/50 Full-Height Co-Op Split" },
        { id: `${hl.id}_c2`, start_sec: s1, end_sec: s2, active_pov: lead, reason: `${lead} Action Main + ${second} Corner PiP` },
        { id: `${hl.id}_c3`, start_sec: s2, end_sec: hl.end_sec, active_pov: idx === projectState.highlights.length - 1 ? "SPLIT" : second, reason: "Co-Op Reaction / Climax" },
      ];
    });
  } else if (mode === "speaker") {
    document.getElementById("btnAiPresetSpeaker")?.classList.add("active");
    if (badge) badge.textContent = "Active Speaker";
    showStatus("Cutting all 21 scenes by Matthew vs Leelai's isolated microphone speech envelopes...");
    const binSec = voiceEnvelopes?.bin_sec || 0.5;
    projectState.highlights.forEach((hl) => {
      const dur = hl.end_sec - hl.start_sec;
      const numWindows = Math.max(2, Math.min(6, Math.round(dur / 5.0)));
      const winDur = dur / numWindows;
      const rawCuts = [];
      for (let w = 0; w < numWindows; w++) {
        const ws = Number((hl.start_sec + w * winDur).toFixed(2));
        const we = Number((w === numWindows - 1 ? hl.end_sec : hl.start_sec + (w + 1) * winDur).toFixed(2));
        let sumM = 0;
        let sumL = 0;
        let cnt = 0;
        if (voiceEnvelopes?.matthew && voiceEnvelopes?.leelai) {
          const i0 = Math.max(0, Math.floor(ws / binSec));
          const i1 = Math.min(voiceEnvelopes.count - 1, Math.ceil(we / binSec));
          for (let i = i0; i <= i1; i++) {
            sumM += voiceEnvelopes.matthew[i] || 0;
            sumL += voiceEnvelopes.leelai[i] || 0;
            cnt++;
          }
        }
        const avgM = cnt > 0 ? sumM / cnt : 0.2;
        const avgL = cnt > 0 ? sumL / cnt : 0.2;
        let pov = "A";
        let reason = "Matthew speaking lead (Isolated Mic A2)";
        if (avgM > 0.14 && avgL > 0.14 && Math.abs(avgM - avgL) < 0.16) {
          pov = "SPLIT";
          reason = "Both Matthew & Leelai speaking / reacting (50/50 Co-Op Split)";
        } else if (avgL > avgM * 1.02 && avgL > 0.06) {
          pov = "B";
          reason = "Leelai speaking lead (Isolated Studio Mic B1)";
        }
        if (rawCuts.length > 0 && rawCuts[rawCuts.length - 1].active_pov === pov) {
          rawCuts[rawCuts.length - 1].end_sec = we;
        } else {
          rawCuts.push({
            id: `${hl.id}_sp_${w}`,
            start_sec: ws,
            end_sec: we,
            active_pov: pov,
            reason,
          });
        }
      }
      hl.camera_cuts = rawCuts;
    });
  } else if (mode === "action") {
    document.getElementById("btnAiPresetAction")?.classList.add("active");
    if (badge) badge.textContent = "Combat Focus";
    showStatus("Applying high-tempo combat action cuts with teammate PiP across all 21 scenes...");
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
          reason: pov === "SPLIT" ? "Climax 50/50 Split" : `Fast Combat Cut (${pov} + Corner PiP)`,
        });
        cur = cuts[cuts.length - 1].end_sec;
        k++;
      }
      hl.camera_cuts = cuts;
    });
  }

  await saveHighlightsToServer();
  hideStatus();
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

// Frame.io Review State & Comments
function renderReviewState(rev) {
  reviewState = rev;
  const statusSel = document.getElementById("reviewStatusSelect");
  if (statusSel && rev.status) statusSel.value = rev.status;

  if (rev.youtube_reference) {
    const ytTitle = document.getElementById("ytRefTitle");
    const ytMeta = document.getElementById("ytRefMeta");
    const ytVid = document.getElementById("ytRefVideo");
    if (ytTitle) ytTitle.textContent = rev.youtube_reference.title || "YouTube Reference";
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
          <div class="cmt-author">${c.author} <span style="color:#94a3b8;font-weight:400;">(${c.role || ""})</span></div>
          <button class="cmt-tc-btn" data-seek-cmt="${c.timestamp_sec}">@ ${formatTime(c.timestamp_sec)} (S${c.scene_number || 1})</button>
        </div>
        <div class="cmt-body">${c.text}</div>
        <div class="cmt-actions">
          <label style="cursor:pointer;display:flex;align-items:center;gap:4px;">
            <input type="checkbox" data-resolve-cmt="${c.id}" ${c.resolved ? "checked" : ""} />
            <span>${c.resolved ? "Resolved" : "Mark Complete"}</span>
          </label>
          <button class="btn btn-xs btn-ghost" data-del-cmt="${c.id}">Delete</button>
        </div>
      `;
      listEl.appendChild(card);
    }
  });

  listEl?.querySelectorAll("[data-seek-cmt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncVideosToMasterTime(parseFloat(btn.getAttribute("data-seek-cmt")), true);
    });
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
    body: JSON.stringify({
      author,
      timestamp_sec: masterTime,
      scene_number: sceneNum,
      text,
    }),
  });
  if (r.ok) {
    inp.value = "";
    renderReviewState(await r.json());
    switchSidebarTab("comments");
  }
});

// YouTube Video / Reference Importer via yt-dlp
document.getElementById("btnImportYoutube")?.addEventListener("click", async () => {
  const url = document.getElementById("ytImportUrl")?.value.trim();
  const target = document.getElementById("ytImportTarget")?.value || "reference";
  if (!url) return;
  showStatus(`Downloading & importing YouTube video (${url}) via yt-dlp...`);
  try {
    const r = await fetch("/api/youtube/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, target, duration_sec: 90.0 }),
    });
    if (!r.ok) throw new Error((await r.json()).detail || "YouTube import failed");
    const res = await r.json();
    if (target === "reference") {
      const revResp = await fetch("/api/review");
      if (revResp.ok) renderReviewState(await revResp.json());
    } else {
      const projResp = await fetch("/api/project");
      if (projResp.ok) renderState(await projResp.json(), true);
    }
  } catch (err) {
    alert(`YouTube Import Error: ${err.message}`);
  } finally {
    hideStatus();
  }
});

// =========================================================================
// VIDEO PLAYBACK, QUALITY & SMOOTHNESS TUNER
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

  if (streamSourceMode === "cloud") {
    resolvedBackendBaseUrl = "CLOUD";
    return resolvedBackendBaseUrl;
  }
  if (streamSourceMode === "local") {
    resolvedBackendBaseUrl = IS_STATIC_CLOUD ? "http://127.0.0.1:8765" : "";
    return resolvedBackendBaseUrl;
  }
  if (streamSourceMode === "tunnel") {
    resolvedBackendBaseUrl = IS_STATIC_CLOUD ? cachedTunnelUrl : "";
    return resolvedBackendBaseUrl;
  }

  // "auto" mode
  if (!IS_STATIC_CLOUD) {
    resolvedBackendBaseUrl = "";
    return resolvedBackendBaseUrl;
  }

  // When running on GitHub Pages (IS_STATIC_CLOUD), probe local SSD server first, then live Cloudflare tunnel!
  try {
    const rLocal = await fetchWithTimeout("http://127.0.0.1:8765/api/health", 1100);
    if (rLocal.ok) {
      resolvedBackendBaseUrl = "http://127.0.0.1:8765";
      return resolvedBackendBaseUrl;
    }
  } catch (_) {}

  if (cachedTunnelUrl) {
    try {
      const rTun = await fetchWithTimeout(`${cachedTunnelUrl}/api/health`, 2200);
      if (rTun.ok) {
        resolvedBackendBaseUrl = cachedTunnelUrl;
        return resolvedBackendBaseUrl;
      }
    } catch (_) {}
  }

  resolvedBackendBaseUrl = "CLOUD";
  return resolvedBackendBaseUrl;
}

function getQualityBadgeLabel(q, base) {
  if (base === "CLOUD") return "360p Cloud";
  if (q === "1080p") return "1080p60 Raw";
  if (q === "720p") return "720p HD";
  if (q === "360p") return "360p Fast";
  return "540p Smooth";
}

function updatePlaybackTunerBadges() {
  const badge = document.getElementById("playbackQualityBadge");
  const speedSuffix = userPlaybackSpeed !== 1.0 ? ` · ${userPlaybackSpeed}x` : "";
  if (badge) {
    badge.textContent = `${getQualityBadgeLabel(currentVideoQuality, resolvedBackendBaseUrl)}${speedSuffix}`;
  }

  document.querySelectorAll("#qualityPillRow .tuner-pill").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-quality") === currentVideoQuality);
  });
  document.querySelectorAll("#speedPillRow .tuner-pill").forEach((btn) => {
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

  let urlA = "";
  let urlB = "";
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

  if (el.videoA.getAttribute("src") !== urlA) {
    el.videoA.src = urlA;
    el.videoA.load();
  }
  if (projectState.track_b && el.videoB.getAttribute("src") !== urlB) {
    el.videoB.src = urlB;
    el.videoB.load();
  }

  if (preservePlayhead) {
    const restoreSeek = () => {
      syncVideosToMasterTime(savedTime, true);
      if (wasPlaying) startPlayback();
    };
    if (el.videoA.readyState >= 1) {
      restoreSeek();
    } else {
      el.videoA.addEventListener("loadedmetadata", restoreSeek, { once: true });
    }
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

  document.querySelectorAll("#speedPillRow .tuner-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      userPlaybackSpeed = parseFloat(btn.getAttribute("data-speed")) || 1.0;
      const ma = document.getElementById("masterAudio");
      const da = document.getElementById("desktopAudio");
      if (ma) ma.playbackRate = userPlaybackSpeed;
      if (da) da.playbackRate = userPlaybackSpeed;
      if (el.videoA) el.videoA.playbackRate = userPlaybackSpeed;
      if (el.videoB) el.videoB.playbackRate = userPlaybackSpeed;
      updatePlaybackTunerBadges();
    });
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

// INIT
(async function initStudio() {
  initPlaybackTunerUI();
  await detectBestBackendServer();
  // Client-side password check on static cloud hosting (?pw=leelai)
  if (IS_STATIC_CLOUD) {
    const params = new URLSearchParams(window.location.search);
    const pwParam = (params.get("pw") || "").trim().toLowerCase();
    if (pwParam === "leelai") {
      localStorage.setItem("dualsync_pw_ok", "leelai");
    }
    if (localStorage.getItem("dualsync_pw_ok") !== "leelai") {
      const entered = (prompt("🔒 Enter DualSync Studio Password (for Matthew & Leelai):", "leelai") || "")
        .trim()
        .toLowerCase();
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
    if (snapResp.ok) {
      storySnap = await snapResp.json();
    }
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
        if (Array.isArray(parsed) && parsed.length > 0) {
          state.highlights = parsed;
        }
      }
    } catch (_) {}
  } else if (storySnap && (!state || !state.track_a || state.track_a.filename.includes("demo_"))) {
    showStatus("Loading 2-Hour Minecraft Speedrun Session (Matthew & Leelai) into live player...");
    try {
      await fetch("/api/load-path/A", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: storySnap.track_a.path }),
      });
      await fetch("/api/load-path/B", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: storySnap.track_b.path }),
      });
      await fetch("/api/project/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_name: storySnap.project_name,
          player_a_name: storySnap.player_a_name,
          player_b_name: storySnap.player_b_name,
        }),
      });
      await fetch("/api/highlights/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(storySnap.highlights),
      });
      state = storySnap;
    } catch (_) {
      state = storySnap;
    } finally {
      hideStatus();
    }
  } else if (storySnap && state) {
    // Preserve full 2-hour waveforms and rich scene metadata from story_project.json
    state.sync = storySnap.sync;
    if (state.highlights?.length === storySnap.highlights?.length) {
      state.highlights = state.highlights.map((h, i) => ({
        ...storySnap.highlights[i],
        ...h,
        act: h.act || storySnap.highlights[i].act,
        scene_number: h.scene_number || storySnap.highlights[i].scene_number,
        local_offset_sec: h.local_offset_sec ?? storySnap.highlights[i].local_offset_sec,
        thumbnail_url: (h.thumbnail_url || storySnap.highlights[i].thumbnail_url || "").replace(
          /^\/thumbnails\//,
          "./thumbnails/"
        ),
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
  }
})();
