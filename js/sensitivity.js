/**
 * Sensitivity Analysis Module
 *
 * Evaluates input shaper robustness to frequency estimation errors.
 * Computes theoretical residual vibration curves (ZV, ZVD, EI) and
 * validates them against full physics simulation using trapezoidal
 * motion profiles convolved with each shaper.
 *
 * Theoretical residual vibration:
 *   V(f) = sqrt( (Σ Ai·cos(ωd·ti))² + (Σ Ai·sin(ωd·ti))² ) × 100%
 *   where ωd = 2π·f·√(1-ζ²), Ai and ti are shaper amplitudes/times
 *
 * Dependencies:
 *   - window.InputShaper  (input-shaping.js)
 *   - Chart               (Chart.js global)
 */

class SensitivityAnalyzer {

  /**
   * @param {string} containerId - DOM id of the container div
   */
  constructor(containerId) {
    this.containerId = containerId;
    this.container = null;

    /** Design parameters */
    this.designFn = 10;
    this.designZeta = 0.05;

    /** Chart instances */
    this.sensitivityChart = null;
    this.validationChart = null;

    /** Cached analysis data for CSV export */
    this.analysisData = null;

    /** Color palette (MATLAB-inspired) */
    this.colors = {
      zv:        '#ea580c',
      zvFill:    'rgba(234, 88, 12, 0.08)',
      zvd:       '#2563eb',
      zvdFill:   'rgba(37, 99, 235, 0.08)',
      ei:        '#16a34a',
      eiFill:    'rgba(22, 163, 74, 0.08)',
      threshold: 'rgba(220, 38, 38, 0.55)',
      designLine:'rgba(100, 116, 139, 0.50)',
      grid:      'rgba(0, 0, 0, 0.06)',
      gridBorder:'rgba(0, 0, 0, 0.12)',
      text:      '#1e293b',
      textDim:   '#64748b',
      white:     '#ffffff',
    };
  }

  /* ==================================================================
   *  UI Construction
   * ================================================================*/

  /**
   * Build the full sensitivity analysis UI inside the container.
   */
  init() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) {
      console.error(`[SensitivityAnalyzer] Container #${this.containerId} not found.`);
      return;
    }

    this.container.innerHTML = '';

    // ── Inject scoped styles ──────────────────────────────────────
    const style = document.createElement('style');
    style.textContent = `
      .sa-root {
        font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
        color: ${this.colors.text};
        background: ${this.colors.white};
        border: 1px solid ${this.colors.gridBorder};
        border-radius: 8px;
        padding: 24px;
        max-width: 1280px;
        margin: 0 auto;
      }
      .sa-root *,
      .sa-root *::before,
      .sa-root *::after { box-sizing: border-box; }

      .sa-header {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 20px; padding-bottom: 16px;
        border-bottom: 1px solid ${this.colors.gridBorder};
      }
      .sa-title {
        font-size: 18px; font-weight: 700; letter-spacing: -0.3px;
      }
      .sa-subtitle {
        font-size: 12px; color: ${this.colors.textDim}; margin-top: 2px;
      }

      /* ── Parameter bar ── */
      .sa-params {
        display: flex; align-items: flex-end; gap: 16px;
        flex-wrap: wrap; margin-bottom: 20px;
      }
      .sa-field { display: flex; flex-direction: column; gap: 4px; }
      .sa-field label {
        font-size: 11px; font-weight: 600; color: ${this.colors.textDim};
        text-transform: uppercase; letter-spacing: 0.5px;
      }
      .sa-field input {
        width: 110px; padding: 7px 10px;
        font-family: 'JetBrains Mono', monospace; font-size: 13px;
        border: 1px solid ${this.colors.gridBorder};
        border-radius: 6px; background: #f8fafc; color: ${this.colors.text};
        transition: border-color 0.15s;
      }
      .sa-field input:focus {
        outline: none; border-color: #2563eb;
        box-shadow: 0 0 0 3px rgba(37,99,235,0.10);
      }

      .sa-btn {
        padding: 8px 20px; font-size: 13px; font-weight: 600;
        border: none; border-radius: 6px; cursor: pointer;
        transition: background 0.15s, transform 0.1s;
      }
      .sa-btn:active { transform: scale(0.97); }
      .sa-btn-primary {
        background: #2563eb; color: #fff;
      }
      .sa-btn-primary:hover { background: #1d4ed8; }
      .sa-btn-secondary {
        background: #f1f5f9; color: ${this.colors.textDim};
        border: 1px solid ${this.colors.gridBorder};
      }
      .sa-btn-secondary:hover { background: #e2e8f0; }

      /* ── Chart grid ── */
      .sa-charts {
        display: grid; grid-template-columns: 1fr 1fr;
        gap: 20px; margin-bottom: 24px;
      }
      .sa-chart-wrap {
        position: relative; background: #fff;
        border: 1px solid ${this.colors.gridBorder};
        border-radius: 8px; padding: 16px 12px 8px;
        min-height: 340px;
      }
      .sa-chart-title {
        font-size: 12px; font-weight: 600; color: ${this.colors.textDim};
        margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.4px;
      }
      .sa-chart-canvas { width: 100% !important; height: 290px !important; }

      /* ── Robustness table ── */
      .sa-table-wrap {
        overflow-x: auto; margin-bottom: 20px;
      }
      .sa-table {
        width: 100%; border-collapse: collapse; font-size: 13px;
        font-family: 'JetBrains Mono', 'Consolas', monospace;
      }
      .sa-table th {
        background: #f8fafc; color: ${this.colors.textDim};
        font-size: 11px; font-weight: 600; text-transform: uppercase;
        letter-spacing: 0.5px; padding: 10px 14px;
        border-bottom: 2px solid ${this.colors.gridBorder};
        text-align: left;
      }
      .sa-table td {
        padding: 10px 14px;
        border-bottom: 1px solid #f1f5f9;
      }
      .sa-table tr:last-child td { border-bottom: none; }
      .sa-table tbody tr:hover { background: #f8fafc; }
      .sa-badge {
        display: inline-block; padding: 2px 8px;
        border-radius: 4px; font-size: 11px; font-weight: 600;
      }
      .sa-badge-zv  { background: rgba(234,88,12,0.10); color: #ea580c; }
      .sa-badge-zvd { background: rgba(37,99,235,0.10);  color: #2563eb; }
      .sa-badge-ei  { background: rgba(22,163,74,0.10);  color: #16a34a; }

      /* ── Footer ── */
      .sa-footer {
        display: flex; justify-content: flex-end; gap: 10px;
        padding-top: 16px; border-top: 1px solid ${this.colors.gridBorder};
      }

      @media (max-width: 860px) {
        .sa-charts { grid-template-columns: 1fr; }
      }
    `;
    this.container.appendChild(style);

    // ── Root wrapper ──────────────────────────────────────────────
    const root = document.createElement('div');
    root.className = 'sa-root';

    // Header
    root.innerHTML = `
      <div class="sa-header">
        <div>
          <div class="sa-title">감도 분석 (Sensitivity Analysis)</div>
          <div class="sa-subtitle">입력 셰이퍼의 주파수 오차 강건성을 평가합니다</div>
        </div>
      </div>
    `;

    // Parameter bar
    const params = document.createElement('div');
    params.className = 'sa-params';
    params.innerHTML = `
      <div class="sa-field">
        <label>설계 주파수 f<sub>n</sub> (Hz)</label>
        <input type="number" id="sa-fn" value="${this.designFn}" min="0.1" step="0.5">
      </div>
      <div class="sa-field">
        <label>감쇠비 ζ</label>
        <input type="number" id="sa-zeta" value="${this.designZeta}" min="0" max="1" step="0.01">
      </div>
      <button class="sa-btn sa-btn-primary" id="sa-run-btn">분석 실행</button>
    `;
    root.appendChild(params);

    // Chart grid
    const charts = document.createElement('div');
    charts.className = 'sa-charts';
    charts.innerHTML = `
      <div class="sa-chart-wrap">
        <div class="sa-chart-title">이론적 감도 곡선 — Theoretical Sensitivity</div>
        <canvas id="sensitivity-chart" class="sa-chart-canvas"></canvas>
      </div>
      <div class="sa-chart-wrap">
        <div class="sa-chart-title">시뮬레이션 검증 — Simulation Validation</div>
        <canvas id="sensitivity-validation" class="sa-chart-canvas"></canvas>
      </div>
    `;
    root.appendChild(charts);

    // Table placeholder
    const tableWrap = document.createElement('div');
    tableWrap.className = 'sa-table-wrap';
    tableWrap.id = 'sa-robustness-table';
    root.appendChild(tableWrap);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'sa-footer';
    footer.innerHTML = `
      <button class="sa-btn sa-btn-secondary" id="sa-export-btn" disabled>CSV 내보내기</button>
    `;
    root.appendChild(footer);

    this.container.appendChild(root);

    // ── Wire events ───────────────────────────────────────────────
    document.getElementById('sa-run-btn').addEventListener('click', () => this.runAnalysis());
    document.getElementById('sa-export-btn').addEventListener('click', () => this.exportCSV());
  }

  /* ==================================================================
   *  Core Analysis
   * ================================================================*/

  /**
   * Execute full sensitivity analysis: theoretical curves, simulation
   * validation, and robustness table.
   */
  runAnalysis() {
    // Read inputs
    this.designFn   = parseFloat(document.getElementById('sa-fn').value)   || 10;
    this.designZeta = parseFloat(document.getElementById('sa-zeta').value) || 0.05;

    const fn   = this.designFn;
    const zeta = this.designZeta;

    // ── 1. Compute shapers at design point ────────────────────────
    const shaperZV  = window.InputShaper.computeZV(fn, zeta);
    const shaperZVD = window.InputShaper.computeZVD(fn, zeta);
    const shaperEI  = window.InputShaper.computeEI(fn, zeta);

    // ── 2. Theoretical sensitivity curves ─────────────────────────
    const numPoints = 300;
    const ratios = [];
    for (let i = 0; i < numPoints; i++) {
      ratios.push(0.3 + (i / (numPoints - 1)) * 1.4); // 0.3 → 1.7
    }

    const sensZV  = this._computeSensitivity(shaperZV, fn, zeta, ratios);
    const sensZVD = this._computeSensitivity(shaperZVD, fn, zeta, ratios);
    const sensEI  = this._computeSensitivity(shaperEI, fn, zeta, ratios);

    // ── 3. Calculate bandwidths ───────────────────────────────────
    const threshold = 5; // percent
    const bwZV  = this._computeBandwidth(ratios, sensZV, threshold);
    const bwZVD = this._computeBandwidth(ratios, sensZVD, threshold);
    const bwEI  = this._computeBandwidth(ratios, sensEI, threshold);

    // ── 4. Simulation validation ──────────────────────────────────
    const validationRatios = [0.5, 0.7, 0.85, 1.0, 1.15, 1.3, 1.5];
    const simZV  = this._runValidation(shaperZV, fn, zeta, validationRatios);
    const simZVD = this._runValidation(shaperZVD, fn, zeta, validationRatios);
    const simEI  = this._runValidation(shaperEI, fn, zeta, validationRatios);

    // ── 5. Cache data for export ──────────────────────────────────
    this.analysisData = {
      fn, zeta, ratios,
      sensZV, sensZVD, sensEI,
      bwZV, bwZVD, bwEI,
      validationRatios,
      simZV, simZVD, simEI,
      shaperZV, shaperZVD, shaperEI,
    };

    // ── 6. Render ─────────────────────────────────────────────────
    this._renderSensitivityChart(ratios, sensZV, sensZVD, sensEI);
    this._renderValidationChart(ratios, sensZV, sensZVD, sensEI,
                                validationRatios, simZV, simZVD, simEI);
    this._renderRobustnessTable(bwZV, bwZVD, bwEI, shaperZV, shaperZVD, shaperEI);

    document.getElementById('sa-export-btn').disabled = false;
  }

  /* ==================================================================
   *  Theoretical Residual Vibration
   * ================================================================*/

  /**
   * Compute residual vibration percentage for a shaper across frequency ratios.
   *
   * V(r) = sqrt( (Σ Ai·cos(ωd·ti))² + (Σ Ai·sin(ωd·ti))² ) × 100
   *
   * @param {Object} shaper     - {amplitudes, times}
   * @param {number} fn         - Design natural frequency (Hz)
   * @param {number} zeta       - Design damping ratio
   * @param {number[]} ratios   - Frequency ratio array
   * @returns {number[]}          Residual vibration percentages
   */
  _computeSensitivity(shaper, fn, zeta, ratios) {
    const { amplitudes, times } = shaper;
    const result = new Array(ratios.length);

    for (let r = 0; r < ratios.length; r++) {
      const fActual = fn * ratios[r];
      const wd = 2 * Math.PI * fActual * Math.sqrt(1 - zeta * zeta);

      let cosSum = 0;
      let sinSum = 0;
      for (let j = 0; j < amplitudes.length; j++) {
        const phase = wd * times[j];
        cosSum += amplitudes[j] * Math.cos(phase);
        sinSum += amplitudes[j] * Math.sin(phase);
      }

      result[r] = Math.sqrt(cosSum * cosSum + sinSum * sinSum) * 100;
    }

    return result;
  }

  /**
   * Find the frequency bandwidth where residual vibration < threshold.
   * Returns an object with lower/upper ratio bounds and ± percentage.
   */
  _computeBandwidth(ratios, sensitivity, threshold) {
    let lower = ratios[0];
    let upper = ratios[ratios.length - 1];
    let foundLower = false;

    // Walk outward from the design ratio (1.0) to find the crossing
    for (let i = 0; i < ratios.length; i++) {
      if (sensitivity[i] <= threshold && !foundLower) {
        lower = ratios[i];
        foundLower = true;
      }
      if (foundLower && sensitivity[i] > threshold) {
        upper = ratios[i - 1] || ratios[i];
        break;
      }
      if (foundLower) {
        upper = ratios[i];
      }
    }

    if (!foundLower) {
      return { lower: NaN, upper: NaN, percent: 0 };
    }

    const halfWidth = Math.max(1.0 - lower, upper - 1.0);
    return {
      lower,
      upper,
      percent: Math.round(halfWidth * 100),
    };
  }

  /* ==================================================================
   *  Simulation Validation
   * ================================================================*/

  /**
   * For each frequency ratio, run a full physics simulation and measure
   * the actual peak residual vibration normalised to the unshaped case.
   *
   * @returns {number[]} Residual vibration percentages (simulation-based)
   */
  _runValidation(shaper, designFn, designZeta, ratios) {
    const dt = 0.001;
    const distance = 100; // mm
    const results = [];

    for (const ratio of ratios) {
      const actualFn = designFn * ratio;

      // Generate a simple trapezoidal command
      const profile = new window.TrapezoidalProfile({
        vMax: 500,
        aMax: 5000,
        distance,
      });
      const samples = profile.getSamples(dt);
      const command = samples.map(s => s.position);

      // Pad command with final value for settling observation
      const finalPos = command[command.length - 1];
      const padLen = Math.floor(2.0 / dt);
      const padded = command.slice();
      for (let i = 0; i < padLen; i++) padded.push(finalPos);

      // ── Unshaped response at actual frequency ───────────────────
      const unshapedSim = window.InputShaper.simulateResponse(
        padded, dt, actualFn, designZeta
      );
      const unshapedVib = this._peakResidual(unshapedSim.position, finalPos, command.length);

      // ── Shaped response at actual frequency ─────────────────────
      const shapedCmd = window.InputShaper.convolve(padded, dt, shaper);
      const shapedSim = window.InputShaper.simulateResponse(
        shapedCmd, dt, actualFn, designZeta
      );
      // Settle index accounts for shaper delay
      const shaperDelaySamples = Math.ceil(shaper.delay / dt);
      const shapedVib = this._peakResidual(
        shapedSim.position, finalPos, command.length + shaperDelaySamples
      );

      // Normalise: shaped / unshaped × 100  (0 = perfect, 100 = no improvement)
      const normalised = unshapedVib > 1e-12
        ? (shapedVib / unshapedVib) * 100
        : 0;
      results.push(normalised);
    }

    return results;
  }

  /**
   * Measure the peak absolute deviation from target after a settle index.
   */
  _peakResidual(response, target, settleIdx) {
    let peak = 0;
    for (let i = settleIdx; i < response.length; i++) {
      const dev = Math.abs(response[i] - target);
      if (dev > peak) peak = dev;
    }
    return peak;
  }

  /* ==================================================================
   *  Chart Rendering
   * ================================================================*/

  /** Shared Chart.js options for the MATLAB-style look. */
  _chartDefaults(titleText, xLabel, yLabel) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true, position: 'top', align: 'end',
          labels: {
            color: this.colors.textDim,
            font: { size: 10, family: 'Inter' },
            boxWidth: 14, boxHeight: 3, padding: 10,
            usePointStyle: false,
          },
        },
        title: {
          display: !!titleText,
          text: titleText || '',
          color: this.colors.text,
          font: { size: 13, family: 'Inter', weight: '600' },
          padding: { bottom: 12 },
        },
        tooltip: {
          backgroundColor: 'rgba(255,255,255,0.96)',
          titleColor: '#1e293b', bodyColor: '#475569',
          titleFont: { size: 11, family: 'JetBrains Mono' },
          bodyFont:  { size: 11, family: 'JetBrains Mono' },
          borderColor: 'rgba(0,0,0,0.08)', borderWidth: 1,
          cornerRadius: 4, padding: 8,
          displayColors: true, boxWidth: 8, boxHeight: 8, boxPadding: 4,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}%`,
          },
        },
        annotation: { annotations: {} },
      },
      scales: {
        x: {
          type: 'linear',
          display: true,
          min: 0.3, max: 1.7,
          grid: { color: this.colors.grid, drawBorder: false },
          ticks: {
            color: this.colors.textDim,
            font: { size: 9, family: 'JetBrains Mono' },
            stepSize: 0.1,
            callback: (v) => v.toFixed(1),
          },
          title: {
            display: true, text: xLabel,
            color: this.colors.textDim, font: { size: 10 },
          },
        },
        y: {
          display: true,
          min: 0,
          grid: { color: this.colors.grid, drawBorder: false },
          ticks: {
            color: this.colors.textDim,
            font: { size: 9, family: 'JetBrains Mono' },
            callback: (v) => v + '%',
          },
          title: {
            display: true, text: yLabel,
            color: this.colors.textDim, font: { size: 10 },
          },
        },
      },
    };
  }

  /**
   * Left chart: theoretical sensitivity curves for all three shapers.
   */
  _renderSensitivityChart(ratios, sensZV, sensZVD, sensEI) {
    if (this.sensitivityChart) this.sensitivityChart.destroy();

    const ctx = document.getElementById('sensitivity-chart').getContext('2d');
    const opts = this._chartDefaults(
      '', '주파수 비율 (f / f_design)', '잔류 진동 (%)'
    );

    // Dynamic y-axis max: cap at 120 or the max value, whichever is smaller
    const maxY = Math.min(120, Math.ceil(
      Math.max(...sensZV, ...sensZVD, ...sensEI, 10) / 10
    ) * 10);
    opts.scales.y.max = maxY;

    // Annotations: 5% threshold + design frequency line
    opts.plugins.annotation.annotations = {
      thresholdLine: {
        type: 'line', scaleID: 'y', value: 5,
        borderColor: this.colors.threshold, borderWidth: 1.5,
        borderDash: [6, 4],
        label: {
          display: true, content: '5% 임계값',
          position: 'end',
          backgroundColor: 'rgba(220,38,38,0.80)', color: '#fff',
          font: { size: 9, weight: '600' }, padding: { x: 6, y: 3 },
        },
      },
      designLine: {
        type: 'line', scaleID: 'x', value: 1.0,
        borderColor: this.colors.designLine, borderWidth: 1.5,
        borderDash: [4, 4],
        label: {
          display: true, content: '설계 주파수',
          position: 'start',
          backgroundColor: 'rgba(100,116,139,0.80)', color: '#fff',
          font: { size: 9, weight: '600' }, padding: { x: 6, y: 3 },
        },
      },
    };

    // Build point data
    const dataZV  = ratios.map((r, i) => ({ x: r, y: sensZV[i] }));
    const dataZVD = ratios.map((r, i) => ({ x: r, y: sensZVD[i] }));
    const dataEI  = ratios.map((r, i) => ({ x: r, y: sensEI[i] }));

    this.sensitivityChart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'ZV',
            data: dataZV,
            borderColor: this.colors.zv,
            backgroundColor: this.colors.zvFill,
            borderWidth: 2.5,
            fill: false,
            pointRadius: 0,
            tension: 0.3,
          },
          {
            label: 'ZVD',
            data: dataZVD,
            borderColor: this.colors.zvd,
            backgroundColor: this.colors.zvdFill,
            borderWidth: 2.5,
            fill: false,
            pointRadius: 0,
            tension: 0.3,
          },
          {
            label: 'EI',
            data: dataEI,
            borderColor: this.colors.ei,
            backgroundColor: this.colors.eiFill,
            borderWidth: 2.5,
            fill: false,
            pointRadius: 0,
            tension: 0.3,
          },
        ],
      },
      options: opts,
    });
  }

  /**
   * Right chart: theoretical curves + simulation scatter overlay.
   */
  _renderValidationChart(ratios, sensZV, sensZVD, sensEI,
                          valRatios, simZV, simZVD, simEI) {
    if (this.validationChart) this.validationChart.destroy();

    const ctx = document.getElementById('sensitivity-validation').getContext('2d');
    const opts = this._chartDefaults(
      '', '주파수 비율 (f / f_design)', '잔류 진동 (%)'
    );

    const maxY = Math.min(120, Math.ceil(
      Math.max(...sensZV, ...sensZVD, ...sensEI,
               ...simZV, ...simZVD, ...simEI, 10) / 10
    ) * 10);
    opts.scales.y.max = maxY;

    // Same reference lines
    opts.plugins.annotation.annotations = {
      thresholdLine: {
        type: 'line', scaleID: 'y', value: 5,
        borderColor: this.colors.threshold, borderWidth: 1.5,
        borderDash: [6, 4],
      },
      designLine: {
        type: 'line', scaleID: 'x', value: 1.0,
        borderColor: this.colors.designLine, borderWidth: 1.5,
        borderDash: [4, 4],
      },
    };

    // Theoretical curves (thin, semi-transparent)
    const bgAlpha = 0.35;
    const theorZV  = ratios.map((r, i) => ({ x: r, y: sensZV[i] }));
    const theorZVD = ratios.map((r, i) => ({ x: r, y: sensZVD[i] }));
    const theorEI  = ratios.map((r, i) => ({ x: r, y: sensEI[i] }));

    // Simulation scatter
    const scatterZV  = valRatios.map((r, i) => ({ x: r, y: simZV[i] }));
    const scatterZVD = valRatios.map((r, i) => ({ x: r, y: simZVD[i] }));
    const scatterEI  = valRatios.map((r, i) => ({ x: r, y: simEI[i] }));

    this.validationChart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          // Theoretical backgrounds
          {
            label: 'ZV 이론',
            data: theorZV,
            borderColor: `rgba(234,88,12,${bgAlpha})`,
            borderWidth: 1.5, fill: false,
            pointRadius: 0, tension: 0.3,
          },
          {
            label: 'ZVD 이론',
            data: theorZVD,
            borderColor: `rgba(37,99,235,${bgAlpha})`,
            borderWidth: 1.5, fill: false,
            pointRadius: 0, tension: 0.3,
          },
          {
            label: 'EI 이론',
            data: theorEI,
            borderColor: `rgba(22,163,74,${bgAlpha})`,
            borderWidth: 1.5, fill: false,
            pointRadius: 0, tension: 0.3,
          },
          // Simulation scatter
          {
            label: 'ZV 시뮬레이션',
            data: scatterZV,
            type: 'scatter',
            borderColor: this.colors.zv,
            backgroundColor: this.colors.zv,
            pointRadius: 6, pointHoverRadius: 8,
            pointStyle: 'circle',
            showLine: false,
          },
          {
            label: 'ZVD 시뮬레이션',
            data: scatterZVD,
            type: 'scatter',
            borderColor: this.colors.zvd,
            backgroundColor: this.colors.zvd,
            pointRadius: 6, pointHoverRadius: 8,
            pointStyle: 'circle',
            showLine: false,
          },
          {
            label: 'EI 시뮬레이션',
            data: scatterEI,
            type: 'scatter',
            borderColor: this.colors.ei,
            backgroundColor: this.colors.ei,
            pointRadius: 6, pointHoverRadius: 8,
            pointStyle: 'circle',
            showLine: false,
          },
        ],
      },
      options: opts,
    });
  }

  /* ==================================================================
   *  Robustness Table
   * ================================================================*/

  _renderRobustnessTable(bwZV, bwZVD, bwEI, shaperZV, shaperZVD, shaperEI) {
    const tableWrap = document.getElementById('sa-robustness-table');
    if (!tableWrap) return;

    const rows = [
      {
        name: 'ZV', cls: 'sa-badge-zv', bw: bwZV,
        delay: shaperZV.delay * 1000,
        useCase: '정확한 주파수 추정 환경 — 최소 지연',
      },
      {
        name: 'ZVD', cls: 'sa-badge-zvd', bw: bwZVD,
        delay: shaperZVD.delay * 1000,
        useCase: '보통 주파수 불확실성 — 균형 잡힌 선택',
      },
      {
        name: 'EI', cls: 'sa-badge-ei', bw: bwEI,
        delay: shaperEI.delay * 1000,
        useCase: '큰 주파수 불확실성 — 최대 강건성',
      },
    ];

    const formatRange = (bw) => {
      if (isNaN(bw.lower)) return '—';
      return `${bw.lower.toFixed(2)} – ${bw.upper.toFixed(2)}`;
    };
    const formatPercent = (bw) => {
      if (isNaN(bw.lower)) return '—';
      return `±${bw.percent}%`;
    };

    tableWrap.innerHTML = `
      <table class="sa-table">
        <thead>
          <tr>
            <th>셰이퍼</th>
            <th>대역폭 (주파수 비율)</th>
            <th>대역폭 (±%)</th>
            <th>지연 시간 (ms)</th>
            <th>권장 사용 환경</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><span class="sa-badge ${r.cls}">${r.name}</span></td>
              <td>${formatRange(r.bw)}</td>
              <td>${formatPercent(r.bw)}</td>
              <td>${r.delay.toFixed(2)}</td>
              <td style="font-family:Inter,sans-serif; font-size:12px; color:${this.colors.textDim};">
                ${r.useCase}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  /* ==================================================================
   *  CSV Export
   * ================================================================*/

  /**
   * Export the full sensitivity data as a downloadable CSV file.
   */
  exportCSV() {
    if (!this.analysisData) return;

    const d = this.analysisData;
    const lines = [];

    // Header block
    lines.push(`# Sensitivity Analysis — f_n=${d.fn} Hz, zeta=${d.zeta}`);
    lines.push(`# Generated ${new Date().toISOString()}`);
    lines.push('');

    // Theoretical curves
    lines.push('Frequency Ratio,ZV (%),ZVD (%),EI (%)');
    for (let i = 0; i < d.ratios.length; i++) {
      lines.push([
        d.ratios[i].toFixed(4),
        d.sensZV[i].toFixed(4),
        d.sensZVD[i].toFixed(4),
        d.sensEI[i].toFixed(4),
      ].join(','));
    }

    lines.push('');
    lines.push('# Simulation Validation');
    lines.push('Frequency Ratio,ZV Sim (%),ZVD Sim (%),EI Sim (%)');
    for (let i = 0; i < d.validationRatios.length; i++) {
      lines.push([
        d.validationRatios[i].toFixed(4),
        d.simZV[i].toFixed(4),
        d.simZVD[i].toFixed(4),
        d.simEI[i].toFixed(4),
      ].join(','));
    }

    lines.push('');
    lines.push('# Bandwidth Summary');
    lines.push('Shaper,Lower Ratio,Upper Ratio,Bandwidth (±%),Delay (ms)');
    const bws = [
      { name: 'ZV',  bw: d.bwZV,  delay: d.shaperZV.delay  },
      { name: 'ZVD', bw: d.bwZVD, delay: d.shaperZVD.delay },
      { name: 'EI',  bw: d.bwEI,  delay: d.shaperEI.delay  },
    ];
    for (const b of bws) {
      lines.push([
        b.name,
        isNaN(b.bw.lower) ? '' : b.bw.lower.toFixed(4),
        isNaN(b.bw.upper) ? '' : b.bw.upper.toFixed(4),
        isNaN(b.bw.percent) ? '' : b.bw.percent,
        (b.delay * 1000).toFixed(4),
      ].join(','));
    }

    // Trigger download
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sensitivity_fn${d.fn}Hz_z${d.zeta}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Make globally available
window.SensitivityAnalyzer = SensitivityAnalyzer;
