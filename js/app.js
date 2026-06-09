/**
 * Main Application Controller
 * 
 * Orchestrates the entire Pick & Place Robot simulation:
 * - UI event handling and parameter management
 * - Motion profile generation & input shaping
 * - Animation loop synchronization
 * - State machine for pick & place sequence
 */

class App {
  constructor() {
    // Modules
    this.sceneManager = null;
    this.chartManager = null;
    this.arm = null;
    this.sequence = null;

    // Simulation state
    this.state = 'IDLE'; // IDLE, COMPUTING, RUNNING, PAUSED, COMPLETE
    this.simTime = 0;
    this.simSpeed = 1.0;
    this.animFrameId = null;
    this.lastFrameTime = 0;

    // Motion data (pre-computed)
    this.motionData = null;
    this.dt = 0.001; // simulation timestep (1ms)

    // Parameters (defaults — matching reference MATLAB code)
    this.params = {
      vMax: 1000,
      aMax: 20000,
      jMax: 500000,
      beta: 0.5,              // AS-Curve smoothness (0, 1]
      gamma: 0.2,             // AS-Curve asymmetricity (0, inf)
      profileType: 'ascurve', // 'ascurve', 'scurve', or 'trapezoidal'
      shaperType: 'ZV',       // 'none', 'ZV', 'ZVD', 'EI'
      fn: 10,                  // Natural frequency (Hz)
      zeta: 0.05,             // Damping ratio
      pickX: 15,
      placeX: 65,
      speed: 1.0,
    };

    this._init();
  }

  _init() {
    // Wait for DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this._setup());
    } else {
      this._setup();
    }
  }

  _setup() {
    // Initialize 3D scene
    const viewport = document.getElementById('viewport');
    if (viewport) {
      this.sceneManager = new SceneManager(viewport);
    }

    // Initialize charts
    this.chartManager = new ChartManager();
    this.chartManager.init({
      position: 'chart-position',
      velocity: 'chart-velocity',
      acceleration: 'chart-acceleration',
      vibration: 'chart-vibration',
    });

    // Initialize robot arm
    this.arm = new EEZYbotArm();

    // Bind UI events
    this._bindEvents();

    // Load initial parameters from UI
    this._readParams();

    // Set initial positions
    if (this.sceneManager) {
      this.sceneManager.updatePickPlacePositions(this.params.pickX, this.params.placeX);
      this.sceneManager.setCarriagePosition(this.params.pickX);
    }

    // === Tab Navigation ===
    this._initTabs();

    // === New Modules (lazy init on first tab switch) ===
    this.sweepManager = null;
    this.sensitivityAnalyzer = null;
    this.experimentLog = null;

    // Initialize experiment log immediately (needs to be ready for auto-save)
    try {
      if (window.ExperimentLog) {
        this.experimentLog = new ExperimentLog('explog-container');
        this.experimentLog.init();
        this._updateExpLogBadge();
      }
    } catch(e) { console.warn('ExperimentLog init deferred:', e.message); }

    // Start render loop
    this._renderLoop();

    // Pre-compute and display initial profile
    this._computeAndDisplay();

    console.log('✦ Pick & Place Robot Simulator initialized');
  }

  // ══════════════════════════════════════
  // TAB NAVIGATION
  // ══════════════════════════════════════

  _initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        this._switchTab(tabName);
      });
    });
  }

  _switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const activeTab = document.getElementById(`tab-${tabName}`);
    if (activeTab) activeTab.classList.add('active');

    // Show/hide config bar (only for simulator tab)
    const configBar = document.getElementById('config-bar');
    if (configBar) {
      // Use visibility + height instead of display to prevent layout shift
      if (tabName === 'simulator') {
        configBar.style.visibility = 'visible';
        configBar.style.height = '60px';
        configBar.style.overflow = 'visible';
      } else {
        configBar.style.visibility = 'hidden';
        configBar.style.height = '0px';
        configBar.style.overflow = 'hidden';
      }
    }

    // Lazy-init modules
    if (tabName === 'sweep' && !this.sweepManager && window.SweepManager) {
      this.sweepManager = new SweepManager('sweep-container');
      this.sweepManager.init();
    }
    if (tabName === 'sensitivity' && !this.sensitivityAnalyzer && window.SensitivityAnalyzer) {
      this.sensitivityAnalyzer = new SensitivityAnalyzer('sensitivity-container');
      this.sensitivityAnalyzer.init();
    }
    if (tabName === 'explog' && this.experimentLog) {
      this.experimentLog.renderTable();
      this._updateExpLogBadge();
    }

    // Resize 3D scene if switching back to simulator
    if (tabName === 'simulator' && this.sceneManager) {
      // Wait for layout to settle, then resize
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.sceneManager.resize();
        });
      });
    }
  }

  _updateExpLogBadge() {
    const badge = document.getElementById('explog-badge');
    if (badge && this.experimentLog) {
      const count = this.experimentLog.getCount();
      if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  // ══════════════════════════════════════
  // UI EVENT BINDING
  // ══════════════════════════════════════

  _bindEvents() {
    // Sliders
    const sliderMap = {
      'slider-vmax': { param: 'vMax', display: 'val-vmax', unit: ' units/s' },
      'slider-amax': { param: 'aMax', display: 'val-amax', unit: ' units/s²' },
      'slider-jmax': { param: 'jMax', display: 'val-jmax', unit: ' units/s³' },
      'slider-beta': { param: 'beta', display: 'val-beta', unit: '', decimals: 3 },
      'slider-gamma': { param: 'gamma', display: 'val-gamma', unit: '', decimals: 3 },
      'slider-fn': { param: 'fn', display: 'val-fn', unit: ' Hz' },
      'slider-zeta': { param: 'zeta', display: 'val-zeta', unit: '', decimals: 3 },
      'slider-friction': { param: 'friction', display: 'val-friction', unit: '' },
      'slider-stiffness': { param: 'servoStiffness', display: 'val-stiffness', unit: '' },
      'slider-pickx': { param: 'pickX', display: 'val-pickx', unit: '' },
      'slider-placex': { param: 'placeX', display: 'val-placex', unit: '' },
    };

    for (const [id, cfg] of Object.entries(sliderMap)) {
      const el = document.getElementById(id);
      if (!el) continue;

      el.addEventListener('input', () => {
        const val = parseFloat(el.value);
        this.params[cfg.param] = val;

        const displayEl = document.getElementById(cfg.display);
        if (displayEl) {
          const decimals = cfg.decimals || (val % 1 !== 0 ? 1 : 0);
          displayEl.textContent = val.toFixed(decimals) + cfg.unit;
        }

        // Update scene markers if position changed
        if (cfg.param === 'pickX' || cfg.param === 'placeX') {
          if (this.sceneManager) {
            this.sceneManager.updatePickPlacePositions(this.params.pickX, this.params.placeX);
          }
        }

        // Re-compute profile if not running
        if (this.state === 'IDLE' || this.state === 'COMPLETE') {
          this._computeAndDisplay();
        }
      });
    }

    // Toggle Payload Event
    const payloadEl = document.getElementById('toggle-payload');
    if (payloadEl) {
      payloadEl.addEventListener('change', () => {
        this.params.payloadLoaded = payloadEl.checked;
        if (this.state === 'IDLE' || this.state === 'COMPLETE') {
          this._computeAndDisplay();
        }
      });
    }

    // Profile type select (toggles AS-Curve vs S-Curve specific params)
    const profileSelect = document.getElementById('select-profile');
    if (profileSelect) {
      profileSelect.addEventListener('change', () => {
        this.params.profileType = profileSelect.value;
        this._toggleProfileUI(profileSelect.value);
        if (this.state === 'IDLE' || this.state === 'COMPLETE') {
          this._computeAndDisplay();
        }
      });
      // Set initial UI visibility
      this._toggleProfileUI(profileSelect.value);
    }

    // Shaper type select
    const shaperSelect = document.getElementById('select-shaper');
    if (shaperSelect) {
      shaperSelect.addEventListener('change', () => {
        this.params.shaperType = shaperSelect.value;
        if (this.state === 'IDLE' || this.state === 'COMPLETE') {
          this._computeAndDisplay();
        }
      });
    }

    // Buttons
    const btnStart = document.getElementById('btn-start');
    if (btnStart) {
      btnStart.addEventListener('click', () => this._handleStart());
    }

    const btnReset = document.getElementById('btn-reset');
    if (btnReset) {
      btnReset.addEventListener('click', () => this._handleReset());
    }

    // Speed buttons
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.speed-btn').forEach(b => {
          b.classList.remove('active');
          b.style.background = 'var(--bg-secondary)';
          b.style.color = 'var(--text-secondary)';
          b.style.borderColor = 'var(--border-glass)';
          b.style.fontWeight = 'normal';
        });
        btn.classList.add('active');
        btn.style.background = 'var(--accent-cyan)';
        btn.style.color = '#fff';
        btn.style.borderColor = 'var(--accent-cyan)';
        btn.style.fontWeight = '600';
        this.simSpeed = parseFloat(btn.dataset.speed);
      });
    });

    // AI Optimizer
    const btnRunAI = document.getElementById('btn-run-ai');
    if (btnRunAI) {
      btnRunAI.addEventListener('click', () => this._handleAIOptimization());
    }

    // 3-Profile Compare
    const btnCompare = document.getElementById('btn-compare');
    if (btnCompare) {
      btnCompare.addEventListener('click', () => this._handleCompare());
    }
    const btnCloseCompare = document.getElementById('btn-close-compare');
    if (btnCloseCompare) {
      btnCloseCompare.addEventListener('click', () => {
        document.getElementById('compare-modal').style.display = 'none';
      });
    }

    // Handle window resize
    window.addEventListener('resize', () => {
      if (this.sceneManager) {
        setTimeout(() => this.sceneManager.resize(), 50);
      }
    });

    // Charts Modal Toggle
    const btnToggleCharts = document.getElementById('btn-toggle-charts');
    const btnCloseCharts = document.getElementById('btn-close-charts');
    const chartsModal = document.getElementById('charts-modal');

    if (btnToggleCharts && chartsModal) {
      btnToggleCharts.addEventListener('click', () => {
        chartsModal.classList.toggle('active');
      });
    }

    if (btnCloseCharts && chartsModal) {
      btnCloseCharts.addEventListener('click', () => {
        chartsModal.classList.remove('active');
      });
    }
  }

  _readParams() {
    const ids = {
      'slider-vmax': 'vMax',
      'slider-amax': 'aMax',
      'slider-jmax': 'jMax',
      'slider-beta': 'beta',
      'slider-gamma': 'gamma',
      'slider-fn': 'fn',
      'slider-zeta': 'zeta',
      'slider-friction': 'friction',
      'slider-stiffness': 'servoStiffness',
      'slider-pickx': 'pickX',
      'slider-placex': 'placeX',
    };

    for (const [id, param] of Object.entries(ids)) {
      const el = document.getElementById(id);
      if (el) {
        this.params[param] = parseFloat(el.value);
      }
    }

    const payloadEl = document.getElementById('toggle-payload');
    if (payloadEl) this.params.payloadLoaded = payloadEl.checked;

    const profileSelect = document.getElementById('select-profile');
    if (profileSelect) this.params.profileType = profileSelect.value;

    const shaperSelect = document.getElementById('select-shaper');
    if (shaperSelect) this.params.shaperType = shaperSelect.value;
  }

  /**
   * Toggle visibility of profile-specific UI elements
   */
  _toggleProfileUI(profileType) {
    const betaGroup = document.getElementById('group-beta');
    const gammaGroup = document.getElementById('group-gamma');
    const jmaxGroup = document.getElementById('group-jmax');
    const infoAS = document.getElementById('info-ascurve');

    const isAS = profileType === 'ascurve';
    const isSC = profileType === 'scurve';

    if (betaGroup) betaGroup.style.display = isAS ? '' : 'none';
    if (gammaGroup) gammaGroup.style.display = isAS ? '' : 'none';
    if (jmaxGroup) jmaxGroup.style.display = isSC ? '' : 'none';
    if (infoAS) infoAS.style.display = isAS ? '' : 'none';
  }

  // ══════════════════════════════════════
  // SIMULATION COMPUTATION
  // ══════════════════════════════════════

  _computeAndDisplay() {
    const { vMax, aMax, jMax, beta, gamma, profileType, shaperType, fn, zeta, pickX, placeX } = this.params;
    const distance = Math.abs(placeX - pickX);

    if (distance < 0.1) return;

    // Generate motion profile
    let profile;
    if (profileType === 'ascurve') {
      profile = new ASCurveProfile({ vMax, aMax, beta, gamma, distance, dt: this.dt });
    } else if (profileType === 'scurve') {
      profile = new SCurveProfile({ vMax, aMax, jMax, distance });
    } else {
      profile = new TrapezoidalProfile({ vMax, aMax, distance });
    }

    const dt = this.dt;
    const samples = profile.getSamples(dt);

    // Compute max length including 2.0s padding
    const maxLen = Math.floor((profile.totalTime + 2.0) / dt) + 1;
    const extendedTime = [];
    for (let i = 0; i < maxLen; i++) {
      extendedTime.push(i * dt);
    }

    // Extract arrays and PAD BEFORE simulation!
    const time = extendedTime;
    const position = [];
    const velocity = [];
    const acceleration = [];
    const jerkArr = [];
    
    const finalPos = samples[samples.length - 1].position;
    
    for (let i = 0; i < maxLen; i++) {
      if (i < samples.length) {
        position.push(samples[i].position);
        velocity.push(samples[i].velocity);
        acceleration.push(samples[i].acceleration);
        jerkArr.push(samples[i].jerk);
      } else {
        position.push(finalPos);
        velocity.push(0);
        acceleration.push(0);
        jerkArr.push(0);
      }
    }

    // Compute input shaping
    let shaper = null;
    let shapedPosition = position; // This is now already padded

    if (shaperType !== 'none') {
      switch (shaperType) {
        case 'ZV': shaper = InputShaper.computeZV(fn, zeta); break;
        case 'ZVD': shaper = InputShaper.computeZVD(fn, zeta); break;
        case 'EI': shaper = InputShaper.computeEI(fn, zeta); break;
      }
      if (shaper) {
        shapedPosition = InputShaper.convolve(position, dt, shaper);
      }
    }

    // Simulation options
    const simOpts = {
      payloadLoaded: this.params.payloadLoaded
    };

    // Simulate system response using realistic 4th-order 2-Mass Servo model
    const unshapedSim = InputShaper.simulateResponse(position, dt, fn, zeta, simOpts);
    const unshapedResponse = unshapedSim.position;

    let shapedSim;
    let shapedResponse;
    if (shaper) {
      shapedSim = InputShaper.simulateResponse(shapedPosition, dt, fn, zeta, simOpts);
      shapedResponse = shapedSim.position;
    } else {
      shapedSim = unshapedSim;
      shapedResponse = unshapedResponse;
    }

    // Compute vibration (tracking error)
    const unshapedVibration = InputShaper.computeVibration(unshapedResponse, position);
    const shapedVibration = InputShaper.computeVibration(
      shapedResponse,
      shaper ? shapedPosition : position
    );

    // Background Simulation: Return trip (ALWAYS unloaded) to calculate realistic Round-Trip UPH
    const returnSimOpts = {
      payloadLoaded: false
    };
    
    // We can use the same position array, just simulated with unloaded mass
    const returnUnshapedSim = InputShaper.simulateResponse(position, dt, fn, zeta, returnSimOpts);
    const returnUnshapedVibration = InputShaper.computeVibration(returnUnshapedSim.position, position);
    
    let returnShapedVibration;
    if (shaper) {
      const returnShapedSim = InputShaper.simulateResponse(shapedPosition, dt, fn, zeta, returnSimOpts);
      returnShapedVibration = InputShaper.computeVibration(returnShapedSim.position, shapedPosition);
    } else {
      returnShapedVibration = returnUnshapedVibration;
    }

    // Store motion data
    this.motionData = {
      time: extendedTime,
      position,
      velocity,
      acceleration,
      jerk: jerkArr,
      shapedPosition,
      shapedResponse,
      unshapedResponse,
      shapedVelResponse: shapedSim.velocity,
      unshapedVelResponse: unshapedSim.velocity,
      shapedAccResponse: shapedSim.acceleration,
      unshapedAccResponse: unshapedSim.acceleration,
      shapedVibration,
      unshapedVibration,
      returnShapedVibration,
      returnUnshapedVibration,
      totalTime: profile.totalTime,
      extendedTime: extendedTime[extendedTime.length - 1],
      distance,
      vReach: profile.vReach || vMax,
      shaper,
      dt,
      // Arrival time markers for charts
      arrivalTime: profile.totalTime, // When kinematic profile finishes
      shaperArrivalTime: profile.totalTime + (shaper ? shaper.delay : 0), // When shaped command reaches final value
    };

    // Update charts
    this.chartManager.loadProfileData(this.motionData, shaperType !== 'none');

    // Update metrics
    this._updateMetrics();
  }

  _updateMetrics() {
    if (!this.motionData) return;

    const md = this.motionData;

    // Total time
    const totalTimeEl = document.getElementById('metric-time');
    if (totalTimeEl) totalTimeEl.textContent = md.totalTime.toFixed(3) + 's';

    // Peak velocity
    const peakVelEl = document.getElementById('metric-vel');
    if (peakVelEl) peakVelEl.textContent = md.vReach.toFixed(1);

    // Residual vibration comparison
    const settleIdx = Math.round(md.totalTime / md.dt);

    const unshapedResidual = InputShaper.computeResidualVibration(md.unshapedVibration, settleIdx);
    const shapedResidual = InputShaper.computeResidualVibration(md.shapedVibration, settleIdx);

    const vibReducEl = document.getElementById('metric-vib');
    if (vibReducEl) {
      if (unshapedResidual > 0.001) {
        const reduction = ((1 - shapedResidual / unshapedResidual) * 100).toFixed(1);
        vibReducEl.textContent = reduction + '%';
      } else {
        vibReducEl.textContent = 'N/A';
      }
    }

    // Shaper delay
    const delayEl = document.getElementById('metric-delay');
    if (delayEl) {
      if (md.shaper) {
        delayEl.textContent = (md.shaper.delay * 1000).toFixed(1) + 'ms';
      } else {
        delayEl.textContent = '0ms';
      }
    }

    // HUD Updates (Real-time overlay on 3D Viewport)
    // 1. Forward Settling Time
    let shapedSettlingTime = md.totalTime;
    let unshapedSettlingTime = md.totalTime;
    const dt = 0.001; // 1ms resolution for high-speed industrial accuracy
    const tol = 0.005; // 0.5% tolerance (5 μm)
    for (let i = md.time.length - 1; i >= 0; i--) {
      if (Math.abs(md.shapedVibration[i]) > tol) { shapedSettlingTime = md.time[i]; break; }
    }
    for (let i = md.time.length - 1; i >= 0; i--) {
      if (Math.abs(md.unshapedVibration[i]) > tol) { unshapedSettlingTime = md.time[i]; break; }
    }

    // 2. Return Settling Time (Unloaded)
    let returnShapedSettlingTime = md.totalTime;
    let returnUnshapedSettlingTime = md.totalTime;
    for (let i = md.time.length - 1; i >= 0; i--) {
      // Note: md.returnShapedVibration might be shorter than md.time if not padded, but we just use its own length
      const v = md.returnShapedVibration[i] || 0;
      if (Math.abs(v) > tol) { returnShapedSettlingTime = md.time[i]; break; }
    }
    for (let i = md.time.length - 1; i >= 0; i--) {
      const v = md.returnUnshapedVibration[i] || 0;
      if (Math.abs(v) > tol) { returnUnshapedSettlingTime = md.time[i]; break; }
    }

    const hudSettleS = document.getElementById('hud-settling-shaped');
    const hudSettleU = document.getElementById('hud-settling-unshaped');
    const hudVibS = document.getElementById('hud-vib-shaped');
    const hudVibU = document.getElementById('hud-vib-unshaped');
    const hudUphS = document.getElementById('hud-uph-shaped');
    const hudUphU = document.getElementById('hud-uph-unshaped');

    if (hudSettleS) hudSettleS.textContent = shapedSettlingTime.toFixed(3) + 's';
    if (hudSettleU) hudSettleU.textContent = unshapedSettlingTime.toFixed(3) + 's';
    if (hudVibS) hudVibS.textContent = shapedResidual.toFixed(4);
    if (hudVibU) hudVibU.textContent = unshapedResidual.toFixed(4);

    // Calculate UPH assuming Cycle Time = Forward Settling + Return Settling
    const roundTripShaped = shapedSettlingTime + returnShapedSettlingTime;
    const roundTripUnshaped = unshapedSettlingTime + returnUnshapedSettlingTime;
    
    if (hudUphS) hudUphS.textContent = Math.floor(3600 / roundTripShaped).toLocaleString();
    if (hudUphU) hudUphU.textContent = Math.floor(3600 / roundTripUnshaped).toLocaleString();
  }

  // ══════════════════════════════════════
  // ANIMATION CONTROL
  // ══════════════════════════════════════

  _handleStart() {
    if (this.state === 'RUNNING') {
      // Pause
      this.state = 'PAUSED';
      this._updateStatusBadge('PAUSED');
      document.getElementById('btn-start').innerHTML = '▶ Resume';
      return;
    }

    if (this.state === 'PAUSED') {
      // Resume
      this.state = 'RUNNING';
      this._updateStatusBadge('RUNNING');
      document.getElementById('btn-start').innerHTML = '⏸ Pause';
      this.lastFrameTime = performance.now();
      return;
    }

    // Fresh start
    this._computeAndDisplay();
    
    if (this.chartManager) {
      this.chartManager.updateRealtime(0);
    }

    if (!this.motionData || this.motionData.distance < 0.1) return;

    // Build pick & place sequence
    this.sequence = new PickPlaceSequence({
      pickX: this.params.pickX,
      placeX: this.params.placeX,
      jMax: this.params.jMax || 500000,
      startX: this.params.pickX,
      armBaseY: 16.2, // Matches scene.armGroupY
      workSurfaceY: 14.5, // Matches railHeight + 0.5
      objectZ: this.sceneManager ? this.sceneManager.objectZ : 15,
      arm: this.arm,
    });
    this.sequence.setGantryDuration(this.motionData.extendedTime);

    this.simTime = 0;
    this.state = 'RUNNING';
    this.lastFrameTime = performance.now();

    // Auto slow-motion for very fast motions so users can actually see the movement
    const motionTime = this.motionData.totalTime;
    if (motionTime < 0.5) {
      // Motion would be invisible at 1x speed — auto-select 0.1x
      this.simSpeed = 0.1;
      this._setSpeedButtonActive('0.1');
    } else if (motionTime < 1.0) {
      // Motion is fast but watchable at 0.3x
      this.simSpeed = 0.3;
      this._setSpeedButtonActive('0.3');
    }

    // Reset scene — show BOTH robots from the start
    if (this.sceneManager) {
      this.sceneManager.clearTrails();
      this.sceneManager.resetObject();
      this.sceneManager.setCarriagePosition(this.params.pickX);
      // Show ghost robot at same start position for side-by-side comparison
      this.sceneManager.setGhostPosition(this.params.pickX);
      this.sceneManager.showGhost();
      this.sceneManager.hideVibrationIndicators();
    }

    this._updateStatusBadge('RUNNING');
    document.getElementById('btn-start').innerHTML = '⏸ Pause';
    document.getElementById('btn-start').classList.remove('btn-primary');
    document.getElementById('btn-start').classList.add('btn-secondary');
  }

  _handleReset() {
    this.state = 'IDLE';
    this.simTime = 0;

    if (this.sceneManager) {
      this.sceneManager.clearTrails();
      this.sceneManager.resetObject();
      this.sceneManager.setCarriagePosition(this.params.pickX);
      this.sceneManager.setArmAngles(0, Math.PI / 6, -Math.PI / 4);
      this.sceneManager.setGripperOpen(1.0);
      this.sceneManager.setGhostPosition(this.params.pickX);
      this.sceneManager.setGhostArmAngles(0, Math.PI / 6, -Math.PI / 4);
      this.sceneManager.setGhostGripperOpen(1.0);
      this.sceneManager.showGhost();
      this.sceneManager.hideVibrationIndicators();
    }

    this._updateStatusBadge('IDLE');
    this._updateProgress(0, 'Ready');
    document.getElementById('btn-start').innerHTML = '▶ Start Simulation';
    document.getElementById('btn-start').classList.add('btn-primary');
    document.getElementById('btn-start').classList.remove('btn-secondary');
    document.getElementById('elapsed-time').textContent = '0.000s';

    this._computeAndDisplay();
  }

  // ══════════════════════════════════════
  // AI OPTIMIZATION
  // ══════════════════════════════════════
  
  async _handleAIOptimization() {
    if (this.state === 'RUNNING' || this.isOptimizing) return;
    
    this.isOptimizing = true;
    const btnRun = document.getElementById('btn-run-ai');
    const progContainer = document.getElementById('ai-progress-container');
    const progBar = document.getElementById('ai-progress-bar');
    const progText = document.getElementById('ai-progress-text');
    
    btnRun.disabled = true;
    btnRun.style.opacity = '0.5';
    progContainer.style.display = 'block';
    
    this._readParams();
    
    // Prepare environment
    const env = {
      ...this.params,
      distance: Math.abs(this.params.placeX - this.params.pickX),
      arm: this.arm
    };

    const optimizer = new window.AIOptimizer(500); // 500 iterations
    
    try {
      const bestParams = await optimizer.optimize(env, (progress) => {
        const pct = Math.round(progress * 100);
        progBar.style.width = pct + '%';
        progText.textContent = pct + '%';
      });

      const updateSliderAndText = (id, textId, value, decimals) => {
        const el = document.getElementById(id);
        const txt = document.getElementById(textId);
        if (el) el.value = value;
        if (txt) txt.textContent = parseFloat(value).toFixed(decimals) + (id === 'slider-vmax' || id === 'slider-amax' ? (id==='slider-vmax'?' units/s':' units/s²') : (id==='slider-jmax'?' units/s³':''));
      };

      updateSliderAndText('slider-vmax', 'val-vmax', bestParams.vMax, 1);
      updateSliderAndText('slider-amax', 'val-amax', bestParams.aMax, 1);
      updateSliderAndText('slider-beta', 'val-beta', bestParams.beta, 3);
      updateSliderAndText('slider-gamma', 'val-gamma', bestParams.gamma, 3);
      
      if (document.getElementById('slider-jmax')) {
        updateSliderAndText('slider-jmax', 'val-jmax', bestParams.jMax, 0);
      }

      // Trigger standard re-compute
      this._readParams();
      this._computeAndDisplay();
      
      // Store optimizer for CSV export
      this.lastOptimizer = optimizer;

      // Flash success
      btnRun.textContent = '✅ 최적화 완료!';
      setTimeout(() => {
        btnRun.textContent = '✨ AI 자동 튜닝';
      }, 4000);
      
    } catch (e) {
      console.error(e);
      btnRun.textContent = '❌ Error: ' + e.message;
      btnRun.title = e.stack;
      setTimeout(() => btnRun.textContent = '✨ Run AI Optimization', 6000);
    } finally {
      this.isOptimizing = false;
      btnRun.disabled = false;
      btnRun.style.opacity = '1';
      setTimeout(() => { progContainer.style.display = 'none'; }, 2000);
    }
  }

  // ══════════════════════════════════════
  // 3-PROFILE COMPARISON
  // ══════════════════════════════════════

  _handleCompare() {
    this._readParams();
    const dt = 0.001;
    const distance = Math.abs(this.params.placeX - this.params.pickX);
    const fn = this.params.fn;
    const zeta = this.params.zeta;
    const payloadLoaded = this.params.payloadLoaded;

    const scenarios = [
      { name: 'Trapezoidal', desc: '기준 — 저크 무제한', color: '#ef4444', profileType: 'trapezoidal', shaperType: 'none' },
      { name: 'AS-Curve', desc: '저크 제한', color: '#f59e0b', profileType: 'ascurve', shaperType: 'none' },
      { name: 'AS-Curve + ZVD', desc: '인풋쉐이핑 적용', color: '#2563eb', profileType: 'ascurve', shaperType: 'ZVD' },
    ];

    const sameResults = this._runProfileComparison(scenarios, distance, fn, zeta, payloadLoaded, dt,
      { vMax: this.params.vMax, aMax: this.params.aMax, beta: this.params.beta, gamma: this.params.gamma, jMax: this.params.jMax });

    const container = document.getElementById('compare-results');
    container.innerHTML = this._buildCompareTable('Part A. 동일 조건 비교 (변인 통제)',
      'V=' + this.params.vMax + ', A=' + this.params.aMax + ' 동일 파라미터에서 프로파일 방식만 변경', sameResults, false) +
      '<div id="compare-partB" style="margin-top:32px; padding:24px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; text-align:center;">' +
        '<div style="color:#6b7280; font-size:13px;">⏳ Part B: 각 프로파일별 AI 최적화 진행 중...</div>' +
        '<div style="height:6px; background:#e5e7eb; border-radius:3px; overflow:hidden; margin-top:12px; max-width:400px; margin-left:auto; margin-right:auto;">' +
          '<div id="compare-ai-progress" style="height:100%; width:0%; background:#f59e0b; transition:width 0.2s;"></div>' +
        '</div>' +
        '<div id="compare-ai-pct" style="font-size:11px; color:#9ca3af; margin-top:4px;">0%</div>' +
      '</div>' +
      '<div style="margin-top:16px; font-size:11px; color:#9ca3af;">조건: 거리=' + distance + 'mm, fn=' + fn + 'Hz, Payload=' + (payloadLoaded ? 'ON' : 'OFF') + ', 정착 기준=±5μm</div>' +
      '<div style="margin-top:16px; text-align:right;">' +
        '<button id="btn-csv-compare" style="padding:8px 16px; background:#2563eb; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;" disabled>📥 CSV 다운로드 (비교 완료 후)</button>' +
      '</div>';

    const modal = document.getElementById('compare-modal');
    modal.style.display = 'flex';
    modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };

    this._runAICompare(scenarios, distance, fn, zeta, payloadLoaded, dt, sameResults);
  }

  _runProfileComparison(scenarios, distance, fn, zeta, payloadLoaded, dt, params) {
    const results = [];
    for (const sc of scenarios) {
      try {
        let profile;
        if (sc.profileType === 'trapezoidal') {
          profile = new window.TrapezoidalProfile({ vMax: params.vMax, aMax: params.aMax, distance });
        } else {
          profile = new window.ASCurveProfile({ vMax: params.vMax, aMax: params.aMax, beta: params.beta, gamma: params.gamma, distance, dt });
        }
        const pos = profile.getSamples(dt).map(s => s.position);
        const motionTime = profile.totalTime;
        const padded = [...pos];
        for (let p = 0; p < 2000; p++) padded.push(distance);

        let shaped = padded;
        if (sc.shaperType !== 'none') {
          const shaper = window.InputShaper.computeZVD(fn, zeta);
          shaped = window.InputShaper.convolve(padded, dt, shaper);
        }

        const sim = window.InputShaper.simulateResponse(shaped, dt, fn, zeta, { payloadLoaded });

        // Use computeVibration — same method as HUD for consistency
        const vibration = window.InputShaper.computeVibration(sim.position, shaped);

        // Peak residual vibration (same as HUD's computeResidualVibration)
        const settleIdx = Math.round(motionTime / dt);
        let peakVib = 0;
        for (let i = settleIdx; i < vibration.length; i++) {
          const v = Math.abs(vibration[i]);
          if (v > peakVib) peakVib = v;
        }

        // Forward settling time — scan backwards for last vibration > tolerance (same as HUD)
        const tol = 0.005;
        let fwdSettlingTime = motionTime;
        for (let i = vibration.length - 1; i >= 0; i--) {
          if (Math.abs(vibration[i]) > tol) { fwdSettlingTime = i * dt; break; }
        }

        // Return trip (ALWAYS unloaded, matching HUD logic)
        const returnSim = window.InputShaper.simulateResponse(shaped, dt, fn, zeta, { payloadLoaded: false });
        const returnVib = window.InputShaper.computeVibration(returnSim.position, shaped);
        let retSettlingTime = motionTime;
        for (let i = returnVib.length - 1; i >= 0; i--) {
          if (Math.abs(returnVib[i]) > tol) { retSettlingTime = i * dt; break; }
        }

        // UPH = 3600 / (Forward + Return) — matches HUD round-trip calculation
        const roundTrip = fwdSettlingTime + retSettlingTime;
        const uph = roundTrip > 0 ? Math.floor(3600 / roundTrip) : 99999;
        results.push({ ...sc, motionTime, peakVib, settlingTime: fwdSettlingTime, uph, usedParams: { ...params } });
      } catch (e) {
        results.push({ ...sc, motionTime: 0, peakVib: 0, settlingTime: 0, uph: 0, usedParams: { ...params }, error: e.message });
      }
    }
    return results;
  }

  async _runAICompare(scenarios, distance, fn, zeta, payloadLoaded, dt, sameResults) {
    const aiResults = [];
    const progBar = document.getElementById('compare-ai-progress');
    const progPct = document.getElementById('compare-ai-pct');
    let totalDone = 0;

    for (let si = 0; si < scenarios.length; si++) {
      const sc = scenarios[si];
      const env = {
        distance, fn, zeta, payloadLoaded,
        profileType: sc.profileType, shaperType: sc.shaperType,
        vMax: this.params.vMax, aMax: this.params.aMax,
        beta: this.params.beta, gamma: this.params.gamma, jMax: this.params.jMax,
      };

      const optimizer = new window.AIOptimizer(200);
      try {
        const best = await optimizer.optimize(env, (progress) => {
          const overall = ((totalDone + progress) / 3) * 100;
          if (progBar) progBar.style.width = overall.toFixed(0) + '%';
          if (progPct) progPct.textContent = overall.toFixed(0) + '%';
        });
        totalDone++;
        const optP = { vMax: best.vMax, aMax: best.aMax, beta: best.beta, gamma: best.gamma, jMax: best.jMax };
        const res = this._runProfileComparison([sc], distance, fn, zeta, payloadLoaded, dt, optP)[0];
        res.optParams = optP;
        aiResults.push(res);
      } catch (e) {
        totalDone++;
        aiResults.push({ ...sc, motionTime: 0, peakVib: 0, settlingTime: 0, uph: 0, error: e.message });
      }
    }

    const partB = document.getElementById('compare-partB');
    if (partB) {
      partB.style.textAlign = 'left';
      partB.style.background = '#fff';
      partB.style.border = 'none';
      partB.style.padding = '0';
      partB.innerHTML = this._buildCompareTable('Part B. 개별 AI 최적화 비교 (각 기술의 최대 성능)',
        'AI PSO가 각 프로파일의 최적 파라미터를 탐색한 결과', aiResults, true);
    }

    this._compareData = { sameResults, aiResults, distance, fn, zeta, payloadLoaded };
    const csvBtn = document.getElementById('btn-csv-compare');
    if (csvBtn) {
      csvBtn.disabled = false;
      csvBtn.textContent = '📥 CSV 다운로드';
      csvBtn.onclick = () => this._exportCompareCSV();
    }
  }

  _buildCompareTable(title, subtitle, results, showOptParams) {
    const baseline = results[0];
    const fmtV = v => v < 0.001 ? v.toFixed(6) : v.toFixed(3);
    const pct = (val, base) => {
      if (!base) return '-';
      const p = ((val - base) / base * 100);
      return (p > 0 ? '+' : '') + p.toFixed(1) + '%';
    };
    const uphPct = (val, base) => {
      if (!base) return '-';
      return '+' + ((val - base) / base * 100).toFixed(0) + '%';
    };

    let optRow = '';
    if (showOptParams) {
      optRow = '<tr style="border-bottom:1px solid #f3f4f6; background:#f8fafc;">' +
        '<td style="padding:8px; font-weight:500; color:#6b7280; font-size:11px;">최적 파라미터</td>' +
        results.map(r => {
          const p = r.optParams;
          return '<td style="text-align:center; padding:8px; font-size:10px; font-family:\'JetBrains Mono\',monospace; color:#6b7280;">' +
            (p ? 'V=' + p.vMax.toFixed(0) + ' A=' + p.aMax.toFixed(0) + '<br>β=' + p.beta.toFixed(2) + ' γ=' + p.gamma.toFixed(2) : '-') +
          '</td>';
        }).join('') + '</tr>';
    }

    return '<div style="margin-bottom:8px;">' +
      '<h3 style="font-size:15px; font-weight:700; color:#1f2937; margin-bottom:4px;">' + title + '</h3>' +
      '<p style="font-size:11px; color:#9ca3af;">' + subtitle + '</p></div>' +
      '<table style="width:100%; border-collapse:collapse; font-family:\'Inter\',sans-serif; font-size:13px;">' +
      '<thead><tr style="border-bottom:2px solid #e5e7eb;">' +
        '<th style="text-align:left; padding:10px 8px; color:#6b7280; font-weight:600; width:140px;">지표</th>' +
        results.map(r => '<th style="text-align:center; padding:10px 8px;"><div style="font-weight:700; color:' + r.color + '; font-size:13px;">' + r.name + '</div><div style="font-size:10px; color:#9ca3af; margin-top:2px;">' + r.desc + '</div></th>').join('') +
      '</tr></thead><tbody>' +
      optRow +
      '<tr style="border-bottom:1px solid #f3f4f6;"><td style="padding:8px; font-weight:500; color:#374151;">이동 시간</td>' +
        results.map(r => '<td style="text-align:center; padding:8px; font-family:\'JetBrains Mono\',monospace;">' + r.motionTime.toFixed(4) + 's</td>').join('') + '</tr>' +
      '<tr style="border-bottom:1px solid #f3f4f6; background:#fafafa;"><td style="padding:8px; font-weight:600; color:#1f2937;">🔴 잔류 진동</td>' +
        results.map(r => '<td style="text-align:center; padding:8px;"><span style="font-family:\'JetBrains Mono\',monospace; font-weight:600; color:' + (r.peakVib < 0.01 ? '#16a34a' : r.peakVib < 1 ? '#f59e0b' : '#ef4444') + ';">' + fmtV(r.peakVib) + ' mm</span>' +
          (r !== baseline ? '<br><span style="font-size:11px; color:' + (r.peakVib < baseline.peakVib ? '#16a34a' : '#ef4444') + ';">' + pct(r.peakVib, baseline.peakVib) + '</span>' : '<br><span style="font-size:11px; color:#9ca3af;">기준</span>') + '</td>').join('') + '</tr>' +
      '<tr style="border-bottom:1px solid #f3f4f6;"><td style="padding:8px; font-weight:600; color:#1f2937;">⏱ 정착 시간</td>' +
        results.map(r => '<td style="text-align:center; padding:8px;"><span style="font-family:\'JetBrains Mono\',monospace; font-weight:600;">' + r.settlingTime.toFixed(3) + 's</span>' +
          (r !== baseline ? '<br><span style="font-size:11px; color:' + (r.settlingTime < baseline.settlingTime ? '#16a34a' : '#ef4444') + ';">' + pct(r.settlingTime, baseline.settlingTime) + '</span>' : '<br><span style="font-size:11px; color:#9ca3af;">기준</span>') + '</td>').join('') + '</tr>' +
      '<tr style="border-bottom:2px solid #e5e7eb; background:#f0f7ff;"><td style="padding:12px 8px; font-weight:700; color:#1f2937; font-size:14px;">📦 UPH</td>' +
        results.map(r => '<td style="text-align:center; padding:12px 8px;"><span style="font-family:\'JetBrains Mono\',monospace; font-weight:800; font-size:18px; color:' + r.color + ';">' + r.uph.toLocaleString() + '</span> <span style="font-size:11px; color:#6b7280;">/hr</span>' +
          (r !== baseline ? '<br><span style="font-size:12px; font-weight:700; color:#16a34a;">' + uphPct(r.uph, baseline.uph) + '</span>' : '<br><span style="font-size:11px; color:#9ca3af;">기준</span>') + '</td>').join('') + '</tr>' +
      '</tbody></table>';
  }

  _exportCompareCSV() {
    if (!this._compareData) return;
    const { sameResults, aiResults, distance, fn, zeta, payloadLoaded } = this._compareData;
    const h = ['비교유형,프로파일,Vmax,Amax,beta,gamma,이동시간(s),잔류진동(mm),정착시간(s),UPH'];
    const rows = [];
    for (const r of sameResults) {
      const p = r.usedParams || {};
      rows.push(['동일조건', r.name, p.vMax, p.aMax, p.beta, p.gamma, r.motionTime.toFixed(4), r.peakVib.toFixed(6), r.settlingTime.toFixed(3), r.uph].join(','));
    }
    for (const r of aiResults) {
      const p = r.optParams || r.usedParams || {};
      rows.push(['AI최적화', r.name, p.vMax?.toFixed(1)||'', p.aMax?.toFixed(1)||'', p.beta?.toFixed(3)||'', p.gamma?.toFixed(3)||'', r.motionTime.toFixed(4), r.peakVib.toFixed(6), r.settlingTime.toFixed(3), r.uph].join(','));
    }
    const csv = '\uFEFF' + h.join('\n') + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '3profile_compare_d' + distance + '_fn' + fn + '.csv';
    a.click();
  }

  // ══════════════════════════════════════
  // RENDER & ANIMATION LOOP
  // ══════════════════════════════════════

  _setSpeedButtonActive(speedValue) {
    document.querySelectorAll('.speed-btn').forEach(b => {
      const isTarget = b.dataset.speed === speedValue;
      b.classList.toggle('active', isTarget);
      b.style.background = isTarget ? 'var(--accent-cyan)' : 'var(--bg-secondary)';
      b.style.color = isTarget ? '#fff' : 'var(--text-secondary)';
      b.style.borderColor = isTarget ? 'var(--accent-cyan)' : 'var(--border-glass)';
      b.style.fontWeight = isTarget ? '600' : 'normal';
    });
  }

  _renderLoop() {
    this.animFrameId = requestAnimationFrame(() => this._renderLoop());

    const now = performance.now();

    if (this.state === 'RUNNING' && this.motionData && this.sequence) {
      const deltaTime = (now - this.lastFrameTime) / 1000;
      this.lastFrameTime = now;

      // Advance simulation time
      this.simTime += deltaTime * this.simSpeed;

      const totalSeqTime = this.sequence.totalTime;

      if (this.simTime >= totalSeqTime) {
        this.simTime = totalSeqTime;
        this.state = 'COMPLETE';
        this._updateStatusBadge('COMPLETE');
        document.getElementById('btn-start').innerHTML = '▶ Start Simulation';
        document.getElementById('btn-start').classList.add('btn-primary');
        document.getElementById('btn-start').classList.remove('btn-secondary');
        
        if (this.chartManager) {
           this.chartManager.drawFull();
        }
      }

      // Get sequence state
      const seqState = this.sequence.getState(this.simTime);

      // Update arm
      if (this.sceneManager) {
        this.sceneManager.setArmAngles(seqState.theta1, seqState.theta2, seqState.theta3);
        this.sceneManager.setGripperOpen(seqState.gripperOpen);
        this.sceneManager.setObjectAttached(seqState.objectAttached);
        // Keep Ghost arm synchronized with Main arm
        this.sceneManager.setGhostArmAngles(seqState.theta1, seqState.theta2, seqState.theta3);
        this.sceneManager.setGhostGripperOpen(seqState.gripperOpen);
      }

      // Handle gantry motion during GANTRY_MOVE phase
      if (seqState.gantryMoving) {
        const gantryStartTime = this.sequence.getGantryStartTime();
        const gantryLocalTime = this.simTime - gantryStartTime;
        const md = this.motionData;

        // Get index into motion data
        const idx = Math.min(
          Math.floor(gantryLocalTime / md.dt),
          md.shapedResponse.length - 1
        );
        
        // Update charts in real-time
        if (this.chartManager) {
          const progress = gantryLocalTime / md.extendedTime;
          this.chartManager.updateRealtime(progress);
        }

        if (idx >= 0 && idx < md.shapedResponse.length) {
          const shapedX = this.params.pickX + md.shapedResponse[idx];
          const unshapedX = this.params.pickX + md.unshapedResponse[idx];
          
          const shapedVib = md.shapedVibration[idx];
          const unshapedVib = md.unshapedVibration[idx];

          if (this.sceneManager) {
            this.sceneManager.setCarriagePosition(shapedX);
            this.sceneManager.setGhostPosition(unshapedX);
            this.sceneManager.showGhost();
            this.sceneManager.updateVibrationIndicators(shapedVib, unshapedVib);
            
            const rTimeS = document.getElementById('hud-realtime-shaped');
            const rTimeU = document.getElementById('hud-realtime-unshaped');
            if (rTimeS) rTimeS.textContent = shapedVib.toFixed(4);
            if (rTimeU) rTimeU.textContent = unshapedVib.toFixed(4);
          }
        }
      } else if (seqState.phase === 'DONE' || seqState.phaseIndex > 5) {
        // After gantry move, park both robots at their final positions
        if (this.sceneManager) {
          this.sceneManager.setCarriagePosition(this.params.placeX);
          // Keep ghost visible at its final unshaped position
          if (this.motionData) {
            const lastIdx = this.motionData.unshapedResponse.length - 1;
            const finalUnshaped = this.params.pickX + this.motionData.unshapedResponse[lastIdx];
            this.sceneManager.setGhostPosition(finalUnshaped);
          }
          this.sceneManager.hideVibrationIndicators();
          
          const rTimeS = document.getElementById('hud-realtime-shaped');
          const rTimeU = document.getElementById('hud-realtime-unshaped');
          if (rTimeS) rTimeS.textContent = '0.0000';
          if (rTimeU) rTimeU.textContent = '0.0000';
        }
      }

      // Handle object placement after release
      if (seqState.phase === 'GRIP_OPEN' || seqState.phase === 'ARM_UP_FINAL' || seqState.phase === 'DONE') {
        if (!seqState.objectAttached && this.sceneManager) {
          this.sceneManager.setObjectAttached(false);
          this.sceneManager.setObjectPosition(this.params.placeX, this.sceneManager.railHeight + 0.5, this.sceneManager.objectZ);
        }
      }

      // Update progress
      const progress = totalSeqTime > 0 ? (this.simTime / totalSeqTime) * 100 : 0;
      this._updateProgress(progress, seqState.phase);
      document.getElementById('elapsed-time').textContent = this.simTime.toFixed(3) + 's';
    }

    // Always render the 3D scene
    if (this.sceneManager) {
      this.sceneManager.render();
    }
  }

  // ══════════════════════════════════════
  // UI UPDATES
  // ══════════════════════════════════════

  _updateStatusBadge(status) {
    const badge = document.getElementById('status-badge');
    if (!badge) return;

    badge.classList.remove('running', 'complete');

    switch (status) {
      case 'IDLE':
        badge.innerHTML = '<span class="dot"></span> IDLE';
        break;
      case 'RUNNING':
        badge.classList.add('running');
        badge.innerHTML = '<span class="dot"></span> RUNNING';
        break;
      case 'PAUSED':
        badge.innerHTML = '<span class="dot"></span> PAUSED';
        break;
      case 'COMPLETE':
        badge.classList.add('complete');
        badge.innerHTML = '<span class="dot"></span> COMPLETE';
        break;
    }
  }

  _updateProgress(percent, phaseName) {
    const fill = document.getElementById('progress-fill');
    if (fill) fill.style.width = Math.min(100, percent) + '%';

    const label = document.getElementById('phase-name');
    if (label) {
      const phaseNames = {
        'READY': '🔄 Ready',
        'ARM_DOWN_APPROACH': '🔽 Arm Approaching',
        'ARM_DOWN_PICK': '🔽 Reaching Object',
        'GRIP_CLOSE': '✊ Gripping',
        'ARM_UP_WITH_OBJ': '🔼 Lifting Object',
        'GANTRY_MOVE': '➡️ Gantry Moving (AS-Curve + Input Shaping)',
        'ARM_DOWN_APPROACH2': '🔽 Arm Approaching',
        'ARM_DOWN_PLACE': '🔽 Placing Object',
        'GRIP_OPEN': '🖐 Releasing',
        'ARM_UP_FINAL': '🔼 Arm Returning',
        'DONE': '✅ Complete',
      };
      label.textContent = phaseNames[phaseName] || phaseName;
    }

    const pctLabel = document.getElementById('progress-pct');
    if (pctLabel) pctLabel.textContent = Math.min(100, percent).toFixed(0) + '%';
  }
}

// Initialize app when scripts are loaded
window.addEventListener('load', () => {
  window.app = new App();
});
