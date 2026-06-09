/**
 * Parameter Sweep Module
 *
 * Batch parameter sweep experiments with heatmap visualization.
 * Runs a grid of (X × Y) simulations, varying two user-chosen parameters,
 * and renders the result metric as an interactive heatmap.
 *
 * Dependencies (window globals):
 *   - TrapezoidalProfile, ASCurveProfile  (motion-profile.js)
 *   - InputShaper                          (input-shaping.js)
 */

class SweepManager {

  // ════════════════════════════════════════
  // CONSTRUCTOR
  // ════════════════════════════════════════

  constructor(containerId) {
    this.containerId = containerId;
    this.container = null;

    /** @type {{ xParam: string, yParam: string, xValues: number[], yValues: number[], data: number[][], details: Object[][] }} */
    this.results = null;

    /** Currently selected metric key */
    this.metric = 'uph';

    /** Heatmap canvas and 2D context */
    this.canvas = null;
    this.ctx = null;

    /** Layout constants for heatmap rendering */
    this.hm = {
      padLeft: 80,
      padRight: 90,
      padTop: 50,
      padBottom: 60,
      legendWidth: 20,
      legendGap: 14,
    };

    /** Highlighted cell index [col, row] or null */
    this.highlightCell = null;
  }

  // ════════════════════════════════════════
  // PARAMETER DEFINITIONS
  // ════════════════════════════════════════

  /** All sweep-able parameters with labels and sensible defaults */
  static get PARAMS() {
    return {
      vMax:     { label: 'Vmax (최대속도)',      unit: 'mm/s',   min: 100,   max: 5000,  steps: 10, default: 1000 },
      aMax:     { label: 'Amax (최대가속도)',     unit: 'mm/s²',  min: 1000,  max: 80000, steps: 10, default: 20000 },
      distance: { label: '이동거리',             unit: 'mm',     min: 5,     max: 200,   steps: 10, default: 50 },
      fn:       { label: 'fn (고유진동수)',       unit: 'Hz',     min: 2,     max: 50,    steps: 10, default: 10 },
      zeta:     { label: 'ζ (감쇠비)',           unit: '',       min: 0.01,  max: 0.3,   steps: 10, default: 0.05 },
      beta:     { label: 'β (부드러움)',         unit: '',       min: 0.05,  max: 1.0,   steps: 10, default: 0.5 },
      gamma:    { label: 'γ (비대칭성)',         unit: '',       min: 0.01,  max: 2.0,   steps: 10, default: 0.2 },
    };
  }

  /** Available result metrics */
  static get METRICS() {
    return {
      uph:          { label: 'UPH (시간당 생산량)', unit: 'pcs/h', higherBetter: true },
      settlingTime: { label: '정착 시간',          unit: 's',     higherBetter: false },
      peakVib:      { label: '최대 잔류진동',       unit: 'mm',    higherBetter: false },
    };
  }

  // ════════════════════════════════════════
  // UI CONSTRUCTION
  // ════════════════════════════════════════

  init() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) {
      console.error('[SweepManager] Container not found:', this.containerId);
      return;
    }
    this._buildUI();
    this._bindEvents();
  }

  _buildUI() {
    const P = SweepManager.PARAMS;
    const paramOpts = Object.keys(P).map(k => `<option value="${k}">${P[k].label}</option>`).join('');

    this.container.innerHTML = `
      <div class="sweep-root" style="
        font-family:'Inter',-apple-system,sans-serif; color:#1f2937;
        background:#f8fafc; border:1px solid #d1d5db; border-radius:10px;
        padding:24px; display:flex; flex-direction:column; gap:20px;
      ">
        <!-- Title -->
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:18px;">🔬</span>
          <h2 style="font-size:14px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:#1f2937; margin:0;">
            파라미터 스윕 분석
          </h2>
        </div>

        <!-- Config Row -->
        <div class="sweep-config" style="
          display:grid; grid-template-columns:1fr 1fr; gap:16px;
          background:#ffffff; border:1px solid #e5e7eb; border-radius:8px; padding:16px;
        ">
          <!-- X Axis -->
          <fieldset style="border:1px solid #e5e7eb; border-radius:6px; padding:12px 14px; margin:0;">
            <legend style="font-size:11px; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:0.08em; padding:0 6px;">X축 파라미터</legend>
            <select id="sweep-x-param" class="sweep-select" style="${this._selectStyle()}">${paramOpts}</select>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-top:10px;">
              <label class="sweep-input-group">
                <span style="${this._microLabel()}">Min</span>
                <input id="sweep-x-min" type="number" style="${this._inputStyle()}" value="${P.vMax.min}">
              </label>
              <label class="sweep-input-group">
                <span style="${this._microLabel()}">Max</span>
                <input id="sweep-x-max" type="number" style="${this._inputStyle()}" value="${P.vMax.max}">
              </label>
              <label class="sweep-input-group">
                <span style="${this._microLabel()}">Steps</span>
                <input id="sweep-x-steps" type="number" min="2" max="50" style="${this._inputStyle()}" value="${P.vMax.steps}">
              </label>
            </div>
          </fieldset>

          <!-- Y Axis -->
          <fieldset style="border:1px solid #e5e7eb; border-radius:6px; padding:12px 14px; margin:0;">
            <legend style="font-size:11px; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:0.08em; padding:0 6px;">Y축 파라미터</legend>
            <select id="sweep-y-param" class="sweep-select" style="${this._selectStyle()}">${paramOpts}</select>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-top:10px;">
              <label class="sweep-input-group">
                <span style="${this._microLabel()}">Min</span>
                <input id="sweep-y-min" type="number" style="${this._inputStyle()}" value="${P.aMax.min}">
              </label>
              <label class="sweep-input-group">
                <span style="${this._microLabel()}">Max</span>
                <input id="sweep-y-max" type="number" style="${this._inputStyle()}" value="${P.aMax.max}">
              </label>
              <label class="sweep-input-group">
                <span style="${this._microLabel()}">Steps</span>
                <input id="sweep-y-steps" type="number" min="2" max="50" style="${this._inputStyle()}" value="${P.aMax.steps}">
              </label>
            </div>
          </fieldset>
        </div>

        <!-- Dropdowns Row -->
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">
          <label style="display:flex; flex-direction:column; gap:4px;">
            <span style="${this._microLabel()}">프로파일 타입</span>
            <select id="sweep-profile" style="${this._selectStyle()}">
              <option value="trapezoidal">Trapezoidal</option>
              <option value="ascurve" selected>AS-Curve</option>
            </select>
          </label>
          <label style="display:flex; flex-direction:column; gap:4px;">
            <span style="${this._microLabel()}">인풋쉐이퍼</span>
            <select id="sweep-shaper" style="${this._selectStyle()}">
              <option value="none">없음 (None)</option>
              <option value="ZV">ZV</option>
              <option value="ZVD" selected>ZVD</option>
              <option value="EI">EI</option>
            </select>
          </label>
          <label style="display:flex; flex-direction:column; gap:4px;">
            <span style="${this._microLabel()}">결과 지표</span>
            <select id="sweep-metric" style="${this._selectStyle()}">
              <option value="uph" selected>UPH (시간당 생산량)</option>
              <option value="settlingTime">정착 시간 (s)</option>
              <option value="peakVib">최대 잔류진동 (mm)</option>
            </select>
          </label>
        </div>

        <!-- Fixed Params -->
        <div id="sweep-fixed" style="
          background:#ffffff; border:1px solid #e5e7eb; border-radius:8px; padding:12px 16px;
          display:flex; flex-wrap:wrap; gap:12px; align-items:center;
        ">
          <span style="font-size:11px; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:0.06em;">고정 파라미터:</span>
        </div>

        <!-- Run Button + Progress -->
        <div style="display:flex; align-items:center; gap:16px;">
          <button id="sweep-run" style="
            padding:10px 28px; background:#2563eb; color:#fff; border:1px solid #2563eb;
            border-radius:6px; font-size:13px; font-weight:600; cursor:pointer;
            letter-spacing:0.04em; transition:all 0.15s ease;
          ">▶ 실행</button>
          <div style="flex:1; display:flex; flex-direction:column; gap:4px;">
            <div id="sweep-progress-bar" style="
              height:6px; background:#e5e7eb; border-radius:3px; overflow:hidden;
            ">
              <div id="sweep-progress-fill" style="height:100%; width:0%; background:#2563eb; transition:width 0.2s ease;"></div>
            </div>
            <span id="sweep-progress-text" style="font-size:11px; color:#9ca3af;">준비 완료</span>
          </div>
        </div>

        <!-- Heatmap Canvas -->
        <div style="background:#ffffff; border:1px solid #e5e7eb; border-radius:8px; padding:16px; position:relative;">
          <canvas id="sweep-heatmap" width="760" height="500" style="width:100%; cursor:crosshair;"></canvas>
        </div>

        <!-- Detail Info -->
        <div id="sweep-detail" style="
          background:#ffffff; border:1px solid #e5e7eb; border-radius:8px; padding:16px;
          font-family:'JetBrains Mono',monospace; font-size:12px; color:#374151;
          white-space:pre-wrap; min-height:40px; display:none;
        "></div>

        <!-- Stats + CSV -->
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div id="sweep-stats" style="font-size:12px; color:#6b7280;"></div>
          <button id="sweep-csv" style="
            padding:8px 18px; background:#16a34a; color:#fff; border:none; border-radius:6px;
            font-size:12px; font-weight:600; cursor:pointer; display:none;
          ">📥 CSV 다운로드</button>
        </div>
      </div>
    `;

    this.canvas = document.getElementById('sweep-heatmap');
    this.ctx = this.canvas.getContext('2d');

    // Set default Y dropdown to aMax
    const ySelect = document.getElementById('sweep-y-param');
    if (ySelect) ySelect.value = 'aMax';
    this._syncAxisDefaults('x');
    this._syncAxisDefaults('y');
    this._updateFixedParams();
  }

  // ── Style helpers ──────────────────────

  _selectStyle() {
    return `width:100%; padding:8px 10px; background:#fff; border:1px solid #d1d5db;
      border-radius:4px; font-size:12px; color:#1f2937; font-family:inherit;
      outline:none; cursor:pointer;`;
  }

  _inputStyle() {
    return `width:100%; padding:6px 8px; background:#fff; border:1px solid #d1d5db;
      border-radius:4px; font-family:'JetBrains Mono',monospace; font-size:12px;
      color:#1f2937; text-align:right; outline:none;`;
  }

  _microLabel() {
    return `font-size:10px; color:#9ca3af; font-weight:500; text-transform:uppercase; letter-spacing:0.06em;`;
  }

  // ════════════════════════════════════════
  // EVENT BINDING
  // ════════════════════════════════════════

  _bindEvents() {
    // Axis parameter change → sync min/max/steps defaults
    document.getElementById('sweep-x-param').addEventListener('change', () => {
      this._syncAxisDefaults('x');
      this._updateFixedParams();
    });
    document.getElementById('sweep-y-param').addEventListener('change', () => {
      this._syncAxisDefaults('y');
      this._updateFixedParams();
    });

    // Run
    document.getElementById('sweep-run').addEventListener('click', () => this.runSweep());

    // CSV
    document.getElementById('sweep-csv').addEventListener('click', () => this.exportCSV());

    // Metric change
    document.getElementById('sweep-metric').addEventListener('change', () => {
      this.metric = document.getElementById('sweep-metric').value;
      if (this.results) this.renderHeatmap();
    });

    // Canvas click → show detail
    this.canvas.addEventListener('click', (e) => this._handleCanvasClick(e));

    // Canvas hover tooltip
    this.canvas.addEventListener('mousemove', (e) => this._handleCanvasHover(e));
    this.canvas.addEventListener('mouseleave', () => {
      this.highlightCell = null;
      if (this.results) this.renderHeatmap();
    });
  }

  /** Sync min/max/steps inputs to match the selected parameter defaults */
  _syncAxisDefaults(axis) {
    const paramKey = document.getElementById(`sweep-${axis}-param`).value;
    const P = SweepManager.PARAMS[paramKey];
    document.getElementById(`sweep-${axis}-min`).value = P.min;
    document.getElementById(`sweep-${axis}-max`).value = P.max;
    document.getElementById(`sweep-${axis}-steps`).value = P.steps;
  }

  /** Rebuild the fixed-parameters display showing non-swept parameters with editable values */
  _updateFixedParams() {
    const xKey = document.getElementById('sweep-x-param').value;
    const yKey = document.getElementById('sweep-y-param').value;
    const fixedDiv = document.getElementById('sweep-fixed');
    const P = SweepManager.PARAMS;

    let html = `<span style="font-size:11px; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:0.06em;">고정 파라미터:</span>`;

    for (const [k, def] of Object.entries(P)) {
      if (k === xKey || k === yKey) continue;
      html += `
        <label style="display:flex; align-items:center; gap:4px; font-size:12px; color:#374151;">
          ${def.label}
          <input id="sweep-fixed-${k}" type="number" value="${def.default}" step="any"
            style="width:72px; padding:4px 6px; border:1px solid #d1d5db; border-radius:4px;
              font-family:'JetBrains Mono',monospace; font-size:11px; text-align:right; outline:none;">
          <span style="font-size:10px; color:#9ca3af;">${def.unit}</span>
        </label>`;
    }
    fixedDiv.innerHTML = html;
  }

  // ════════════════════════════════════════
  // SWEEP EXECUTION
  // ════════════════════════════════════════

  async runSweep() {
    const btnRun = document.getElementById('sweep-run');
    const fill = document.getElementById('sweep-progress-fill');
    const text = document.getElementById('sweep-progress-text');

    // Read configuration
    const xParam = document.getElementById('sweep-x-param').value;
    const yParam = document.getElementById('sweep-y-param').value;
    const xMin = parseFloat(document.getElementById('sweep-x-min').value);
    const xMax = parseFloat(document.getElementById('sweep-x-max').value);
    const xSteps = parseInt(document.getElementById('sweep-x-steps').value, 10);
    const yMin = parseFloat(document.getElementById('sweep-y-min').value);
    const yMax = parseFloat(document.getElementById('sweep-y-max').value);
    const ySteps = parseInt(document.getElementById('sweep-y-steps').value, 10);
    const profileType = document.getElementById('sweep-profile').value;
    const shaperType = document.getElementById('sweep-shaper').value;
    this.metric = document.getElementById('sweep-metric').value;

    // Validate
    if (xParam === yParam) {
      alert('X축과 Y축에 서로 다른 파라미터를 선택하세요.');
      return;
    }
    if (xSteps < 2 || ySteps < 2 || xMin >= xMax || yMin >= yMax) {
      alert('범위 및 스텝 수를 확인하세요. (Min < Max, Steps ≥ 2)');
      return;
    }

    // Build axis value arrays
    const xValues = this._linspace(xMin, xMax, xSteps);
    const yValues = this._linspace(yMin, yMax, ySteps);

    // Read fixed params
    const P = SweepManager.PARAMS;
    const fixedVals = {};
    for (const k of Object.keys(P)) {
      if (k === xParam || k === yParam) continue;
      const el = document.getElementById(`sweep-fixed-${k}`);
      fixedVals[k] = el ? parseFloat(el.value) : P[k].default;
    }

    // Disable button
    btnRun.disabled = true;
    btnRun.style.opacity = '0.5';
    btnRun.textContent = '⏳ 실행 중…';

    const total = xSteps * ySteps;
    const data = [];
    const details = [];
    let done = 0;

    for (let yi = 0; yi < ySteps; yi++) {
      const row = [];
      const detailRow = [];

      for (let xi = 0; xi < xSteps; xi++) {
        // Merge params
        const params = { ...fixedVals };
        params[xParam] = xValues[xi];
        params[yParam] = yValues[yi];

        const result = this._simulateCell(params, profileType, shaperType);
        row.push(result[this.metric]);
        detailRow.push(result);

        done++;

        // Yield to UI periodically
        if (done % 10 === 0) {
          const pct = (done / total * 100).toFixed(0);
          fill.style.width = pct + '%';
          text.textContent = `${done} / ${total} (${pct}%)`;
          await new Promise(r => setTimeout(r, 0));
        }
      }
      data.push(row);
      details.push(detailRow);
    }

    // Store results
    this.results = { xParam, yParam, xValues, yValues, data, details, profileType, shaperType };

    // Final UI state
    fill.style.width = '100%';
    text.textContent = `완료 — ${total}개 시뮬레이션`;
    btnRun.disabled = false;
    btnRun.style.opacity = '1';
    btnRun.textContent = '▶ 실행';

    document.getElementById('sweep-csv').style.display = '';

    this.renderHeatmap();
  }

  /**
   * Run a single simulation cell and return { uph, settlingTime, peakVib, motionTime, ... }
   * This logic mirrors app.js _runProfileComparison exactly.
   */
  _simulateCell(params, profileType, shaperType) {
    const { vMax, aMax, beta, gamma, distance, fn, zeta } = params;
    const dt = 0.001;
    const tol = 0.005; // 5 μm settling tolerance

    try {
      // 1. Create motion profile
      let profile;
      if (profileType === 'ascurve') {
        profile = new window.ASCurveProfile({ vMax, aMax, beta, gamma, distance, dt });
      } else {
        profile = new window.TrapezoidalProfile({ vMax, aMax, distance });
      }

      // 2. Get position samples
      const pos = profile.getSamples(dt).map(s => s.position);
      const motionTime = profile.totalTime;

      // 3. Pad for settling observation
      const padded = [...pos];
      for (let i = 0; i < 3000; i++) padded.push(distance);

      // 4. Apply input shaper
      let shaped = padded;
      if (shaperType !== 'none') {
        let shaper;
        switch (shaperType) {
          case 'ZV':  shaper = window.InputShaper.computeZV(fn, zeta); break;
          case 'ZVD': shaper = window.InputShaper.computeZVD(fn, zeta); break;
          case 'EI':  shaper = window.InputShaper.computeEI(fn, zeta); break;
        }
        if (shaper) {
          shaped = window.InputShaper.convolve(padded, dt, shaper);
        }
      }

      // 5. Forward simulation (payload loaded)
      const fwdSim = window.InputShaper.simulateResponse(shaped, dt, fn, zeta, { payloadLoaded: true });
      const fwdVib = window.InputShaper.computeVibration(fwdSim.position, shaped);

      // 6. Peak residual vibration (after motion ends)
      const settleIdx = Math.round(motionTime / dt);
      let peakVib = 0;
      for (let i = settleIdx; i < fwdVib.length; i++) {
        const v = Math.abs(fwdVib[i]);
        if (v > peakVib) peakVib = v;
      }

      // 7. Forward settling time
      let fwdSettle = motionTime;
      for (let i = fwdVib.length - 1; i >= 0; i--) {
        if (Math.abs(fwdVib[i]) > tol) { fwdSettle = i * dt; break; }
      }

      // 8. Return trip (always unloaded) — matches HUD logic
      const retSim = window.InputShaper.simulateResponse(shaped, dt, fn, zeta, { payloadLoaded: false });
      const retVib = window.InputShaper.computeVibration(retSim.position, shaped);
      let retSettle = motionTime;
      for (let i = retVib.length - 1; i >= 0; i--) {
        if (Math.abs(retVib[i]) > tol) { retSettle = i * dt; break; }
      }

      // 9. UPH = 3600 / (fwd + ret)
      const roundTrip = fwdSettle + retSettle;
      const uph = roundTrip > 0 ? Math.floor(3600 / roundTrip) : 99999;

      return { uph, settlingTime: fwdSettle, peakVib, motionTime, roundTrip, retSettle, vMax, aMax, fn, zeta, beta, gamma, distance };

    } catch (e) {
      return { uph: 0, settlingTime: 0, peakVib: 0, motionTime: 0, roundTrip: 0, retSettle: 0, error: e.message };
    }
  }

  // ════════════════════════════════════════
  // HEATMAP RENDERING
  // ════════════════════════════════════════

  renderHeatmap() {
    if (!this.results || !this.ctx) return;

    const { xValues, yValues, data, details, xParam, yParam } = this.results;
    const metricDef = SweepManager.METRICS[this.metric];
    const ctx = this.ctx;
    const canvas = this.canvas;

    // High-DPI support
    const dpr = window.devicePixelRatio || 1;
    const displayW = canvas.clientWidth;
    const displayH = canvas.clientHeight;
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const W = displayW;
    const H = displayH;
    const { padLeft, padRight, padTop, padBottom, legendWidth, legendGap } = this.hm;

    // Plot area
    const plotW = W - padLeft - padRight - legendWidth - legendGap - 20;
    const plotH = H - padTop - padBottom;

    // Clear
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // Extract data for current metric
    const metricData = [];
    let valMin = Infinity, valMax = -Infinity, valSum = 0, valCount = 0;
    for (let yi = 0; yi < yValues.length; yi++) {
      const row = [];
      for (let xi = 0; xi < xValues.length; xi++) {
        const d = details[yi][xi];
        const v = d[this.metric] || 0;
        row.push(v);
        if (isFinite(v)) {
          if (v < valMin) valMin = v;
          if (v > valMax) valMax = v;
          valSum += v;
          valCount++;
        }
      }
      metricData.push(row);
    }
    const valMean = valCount > 0 ? valSum / valCount : 0;
    const valRange = valMax - valMin || 1;

    // Cell sizes
    const cellW = plotW / xValues.length;
    const cellH = plotH / yValues.length;

    // Draw cells
    for (let yi = 0; yi < yValues.length; yi++) {
      for (let xi = 0; xi < xValues.length; xi++) {
        const v = metricData[yi][xi];
        const t = (v - valMin) / valRange; // 0..1
        const color = this._valueToColor(t, metricDef.higherBetter);

        const cx = padLeft + xi * cellW;
        const cy = padTop + (yValues.length - 1 - yi) * cellH; // Y axis bottom-to-top

        ctx.fillStyle = color;
        ctx.fillRect(cx, cy, cellW, cellH);

        // Cell border
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(cx, cy, cellW, cellH);

        // Value text (only if cells are large enough)
        if (cellW > 38 && cellH > 22) {
          ctx.fillStyle = this._textColorForBg(t, metricDef.higherBetter);
          ctx.font = '500 10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const label = this._formatValue(v, this.metric);
          ctx.fillText(label, cx + cellW / 2, cy + cellH / 2);
        }
      }
    }

    // Highlight cell
    if (this.highlightCell) {
      const [hx, hy] = this.highlightCell;
      const cx = padLeft + hx * cellW;
      const cy = padTop + (yValues.length - 1 - hy) * cellH;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(cx, cy, cellW, cellH);
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - 1, cy - 1, cellW + 2, cellH + 2);
    }

    // ── X-axis labels ──
    ctx.fillStyle = '#6b7280';
    ctx.font = '500 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xStep = Math.max(1, Math.ceil(xValues.length / 15));
    for (let xi = 0; xi < xValues.length; xi += xStep) {
      const cx = padLeft + xi * cellW + cellW / 2;
      ctx.fillText(this._formatAxis(xValues[xi]), cx, padTop + plotH + 8);
    }
    // X-axis title
    ctx.fillStyle = '#374151';
    ctx.font = '600 12px Inter, sans-serif';
    ctx.fillText(SweepManager.PARAMS[xParam].label, padLeft + plotW / 2, padTop + plotH + 30);

    // ── Y-axis labels ──
    ctx.fillStyle = '#6b7280';
    ctx.font = '500 10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const yStep = Math.max(1, Math.ceil(yValues.length / 12));
    for (let yi = 0; yi < yValues.length; yi += yStep) {
      const cy = padTop + (yValues.length - 1 - yi) * cellH + cellH / 2;
      ctx.fillText(this._formatAxis(yValues[yi]), padLeft - 8, cy);
    }
    // Y-axis title (rotated)
    ctx.save();
    ctx.fillStyle = '#374151';
    ctx.font = '600 12px Inter, sans-serif';
    ctx.translate(16, padTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(SweepManager.PARAMS[yParam].label, 0, 0);
    ctx.restore();

    // ── Color Legend ──
    const lgX = padLeft + plotW + legendGap + 10;
    const lgY = padTop;
    const lgH = plotH;
    const lgW = legendWidth;
    const legendSteps = 100;
    for (let i = 0; i < legendSteps; i++) {
      const t = 1 - i / (legendSteps - 1); // top = high
      const color = this._valueToColor(t, metricDef.higherBetter);
      ctx.fillStyle = color;
      ctx.fillRect(lgX, lgY + (i / legendSteps) * lgH, lgW, lgH / legendSteps + 1);
    }
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.strokeRect(lgX, lgY, lgW, lgH);

    // Legend labels
    ctx.fillStyle = '#6b7280';
    ctx.font = '500 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(this._formatValue(valMax, this.metric), lgX + lgW + 4, lgY);
    ctx.textBaseline = 'middle';
    ctx.fillText(this._formatValue(valMean, this.metric), lgX + lgW + 4, lgY + lgH / 2);
    ctx.textBaseline = 'bottom';
    ctx.fillText(this._formatValue(valMin, this.metric), lgX + lgW + 4, lgY + lgH);

    // Legend title
    ctx.save();
    ctx.fillStyle = '#374151';
    ctx.font = '600 10px Inter, sans-serif';
    ctx.translate(lgX + lgW + 4, lgY - 8);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(metricDef.label, 0, 0);
    ctx.restore();

    // ── Title ──
    ctx.fillStyle = '#1f2937';
    ctx.font = '700 14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(
      `${metricDef.label}  |  ${SweepManager.PARAMS[xParam].label} × ${SweepManager.PARAMS[yParam].label}`,
      padLeft + plotW / 2, 10
    );

    // ── Plot border ──
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.strokeRect(padLeft, padTop, plotW, plotH);

    // ── Statistics ──
    const statsEl = document.getElementById('sweep-stats');
    if (statsEl) {
      statsEl.innerHTML =
        `<b>Min:</b> ${this._formatValue(valMin, this.metric)} ${metricDef.unit} &nbsp;|&nbsp; ` +
        `<b>Max:</b> ${this._formatValue(valMax, this.metric)} ${metricDef.unit} &nbsp;|&nbsp; ` +
        `<b>Mean:</b> ${this._formatValue(valMean, this.metric)} ${metricDef.unit} &nbsp;|&nbsp; ` +
        `<b>Grid:</b> ${xValues.length}×${yValues.length} = ${xValues.length * yValues.length}`;
    }
  }

  // ── Color mapping ──────────────────────

  /**
   * Map a normalised value t ∈ [0,1] to an RGB colour string.
   * For higher-is-better metrics (UPH):   low = deep blue → high = bright green
   * For lower-is-better metrics (settle): low = bright blue → high = deep red
   */
  _valueToColor(t, higherBetter) {
    let r, g, b;

    if (higherBetter) {
      // Blue → Cyan → Green → Yellow (for UPH)
      if (t < 0.25) {
        const s = t / 0.25;
        r = 20;  g = Math.round(40 + 120 * s);  b = Math.round(140 + 60 * s);
      } else if (t < 0.5) {
        const s = (t - 0.25) / 0.25;
        r = Math.round(20 + 20 * s); g = Math.round(160 + 60 * s); b = Math.round(200 - 60 * s);
      } else if (t < 0.75) {
        const s = (t - 0.5) / 0.25;
        r = Math.round(40 + 80 * s); g = Math.round(220 + 20 * s); b = Math.round(140 - 80 * s);
      } else {
        const s = (t - 0.75) / 0.25;
        r = Math.round(120 + 100 * s); g = Math.round(240 - 10 * s); b = Math.round(60 - 40 * s);
      }
    } else {
      // Good (low, blue) → Bad (high, red)
      if (t < 0.25) {
        const s = t / 0.25;
        r = Math.round(30 + 10 * s); g = Math.round(100 + 100 * s); b = Math.round(200 + 30 * s);
      } else if (t < 0.5) {
        const s = (t - 0.25) / 0.25;
        r = Math.round(40 + 100 * s); g = Math.round(200 + 40 * s); b = Math.round(230 - 90 * s);
      } else if (t < 0.75) {
        const s = (t - 0.5) / 0.25;
        r = Math.round(140 + 80 * s); g = Math.round(240 - 60 * s); b = Math.round(140 - 80 * s);
      } else {
        const s = (t - 0.75) / 0.25;
        r = Math.round(220 + 30 * s); g = Math.round(180 - 130 * s); b = Math.round(60 - 30 * s);
      }
    }

    return `rgb(${r},${g},${b})`;
  }

  /** Choose black or white text depending on cell background brightness */
  _textColorForBg(t, higherBetter) {
    // For both scales the extremes tend to be dark, middle can be bright
    if (higherBetter) {
      return t < 0.2 ? '#c0d0e0' : (t > 0.85 ? '#1a3000' : '#0a2020');
    }
    return t < 0.2 ? '#d0e0ff' : (t > 0.85 ? '#3a0000' : '#1a1a30');
  }

  // ── Formatting helpers ─────────────────

  _formatValue(v, metric) {
    if (!isFinite(v)) return '—';
    if (metric === 'uph') return Math.round(v).toLocaleString();
    if (metric === 'settlingTime') return v.toFixed(3);
    if (metric === 'peakVib') return v.toFixed(4);
    return v.toPrecision(4);
  }

  _formatAxis(v) {
    if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + 'k';
    if (Number.isInteger(v)) return v.toString();
    if (Math.abs(v) < 0.1) return v.toFixed(3);
    if (Math.abs(v) < 10) return v.toFixed(2);
    return v.toFixed(1);
  }

  _linspace(min, max, n) {
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push(min + (max - min) * i / (n - 1));
    }
    return arr;
  }

  // ════════════════════════════════════════
  // CANVAS INTERACTION
  // ════════════════════════════════════════

  _canvasToCell(e) {
    if (!this.results) return null;
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const { padLeft, padTop, padRight, padBottom, legendWidth, legendGap } = this.hm;
    const plotW = this.canvas.clientWidth - padLeft - padRight - legendWidth - legendGap - 20;
    const plotH = this.canvas.clientHeight - padTop - padBottom;
    const { xValues, yValues } = this.results;

    const cellW = plotW / xValues.length;
    const cellH = plotH / yValues.length;

    const xi = Math.floor((mx - padLeft) / cellW);
    const yi = yValues.length - 1 - Math.floor((my - padTop) / cellH); // invert Y

    if (xi < 0 || xi >= xValues.length || yi < 0 || yi >= yValues.length) return null;
    return [xi, yi];
  }

  _handleCanvasClick(e) {
    const cell = this._canvasToCell(e);
    if (!cell) return;
    const [xi, yi] = cell;
    const d = this.results.details[yi][xi];
    const xP = SweepManager.PARAMS[this.results.xParam];
    const yP = SweepManager.PARAMS[this.results.yParam];

    const detailEl = document.getElementById('sweep-detail');
    detailEl.style.display = '';
    detailEl.innerHTML =
      `<div style="font-weight:700; margin-bottom:8px; font-size:13px; color:#2563eb;">
        📍 셀 [${xi + 1}, ${yi + 1}]  —  ${xP.label} = ${this._formatAxis(this.results.xValues[xi])}${xP.unit ? ' ' + xP.unit : ''},  ${yP.label} = ${this._formatAxis(this.results.yValues[yi])}${yP.unit ? ' ' + yP.unit : ''}
      </div>` +
      `<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px;">` +
        this._detailCard('UPH', Math.round(d.uph).toLocaleString(), 'pcs/h') +
        this._detailCard('정착 시간', d.settlingTime ? d.settlingTime.toFixed(4) : '—', 's') +
        this._detailCard('최대 진동', d.peakVib ? d.peakVib.toFixed(5) : '—', 'mm') +
        this._detailCard('모션 시간', d.motionTime ? d.motionTime.toFixed(4) : '—', 's') +
        this._detailCard('왕복 시간', d.roundTrip ? d.roundTrip.toFixed(4) : '—', 's') +
        this._detailCard('복귀 정착', d.retSettle ? d.retSettle.toFixed(4) : '—', 's') +
      `</div>` +
      (d.error ? `<div style="color:#dc2626; margin-top:8px;">⚠ ${d.error}</div>` : '');

    this.highlightCell = cell;
    this.renderHeatmap();
  }

  _detailCard(label, value, unit) {
    return `<div style="background:#f8fafc; border:1px solid #e5e7eb; border-radius:6px; padding:10px;">
      <div style="font-size:10px; color:#9ca3af; text-transform:uppercase; letter-spacing:0.06em;">${label}</div>
      <div style="font-size:16px; font-weight:700; color:#1f2937; margin-top:2px;">${value} <span style="font-size:10px; color:#9ca3af; font-weight:400;">${unit}</span></div>
    </div>`;
  }

  _handleCanvasHover(e) {
    const cell = this._canvasToCell(e);
    if (!cell) {
      if (this.highlightCell) {
        this.highlightCell = null;
        this.renderHeatmap();
      }
      return;
    }
    const [xi, yi] = cell;
    if (!this.highlightCell || this.highlightCell[0] !== xi || this.highlightCell[1] !== yi) {
      this.highlightCell = cell;
      this.renderHeatmap();
    }
  }

  // ════════════════════════════════════════
  // CSV EXPORT
  // ════════════════════════════════════════

  exportCSV() {
    if (!this.results) return;
    const { xParam, yParam, xValues, yValues, details, profileType, shaperType } = this.results;

    const headers = [
      xParam, yParam,
      'profileType', 'shaperType',
      'UPH', 'settlingTime_s', 'peakVib_mm', 'motionTime_s', 'roundTrip_s', 'retSettle_s',
      'vMax', 'aMax', 'fn', 'zeta', 'beta', 'gamma', 'distance',
    ];

    const rows = [headers.join(',')];

    for (let yi = 0; yi < yValues.length; yi++) {
      for (let xi = 0; xi < xValues.length; xi++) {
        const d = details[yi][xi];
        rows.push([
          xValues[xi], yValues[yi],
          profileType, shaperType,
          d.uph, d.settlingTime, d.peakVib, d.motionTime, d.roundTrip, d.retSettle,
          d.vMax || '', d.aMax || '', d.fn || '', d.zeta || '', d.beta || '', d.gamma || '', d.distance || '',
        ].join(','));
      }
    }

    const csv = rows.join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sweep_${xParam}_vs_${yParam}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// ═══════════════════════════════════════════
// Global Export
// ═══════════════════════════════════════════
window.SweepManager = SweepManager;
