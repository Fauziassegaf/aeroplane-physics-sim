/**
 * AeroMotion - Aeroplane Takeoff Physics Simulation Engine
 * Modeling Uniformly Accelerated Rectilinear Motion (SUVAT)
 * Initial Velocity u = 0, Constant Acceleration a, Target Velocity v
 */

// --- Global Simulation State ---
const state = {
  // SUVAT Parameters
  u: 0, // initial velocity in m/s (always 0 from rest)
  a: 2.5, // acceleration in m/s^2
  vTarget: 70, // target takeoff velocity in m/s
  runwayLimit: 0, // 0 = unlimited / auto-scale, >0 = specified runway length in meters

  // Derived Values
  tTarget: 28.0, // seconds = v / a
  sTarget: 980.0, // meters = v^2 / (2a)
  gForce: 0.255, // a / 9.81

  // Playback State
  tCurrent: 0, // current elapsed time in seconds
  isPlaying: false,
  playbackSpeed: 1.0,
  climbDuration: 22.0, // extended sustained climb duration in seconds after liftoff
  maxSimTime: 56.0, // tTarget + climbDuration

  // Automatic 10-Cycle Repetition State
  cycle: 1, // current cycle from 1 to 10
  maxCycles: 10,
  completedCycles: 0,
  autoRepeat: true,
  isResetting: false,
  resetTimer: 0,
  allCompleted: false,

  // Display & Unit Settings
  unit: 'ms', // 'ms' (m/s), 'kmh' (km/h), 'kts' (knots)
  viewMode: '3d', // '3d' (Three.js WebGL) or '2d' (Canvas 2D HUD)
  cameraMode: 'chase', // 'chase' or 'panoramic' (for 2D)
  cam3DMode: 'chase', // 'chase', 'cockpit', 'tower', 'wing' (for 3D)
  soundEnabled: false,
  preset: 'b737',

  // Animation Frame
  lastTimestamp: 0,
  particles: [],
  skidMarks: [],

  // History Log
  history: []
};

// --- Aircraft Presets ---
const PRESETS = {
  cessna: {
    name: 'Cessna 172 Skyhawk',
    type: 'prop',
    a: 1.8,
    v: 28, // ~101 km/h (54 kts)
    desc: 'Light single-engine trainer aircraft'
  },
  atr72: {
    name: 'ATR 72 Turboprop',
    type: 'turboprop',
    a: 2.1,
    v: 58, // ~209 km/h (113 kts)
    desc: 'Regional twin-turboprop airliner'
  },
  b737: {
    name: 'Boeing 737-800',
    type: 'jet',
    a: 2.2,
    v: 75, // ~270 km/h (146 kts)
    desc: 'Standard commercial narrowbody jet'
  },
  a380: {
    name: 'Airbus A380-800',
    type: 'heavy',
    a: 1.6,
    v: 82, // ~295 km/h (160 kts)
    desc: 'Heavy widebody double-deck jumbo jet'
  },
  f16: {
    name: 'F-16 Falcon (Afterburner)',
    type: 'fighter',
    a: 6.2,
    v: 80, // ~288 km/h (155 kts)
    desc: 'High-thrust military fighter jet'
  },
  catapult: {
    name: 'Carrier Steam Catapult',
    type: 'catapult',
    a: 31.0,
    v: 72, // ~259 km/h (140 kts)
    desc: 'High acceleration aircraft carrier launch'
  },
  custom: {
    name: 'Custom Configuration',
    type: 'jet',
    a: 2.5,
    v: 70,
    desc: 'User-defined parameters'
  }
};

// --- Audio Synthesizer (Web Audio API) ---
let audioCtx = null;
let engineOsc = null;
let engineGain = null;
let windNoiseNode = null;
let windGain = null;

function initAudio() {
  if (audioCtx) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();

    // Engine Tone (Turbine / Prop whine)
    engineOsc = audioCtx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.setValueAtTime(60, audioCtx.currentTime);

    // Lowpass filter to simulate deep jet rumble
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, audioCtx.currentTime);

    engineGain = audioCtx.createGain();
    engineGain.gain.setValueAtTime(0, audioCtx.currentTime);

    engineOsc.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(audioCtx.destination);
    engineOsc.start();

    // Wind / Rush noise
    const bufferSize = audioCtx.sampleRate * 2;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = audioCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const windFilter = audioCtx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.setValueAtTime(600, audioCtx.currentTime);
    windFilter.Q.setValueAtTime(1.5, audioCtx.currentTime);

    windGain = audioCtx.createGain();
    windGain.gain.setValueAtTime(0, audioCtx.currentTime);

    whiteNoise.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(audioCtx.destination);
    whiteNoise.start();
  } catch (e) {
    console.warn('Web Audio not supported or blocked:', e);
  }
}

function updateAudio(vCurrent, isAirborne) {
  if (!state.soundEnabled || !audioCtx) return;
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  if (!state.isPlaying && state.tCurrent === 0) {
    if (engineGain) engineGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
    if (windGain) windGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
    return;
  }

  const speedRatio = Math.min(1.5, vCurrent / (state.vTarget || 1));
  const baseFreq = state.preset === 'prop' ? 80 : 110;
  const targetFreq = baseFreq + speedRatio * 320;

  if (engineOsc) {
    engineOsc.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.05);
  }
  if (engineGain) {
    const vol = state.isPlaying ? 0.08 + speedRatio * 0.12 : 0.02;
    engineGain.gain.setTargetAtTime(vol, audioCtx.currentTime, 0.05);
  }
  if (windGain) {
    const windVol = state.isPlaying ? speedRatio * 0.15 : 0;
    windGain.gain.setTargetAtTime(windVol, audioCtx.currentTime, 0.05);
  }
}

function playLiftoffChime() {
  if (!state.soundEnabled || !audioCtx) return;
  try {
    const chimeOsc = audioCtx.createOscillator();
    const chimeGain = audioCtx.createGain();
    chimeOsc.type = 'sine';
    chimeOsc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    chimeOsc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.3); // A5

    chimeGain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    chimeGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);

    chimeOsc.connect(chimeGain);
    chimeGain.connect(audioCtx.destination);
    chimeOsc.start();
    chimeOsc.stop(audioCtx.currentTime + 0.85);
  } catch (e) {}
}

// --- Physics Calculations ---
function computeSUVAT() {
  const u = state.u;
  const a = Math.max(0.01, state.a);
  const v = Math.max(1, state.vTarget);

  // Time required for ground roll: t_r = (v - u) / a = v / a
  state.tTarget = v / a;

  // Runway distance required: s_r = (v^2 - u^2) / (2a) = v^2 / (2a)
  state.sTarget = (v * v) / (2 * a);

  // G-force: a / g
  state.gForce = a / 9.80665;

  // Total simulation window: takeoff roll + extended sustained climb duration
  state.maxSimTime = state.tTarget + state.climbDuration;

  // Clamp current time if out of bounds
  if (state.tCurrent > state.maxSimTime) {
    state.tCurrent = state.maxSimTime;
  }

  updateUIElements();
  updateEquationCards();
  drawAllGraphs();
}

/**
 * Returns current kinematics at time t (Runway Acceleration & Extended Climb)
 */
function getKinematicsAt(t) {
  const a = state.a;
  const vTarget = state.vTarget;
  const tTakeoff = state.tTarget;
  const sTakeoff = state.sTarget;

  let s = 0;
  let v = 0;
  let vx = 0;
  let vy = 0;
  let accel = a;
  let altitude = 0;
  let pitchDeg = 0;
  let status = 'ready';

  if (t <= 0) {
    s = 0;
    v = 0;
    vx = 0;
    vy = 0;
    status = 'ready';
  } else if (t < tTakeoff) {
    // Phase 1: Uniform acceleration rectilinear motion along the runway from rest (u = 0, a = const)
    s = 0.5 * a * t * t;
    v = a * t;
    vx = v;
    vy = 0;
    altitude = 0;
    pitchDeg = 0;
    status = 'accelerating';
  } else {
    // Phase 2 & 3: Rotation & Extended Gradual Climb Out
    const tAirborne = t - tTakeoff;
    const tRot = 2.5; // seconds for smooth rotation & flare
    const maxPitch = 13.0; // degrees pitch attitude
    const climbGamma = 9.0; // degrees steady climb flight path angle
    const vClimb = vTarget * 1.05; // steady climb airspeed

    if (tAirborne <= tRot) {
      // Rotation & transition phase
      const tau = tAirborne / tRot;
      const ease = tau * tau * (3 - 2 * tau); // cubic ease-in-out
      pitchDeg = ease * maxPitch;
      const curGamma = ease * climbGamma;
      const gammaRad = (curGamma * Math.PI) / 180;

      v = vTarget + 0.5 * a * tAirborne;
      vx = v * Math.cos(gammaRad);
      vy = v * Math.sin(gammaRad);

      // Distance on runway + liftoff roll
      s = sTakeoff + vTarget * tAirborne + 0.5 * (a * 0.5) * (tAirborne * tAirborne);
      altitude = 0.5 * vy * tAirborne;
      status = tAirborne < 0.6 ? 'rotate' : 'airborne';
    } else {
      // Steady gradual climb phase
      const tSteady = tAirborne - tRot;
      pitchDeg = maxPitch;
      const gammaRad = (climbGamma * Math.PI) / 180;

      v = vClimb;
      vx = vClimb * Math.cos(gammaRad);
      vy = vClimb * Math.sin(gammaRad);

      const sRot = vTarget * tRot + 0.5 * (a * 0.5) * (tRot * tRot);
      const altRot = 0.5 * (vTarget * Math.sin(gammaRad)) * tRot;

      s = sTakeoff + sRot + vx * tSteady;
      altitude = altRot + vy * tSteady;
      status = 'airborne';
      accel = 0.15; // residual climb acceleration
    }
  }

  // Check runway overrun if a limit is set
  const hasRunwayLimit = state.runwayLimit > 0;
  const isOverrun = hasRunwayLimit && s > state.runwayLimit && t < tTakeoff;

  if (isOverrun) {
    status = 'overrun';
  }

  return { s, v, vx, vy, a: accel, t, altitude, pitchDeg, status };
}

// --- Unit Formatting Helpers ---
function formatSpeed(vInMs, unit = state.unit) {
  if (unit === 'kmh') {
    return { val: (vInMs * 3.6).toFixed(1), unit: 'km/h' };
  } else if (unit === 'kts') {
    return { val: (vInMs * 1.94384).toFixed(1), unit: 'kts' };
  }
  return { val: vInMs.toFixed(1), unit: 'm/s' };
}

function formatDistance(sInMeters) {
  if (sInMeters >= 1000) {
    return { val: (sInMeters / 1000).toFixed(2), unit: 'km', raw: sInMeters.toFixed(1) + ' m' };
  }
  return { val: sInMeters.toFixed(1), unit: 'm', raw: sInMeters.toFixed(1) + ' m' };
}

// --- DOM References ---
let elSliderA, elInputA, elSliderV, elInputV, elPresetSelect;
let elRunwayLimitSelect, elBtnPlay, elBtnReset, elBtnStepBack, elBtnStepFwd;
let elScrubber, elSpeedSelect, elCamChase, elCamPano, elUnitSelect;
let elBtnSound, elBtnTheme, elHudStatus, elHudText;
let elMetricTime, elMetricDist, elMetricSpeed, elMetricGForce;
let simCanvas, simCtx;
let graphCanvasS, graphCtxS, graphCanvasV, graphCtxV, graphCanvasA, graphCtxA;

// 3D Scene References
let simCanvas3D, scene3D, camera3D, renderer3D, aircraft3D, sunLight3D;
let elBtnView3D, elBtnView2D, elCam3DControls, elCam2DControls;
let elCamChase3D, elCamCockpit3D, elCamTower3D, elCamWing3D;

// Cycle & Altitude Telemetry References
let elMetricCycle, elMetricCycleSub, elHudCycleText, elCycleStatusLabel, elCycleDots;
let elMetricAlt, elMetricAltSub, elMetricDistSub, elMetricTimeSub, elMetricSpeedSub, elMetricAccel;
let elCheckAutoRepeat, elBtnRestartCycles, elCycleModal, elBtnModalRestart, elSummaryRunways, elSummaryAlt;

// --- Initialize DOM References and Event Listeners ---
function initDOM() {
  elSliderA = document.getElementById('slider-a');
  elInputA = document.getElementById('input-a');
  elSliderV = document.getElementById('slider-v');
  elInputV = document.getElementById('input-v');
  elPresetSelect = document.getElementById('preset-select');
  elRunwayLimitSelect = document.getElementById('runway-limit-select');

  elBtnPlay = document.getElementById('btn-play');
  elBtnReset = document.getElementById('btn-reset');
  elBtnStepBack = document.getElementById('btn-step-back');
  elBtnStepFwd = document.getElementById('btn-step-fwd');
  elScrubber = document.getElementById('sim-scrubber');
  elSpeedSelect = document.getElementById('speed-select');

  elCamChase = document.getElementById('cam-chase');
  elCamPano = document.getElementById('cam-pano');
  elUnitSelect = document.getElementById('unit-select');
  elBtnSound = document.getElementById('btn-sound');
  elBtnTheme = document.getElementById('btn-theme');

  elHudStatus = document.getElementById('hud-status-badge');
  elHudText = document.getElementById('hud-status-text');

  elMetricTime = document.getElementById('metric-time');
  elMetricDist = document.getElementById('metric-dist');
  elMetricSpeed = document.getElementById('metric-speed');
  elMetricGForce = document.getElementById('metric-gforce');

  elMetricCycle = document.getElementById('metric-cycle');
  elMetricCycleSub = document.getElementById('metric-cycle-sub');
  elHudCycleText = document.getElementById('hud-cycle-text');
  elCycleStatusLabel = document.getElementById('cycle-status-label');
  elCycleDots = document.querySelectorAll('#cycle-dots-container .cycle-dot');
  elMetricAlt = document.getElementById('metric-alt');
  elMetricAltSub = document.getElementById('metric-alt-sub');
  elMetricDistSub = document.getElementById('metric-dist-sub');
  elMetricTimeSub = document.getElementById('metric-time-sub');
  elMetricSpeedSub = document.getElementById('metric-speed-sub');
  elMetricAccel = document.getElementById('metric-accel');
  elCheckAutoRepeat = document.getElementById('check-auto-repeat');
  elBtnRestartCycles = document.getElementById('btn-restart-cycles');
  elCycleModal = document.getElementById('cycle-completion-modal');
  elBtnModalRestart = document.getElementById('btn-modal-restart');
  elSummaryRunways = document.getElementById('summary-runways');
  elSummaryAlt = document.getElementById('summary-alt');

  if (elCheckAutoRepeat) {
    elCheckAutoRepeat.addEventListener('change', (e) => {
      state.autoRepeat = e.target.checked;
      updateUIElements();
    });
  }

  if (elBtnRestartCycles) {
    elBtnRestartCycles.addEventListener('click', restartAllCycles);
  }

  if (elBtnModalRestart) {
    elBtnModalRestart.addEventListener('click', () => {
      if (elCycleModal) elCycleModal.style.display = 'none';
      restartAllCycles();
    });
  }

  simCanvas = document.getElementById('sim-canvas');
  simCtx = simCanvas.getContext('2d');
  simCanvas3D = document.getElementById('sim-canvas-3d');

  elBtnView3D = document.getElementById('btn-view-3d');
  elBtnView2D = document.getElementById('btn-view-2d');
  elCam3DControls = document.getElementById('cam-controls-3d');
  elCam2DControls = document.getElementById('cam-controls-2d');

  elCamChase3D = document.getElementById('cam-chase-3d');
  elCamCockpit3D = document.getElementById('cam-cockpit-3d');
  elCamTower3D = document.getElementById('cam-tower-3d');
  elCamWing3D = document.getElementById('cam-wing-3d');

  // View Mode (3D vs 2D) Toggles
  if (elBtnView3D && elBtnView2D) {
    elBtnView3D.addEventListener('click', () => {
      state.viewMode = '3d';
      elBtnView3D.classList.add('active');
      elBtnView2D.classList.remove('active');
      if (simCanvas3D) simCanvas3D.style.display = 'block';
      if (simCanvas) simCanvas.style.display = 'none';
      if (elCam3DControls) elCam3DControls.style.display = 'flex';
      if (elCam2DControls) elCam2DControls.style.display = 'none';
      handleResize();
    });

    elBtnView2D.addEventListener('click', () => {
      state.viewMode = '2d';
      elBtnView2D.classList.add('active');
      elBtnView3D.classList.remove('active');
      if (simCanvas) simCanvas.style.display = 'block';
      if (simCanvas3D) simCanvas3D.style.display = 'none';
      if (elCam2DControls) elCam2DControls.style.display = 'flex';
      if (elCam3DControls) elCam3DControls.style.display = 'none';
      handleResize();
    });
  }

  const setCam3D = (mode, activeBtn) => {
    state.cam3DMode = mode;
    [elCamChase3D, elCamCockpit3D, elCamTower3D, elCamWing3D].forEach(b => {
      if (b) b.classList.remove('active');
    });
    if (activeBtn) activeBtn.classList.add('active');
  };

  if (elCamChase3D) elCamChase3D.addEventListener('click', () => setCam3D('chase', elCamChase3D));
  if (elCamCockpit3D) elCamCockpit3D.addEventListener('click', () => setCam3D('cockpit', elCamCockpit3D));
  if (elCamTower3D) elCamTower3D.addEventListener('click', () => setCam3D('tower', elCamTower3D));
  if (elCamWing3D) elCamWing3D.addEventListener('click', () => setCam3D('wing', elCamWing3D));

  // Initialize 3D Engine
  init3DScene();

  graphCanvasS = document.getElementById('graph-s');
  graphCtxS = graphCanvasS.getContext('2d');
  graphCanvasV = document.getElementById('graph-v');
  graphCtxV = graphCanvasV.getContext('2d');
  graphCanvasA = document.getElementById('graph-a');
  graphCtxA = graphCanvasA.getContext('2d');

  // Input Listeners
  if (elSliderA) {
    elSliderA.addEventListener('input', (e) => {
      state.a = parseFloat(e.target.value);
      if (elInputA) elInputA.value = state.a.toFixed(1);
      setPresetCustom();
      computeSUVAT();
    });
  }

  if (elInputA) {
    elInputA.addEventListener('change', (e) => {
      let val = parseFloat(e.target.value);
      if (isNaN(val)) val = 2.0;
      val = Math.max(0.2, Math.min(35.0, val));
      state.a = val;
      if (elSliderA) elSliderA.value = val;
      elInputA.value = val.toFixed(1);
      setPresetCustom();
      computeSUVAT();
    });
  }

  if (elSliderV) {
    elSliderV.addEventListener('input', (e) => {
      state.vTarget = parseFloat(e.target.value);
      if (elInputV) elInputV.value = state.vTarget.toFixed(0);
      setPresetCustom();
      computeSUVAT();
    });
  }

  if (elInputV) {
    elInputV.addEventListener('change', (e) => {
      let val = parseFloat(e.target.value);
      if (isNaN(val)) val = 70;
      val = Math.max(10, Math.min(130, val));
      state.vTarget = val;
      if (elSliderV) elSliderV.value = val;
      elInputV.value = val.toFixed(0);
      setPresetCustom();
      computeSUVAT();
    });
  }

  if (elPresetSelect) {
    elPresetSelect.addEventListener('change', (e) => {
      applyPreset(e.target.value);
    });
  }

  if (elRunwayLimitSelect) {
    elRunwayLimitSelect.addEventListener('change', (e) => {
      state.runwayLimit = parseFloat(e.target.value);
      computeSUVAT();
    });
  }

  // Playback Listeners
  if (elBtnPlay) elBtnPlay.addEventListener('click', togglePlay);
  if (elBtnReset) elBtnReset.addEventListener('click', resetSim);
  if (elBtnStepBack) elBtnStepBack.addEventListener('click', () => stepSim(-0.2));
  if (elBtnStepFwd) elBtnStepFwd.addEventListener('click', () => stepSim(0.2));

  if (elScrubber) {
    elScrubber.addEventListener('input', (e) => {
      const fraction = parseFloat(e.target.value) / 1000;
      state.tCurrent = fraction * state.maxSimTime;
      updateUIElements();
      drawAllGraphs();
    });
  }

  if (elSpeedSelect) {
    elSpeedSelect.addEventListener('change', (e) => {
      state.playbackSpeed = parseFloat(e.target.value);
    });
  }

  // Camera Mode Listeners
  if (elCamChase) {
    elCamChase.addEventListener('click', () => {
      state.cameraMode = 'chase';
      elCamChase.classList.add('active');
      if (elCamPano) elCamPano.classList.remove('active');
    });
  }

  if (elCamPano) {
    elCamPano.addEventListener('click', () => {
      state.cameraMode = 'panoramic';
      elCamPano.classList.add('active');
      if (elCamChase) elCamChase.classList.remove('active');
    });
  }

  // Unit Toggle
  if (elUnitSelect) {
    elUnitSelect.addEventListener('change', (e) => {
      state.unit = e.target.value;
      updateUIElements();
      updateEquationCards();
    });
  }

  // Sound Toggle
  if (elBtnSound) {
    elBtnSound.addEventListener('click', () => {
      initAudio();
      state.soundEnabled = !state.soundEnabled;
      elBtnSound.innerHTML = state.soundEnabled ? '🔊 Sound: ON' : '🔈 Sound: OFF';
      elBtnSound.classList.toggle('btn-primary', state.soundEnabled);
    });
  }

  // Theme Toggle
  if (elBtnTheme) {
    elBtnTheme.addEventListener('click', () => {
      const isLight = document.body.dataset.theme === 'light';
      document.body.dataset.theme = isLight ? 'dark' : 'light';
      elBtnTheme.innerHTML = isLight ? '🌙 Dark' : '☀️ Light';
      drawAllGraphs();
    });
  }

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'KeyR') {
      e.preventDefault();
      resetSim();
    } else if (e.code === 'BracketLeft') {
      e.preventDefault();
      stepSim(-0.2);
    } else if (e.code === 'BracketRight') {
      e.preventDefault();
      stepSim(0.2);
    } else if (e.code === 'KeyM') {
      elBtnSound.click();
    }
  });

  // Graph Scrubbing Listeners
  attachGraphScrubEvents(graphCanvasS);
  attachGraphScrubEvents(graphCanvasV);
  attachGraphScrubEvents(graphCanvasA);

  // Resize Listener for Canvas DPI
  window.addEventListener('resize', handleResize);
  handleResize();

  // Initialize tabs, quiz, data log
  initTabs();
  initQuiz();
  initDataLogger();
}

function handleResize() {
  if (simCanvas) setupCanvasDPI(simCanvas);
  if (graphCanvasS) setupCanvasDPI(graphCanvasS);
  if (graphCanvasV) setupCanvasDPI(graphCanvasV);
  if (graphCanvasA) setupCanvasDPI(graphCanvasA);

  if (renderer3D && camera3D && simCanvas3D) {
    const rect = simCanvas3D.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      camera3D.aspect = rect.width / rect.height;
      camera3D.updateProjectionMatrix();
      renderer3D.setSize(rect.width, rect.height);
    }
  }
  drawAllGraphs();
}

function setupCanvasDPI(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.resetTransform();
  ctx.scale(dpr, dpr);
}

function setPresetCustom() {
  state.preset = 'custom';
  elPresetSelect.value = 'custom';
}

function applyPreset(key) {
  const p = PRESETS[key];
  if (!p) return;
  state.preset = key;
  state.a = p.a;
  state.vTarget = p.v;

  elSliderA.value = p.a;
  elInputA.value = p.a.toFixed(1);
  elSliderV.value = p.v;
  elInputV.value = p.v.toFixed(0);

  resetSim();
  computeSUVAT();
}

function togglePlay() {
  initAudio();
  if (state.allCompleted) {
    restartAllCycles();
    state.isPlaying = true;
    elBtnPlay.innerHTML = '⏸ Pause';
    elBtnPlay.classList.add('btn-primary');
    state.lastTimestamp = performance.now();
    return;
  }
  state.isPlaying = !state.isPlaying;
  if (state.isPlaying) {
    if (state.tCurrent >= state.maxSimTime) {
      state.tCurrent = 0;
    }
    elBtnPlay.innerHTML = '⏸ Pause';
    elBtnPlay.classList.add('btn-primary');
    state.lastTimestamp = performance.now();
  } else {
    elBtnPlay.innerHTML = '▶ Play';
    elBtnPlay.classList.remove('btn-primary');
  }
}

function resetSim() {
  state.isPlaying = false;
  state.isResetting = false;
  state.resetTimer = 0;
  state.tCurrent = 0;
  state.particles = [];
  elBtnPlay.innerHTML = '▶ Play';
  elBtnPlay.classList.remove('btn-primary');
  updateUIElements();
  drawAllGraphs();
  updateAudio(0, false);
}

function restartAllCycles() {
  state.cycle = 1;
  state.completedCycles = 0;
  state.allCompleted = false;
  state.isResetting = false;
  state.resetTimer = 0;
  if (elCycleModal) elCycleModal.style.display = 'none';
  resetSim();
}

function logCycleRun(cycleNum) {
  const kin = getKinematicsAt(state.maxSimTime);
  state.history.push({
    name: `${PRESETS[state.preset]?.name || 'Aircraft'} (Cycle ${cycleNum})`,
    a: state.a,
    v: state.vTarget,
    t: state.tTarget,
    s: state.sTarget,
    g: state.gForce
  });
  renderDataTable();
}

function renderDataTable() {
  const elTableBody = document.querySelector('#data-table tbody');
  if (!elTableBody) return;
  elTableBody.innerHTML = '';
  state.history.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>#${idx + 1}</td>
      <td>${row.name}</td>
      <td>${row.a.toFixed(2)}</td>
      <td>${row.v.toFixed(1)}</td>
      <td>${row.t.toFixed(2)}</td>
      <td>${row.s.toFixed(1)}</td>
      <td>${row.g.toFixed(2)}</td>
    `;
    elTableBody.appendChild(tr);
  });
}

function showCycleCompletionModal() {
  if (elCycleModal) {
    if (elSummaryRunways) {
      const totalGroundRollsKm = ((state.maxCycles * state.sTarget) / 1000).toFixed(2);
      elSummaryRunways.textContent = `${totalGroundRollsKm} km (${state.maxCycles} × ${state.sTarget.toFixed(0)}m)`;
    }
    if (elSummaryAlt) {
      const maxKin = getKinematicsAt(state.maxSimTime);
      const altM = maxKin.altitude.toFixed(0);
      const altFt = (maxKin.altitude * 3.28084).toFixed(0);
      elSummaryAlt.textContent = `${altM} m (${altFt} ft) AGL`;
    }
    elCycleModal.style.display = 'block';
  }
}

function stepSim(deltaSec) {
  state.isPlaying = false;
  elBtnPlay.innerHTML = '▶ Play';
  elBtnPlay.classList.remove('btn-primary');
  state.tCurrent = Math.max(0, Math.min(state.maxSimTime, state.tCurrent + deltaSec));
  updateUIElements();
  drawAllGraphs();
}

// --- Attach Graph Hover & Drag Scrubbing ---
function attachGraphScrubEvents(canvas) {
  let isDragging = false;

  const handlePointer = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const padLeft = 40;
    const padRight = 15;
    const plotWidth = rect.width - padLeft - padRight;
    const fraction = Math.max(0, Math.min(1, (x - padLeft) / plotWidth));

    state.isPlaying = false;
    elBtnPlay.innerHTML = '▶ Play';
    elBtnPlay.classList.remove('btn-primary');
    state.tCurrent = fraction * state.maxSimTime;
    updateUIElements();
    drawAllGraphs();
  };

  canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    handlePointer(e);
  });
  window.addEventListener('mousemove', (e) => {
    if (isDragging) handlePointer(e);
  });
  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // Touch Support
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      isDragging = true;
      handlePointer(e.touches[0]);
    }
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (isDragging && e.touches.length === 1) {
      handlePointer(e.touches[0]);
    }
  }, { passive: true });
  window.addEventListener('touchend', () => {
    isDragging = false;
  });
}

// --- UI Updates ---
function updateUIElements() {
  const kin = getKinematicsAt(state.tCurrent);
  const formattedV = formatSpeed(kin.v);
  const formattedVTarget = formatSpeed(state.vTarget);
  const formattedS = formatDistance(kin.s);
  const formattedSTarget = formatDistance(state.sTarget);

  // Scrubber Position
  const progressPercent = Math.min(100, (state.tCurrent / state.maxSimTime) * 100);
  if (elScrubber) elScrubber.value = (progressPercent * 10).toFixed(0);

  // Card 1: Cycle Counter & Dots
  if (elMetricCycle) {
    elMetricCycle.innerHTML = `${state.cycle} <span class="num-unit">/ ${state.maxCycles}</span>`;
  }
  if (elMetricCycleSub) {
    if (state.allCompleted) {
      elMetricCycleSub.innerHTML = `<span style="color:#10b981;font-weight:700;">Completed (10/10)</span>`;
    } else if (state.isResetting) {
      elMetricCycleSub.innerHTML = `<span style="color:#f59e0b;font-weight:700;">Resetting for Cycle ${state.cycle}...</span>`;
    } else if (state.autoRepeat) {
      elMetricCycleSub.textContent = 'Auto 10-Cycle Active';
    } else {
      elMetricCycleSub.textContent = 'Manual Cycle Mode';
    }
  }

  if (elHudCycleText) {
    elHudCycleText.textContent = `CYCLE ${state.cycle} / ${state.maxCycles}`;
  }
  if (elCycleStatusLabel) {
    elCycleStatusLabel.textContent = `Cycle ${state.cycle} / ${state.maxCycles}`;
  }

  // Update HUD cycle dots
  if (elCycleDots && elCycleDots.length > 0) {
    elCycleDots.forEach((dot, idx) => {
      dot.className = 'cycle-dot';
      if (state.allCompleted) {
        dot.classList.add('completed');
      } else if (idx < state.cycle - 1) {
        dot.classList.add('completed');
      } else if (idx === state.cycle - 1) {
        dot.classList.add('active');
      }
    });
  }

  // Card 2: Elapsed Time
  if (elMetricTime) {
    elMetricTime.innerHTML = `${kin.t.toFixed(1)} <span class="num-unit">/ ${state.maxSimTime.toFixed(1)} s</span>`;
  }
  if (elMetricTimeSub) {
    if (kin.t <= state.tTarget) {
      elMetricTimeSub.textContent = `Ground Roll: t ≤ ${state.tTarget.toFixed(1)} s`;
    } else {
      elMetricTimeSub.textContent = `Extended Climb: +${(kin.t - state.tTarget).toFixed(1)} s`;
    }
  }

  // Card 3: Horizontal Distance
  if (elMetricDist) {
    elMetricDist.innerHTML = `${formattedS.val} <span class="num-unit">${formattedS.unit}</span>`;
  }
  if (elMetricDistSub) {
    const groundDist = Math.min(kin.s, state.sTarget).toFixed(0);
    const airDist = Math.max(0, kin.s - state.sTarget).toFixed(0);
    elMetricDistSub.textContent = `Runway: ${groundDist} m | Air: ${airDist} m`;
  }

  // Card 4: Altitude AGL (Height above ground) & Climb Rate
  if (elMetricAlt) {
    elMetricAlt.innerHTML = `${kin.altitude.toFixed(1)} <span class="num-unit">m</span>`;
  }
  if (elMetricAltSub) {
    const altFt = (kin.altitude * 3.28084).toFixed(0);
    const fpm = (kin.vy * 196.85).toFixed(0);
    elMetricAltSub.textContent = `${altFt} ft AGL | Climb: ${kin.vy.toFixed(1)} m/s (${fpm} fpm)`;
  }

  // Card 5: Airspeed / Velocity
  if (elMetricSpeed) {
    elMetricSpeed.innerHTML = `${formattedV.val} <span class="num-unit">${formattedV.unit}</span>`;
  }
  if (elMetricSpeedSub) {
    if (kin.t < state.tTarget) {
      elMetricSpeedSub.textContent = `Take-Off Speed Vr: ${formattedVTarget.val} ${formattedVTarget.unit}`;
    } else {
      elMetricSpeedSub.textContent = `Climb Speed: ${formattedV.val} ${formattedVTarget.unit} (Pitch: ${kin.pitchDeg.toFixed(1)}°)`;
    }
  }

  // Card 6: Acceleration & G-Force
  if (elMetricAccel) {
    elMetricAccel.innerHTML = `${kin.a.toFixed(2)} <span class="num-unit">m/s²</span>`;
  }
  if (elMetricGForce) {
    const gVal = (kin.a / 9.80665).toFixed(2);
    const phaseLabel = kin.t <= state.tTarget ? 'Runway Acceleration' : 'Steady Climb';
    elMetricGForce.innerHTML = `${gVal} g <span class="num-unit">(${phaseLabel})</span>`;
  }

  // HUD Status Badge
  if (elHudStatus && elHudText) {
    if (state.allCompleted) {
      elHudStatus.className = 'hud-status completed';
      elHudText.textContent = `🎉 All 10 Take-Off Cycles Completed! (${state.maxCycles} / ${state.maxCycles})`;
    } else if (state.isResetting) {
      elHudStatus.className = 'hud-status ready';
      elHudText.textContent = `🔄 Resetting Aeroplane to Runway Threshold for Cycle ${state.cycle}...`;
    } else if (kin.status === 'accelerating') {
      elHudStatus.className = 'hud-status accelerating';
      elHudText.textContent = `Cycle ${state.cycle}/10: Takeoff Roll (a = ${state.a.toFixed(1)} m/s², s = ${kin.s.toFixed(0)}m)`;
    } else if (kin.status === 'rotate') {
      elHudStatus.className = 'hud-status rotate';
      elHudText.textContent = `Cycle ${state.cycle}/10: ROTATE! Vr = ${state.vTarget} m/s reached (s = ${state.sTarget.toFixed(0)}m)`;
    } else if (kin.status === 'airborne') {
      elHudStatus.className = 'hud-status airborne';
      const altFt = (kin.altitude * 3.28084).toFixed(0);
      elHudText.textContent = `Cycle ${state.cycle}/10: Airborne & Gradual Climb (Alt: ${kin.altitude.toFixed(0)}m / ${altFt}ft, Dist: ${kin.s.toFixed(0)}m)`;
    } else if (kin.status === 'overrun') {
      elHudStatus.className = 'hud-status overrun';
      elHudText.textContent = `⚠️ RUNWAY OVERRUN! Insufficient distance!`;
    } else {
      elHudStatus.className = 'hud-status ready';
      elHudText.textContent = `Cycle ${state.cycle}/10: Ready at Runway Threshold (u = 0 m/s)`;
    }
  }

  // Audio update
  updateAudio(kin.v, kin.altitude > 0);
}

// --- Live Equation Breakdown Cards ---
function updateEquationCards() {
  const u = state.u;
  const a = state.a;
  const v = state.vTarget;
  const t = state.tTarget;
  const s = state.sTarget;

  // Card 1: Time t = (v - u) / a
  const elEqTime = document.getElementById('eq-subst-time');
  if (elEqTime) {
    elEqTime.innerHTML = `t = \\frac{${v.toFixed(1)} - ${u}}{${a.toFixed(1)}} = \\mathbf{${t.toFixed(2)}\\text{ s}}`;
  }

  // Card 2: Distance s = ut + 0.5 a t^2
  const elEqDist1 = document.getElementById('eq-subst-dist1');
  if (elEqDist1) {
    elEqDist1.innerHTML = `s = (0)(${t.toFixed(1)}) + \\frac{1}{2}(${a.toFixed(1)})(${t.toFixed(1)})^2 = \\mathbf{${s.toFixed(1)}\\text{ m}}`;
  }

  // Card 3: Distance s = (v^2 - u^2) / (2a)
  const elEqDist2 = document.getElementById('eq-subst-dist2');
  if (elEqDist2) {
    elEqDist2.innerHTML = `s = \\frac{(${v.toFixed(1)})^2 - 0^2}{2 \\times ${a.toFixed(1)}} = \\frac{${(v*v).toFixed(0)}}{${(2*a).toFixed(1)}} = \\mathbf{${s.toFixed(1)}\\text{ m}}`;
  }

  // Card 4: Average speed & G-force
  const elEqAvg = document.getElementById('eq-subst-avg');
  if (elEqAvg) {
    const vAvg = v / 2;
    elEqAvg.innerHTML = `v_{avg} = \\frac{0 + ${v.toFixed(1)}}{2} = ${vAvg.toFixed(1)}\\text{ m/s} \\implies s = ${vAvg.toFixed(1)} \\times ${t.toFixed(1)} = \\mathbf{${(vAvg * t).toFixed(1)}\\text{ m}}`;
  }
}

// --- 3D WebGL Runway & Aircraft Simulation ---
function init3DScene() {
  simCanvas3D = document.getElementById('sim-canvas-3d');
  if (!simCanvas3D || typeof THREE === 'undefined' || typeof AeroplaneModel3D === 'undefined') return;

  scene3D = new THREE.Scene();
  scene3D.background = new THREE.Color(0x0a101f);
  scene3D.fog = new THREE.FogExp2(0x0a101f, 0.00018);

  const rect = simCanvas3D.getBoundingClientRect();
  const aspect = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 16 / 9;
  camera3D = new THREE.PerspectiveCamera(45, aspect, 0.2, 12000);

  renderer3D = new THREE.WebGLRenderer({ canvas: simCanvas3D, antialias: true, powerPreference: 'high-performance' });
  renderer3D.setSize(rect.width, rect.height);
  renderer3D.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer3D.shadowMap.enabled = true;
  renderer3D.shadowMap.type = THREE.PCFSoftShadowMap;

  // Studio / Sunlight Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene3D.add(ambient);

  sunLight3D = new THREE.DirectionalLight(0xfffaed, 2.0);
  sunLight3D.position.set(35, 50, 35);
  sunLight3D.castShadow = true;
  sunLight3D.shadow.mapSize.width = 2048;
  sunLight3D.shadow.mapSize.height = 2048;
  sunLight3D.shadow.camera.near = 5;
  sunLight3D.shadow.camera.far = 250;
  const d = 45;
  sunLight3D.shadow.camera.left = -d;
  sunLight3D.shadow.camera.right = d;
  sunLight3D.shadow.camera.top = d;
  sunLight3D.shadow.camera.bottom = -d;
  scene3D.add(sunLight3D);

  const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x1e293b, 0.55);
  scene3D.add(hemiLight);

  // Construct Realistic 3D Runway Environment
  build3DRunway();

  // Instantiate 3D Aeroplane Model with Fauzi AeroPhysics Lab Livery
  aircraft3D = new AeroplaneModel3D({
    scale: 1.0,
    airlineName: 'FAUZI AEROPHYSICS LAB',
    registration: 'FZ-APL2026'
  });
  aircraft3D.group.position.set(0, 2.45, 0); // Tarmac ground level
  scene3D.add(aircraft3D.group);
}

function build3DRunway() {
  const runwayGroup = new THREE.Group();

  // 1. Asphalt Strip (Extended 6000m long, 45m wide)
  const runwayLength = 6000;
  const runwayWidth = 45;
  const asphaltGeom = new THREE.PlaneGeometry(runwayLength, runwayWidth);
  asphaltGeom.rotateX(-Math.PI / 2);
  asphaltGeom.translate(runwayLength / 2 - 200, 0, 0);

  const asphaltMat = new THREE.MeshStandardMaterial({
    color: 0x182030,
    roughness: 0.82,
    metalness: 0.12
  });
  const asphaltMesh = new THREE.Mesh(asphaltGeom, asphaltMat);
  asphaltMesh.receiveShadow = true;
  runwayGroup.add(asphaltMesh);

  // 2. Surrounding Ground Terrain (12,000m long, 3,000m wide)
  const terrainGeom = new THREE.PlaneGeometry(12000, 3000);
  terrainGeom.rotateX(-Math.PI / 2);
  terrainGeom.translate(5500, -0.05, 0);
  const terrainMat = new THREE.MeshStandardMaterial({
    color: 0x090f1d,
    roughness: 0.95
  });
  const terrain = new THREE.Mesh(terrainGeom, terrainMat);
  terrain.receiveShadow = true;
  runwayGroup.add(terrain);

  // 3. Threshold Piano Key Stripes at x = 0
  const keyMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const keyGeom = new THREE.PlaneGeometry(30, 1.8);
  keyGeom.rotateX(-Math.PI / 2);
  for (let k = -8; k <= 8; k++) {
    if (Math.abs(k) < 2) continue; // Gap for centerline
    const key = new THREE.Mesh(keyGeom, keyMat);
    key.position.set(16, 0.02, k * 2.4);
    runwayGroup.add(key);
  }

  // Green Threshold Start Lights
  const greenLightMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
  const greenLightGeom = new THREE.CylinderGeometry(0.2, 0.2, 0.45, 8);
  for (let z = -22; z <= 22; z += 4) {
    const l = new THREE.Mesh(greenLightGeom, greenLightMat);
    l.position.set(0, 0.22, z);
    runwayGroup.add(l);
  }

  // 4. White Centerline Dashes (every 30m up to 5800m)
  const dashGeom = new THREE.PlaneGeometry(15, 1.2);
  dashGeom.rotateX(-Math.PI / 2);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let x = 40; x < 5800; x += 30) {
    const dash = new THREE.Mesh(dashGeom, dashMat);
    dash.position.set(x, 0.02, 0);
    runwayGroup.add(dash);
  }

  // 5. Runway Elevated Edge Lights & Distance Signs
  const edgeLightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const edgeLightGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.4, 8);

  for (let x = 0; x < 5800; x += 60) {
    const l1 = new THREE.Mesh(edgeLightGeom, edgeLightMat);
    l1.position.set(x, 0.2, -23);
    runwayGroup.add(l1);

    const l2 = new THREE.Mesh(edgeLightGeom, edgeLightMat);
    l2.position.set(x, 0.2, 23);
    runwayGroup.add(l2);

    if (x > 0 && x % 240 === 0) {
      const signBoard = createDistanceSign3D(x);
      signBoard.position.set(x, 0, 25.5);
      runwayGroup.add(signBoard);
    }
  }

  // 6. Realistic Airport Buildings Along Runway (Terminal, ATC Tower, Hangars, Facilities)
  // Situated safely at z = 75m to 125m along runway so flight path and climb trajectory remain completely clear
  const terminal = createAirportTerminal3D();
  terminal.position.set(380, 0, 95);
  runwayGroup.add(terminal);

  const tower = createAirportTower3D();
  tower.position.set(650, 0, 92);
  runwayGroup.add(tower);

  const hangars = createAirportHangars3D();
  runwayGroup.add(hangars);

  const fireStation = createFireStation3D();
  runwayGroup.add(fireStation);

  const fuelFarm = createFuelFarm3D();
  runwayGroup.add(fuelFarm);

  const radarTower = createRadarTower3D();
  runwayGroup.add(radarTower);

  const navaids = createAirportNavaids3D();
  runwayGroup.add(navaids);

  // Apron Floodlight Pylons along airport facilities
  [260, 480, 780, 960, 1150].forEach(lx => {
    runwayGroup.add(createApronFloodlight3D(lx, 68));
  });

  scene3D.add(runwayGroup);
}

function createAirportTerminal3D() {
  const terminal = new THREE.Group();

  // Main Concourse Building (180m wide, 42m deep, 14m high)
  const concourseMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.4,
    metalness: 0.3
  });
  const concourseGeom = new THREE.BoxGeometry(180, 14, 42);
  concourseGeom.translate(0, 7, 0);
  const concourse = new THREE.Mesh(concourseGeom, concourseMat);
  concourse.receiveShadow = true;
  concourse.castShadow = true;
  terminal.add(concourse);

  // Curved Aerodynamic Roof Canopy
  const roofGeom = new THREE.CylinderGeometry(95, 95, 184, 32, 1, false, 0, Math.PI * 0.45);
  roofGeom.rotateZ(Math.PI / 2);
  roofGeom.rotateX(-Math.PI * 0.225);
  roofGeom.translate(0, 12, 6);
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.3,
    metalness: 0.6
  });
  const roof = new THREE.Mesh(roofGeom, roofMat);
  terminal.add(roof);

  // Front Glass Curtain Wall facing Runway/Apron
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.7,
    roughness: 0.1,
    metalness: 0.8
  });
  const glassGeom = new THREE.PlaneGeometry(176, 11);
  glassGeom.translate(0, 6.5, -21.1);
  const glassMesh = new THREE.Mesh(glassGeom, glassMat);
  terminal.add(glassMesh);

  // Vertical Window Mullions
  const mullionMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 });
  const mullionGeom = new THREE.BoxGeometry(0.5, 11, 0.4);
  for (let mx = -80; mx <= 80; mx += 16) {
    const mullion = new THREE.Mesh(mullionGeom, mullionMat);
    mullion.position.set(mx, 6.5, -21.2);
    terminal.add(mullion);
  }

  // 4 Passenger Boarding Jet Bridges (Aerobridges reaching towards apron)
  const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5 });
  const bridgePositions = [-60, -20, 20, 60];

  bridgePositions.forEach(bx => {
    const bridgeGroup = new THREE.Group();
    // Fixed rotunda on terminal wall
    const rotundaGeom = new THREE.CylinderGeometry(3.5, 3.5, 6, 12);
    rotundaGeom.translate(0, 5, 0);
    const rotunda = new THREE.Mesh(rotundaGeom, bridgeMat);
    rotunda.position.set(bx, 0, -22);
    bridgeGroup.add(rotunda);

    // Telescopic tunnel angled out to apron gate position
    const tunnelGeom = new THREE.BoxGeometry(3.2, 3.2, 18);
    tunnelGeom.translate(0, 4.5, -9);
    const tunnel = new THREE.Mesh(tunnelGeom, bridgeMat);
    tunnel.position.set(bx, 0, -22);
    tunnel.rotation.y = 0.14 * (bx > 0 ? 1 : -1);
    bridgeGroup.add(tunnel);

    // Support wheel barrow
    const legGeom = new THREE.CylinderGeometry(0.3, 0.3, 3, 8);
    const leg = new THREE.Mesh(legGeom, mullionMat);
    leg.position.set(bx + (bx > 0 ? 2.5 : -2.5), 1.5, -38);
    bridgeGroup.add(leg);

    terminal.add(bridgeGroup);
  });

  // Terminal Sign Billboard: FAUZI INT'L AIRPORT • TERMINAL 1
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 512;
  signCanvas.height = 64;
  const sCtx = signCanvas.getContext('2d');
  sCtx.fillStyle = '#0f172a';
  sCtx.fillRect(0, 0, 512, 64);
  sCtx.fillStyle = '#38bdf8';
  sCtx.font = 'bold 30px sans-serif';
  sCtx.textAlign = 'center';
  sCtx.fillText('FAUZI INT\'L AIRPORT • TERMINAL 1', 256, 44);

  const signTex = new THREE.CanvasTexture(signCanvas);
  const signGeom = new THREE.PlaneGeometry(64, 8);
  signGeom.translate(0, 16.5, -21.3);
  const signMesh = new THREE.Mesh(signGeom, new THREE.MeshBasicMaterial({ map: signTex }));
  terminal.add(signMesh);

  return terminal;
}

function createAirportTower3D() {
  const tower = new THREE.Group();

  // Tapered Concrete Shaft
  const shaftGeom = new THREE.CylinderGeometry(3.6, 5.8, 32, 16);
  shaftGeom.translate(0, 16, 0);
  const shaftMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.7,
    metalness: 0.1
  });
  tower.add(new THREE.Mesh(shaftGeom, shaftMat));

  // Vertical blue aero stripes along shaft
  const stripeGeom = new THREE.PlaneGeometry(1.6, 31);
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0x0284c7 });
  const s1 = new THREE.Mesh(stripeGeom, stripeMat);
  s1.position.set(0, 16, 4.6);
  tower.add(s1);

  // Lower Catwalk Balcony Platform
  const catwalkGeom = new THREE.CylinderGeometry(7.8, 7.8, 1.2, 16);
  catwalkGeom.translate(0, 32.5, 0);
  const catwalkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 });
  tower.add(new THREE.Mesh(catwalkGeom, catwalkMat));

  // Safety Railing
  const railingGeom = new THREE.CylinderGeometry(7.7, 7.7, 1.0, 16, 1, true);
  railingGeom.translate(0, 33.6, 0);
  const railingMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, wireframe: true });
  tower.add(new THREE.Mesh(railingGeom, railingMat));

  // VCR (Visual Control Room) Cab with 360 Tinted Glass
  const cabGeom = new THREE.CylinderGeometry(7.2, 5.0, 6.5, 16);
  cabGeom.translate(0, 36.5, 0);
  const cabMat = new THREE.MeshPhysicalMaterial({
    color: 0x0284c7,
    transparent: true,
    opacity: 0.82,
    roughness: 0.1,
    metalness: 0.8
  });
  tower.add(new THREE.Mesh(cabGeom, cabMat));

  // Upper Roof Platform
  const roofGeom = new THREE.CylinderGeometry(7.6, 7.2, 1.2, 16);
  roofGeom.translate(0, 40.3, 0);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3 });
  tower.add(new THREE.Mesh(roofGeom, roofMat));

  // Primary Ground Radar Dome
  const domeGeom = new THREE.SphereGeometry(2.4, 16, 16);
  domeGeom.translate(0, 42.8, 0);
  const domeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
  tower.add(new THREE.Mesh(domeGeom, domeMat));

  // Antenna Mast with Flashing Hazard Beacon
  const mastGeom = new THREE.CylinderGeometry(0.12, 0.2, 6, 8);
  mastGeom.translate(0, 47, 0);
  const mastMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8 });
  tower.add(new THREE.Mesh(mastGeom, mastMat));

  const beaconGeom = new THREE.SphereGeometry(0.4, 8, 8);
  beaconGeom.translate(0, 50.2, 0);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  tower.add(new THREE.Mesh(beaconGeom, beaconMat));

  return tower;
}

function createAirportHangars3D() {
  const hangars = new THREE.Group();

  const hangarWidth = 75;
  const hangarHeight = 20;
  const hangarDepth = 55;

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 });
  const openBayMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3 });

  // Two Hangars: Hangar 1 (Maintenance) and Hangar 2 (Cargo)
  const configs = [
    { x: 880, isOpen: true },
    { x: 1010, isOpen: false }
  ];

  configs.forEach(cfg => {
    const hGroup = new THREE.Group();

    // Hangar Main Box
    const bodyGeom = new THREE.BoxGeometry(hangarWidth, hangarHeight * 0.7, hangarDepth);
    bodyGeom.translate(0, hangarHeight * 0.35, 0);
    hGroup.add(new THREE.Mesh(bodyGeom, wallMat));

    // Barrel Vault / Arched Roof
    const archGeom = new THREE.CylinderGeometry(hangarWidth * 0.52, hangarWidth * 0.52, hangarDepth, 24, 1, false, 0, Math.PI);
    archGeom.rotateX(Math.PI / 2);
    archGeom.rotateZ(Math.PI / 2);
    archGeom.translate(0, hangarHeight * 0.7, 0);
    hGroup.add(new THREE.Mesh(archGeom, roofMat));

    // Front Sliding Doors facing runway apron
    const frontZ = -hangarDepth / 2 - 0.2;
    if (cfg.isOpen) {
      const door1 = new THREE.Mesh(new THREE.BoxGeometry(hangarWidth * 0.3, hangarHeight * 0.68, 0.8), doorMat);
      door1.position.set(-hangarWidth * 0.33, hangarHeight * 0.34, frontZ);
      hGroup.add(door1);

      const door2 = new THREE.Mesh(new THREE.BoxGeometry(hangarWidth * 0.3, hangarHeight * 0.68, 0.8), doorMat);
      door2.position.set(hangarWidth * 0.33, hangarHeight * 0.34, frontZ);
      hGroup.add(door2);

      // Interior lit maintenance bay
      const bay = new THREE.Mesh(new THREE.PlaneGeometry(hangarWidth * 0.38, hangarHeight * 0.68), openBayMat);
      bay.position.set(0, hangarHeight * 0.34, frontZ + 0.1);
      hGroup.add(bay);
    } else {
      const doors = new THREE.Mesh(new THREE.BoxGeometry(hangarWidth * 0.88, hangarHeight * 0.68, 0.8), doorMat);
      doors.position.set(0, hangarHeight * 0.34, frontZ);
      hGroup.add(doors);
    }

    // Hazard Stripes Header
    const hazardGeom = new THREE.PlaneGeometry(hangarWidth * 0.9, 1.4);
    const hazardMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const hazard = new THREE.Mesh(hazardGeom, hazardMat);
    hazard.position.set(0, hangarHeight * 0.72, frontZ - 0.5);
    hGroup.add(hazard);

    // Side Office Annex
    const annexGeom = new THREE.BoxGeometry(16, 7, 28);
    annexGeom.translate(hangarWidth / 2 + 8, 3.5, 0);
    hGroup.add(new THREE.Mesh(annexGeom, wallMat));

    hGroup.position.set(cfg.x, 0, 105);
    hangars.add(hGroup);
  });

  return hangars;
}

function createFireStation3D() {
  const station = new THREE.Group();

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4 });

  // Station Garage (45m wide, 18m deep, 8m high)
  const bodyGeom = new THREE.BoxGeometry(45, 8, 18);
  bodyGeom.translate(0, 4, 0);
  station.add(new THREE.Mesh(bodyGeom, wallMat));

  // 3 Red Emergency Appliance Doors
  for (let b = -12; b <= 12; b += 12) {
    const doorGeom = new THREE.PlaneGeometry(8, 6.2);
    doorGeom.translate(b, 3.1, -9.1);
    const d = new THREE.Mesh(doorGeom, doorMat);
    station.add(d);
  }

  // Communications Mast
  const mastGeom = new THREE.CylinderGeometry(0.2, 0.3, 10, 8);
  mastGeom.translate(18, 13, -6);
  station.add(new THREE.Mesh(mastGeom, new THREE.MeshStandardMaterial({ color: 0x94a3b8 })));

  // Two Stationed Airport Crash Tenders (Fire Trucks) on Apron
  [-8, 8].forEach(tx => {
    const truck = new THREE.Group();
    const tBodyGeom = new THREE.BoxGeometry(3.6, 2.6, 8.5);
    tBodyGeom.translate(0, 1.8, 0);
    truck.add(new THREE.Mesh(tBodyGeom, doorMat));

    const cabGeom = new THREE.BoxGeometry(3.4, 1.4, 2.5);
    cabGeom.translate(0, 2.2, -2.6);
    truck.add(new THREE.Mesh(cabGeom, new THREE.MeshStandardMaterial({ color: 0x0284c7 })));

    const turretGeom = new THREE.CylinderGeometry(0.3, 0.4, 1.8, 8);
    turretGeom.rotateX(Math.PI / 3);
    turretGeom.translate(0, 3.4, -1.8);
    truck.add(new THREE.Mesh(turretGeom, new THREE.MeshStandardMaterial({ color: 0xe2e8f0 })));

    truck.position.set(tx, 0, -16);
    station.add(truck);
  });

  station.position.set(180, 0, 85);
  return station;
}

function createFuelFarm3D() {
  const farm = new THREE.Group();

  const tankMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3, metalness: 0.2 });
  const bundMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 });

  // 3 White Cylindrical Storage Tanks
  const tankRadius = 8;
  const tankHeight = 9;
  const tankSpacing = 22;

  for (let i = -1; i <= 1; i++) {
    const tGeom = new THREE.CylinderGeometry(tankRadius, tankRadius, tankHeight, 24);
    tGeom.translate(i * tankSpacing, tankHeight / 2, 0);
    farm.add(new THREE.Mesh(tGeom, tankMat));

    const capGeom = new THREE.SphereGeometry(tankRadius, 24, 8, 0, Math.PI * 2, 0, Math.PI * 0.2);
    capGeom.translate(i * tankSpacing, tankHeight - 1.2, 0);
    farm.add(new THREE.Mesh(capGeom, tankMat));

    // Green Aviation Fuel Hazard Stripe
    const stripeGeom = new THREE.CylinderGeometry(tankRadius + 0.05, tankRadius + 0.05, 1.2, 24, 1, true);
    stripeGeom.translate(i * tankSpacing, 5.5, 0);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    farm.add(new THREE.Mesh(stripeGeom, stripeMat));
  }

  // Safety Containment Wall
  const bundGeom = new THREE.BoxGeometry(75, 1.8, 28);
  bundGeom.translate(0, 0.9, 0);
  farm.add(new THREE.Mesh(bundGeom, bundMat));

  farm.position.set(1250, 0, 115);
  return farm;
}

function createRadarTower3D() {
  const radar = new THREE.Group();

  // Lattice Framework Pylon
  const pylonGeom = new THREE.CylinderGeometry(1.5, 4.0, 24, 4);
  pylonGeom.translate(0, 12, 0);
  const pylonMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, wireframe: true });
  radar.add(new THREE.Mesh(pylonGeom, pylonMat));

  // Platform
  const platGeom = new THREE.CylinderGeometry(4.2, 4.2, 0.8, 12);
  platGeom.translate(0, 24.4, 0);
  radar.add(new THREE.Mesh(platGeom, new THREE.MeshStandardMaterial({ color: 0x1e293b })));

  // White Spherical Doppler Radome
  const domeGeom = new THREE.SphereGeometry(4.5, 24, 24);
  domeGeom.translate(0, 29.2, 0);
  const domeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
  radar.add(new THREE.Mesh(domeGeom, domeMat));

  radar.position.set(1450, 0, 120);
  return radar;
}

function createAirportNavaids3D() {
  const navaids = new THREE.Group();

  // 1. Windsock Mast
  const sockGroup = new THREE.Group();
  const mastGeom = new THREE.CylinderGeometry(0.12, 0.16, 7.5, 8);
  mastGeom.translate(0, 3.75, 0);
  sockGroup.add(new THREE.Mesh(mastGeom, new THREE.MeshStandardMaterial({ color: 0x94a3b8 })));

  // Orange & White Striped Cone
  const coneGeom = new THREE.ConeGeometry(0.75, 3.2, 12);
  coneGeom.rotateZ(-Math.PI / 2);
  coneGeom.translate(1.6, 7.2, 0);
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.8 });
  sockGroup.add(new THREE.Mesh(coneGeom, coneMat));

  sockGroup.position.set(220, 0, 38);
  navaids.add(sockGroup);

  // 2. ILS Glide Slope Antenna Tower
  const ilsMast = new THREE.Group();
  const ilsGeom = new THREE.BoxGeometry(0.8, 12, 0.8);
  ilsGeom.translate(0, 6, 0);
  ilsMast.add(new THREE.Mesh(ilsGeom, new THREE.MeshStandardMaterial({ color: 0xe2e8f0, wireframe: true })));

  [4, 8, 11].forEach(ay => {
    const aBox = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 0.5), new THREE.MeshStandardMaterial({ color: 0xf59e0b }));
    aBox.position.set(0, ay, 0);
    ilsMast.add(aBox);
  });
  ilsMast.position.set(140, 0, -35);
  navaids.add(ilsMast);

  return navaids;
}

function createApronFloodlight3D(x, z) {
  const lightTower = new THREE.Group();
  const pylonGeom = new THREE.CylinderGeometry(0.3, 0.6, 18, 8);
  pylonGeom.translate(0, 9, 0);
  lightTower.add(new THREE.Mesh(pylonGeom, new THREE.MeshStandardMaterial({ color: 0x475569 })));

  const headGeom = new THREE.BoxGeometry(4.5, 0.8, 1.2);
  headGeom.translate(0, 18.4, 0);
  lightTower.add(new THREE.Mesh(headGeom, new THREE.MeshStandardMaterial({ color: 0x0f172a })));

  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
  const lampGeom = new THREE.PlaneGeometry(4.2, 0.6);
  lampGeom.rotateX(Math.PI / 4);
  lampGeom.translate(0, 18.2, -0.6);
  lightTower.add(new THREE.Mesh(lampGeom, lampMat));

  lightTower.position.set(x, 0, z);
  return lightTower;
}

function createDistanceSign3D(distMeters) {
  const signGroup = new THREE.Group();
  const boxGeom = new THREE.BoxGeometry(2.4, 1.6, 0.3);
  boxGeom.translate(0, 1.2, 0);
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 });
  const box = new THREE.Mesh(boxGeom, boxMat);
  signGroup.add(box);

  const signCanvas = document.createElement('canvas');
  signCanvas.width = 256;
  signCanvas.height = 128;
  const sCtx = signCanvas.getContext('2d');
  sCtx.fillStyle = '#000000';
  sCtx.fillRect(0, 0, 256, 128);
  sCtx.strokeStyle = '#f59e0b';
  sCtx.lineWidth = 8;
  sCtx.strokeRect(4, 4, 248, 120);
  sCtx.fillStyle = '#f59e0b';
  sCtx.font = 'bold 52px monospace';
  sCtx.textAlign = 'center';
  sCtx.fillText(`${distMeters}m`, 128, 80);

  const tex = new THREE.CanvasTexture(signCanvas);
  const labelGeom = new THREE.PlaneGeometry(2.2, 1.3);
  labelGeom.rotateY(-Math.PI / 2);
  const labelMat = new THREE.MeshBasicMaterial({ map: tex });
  const label = new THREE.Mesh(labelGeom, labelMat);
  label.position.set(-0.16, 1.2, 0);
  signGroup.add(label);

  return signGroup;
}

function updateAndRender3D(dt, kin) {
  if (!aircraft3D || !scene3D || !camera3D || !renderer3D) return;

  // Adapt Aircraft Preset Scale
  let modelScale = 1.0;
  if (state.preset === 'cessna') modelScale = 0.55;
  else if (state.preset === 'atr72') modelScale = 0.8;
  else if (state.preset === 'a380') modelScale = 1.45;
  else if (state.preset === 'f16') modelScale = 0.68;
  else if (state.preset === 'catapult') modelScale = 0.72;
  aircraft3D.group.scale.set(modelScale, modelScale, modelScale);

  // 1. Position Aircraft on Runway
  const groundOffset = 2.45 * modelScale;
  aircraft3D.group.position.x = kin.s;
  aircraft3D.group.position.y = groundOffset + kin.altitude;
  aircraft3D.group.rotation.z = (kin.pitchDeg * Math.PI) / 180;

  // 2. Animate Internal Model (Turbine, Wheels, Gear, Flaps, Elevators, Lights)
  aircraft3D.update(dt, kin.v, kin.altitude > 0.4, kin.altitude);

  // 3. Sunlight follows Aircraft
  if (sunLight3D) {
    sunLight3D.position.set(kin.s + 35, groundOffset + kin.altitude + 50, 35);
    sunLight3D.target.position.set(kin.s, groundOffset + kin.altitude, 0);
    if (!sunLight3D.target.parent) scene3D.add(sunLight3D.target);
  }

  // 4. Camera 3D Tracking Modes (elevating smoothly during climb)
  const curS = kin.s;
  const curY = groundOffset + kin.altitude;

  if (state.cam3DMode === 'chase') {
    const targetCamX = curS - 38;
    const targetCamY = curY + 7.5;
    const targetCamZ = 14.0;
    camera3D.position.set(targetCamX, targetCamY, targetCamZ);
    camera3D.lookAt(curS + 12, curY + 1.2, 0);
  } else if (state.cam3DMode === 'cockpit') {
    const pitchRad = (kin.pitchDeg * Math.PI) / 180;
    camera3D.position.set(curS + 13.0 * modelScale, curY + 1.05 * modelScale, 0);
    camera3D.lookAt(curS + 160, curY + 1.05 * modelScale + Math.tan(pitchRad) * 160, 0);
  } else if (state.cam3DMode === 'tower') {
    camera3D.position.set(650, 37.0, 92);
    camera3D.lookAt(curS, curY + 2, 0);
  } else if (state.cam3DMode === 'wing') {
    camera3D.position.set(curS - 3.5 * modelScale, curY + 1.6 * modelScale, 15 * modelScale);
    camera3D.lookAt(curS + 20 * modelScale, curY, 0);
  }

  renderer3D.render(scene3D, camera3D);
}

// --- Main Animation Loop ---
function animationLoop(timestamp) {
  if (state.lastTimestamp === 0) state.lastTimestamp = timestamp;
  const dt = Math.min((timestamp - state.lastTimestamp) / 1000, 0.1);
  state.lastTimestamp = timestamp;

  if (state.isPlaying) {
    if (state.isResetting) {
      state.resetTimer -= dt;
      if (state.resetTimer <= 0) {
        state.isResetting = false;
        state.tCurrent = 0;
        state.particles = [];
        updateAudio(0, false);
      }
      updateUIElements();
      drawAllGraphs();
    } else {
      const prevKin = getKinematicsAt(state.tCurrent);
      state.tCurrent += dt * state.playbackSpeed;

      const curKin = getKinematicsAt(state.tCurrent);
      // Sound chime trigger right at rotation point
      if (prevKin.t < state.tTarget && curKin.t >= state.tTarget) {
        playLiftoffChime();
      }

      if (state.tCurrent >= state.maxSimTime) {
        state.tCurrent = state.maxSimTime;

        if (state.autoRepeat) {
          logCycleRun(state.cycle);
          state.completedCycles = state.cycle;

          if (state.cycle < state.maxCycles) {
            state.cycle++;
            state.isResetting = true;
            state.resetTimer = 1.2; // 1.2 second pause displaying cycle completion before returning to start
            state.tCurrent = 0;
            state.particles = [];
            updateAudio(0, false);
          } else {
            // Cycle 10 complete! All 10 take-offs have completed!
            state.isPlaying = false;
            state.allCompleted = true;
            elBtnPlay.innerHTML = '▶ Play';
            elBtnPlay.classList.remove('btn-primary');
            showCycleCompletionModal();
          }
        } else {
          state.isPlaying = false;
          elBtnPlay.innerHTML = '▶ Play';
          elBtnPlay.classList.remove('btn-primary');
        }
      }

      updateUIElements();
      drawAllGraphs();
    }
  }

  const kin = getKinematicsAt(state.tCurrent);
  if (state.viewMode === '3d' && renderer3D && aircraft3D) {
    updateAndRender3D(dt, kin);
  } else {
    renderSimCanvas();
  }

  requestAnimationFrame(animationLoop);
}

// --- Visual Simulation Canvas Rendering ---
function renderSimCanvas() {
  const rect = simCanvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const ctx = simCtx;

  const isLight = document.body.dataset.theme === 'light';
  const kin = getKinematicsAt(state.tCurrent);

  // Background Sky Gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
  if (isLight) {
    skyGrad.addColorStop(0, '#93c5fd'); // soft sky blue
    skyGrad.addColorStop(0.55, '#dbeafe');
    skyGrad.addColorStop(0.7, '#cbd5e1'); // horizon haze
  } else {
    skyGrad.addColorStop(0, '#0b1329'); // dark navy aero sky
    skyGrad.addColorStop(0.55, '#182442');
    skyGrad.addColorStop(0.7, '#243254'); // horizon glow
  }
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, width, height);

  // Runway Elevation Geometry with smooth vertical camera tracking during climb
  let groundY = height * 0.74; // Tarmac surface line

  // Determine Camera Coordinate Frame
  let viewOffsetMeters = 0;
  let scalePixelsPerMeter = 1.0;

  if (state.cameraMode === 'chase') {
    // Dynamic scale: slight zoom out at high speeds for realistic sensation
    const speedRatio = Math.min(1.5, kin.v / 70);
    scalePixelsPerMeter = Math.max(0.35, 1.2 - speedRatio * 0.4);
    const planeScreenX = width * 0.28;
    viewOffsetMeters = kin.s - (planeScreenX / scalePixelsPerMeter);

    // Smooth vertical camera tracking as plane climbs high into the sky
    if (kin.altitude > 8) {
      const maxCameraShift = height * 0.46;
      const verticalShift = Math.min(maxCameraShift, (kin.altitude - 8) * scalePixelsPerMeter * 0.7);
      groundY += verticalShift;
    }
  } else {
    // Panoramic / Bird's Eye View
    const totalSpan = Math.max(state.sTarget * 1.3, (state.runwayLimit || 0) * 1.1, 400);
    const marginPixels = 60;
    scalePixelsPerMeter = (width - marginPixels * 2) / totalSpan;
    viewOffsetMeters = -marginPixels / scalePixelsPerMeter;
  }

  const runwayHeight = height - groundY;

  // Draw Distant Scenery (Parallax Clouds, Mountains, Control Tower)
  drawBackgroundScenery(ctx, width, groundY, kin.s, isLight);

  // Draw Ground / Grass
  ctx.fillStyle = isLight ? '#64748b' : '#0f172a';
  ctx.fillRect(0, groundY, width, runwayHeight);

  // Draw Runway Tarmac & Markings
  drawRunway(ctx, width, groundY, runwayHeight, viewOffsetMeters, scalePixelsPerMeter, isLight);

  // Draw Particles (Jet exhaust, smoke)
  updateAndDrawParticles(ctx, viewOffsetMeters, scalePixelsPerMeter, groundY, kin);

  // Draw Aeroplane
  drawAeroplane(ctx, kin, groundY, viewOffsetMeters, scalePixelsPerMeter, isLight);

  // Draw HUD Velocity, Altitude & Distance Overlay
  drawHUDCanvasOverlay(ctx, kin, groundY, viewOffsetMeters, scalePixelsPerMeter, isLight);
}

function drawBackgroundScenery(ctx, width, groundY, planeS, isLight) {
  // Clear, crisp, simple sky with no clouds!
  // 1. Distant horizon mountain ridge
  ctx.fillStyle = isLight ? '#94a3b8' : '#17223b';
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  for (let x = 0; x <= width; x += 60) {
    const hillHeight = Math.sin((x + planeS * 0.015) * 0.008) * 16 + 14;
    ctx.lineTo(x, groundY - hillHeight);
  }
  ctx.lineTo(width, groundY);
  ctx.closePath();
  ctx.fill();

  // 2. Airport Facilities Silhouette along ground baseline (Terminal, ATC Tower, Hangars, Fuel Depot)
  const baseOffset = (planeS * 0.15);
  const bldColor = isLight ? '#64748b' : '#1e293b';
  const glassColor = isLight ? '#38bdf8' : '#0284c7';
  ctx.fillStyle = bldColor;

  const termX = ((450 - baseOffset) % (width + 600) + (width + 600)) % (width + 600) - 200;

  // Terminal Main Concourse
  ctx.fillRect(termX, groundY - 24, 120, 24);
  // Terminal Curved Roof
  ctx.beginPath();
  ctx.ellipse(termX + 60, groundY - 24, 62, 8, 0, Math.PI, 0);
  ctx.fill();
  // Terminal Glass Facade
  ctx.fillStyle = glassColor;
  ctx.fillRect(termX + 12, groundY - 20, 96, 9);
  ctx.fillStyle = bldColor;

  // ATC Tower
  const towerX = termX + 150;
  ctx.fillRect(towerX + 10, groundY - 52, 10, 52);
  ctx.fillStyle = glassColor;
  ctx.fillRect(towerX + 6, groundY - 58, 18, 8);
  ctx.fillStyle = bldColor;
  ctx.fillRect(towerX + 4, groundY - 60, 22, 3);
  ctx.beginPath();
  ctx.arc(towerX + 15, groundY - 64, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(towerX + 14, groundY - 74, 2, 10);

  // Maintenance & Cargo Hangars
  const hangarX = towerX + 55;
  for (let h = 0; h < 2; h++) {
    const hx = hangarX + h * 58;
    ctx.fillRect(hx, groundY - 26, 50, 26);
    ctx.beginPath();
    ctx.ellipse(hx + 25, groundY - 26, 25, 10, 0, Math.PI, 0);
    ctx.fill();
  }

  // Aviation Fuel Storage Tanks
  const fuelX = hangarX + 135;
  for (let f = 0; f < 3; f++) {
    ctx.fillRect(fuelX + f * 18, groundY - 15, 15, 15);
    ctx.beginPath();
    ctx.arc(fuelX + f * 18 + 7.5, groundY - 15, 7.5, Math.PI, 0);
    ctx.fill();
  }
}

function drawRunway(ctx, width, groundY, runwayHeight, offsetMeters, scale, isLight) {
  // Asphalt strip
  const runwayTop = groundY;
  ctx.fillStyle = isLight ? '#334155' : '#161e2e';
  ctx.fillRect(0, runwayTop, width, runwayHeight);

  // Runway Start Threshold (Piano keys at s = 0)
  const xStart = (0 - offsetMeters) * scale;
  if (xStart > -100 && xStart < width + 100) {
    ctx.fillStyle = '#ffffff';
    // Green threshold start lights
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(xStart - 4, runwayTop - 4, 8, 8);
    // Piano key stripes
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let k = 0; k < 6; k++) {
      ctx.fillRect(xStart, runwayTop + 6 + k * 12, 35 * Math.min(2, scale), 6);
    }
    // Threshold Line
    ctx.fillRect(xStart - 2, runwayTop, 4, runwayHeight);
  }

  // Centerline Dashed Stripes (30m cycle: 15m stripe, 15m gap)
  const stripeCycleMeters = 30;
  const firstCycle = Math.floor(offsetMeters / stripeCycleMeters);
  const lastCycle = Math.ceil((offsetMeters + width / scale) / stripeCycleMeters);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  for (let c = firstCycle; c <= lastCycle; c++) {
    const sMark = c * stripeCycleMeters;
    if (sMark < 0) continue;
    if (state.runwayLimit > 0 && sMark > state.runwayLimit) break;

    const xMark = (sMark - offsetMeters) * scale;
    const stripeLen = 15 * scale;
    ctx.fillRect(xMark, runwayTop + runwayHeight * 0.48, stripeLen, 4);
  }

  // Distance Markers (every 100m, with larger signboards every 250m & 500m)
  const markerStep = 100;
  const firstMarker = Math.floor(offsetMeters / markerStep);
  const lastMarker = Math.ceil((offsetMeters + width / scale) / markerStep);

  for (let m = firstMarker; m <= lastMarker; m++) {
    const sMeter = m * markerStep;
    if (sMeter < 0) continue;
    if (state.runwayLimit > 0 && sMeter > state.runwayLimit) continue;

    const xM = (sMeter - offsetMeters) * scale;
    if (xM < -50 || xM > width + 50) continue;

    // Ground hash mark
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillRect(xM - 1, runwayTop + 2, 2, 10);

    // Marker Signboards along runway edge
    const isMajor = sMeter % 500 === 0;
    const isSemi = sMeter % 250 === 0;

    if (isMajor || isSemi || scale > 0.8) {
      // Draw distance signboard
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      const signW = isMajor ? 48 : 36;
      const signH = 18;
      const signX = xM - signW / 2;
      const signY = runwayTop + runwayHeight - 24;

      ctx.fillRect(signX, signY, signW, signH);
      ctx.strokeRect(signX, signY, signW, signH);

      ctx.fillStyle = isMajor ? '#fbbf24' : '#ffffff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${sMeter}m`, xM, signY + 13);
    }
  }

  // Take-off Required Distance Target Marker (Vr flag)
  const xTarget = (state.sTarget - offsetMeters) * scale;
  if (xTarget > -100 && xTarget < width + 100) {
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(xTarget, runwayTop);
    ctx.lineTo(xTarget, runwayTop + runwayHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    // Vr Badge Flag
    ctx.fillStyle = '#10b981';
    ctx.fillRect(xTarget - 24, runwayTop - 26, 48, 20);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Vr POINT', xTarget, runwayTop - 12);
  }

  // Runway Limit Threshold (if active)
  if (state.runwayLimit > 0) {
    const xLimit = (state.runwayLimit - offsetMeters) * scale;
    if (xLimit > -100 && xLimit < width + 100) {
      // End of runway blast pad / red overrun stripes
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(xLimit, runwayTop, 6, runwayHeight);

      // Red threshold end lights
      for (let l = 0; l < 5; l++) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(xLimit + 3, runwayTop + 6 + l * 14, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Yellow chevron blast pad area after limit
      ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
      ctx.fillRect(xLimit + 6, runwayTop, width - xLimit, runwayHeight);

      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`STOP END (${state.runwayLimit}m)`, xLimit, runwayTop - 10);
    }
  }
}

function updateAndDrawParticles(ctx, offsetMeters, scale, groundY, kin) {
  // Spawn exhaust particles if moving
  if (state.isPlaying && kin.v > 1) {
    const count = Math.min(4, Math.ceil(state.a / 1.5));
    for (let i = 0; i < count; i++) {
      state.particles.push({
        s: kin.s - (Math.random() * 2),
        alt: kin.altitude + 6 + (Math.random() * 4 - 2),
        vx: -kin.v * 0.3 - (Math.random() * 8 + 4),
        vy: (Math.random() - 0.5) * 3,
        life: 1.0,
        decay: Math.random() * 0.04 + 0.03,
        size: Math.random() * 5 + 3,
        isAfterburner: state.preset === 'fighter' || state.preset === 'catapult'
      });
    }
  }

  // Render & Update Particles
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.life -= p.decay;
    p.s += p.vx * 0.016;
    p.alt += p.vy * 0.016;
    p.size += 0.3;

    if (p.life <= 0) {
      state.particles.splice(i, 1);
      continue;
    }

    const px = (p.s - offsetMeters) * scale;
    const py = groundY - (p.alt * scale) - 6;

    ctx.save();
    if (p.isAfterburner && p.life > 0.6) {
      ctx.fillStyle = `rgba(249, 115, 22, ${p.life * 0.9})`; // orange flame
    } else {
      ctx.fillStyle = `rgba(203, 213, 225, ${p.life * 0.35})`; // smoke
    }
    ctx.beginPath();
    ctx.arc(px, py, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawAeroplane(ctx, kin, groundY, offsetMeters, scale, isLight) {
  const planeScreenX = (kin.s - offsetMeters) * scale;
  const planeScreenY = groundY - (kin.altitude * scale);

  ctx.save();
  ctx.translate(planeScreenX, planeScreenY);

  // Pitch rotation when airborne or rotating
  if (kin.pitchDeg > 0) {
    ctx.rotate((-kin.pitchDeg * Math.PI) / 180);
  }

  // Vector Plane Sprite Dimensions
  const planeLength = 68;
  const planeHeight = 16;
  const isFighter = state.preset === 'fighter';
  const isProp = state.preset === 'prop';

  // Shadow on Ground (if airborne, shadow stays on runway)
  if (kin.altitude > 0) {
    ctx.save();
    ctx.resetTransform();
    // Shadow coordinate
    const shadowScale = Math.max(0.4, 1.0 - kin.altitude / 80);
    const shadowX = (kin.s - offsetMeters) * scale;
    const shadowY = groundY + 4;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(shadowX, shadowY, (planeLength * 0.5) * shadowScale, 5 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Wheels / Landing Gear (retracts after climb > 8m)
  const gearDeployed = kin.altitude < 12;
  const wheelRadius = 4.5;
  const wheelSpin = (kin.s / 0.8) % (Math.PI * 2);

  if (gearDeployed) {
    ctx.fillStyle = '#64748b';
    // Front Nose Gear
    ctx.fillRect(planeLength * 0.25, 0, 3, 10);
    // Main Rear Gear
    ctx.fillRect(-planeLength * 0.2, 0, 4, 10);

    // Wheels
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(planeLength * 0.25 + 1.5, 10, wheelRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(-planeLength * 0.2 + 2, 10, wheelRadius, 0, Math.PI * 2);
    ctx.fill();

    // Wheel spokes to visualize rolling
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(planeLength * 0.25 + 1.5, 10);
    ctx.lineTo(planeLength * 0.25 + 1.5 + Math.cos(wheelSpin) * wheelRadius, 10 + Math.sin(wheelSpin) * wheelRadius);
    ctx.moveTo(-planeLength * 0.2 + 2, 10);
    ctx.lineTo(-planeLength * 0.2 + 2 + Math.cos(wheelSpin) * wheelRadius, 10 + Math.sin(wheelSpin) * wheelRadius);
    ctx.stroke();
  }

  // Fuselage Body
  ctx.fillStyle = isLight ? '#f8fafc' : '#e2e8f0';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  // Nose cone
  ctx.moveTo(planeLength * 0.5, 0);
  // Top fuselage curve
  ctx.quadraticCurveTo(planeLength * 0.2, -planeHeight * 0.8, -planeLength * 0.35, -planeHeight * 0.7);
  // Tail fin rise
  ctx.lineTo(-planeLength * 0.5, -planeHeight * 1.8);
  ctx.lineTo(-planeLength * 0.42, -planeHeight * 1.8);
  ctx.lineTo(-planeLength * 0.35, -planeHeight * 0.5);
  // Tail horizontal stabilizer
  ctx.lineTo(-planeLength * 0.48, -planeHeight * 0.2);
  // Underside belly
  ctx.quadraticCurveTo(0, planeHeight * 0.3, planeLength * 0.5, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Cockpit Windshield Glass
  ctx.fillStyle = '#0284c7';
  ctx.beginPath();
  ctx.moveTo(planeLength * 0.38, -planeHeight * 0.1);
  ctx.lineTo(planeLength * 0.44, 0);
  ctx.lineTo(planeLength * 0.36, -planeHeight * 0.45);
  ctx.lineTo(planeLength * 0.28, -planeHeight * 0.45);
  ctx.closePath();
  ctx.fill();

  // Passenger Windows
  if (!isFighter) {
    ctx.fillStyle = '#0284c7';
    for (let w = -15; w <= 16; w += 6) {
      ctx.fillRect(w, -planeHeight * 0.35, 3.5, 3.5);
    }
  }

  // Jet Engine or Propeller
  if (isProp) {
    // Propeller spinning disc
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(planeLength * 0.52, 0, 2, 14, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // Jet Nacelle under wing
    ctx.fillStyle = isFighter ? '#475569' : '#0284c7';
    ctx.fillRect(-8, 2, 22, 9);
    ctx.strokeStyle = '#1e293b';
    ctx.strokeRect(-8, 2, 22, 9);

    // Afterburner glow if high acceleration
    if ((isFighter || state.preset === 'catapult') && state.isPlaying) {
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(-8, 3);
      ctx.lineTo(-24, 6.5);
      ctx.lineTo(-8, 10);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Wing Line
  ctx.fillStyle = isLight ? '#cbd5e1' : '#94a3b8';
  ctx.beginPath();
  ctx.moveTo(12, 1);
  ctx.lineTo(-14, 6);
  ctx.lineTo(-20, 4);
  ctx.lineTo(6, -2);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawHUDCanvasOverlay(ctx, kin, groundY, offsetMeters, scale, isLight) {
  const planeScreenX = (kin.s - offsetMeters) * scale;
  const planeScreenY = groundY - (kin.altitude * scale);

  // 1. Speed Vector Arrow above aircraft
  if (kin.v > 2) {
    const arrowLen = Math.min(80, kin.v * 0.9);
    ctx.save();
    ctx.strokeStyle = '#10b981';
    ctx.fillStyle = '#10b981';
    ctx.lineWidth = 2;

    const arrowY = planeScreenY - 32;
    ctx.beginPath();
    ctx.moveTo(planeScreenX, arrowY);
    ctx.lineTo(planeScreenX + arrowLen, arrowY);
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(planeScreenX + arrowLen, arrowY);
    ctx.lineTo(planeScreenX + arrowLen - 6, arrowY - 4);
    ctx.lineTo(planeScreenX + arrowLen - 6, arrowY + 4);
    ctx.closePath();
    ctx.fill();

    // Text Label: v(t)
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`v = ${kin.v.toFixed(1)} m/s`, planeScreenX + arrowLen + 6, arrowY + 4);
    ctx.restore();
  }

  // 2. Flight Telemetry Badge on 2D Screen
  ctx.save();
  const badgeW = 275;
  const badgeH = 46;
  const badgeX = 14;
  const badgeY = 14;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
  } else {
    ctx.rect(badgeX, badgeY, badgeW, badgeH);
  }
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#94a3b8';
  ctx.font = '9px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`CYCLE ${state.cycle} / ${state.maxCycles}  •  t = ${kin.t.toFixed(1)}s`, badgeX + 10, badgeY + 16);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 11px monospace';
  const altFt = (kin.altitude * 3.28084).toFixed(0);
  ctx.fillText(`Dist: ${kin.s.toFixed(0)}m  |  Alt: ${kin.altitude.toFixed(0)}m (${altFt}ft)`, badgeX + 10, badgeY + 34);

  // 3. Primary Flight Display (PFD) Altitude Tape on left edge
  const tapeW = 46;
  const tapeH = 150;
  const tapeX = 14;
  const tapeY = Math.max(70, (ctx.canvas.height / (window.devicePixelRatio || 1) - tapeH) / 2);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
  ctx.lineWidth = 1;
  ctx.fillRect(tapeX, tapeY, tapeW, tapeH);
  ctx.strokeRect(tapeX, tapeY, tapeW, tapeH);

  // Tape Header
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ALT (m)', tapeX + tapeW / 2, tapeY - 4);

  // Tick marks relative to current altitude
  const curAlt = kin.altitude;
  const altStep = 25;
  const pixelsPerAltM = (tapeH * 0.65) / 100;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '8px monospace';

  const baseAlt = Math.floor(curAlt / altStep) * altStep;
  for (let a = baseAlt - 75; a <= baseAlt + 75; a += altStep) {
    if (a < 0) continue;
    const dy = (curAlt - a) * pixelsPerAltM;
    const yTick = tapeY + tapeH / 2 + dy;
    if (yTick > tapeY + 10 && yTick < tapeY + tapeH - 4) {
      ctx.beginPath();
      ctx.moveTo(tapeX + tapeW - 10, yTick);
      ctx.lineTo(tapeX + tapeW - 2, yTick);
      ctx.stroke();

      ctx.textAlign = 'right';
      ctx.fillText(a.toString(), tapeX + tapeW - 12, yTick + 3);
    }
  }

  // Current Altitude Bug in center of tape
  const bugY = tapeY + tapeH / 2;
  ctx.fillStyle = '#0284c7';
  ctx.fillRect(tapeX + 2, bugY - 9, tapeW - 4, 18);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(tapeX + 2, bugY - 9, tapeW - 4, 18);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(curAlt.toFixed(0), tapeX + tapeW / 2, bugY + 4);

  ctx.restore();
}

// --- Kinematic Graphs Rendering (s-t, v-t, a-t) ---
function drawAllGraphs() {
  drawGraphS();
  drawGraphV();
  drawGraphA();
}

function drawGraphS() {
  const rect = graphCanvasS.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const ctx = graphCtxS;
  const isLight = document.body.dataset.theme === 'light';

  ctx.clearRect(0, 0, width, height);

  const padLeft = 45;
  const padBottom = 26;
  const padTop = 15;
  const padRight = 15;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const tMax = state.maxSimTime;
  // Estimate max displacement at tMax
  const kinEnd = getKinematicsAt(tMax);
  const sMax = Math.max(state.sTarget * 1.25, kinEnd.s * 1.05, 100);

  drawAxes(ctx, padLeft, padTop, plotW, plotH, 't (s)', 's (m)', tMax, sMax, isLight);

  // Curve: s(t) = 0.5 a t^2 up to tTarget
  ctx.strokeStyle = '#8b5cf6'; // purple / violet
  ctx.lineWidth = 2.5;
  ctx.beginPath();

  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * tMax;
    const s = getKinematicsAt(t).s;
    const px = padLeft + (t / tMax) * plotW;
    const py = padTop + plotH - (s / sMax) * plotH;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // Current Simulation Time Dot & Tangent Slope Line
  const kinCur = getKinematicsAt(state.tCurrent);
  const curX = padLeft + (state.tCurrent / tMax) * plotW;
  const curY = padTop + plotH - (kinCur.s / sMax) * plotH;

  // Tangent line slope = ds/dt = v
  const dtSpan = 2.0;
  const t1 = Math.max(0, state.tCurrent - dtSpan);
  const t2 = Math.min(tMax, state.tCurrent + dtSpan);
  const s1 = kinCur.s - kinCur.v * (state.tCurrent - t1);
  const s2 = kinCur.s + kinCur.v * (t2 - state.tCurrent);

  const x1 = padLeft + (t1 / tMax) * plotW;
  const y1 = padTop + plotH - (s1 / sMax) * plotH;
  const x2 = padLeft + (t2 / tMax) * plotW;
  const y2 = padTop + plotH - (s2 / sMax) * plotH;

  ctx.strokeStyle = 'rgba(16, 185, 129, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Tangent annotation badge
  ctx.fillStyle = '#10b981';
  ctx.font = '9px monospace';
  ctx.fillText(`Slope = v: ${kinCur.v.toFixed(1)} m/s`, Math.min(plotW + padLeft - 95, curX + 10), Math.max(padTop + 14, curY - 10));

  // Current Dot
  ctx.fillStyle = '#8b5cf6';
  ctx.beginPath();
  ctx.arc(curX, curY, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawGraphV() {
  const rect = graphCanvasV.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const ctx = graphCtxV;
  const isLight = document.body.dataset.theme === 'light';

  ctx.clearRect(0, 0, width, height);

  const padLeft = 45;
  const padBottom = 26;
  const padTop = 15;
  const padRight = 15;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const tMax = state.maxSimTime;
  const kinEnd = getKinematicsAt(tMax);
  const vMax = Math.max(state.vTarget * 1.25, kinEnd.v * 1.05, 20);

  drawAxes(ctx, padLeft, padTop, plotW, plotH, 't (s)', 'v (m/s)', tMax, vMax, isLight);

  // Shaded Area Under v-t Curve = Displacement s!
  const curX = padLeft + (state.tCurrent / tMax) * plotW;
  const kinCur = getKinematicsAt(state.tCurrent);
  const curY = padTop + plotH - (kinCur.v / vMax) * plotH;

  ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
  ctx.beginPath();
  ctx.moveTo(padLeft, padTop + plotH);
  // Curve up to current time
  const steps = 30;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * state.tCurrent;
    const v = getKinematicsAt(t).v;
    const px = padLeft + (t / tMax) * plotW;
    const py = padTop + plotH - (v / vMax) * plotH;
    ctx.lineTo(px, py);
  }
  ctx.lineTo(curX, padTop + plotH);
  ctx.closePath();
  ctx.fill();

  // Full Velocity Line
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const t = (i / 60) * tMax;
    const v = getKinematicsAt(t).v;
    const px = padLeft + (t / tMax) * plotW;
    const py = padTop + plotH - (v / vMax) * plotH;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // Label: Area = Distance s
  if (state.tCurrent > 1.5) {
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 9px monospace';
    ctx.fillText(`Area = s = ${kinCur.s.toFixed(0)}m`, padLeft + (state.tCurrent / tMax) * plotW * 0.4, padTop + plotH - 8);
  }

  // Current Dot
  ctx.fillStyle = '#10b981';
  ctx.beginPath();
  ctx.arc(curX, curY, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawGraphA() {
  const rect = graphCanvasA.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const ctx = graphCtxA;
  const isLight = document.body.dataset.theme === 'light';

  ctx.clearRect(0, 0, width, height);

  const padLeft = 45;
  const padBottom = 26;
  const padTop = 15;
  const padRight = 15;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const tMax = state.maxSimTime;
  const aMax = Math.max(state.a * 1.5, 6.0);

  drawAxes(ctx, padLeft, padTop, plotW, plotH, 't (s)', 'a (m/s²)', tMax, aMax, isLight);

  // Shaded Area Under a-t = Δv
  const curX = padLeft + (state.tCurrent / tMax) * plotW;
  ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
  ctx.beginPath();
  ctx.moveTo(padLeft, padTop + plotH);
  for (let i = 0; i <= 30; i++) {
    const t = (i / 30) * state.tCurrent;
    const aVal = getKinematicsAt(t).a;
    const px = padLeft + (t / tMax) * plotW;
    const py = padTop + plotH - (aVal / aMax) * plotH;
    ctx.lineTo(px, py);
  }
  ctx.lineTo(curX, padTop + plotH);
  ctx.closePath();
  ctx.fill();

  // Acceleration Line (Constant on runway, then transition to steady climb)
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const t = (i / 60) * tMax;
    const aVal = getKinematicsAt(t).a;
    const px = padLeft + (t / tMax) * plotW;
    const py = padTop + plotH - (aVal / aMax) * plotH;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // Label: Area = Change in velocity Δv
  const kinCur = getKinematicsAt(state.tCurrent);
  if (state.tCurrent > 1.5) {
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 9px monospace';
    const aCurY = padTop + plotH - (kinCur.a / aMax) * plotH;
    ctx.fillText(`Area = Δv = ${kinCur.v.toFixed(0)} m/s`, padLeft + 10, aCurY - 6);
  }

  // Current Dot
  const curDotY = padTop + plotH - (kinCur.a / aMax) * plotH;
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(curX, curDotY, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawAxes(ctx, left, top, w, h, xLabel, yLabel, xMax, yMax, isLight) {
  ctx.strokeStyle = isLight ? '#cbd5e1' : '#23314d';
  ctx.lineWidth = 1;

  // Grid Lines & Ticks
  const xDivs = 4;
  const yDivs = 3;

  ctx.fillStyle = isLight ? '#64748b' : '#64748b';
  ctx.font = '9px monospace';

  // Horizontal Grid
  for (let j = 0; j <= yDivs; j++) {
    const yVal = (j / yDivs) * yMax;
    const y = top + h - (j / yDivs) * h;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + w, y);
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.fillText(yVal >= 100 ? yVal.toFixed(0) : yVal.toFixed(1), left - 6, y + 3);
  }

  // Vertical Grid
  for (let i = 0; i <= xDivs; i++) {
    const xVal = (i / xDivs) * xMax;
    const x = left + (i / xDivs) * w;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + h);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillText(xVal.toFixed(0), x, top + h + 14);
  }

  // Axis Labels
  ctx.fillStyle = isLight ? '#334155' : '#94a3b8';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(xLabel, left + w, top + h + 22);

  ctx.textAlign = 'left';
  ctx.fillText(yLabel, left - 4, top - 4);
}

// --- Tabs Management ---
function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.dataset.tab;
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');
    });
  });
}

// --- Student Quiz & Challenge Mode ---
const QUIZ_QUESTIONS = [
  {
    q: 'A commercial jet accelerates from rest at a = 2.4 m/s² until it reaches its rotation speed of v = 72 m/s. What is the required take-off time t?',
    type: 'time',
    a: 2.4,
    v: 72,
    correct: 30.0,
    unit: 's',
    hint: 'Use the first equation of motion: v = u + at. With u = 0, t = v / a.'
  },
  {
    q: 'A light aircraft with acceleration a = 2.0 m/s² requires a take-off speed of v = 30 m/s. What minimum runway distance s is required?',
    type: 'dist',
    a: 2.0,
    v: 30,
    correct: 225.0,
    unit: 'm',
    hint: 'Use v² = u² + 2as. Since u = 0, s = v² / (2a).'
  },
  {
    q: 'An airliner must achieve a takeoff speed of v = 80 m/s on a runway that provides at most 1600 m of ground roll. What minimum acceleration a is needed?',
    type: 'accel',
    s: 1600,
    v: 80,
    correct: 2.0,
    unit: 'm/s²',
    hint: 'Rearrange v² = 2as to solve for acceleration: a = v² / (2s).'
  },
  {
    q: 'An F-16 fighter jet with afterburner accelerates at a = 6.0 m/s² for t = 14 seconds from rest. What speed v does it achieve?',
    type: 'speed',
    a: 6.0,
    t: 14,
    correct: 84.0,
    unit: 'm/s',
    hint: 'Use v = u + at with u = 0: v = a × t.'
  }
];

let currentQuizIndex = 0;

function initQuiz() {
  const elQuizPrompt = document.getElementById('quiz-prompt');
  const elQuizInput = document.getElementById('quiz-input');
  const elQuizUnit = document.getElementById('quiz-unit');
  const elBtnCheck = document.getElementById('btn-quiz-check');
  const elBtnNext = document.getElementById('btn-quiz-next');
  const elBtnLoadSim = document.getElementById('btn-quiz-load');
  const elFeedback = document.getElementById('quiz-feedback');

  if (!elQuizPrompt) return;

  function loadQuestion(idx) {
    const q = QUIZ_QUESTIONS[idx];
    elQuizPrompt.textContent = q.q;
    elQuizInput.value = '';
    elQuizUnit.textContent = q.unit;
    elFeedback.className = 'quiz-feedback';
    elFeedback.style.display = 'none';
  }

  elBtnCheck.addEventListener('click', () => {
    const q = QUIZ_QUESTIONS[currentQuizIndex];
    const userVal = parseFloat(elQuizInput.value);
    if (isNaN(userVal)) {
      elFeedback.className = 'quiz-feedback incorrect';
      elFeedback.innerHTML = 'Please enter a valid numeric value.';
      elFeedback.style.display = 'block';
      return;
    }

    const tolerance = 0.05 * q.correct; // 5% tolerance
    const isCorrect = Math.abs(userVal - q.correct) <= Math.max(0.2, tolerance);

    if (isCorrect) {
      elFeedback.className = 'quiz-feedback correct';
      elFeedback.innerHTML = `🎉 <strong>Correct!</strong> Exactly ${q.correct} ${q.unit}. Great job applying SUVAT kinematics!`;
    } else {
      elFeedback.className = 'quiz-feedback incorrect';
      elFeedback.innerHTML = `❌ <strong>Not quite.</strong> Hint: ${q.hint} (Expected ~${q.correct} ${q.unit})`;
    }
    elFeedback.style.display = 'block';
  });

  elBtnNext.addEventListener('click', () => {
    currentQuizIndex = (currentQuizIndex + 1) % QUIZ_QUESTIONS.length;
    loadQuestion(currentQuizIndex);
  });

  elBtnLoadSim.addEventListener('click', () => {
    const q = QUIZ_QUESTIONS[currentQuizIndex];
    if (q.a) state.a = q.a;
    if (q.v) state.vTarget = q.v;
    if (q.s && !q.a) state.a = (q.v * q.v) / (2 * q.s);

    elSliderA.value = state.a;
    elInputA.value = state.a.toFixed(1);
    elSliderV.value = state.vTarget;
    elInputV.value = state.vTarget.toFixed(0);

    setPresetCustom();
    resetSim();
    computeSUVAT();

    // Switch back to simulation tab
    const simTab = document.querySelector('[data-tab="tab-sim"]');
    if (simTab) simTab.click();
  });

  loadQuestion(0);
}

// --- Data Logger & CSV Export ---
function initDataLogger() {
  const elBtnLog = document.getElementById('btn-log-run');
  const elBtnClear = document.getElementById('btn-clear-log');
  const elBtnExport = document.getElementById('btn-export-csv');
  const elTableBody = document.querySelector('#data-table tbody');

  if (!elBtnLog || !elTableBody) return;

  renderDataTable();

  elBtnLog.addEventListener('click', () => {
    state.history.push({
      name: PRESETS[state.preset]?.name || 'Custom',
      a: state.a,
      v: state.vTarget,
      t: state.tTarget,
      s: state.sTarget,
      g: state.gForce
    });
    renderDataTable();
  });

  elBtnClear.addEventListener('click', () => {
    state.history = [];
    renderDataTable();
  });

  elBtnExport.addEventListener('click', () => {
    if (state.history.length === 0) {
      alert('Log at least one run before exporting!');
      return;
    }

    let csv = 'Run,Aircraft_Preset,Acceleration_m_s2,Takeoff_Velocity_m_s,Time_s,Runway_Distance_m,G_Force\n';
    state.history.forEach((row, idx) => {
      csv += `${idx + 1},"${row.name}",${row.a},${row.v},${row.t},${row.s},${row.g}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'aeroplane_takeoff_physics_data.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

// --- Global Initialization on DOM Load ---
function startApp() {
  try {
    initDOM();
    applyPreset('b737');
    requestAnimationFrame(animationLoop);
  } catch (err) {
    console.error('Fatal initialization error in startApp:', err);
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
