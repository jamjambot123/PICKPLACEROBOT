/**
 * Experiment History / Log Module
 *
 * Tracks every simulation run, persists to localStorage, and provides:
 *  - Scrollable table with relative timestamps
 *  - Side-by-side comparison of 2-3 experiments
 *  - CSV export
 *  - Full Korean UI labels
 *
 * Usage:
 *   const log = new ExperimentLog('experiment-log-container');
 *   log.init();
 *   log.addExperiment(profile, shaper, params, results);
 */

class ExperimentLog {
  /**
   * @param {string} containerId - DOM id of the container div
   */
  constructor(containerId) {
    this.containerId = containerId;
    this.container = null;
    this.storageKey = 'pickplace_experiments';
    this.experiments = [];
    this.selectedIds = new Set();
    this._relativeTimeTimer = null;
  }

  // ─────────────────────────────────────────────
  // Persistence
  // ─────────────────────────────────────────────

  _load() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      this.experiments = raw ? JSON.parse(raw) : [];
    } catch (_) {
      this.experiments = [];
    }
  }

  _save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.experiments));
    } catch (_) {
      console.warn('[ExperimentLog] localStorage save failed');
    }
  }

  _nextId() {
    if (this.experiments.length === 0) return 1;
    return Math.max(...this.experiments.map(e => e.id)) + 1;
  }

  // ─────────────────────────────────────────────
  // Initialisation
  // ─────────────────────────────────────────────

  init() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) {
      console.warn('[ExperimentLog] container not found:', this.containerId);
      return;
    }

    this._load();
    this._injectStyles();
    this._buildUI();
    this.renderTable();

    // Refresh relative timestamps every 30 s
    this._relativeTimeTimer = setInterval(() => this._refreshTimestamps(), 30000);
  }

  // ─────────────────────────────────────────────
  // CSS (scoped via .explog- prefix)
  // ─────────────────────────────────────────────

  _injectStyles() {
    if (document.getElementById('explog-styles')) return;

    const style = document.createElement('style');
    style.id = 'explog-styles';
    style.textContent = /* css */ `
      /* ── Container ── */
      .explog-root {
        font-family: 'Inter', -apple-system, sans-serif;
        font-size: 12px;
        color: #1f2937;
        display: flex;
        flex-direction: column;
        height: 100%;
      }

      /* ── Header ── */
      .explog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid #e5e7eb;
        background: #ffffff;
        flex-shrink: 0;
      }
      .explog-header-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .explog-title {
        font-size: 13px;
        font-weight: 600;
        color: #1f2937;
      }
      .explog-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        border-radius: 10px;
        background: #2563eb;
        color: #ffffff;
        font-size: 10px;
        font-weight: 700;
      }
      .explog-actions {
        display: flex;
        gap: 6px;
      }
      .explog-btn {
        padding: 5px 10px;
        border: 1px solid #d1d5db;
        border-radius: 5px;
        background: #ffffff;
        color: #374151;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
      }
      .explog-btn:hover {
        background: #f3f4f6;
        border-color: #9ca3af;
      }
      .explog-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .explog-btn.danger {
        color: #dc2626;
        border-color: #fca5a5;
      }
      .explog-btn.danger:hover {
        background: #fef2f2;
      }
      .explog-btn.primary {
        background: #2563eb;
        color: #ffffff;
        border-color: #2563eb;
      }
      .explog-btn.primary:hover {
        background: #1d4ed8;
      }
      .explog-btn.primary:disabled {
        opacity: 0.4;
      }

      /* ── Table wrapper ── */
      .explog-table-wrap {
        flex: 1;
        overflow-y: auto;
        overflow-x: auto;
      }
      .explog-table-wrap::-webkit-scrollbar { width: 5px; height: 5px; }
      .explog-table-wrap::-webkit-scrollbar-track { background: #f0f0f0; }
      .explog-table-wrap::-webkit-scrollbar-thumb { background: #c4c4c4; border-radius: 10px; }

      /* ── Table ── */
      .explog-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
        min-width: 700px;
      }
      .explog-table th {
        position: sticky;
        top: 0;
        z-index: 2;
        background: #1e3a5f;
        color: #ffffff;
        font-weight: 600;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding: 8px 10px;
        text-align: left;
        white-space: nowrap;
        border-bottom: 2px solid #163050;
      }
      .explog-table th:first-child {
        text-align: center;
        width: 32px;
      }
      .explog-table td {
        padding: 7px 10px;
        border-bottom: 1px solid #e5e7eb;
        white-space: nowrap;
      }
      .explog-table tr:nth-child(even) td {
        background: #f8fafc;
      }
      .explog-table tr:nth-child(odd) td {
        background: #ffffff;
      }
      .explog-table tbody tr {
        cursor: pointer;
        transition: background 0.12s ease;
      }
      .explog-table tbody tr:hover td {
        background: #eff6ff !important;
      }
      .explog-table tbody tr.explog-selected td {
        background: #dbeafe !important;
      }

      /* Checkbox */
      .explog-chk {
        width: 14px;
        height: 14px;
        accent-color: #2563eb;
        cursor: pointer;
      }

      /* Number column */
      .explog-col-id {
        font-family: 'JetBrains Mono', monospace;
        color: #6b7280;
        font-size: 10px;
        text-align: center;
        width: 32px;
      }

      /* Timestamp */
      .explog-col-time {
        color: #6b7280;
        font-size: 10px;
      }

      /* Profile / Shaper tags */
      .explog-tag {
        display: inline-block;
        padding: 2px 7px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
      }
      .explog-tag.profile-trapezoidal { background: #fee2e2; color: #991b1b; }
      .explog-tag.profile-ascurve { background: #fef3c7; color: #92400e; }
      .explog-tag.profile-scurve { background: #dbeafe; color: #1e40af; }
      .explog-tag.shaper-none { background: #f3f4f6; color: #6b7280; }
      .explog-tag.shaper-ZV { background: #d1fae5; color: #065f46; }
      .explog-tag.shaper-ZVD { background: #c7d2fe; color: #3730a3; }
      .explog-tag.shaper-EI { background: #fce7f3; color: #9d174d; }

      /* Metric cells */
      .explog-metric {
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        font-weight: 500;
      }
      .explog-best {
        color: #16a34a;
        font-weight: 700;
      }

      /* Vibration reduction coloring */
      .explog-vib-green { color: #16a34a; font-weight: 700; }
      .explog-vib-yellow { color: #ca8a04; font-weight: 600; }
      .explog-vib-red { color: #dc2626; font-weight: 600; }

      /* ── Empty state ── */
      .explog-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        color: #9ca3af;
        gap: 8px;
      }
      .explog-empty-icon {
        font-size: 32px;
        opacity: 0.5;
      }
      .explog-empty-text {
        font-size: 13px;
      }

      /* ── Row flash animation ── */
      @keyframes explog-flash {
        0% { background: #fef3c7 !important; }
        100% { background: transparent !important; }
      }
      .explog-flash td {
        animation: explog-flash 1.2s ease-out;
      }

      /* ── Comparison Panel ── */
      .explog-compare-panel {
        flex-shrink: 0;
        background: #eff6ff;
        border-top: 2px solid #2563eb;
        padding: 16px;
        display: none;
        flex-direction: column;
        gap: 12px;
        max-height: 50%;
        overflow-y: auto;
      }
      .explog-compare-panel.active {
        display: flex;
      }
      .explog-compare-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .explog-compare-title {
        font-size: 13px;
        font-weight: 700;
        color: #1e3a5f;
      }

      .explog-compare-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
      }
      .explog-compare-table th {
        background: #1e3a5f;
        color: #ffffff;
        font-size: 10px;
        font-weight: 600;
        padding: 6px 10px;
        text-align: left;
        text-transform: uppercase;
      }
      .explog-compare-table td {
        padding: 5px 10px;
        border-bottom: 1px solid #d1d5db;
        background: #ffffff;
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
      }
      .explog-compare-table tr:nth-child(even) td {
        background: #f8fafc;
      }
      .explog-compare-table td:first-child {
        font-family: 'Inter', sans-serif;
        font-weight: 600;
        color: #374151;
        background: #f0f4ff;
      }
      .explog-delta-pos { color: #16a34a; font-weight: 700; }
      .explog-delta-neg { color: #dc2626; font-weight: 700; }
      .explog-cell-best {
        background: #d1fae5 !important;
        font-weight: 700;
      }

      /* ── Detail Modal ── */
      .explog-detail-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .explog-detail-card {
        background: #ffffff;
        border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.25);
        max-width: 520px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        padding: 24px;
      }
      .explog-detail-card h3 {
        font-size: 15px;
        font-weight: 700;
        margin-bottom: 16px;
        color: #1e3a5f;
      }
      .explog-detail-section {
        margin-bottom: 14px;
      }
      .explog-detail-section h4 {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #6b7280;
        margin-bottom: 8px;
        border-bottom: 1px solid #e5e7eb;
        padding-bottom: 4px;
      }
      .explog-detail-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 16px;
        font-size: 12px;
      }
      .explog-detail-grid dt {
        color: #6b7280;
      }
      .explog-detail-grid dd {
        font-family: 'JetBrains Mono', monospace;
        font-weight: 600;
        color: #1f2937;
        text-align: right;
      }
      .explog-detail-close {
        margin-top: 16px;
        width: 100%;
        padding: 10px;
        background: #f3f4f6;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        color: #374151;
      }
      .explog-detail-close:hover {
        background: #e5e7eb;
      }
    `;

    document.head.appendChild(style);
  }

  // ─────────────────────────────────────────────
  // UI Construction
  // ─────────────────────────────────────────────

  _buildUI() {
    this.container.innerHTML = '';
    this.container.innerHTML = `
      <div class="explog-root">
        <!-- Header -->
        <div class="explog-header">
          <div class="explog-header-left">
            <span style="font-size:15px;">📋</span>
            <span class="explog-title">실험 이력</span>
            <span class="explog-badge" id="explog-count">0</span>
          </div>
          <div class="explog-actions">
            <button class="explog-btn" id="explog-btn-csv" title="CSV 내보내기">📥 CSV 내보내기</button>
            <button class="explog-btn primary" id="explog-btn-compare" disabled title="2~3개 선택 후 비교">🔍 선택 비교</button>
            <button class="explog-btn danger" id="explog-btn-clear" title="전체 삭제">🗑 전체 삭제</button>
          </div>
        </div>

        <!-- Table -->
        <div class="explog-table-wrap" id="explog-table-wrap">
          <!-- rendered by renderTable() -->
        </div>

        <!-- Comparison Panel (hidden) -->
        <div class="explog-compare-panel" id="explog-compare-panel">
          <div class="explog-compare-header">
            <span class="explog-compare-title">📊 실험 비교</span>
            <button class="explog-btn" id="explog-btn-close-compare">✕ 닫기</button>
          </div>
          <div id="explog-compare-body"></div>
        </div>
      </div>
    `;

    // Bind header button events
    document.getElementById('explog-btn-csv').addEventListener('click', () => this.exportCSV());
    document.getElementById('explog-btn-compare').addEventListener('click', () => this.compareSelected());
    document.getElementById('explog-btn-clear').addEventListener('click', () => this.clearAll());
    document.getElementById('explog-btn-close-compare').addEventListener('click', () => {
      document.getElementById('explog-compare-panel').classList.remove('active');
    });
  }

  // ─────────────────────────────────────────────
  // Add Experiment
  // ─────────────────────────────────────────────

  /**
   * @param {'trapezoidal'|'ascurve'|'scurve'} profile
   * @param {'none'|'ZV'|'ZVD'|'EI'} shaper
   * @param {object} params  - { vMax, aMax, beta, gamma, fn, zeta, distance, payloadLoaded }
   * @param {object} results - { motionTime, settlingTimeShaped, settlingTimeUnshaped,
   *                             peakVibShaped, peakVibUnshaped, uphShaped, uphUnshaped, vibReduction }
   */
  addExperiment(profile, shaper, params, results) {
    this._load(); // ensure latest

    const record = {
      id: this._nextId(),
      timestamp: new Date().toISOString(),
      profile: profile,
      shaper: shaper,
      params: {
        vMax: params.vMax,
        aMax: params.aMax,
        beta: params.beta,
        gamma: params.gamma,
        fn: params.fn,
        zeta: params.zeta,
        distance: params.distance,
        payloadLoaded: params.payloadLoaded,
      },
      results: {
        motionTime: results.motionTime,
        settlingTimeShaped: results.settlingTimeShaped,
        settlingTimeUnshaped: results.settlingTimeUnshaped,
        peakVibShaped: results.peakVibShaped,
        peakVibUnshaped: results.peakVibUnshaped,
        uphShaped: results.uphShaped,
        uphUnshaped: results.uphUnshaped,
        vibReduction: results.vibReduction,
      },
    };

    this.experiments.push(record);
    this._save();
    this.renderTable();

    // Flash the newly added row
    requestAnimationFrame(() => {
      const row = document.querySelector(`[data-explog-id="${record.id}"]`);
      if (row) {
        row.classList.add('explog-flash');
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        setTimeout(() => row.classList.remove('explog-flash'), 1400);
      }
    });

    return record;
  }

  // ─────────────────────────────────────────────
  // Render Table
  // ─────────────────────────────────────────────

  renderTable() {
    const wrap = document.getElementById('explog-table-wrap');
    if (!wrap) return;

    // Update count badge
    const badge = document.getElementById('explog-count');
    if (badge) badge.textContent = this.experiments.length;

    // Empty state
    if (this.experiments.length === 0) {
      wrap.innerHTML = `
        <div class="explog-empty">
          <div class="explog-empty-icon">📭</div>
          <div class="explog-empty-text">아직 실험 기록이 없습니다</div>
          <div style="font-size:11px; color:#b0b7c3;">시뮬레이션을 실행하면 자동으로 기록됩니다</div>
        </div>
      `;
      this._updateCompareBtn();
      return;
    }

    // Find best UPH for highlighting
    const bestUPH = Math.max(...this.experiments.map(e => e.results.uphShaped || 0));

    // Sort newest first
    const sorted = [...this.experiments].sort((a, b) => b.id - a.id);

    let html = `
      <table class="explog-table">
        <thead>
          <tr>
            <th style="text-align:center;"><input type="checkbox" class="explog-chk" id="explog-chk-all" title="전체 선택"></th>
            <th>#</th>
            <th>시각</th>
            <th>프로파일</th>
            <th>쉐이퍼</th>
            <th>주요 파라미터</th>
            <th>정착시간</th>
            <th>UPH</th>
            <th>진동감소율</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const exp of sorted) {
      const isSelected = this.selectedIds.has(exp.id);
      const r = exp.results;

      // Vibration reduction color
      let vibClass = 'explog-vib-red';
      if (r.vibReduction >= 50) vibClass = 'explog-vib-green';
      else if (r.vibReduction >= 20) vibClass = 'explog-vib-yellow';

      // Best UPH?
      const uphClass = (r.uphShaped === bestUPH && bestUPH > 0) ? 'explog-best' : '';

      // Profile tag class
      const profileTag = `profile-${exp.profile}`;
      const profileLabel = { trapezoidal: 'Trap', ascurve: 'AS-Curve', scurve: 'S-Curve' }[exp.profile] || exp.profile;

      // Shaper tag class
      const shaperTag = `shaper-${exp.shaper}`;
      const shaperLabel = exp.shaper === 'none' ? 'None' : exp.shaper;

      html += `
        <tr data-explog-id="${exp.id}" class="${isSelected ? 'explog-selected' : ''}">
          <td style="text-align:center;">
            <input type="checkbox" class="explog-chk explog-row-chk"
                   data-id="${exp.id}" ${isSelected ? 'checked' : ''}>
          </td>
          <td class="explog-col-id">${exp.id}</td>
          <td class="explog-col-time" data-ts="${exp.timestamp}">${this.getRelativeTime(exp.timestamp)}</td>
          <td><span class="explog-tag ${profileTag}">${profileLabel}</span></td>
          <td><span class="explog-tag ${shaperTag}">${shaperLabel}</span></td>
          <td class="explog-metric">V${exp.params.vMax} A${exp.params.aMax}</td>
          <td class="explog-metric">${r.settlingTimeShaped != null ? r.settlingTimeShaped.toFixed(3) + 's' : '-'}</td>
          <td class="explog-metric ${uphClass}">${r.uphShaped != null ? r.uphShaped.toLocaleString() : '-'}</td>
          <td class="${vibClass}">${r.vibReduction != null ? r.vibReduction.toFixed(1) + '%' : '-'}</td>
        </tr>
      `;
    }

    html += '</tbody></table>';
    wrap.innerHTML = html;

    // Bind events
    this._bindTableEvents();
  }

  _bindTableEvents() {
    // Select-all checkbox
    const chkAll = document.getElementById('explog-chk-all');
    if (chkAll) {
      chkAll.addEventListener('change', () => {
        if (chkAll.checked) {
          this.experiments.forEach(e => this.selectedIds.add(e.id));
        } else {
          this.selectedIds.clear();
        }
        this.renderTable();
      });
    }

    // Row checkboxes
    document.querySelectorAll('.explog-row-chk').forEach(chk => {
      chk.addEventListener('change', (e) => {
        e.stopPropagation();
        const id = parseInt(chk.dataset.id, 10);
        if (chk.checked) {
          this.selectedIds.add(id);
        } else {
          this.selectedIds.delete(id);
        }
        // Update row visual without full re-render
        const row = chk.closest('tr');
        if (row) row.classList.toggle('explog-selected', chk.checked);
        this._updateCompareBtn();
      });
    });

    // Row click → detail view (but not on checkbox)
    document.querySelectorAll('[data-explog-id]').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT') return;
        const id = parseInt(row.dataset.explogId, 10);
        this._showDetail(id);
      });
    });

    this._updateCompareBtn();
  }

  _updateCompareBtn() {
    const btn = document.getElementById('explog-btn-compare');
    if (btn) {
      const n = this.selectedIds.size;
      btn.disabled = n < 2 || n > 3;
      btn.textContent = n > 0 ? `🔍 선택 비교 (${n})` : '🔍 선택 비교';
    }
  }

  _refreshTimestamps() {
    document.querySelectorAll('.explog-col-time[data-ts]').forEach(td => {
      td.textContent = this.getRelativeTime(td.dataset.ts);
    });
  }

  // ─────────────────────────────────────────────
  // Detail Modal
  // ─────────────────────────────────────────────

  _showDetail(id) {
    const exp = this.experiments.find(e => e.id === id);
    if (!exp) return;

    const p = exp.params;
    const r = exp.results;

    const overlay = document.createElement('div');
    overlay.className = 'explog-detail-overlay';
    overlay.innerHTML = `
      <div class="explog-detail-card">
        <h3>실험 #${exp.id} 상세</h3>

        <div class="explog-detail-section">
          <h4>기본 정보</h4>
          <dl class="explog-detail-grid">
            <dt>시각</dt><dd>${new Date(exp.timestamp).toLocaleString('ko-KR')}</dd>
            <dt>프로파일</dt><dd>${exp.profile}</dd>
            <dt>인풋 쉐이퍼</dt><dd>${exp.shaper}</dd>
            <dt>이동 거리</dt><dd>${p.distance} mm</dd>
            <dt>페이로드</dt><dd>${p.payloadLoaded ? '적재' : '무적재'}</dd>
          </dl>
        </div>

        <div class="explog-detail-section">
          <h4>모션 파라미터</h4>
          <dl class="explog-detail-grid">
            <dt>V<sub>max</sub></dt><dd>${p.vMax}</dd>
            <dt>A<sub>max</sub></dt><dd>${p.aMax}</dd>
            <dt>β (beta)</dt><dd>${p.beta != null ? p.beta : '-'}</dd>
            <dt>γ (gamma)</dt><dd>${p.gamma != null ? p.gamma : '-'}</dd>
            <dt>f<sub>n</sub></dt><dd>${p.fn} Hz</dd>
            <dt>ζ (zeta)</dt><dd>${p.zeta}</dd>
          </dl>
        </div>

        <div class="explog-detail-section">
          <h4>결과</h4>
          <dl class="explog-detail-grid">
            <dt>모션 시간</dt><dd>${r.motionTime != null ? r.motionTime.toFixed(4) + 's' : '-'}</dd>
            <dt>정착시간 (쉐이핑)</dt><dd>${r.settlingTimeShaped != null ? r.settlingTimeShaped.toFixed(4) + 's' : '-'}</dd>
            <dt>정착시간 (원본)</dt><dd>${r.settlingTimeUnshaped != null ? r.settlingTimeUnshaped.toFixed(4) + 's' : '-'}</dd>
            <dt>피크 진동 (쉐이핑)</dt><dd>${r.peakVibShaped != null ? r.peakVibShaped.toFixed(5) : '-'}</dd>
            <dt>피크 진동 (원본)</dt><dd>${r.peakVibUnshaped != null ? r.peakVibUnshaped.toFixed(5) : '-'}</dd>
            <dt>UPH (쉐이핑)</dt><dd>${r.uphShaped != null ? r.uphShaped.toLocaleString() : '-'}</dd>
            <dt>UPH (원본)</dt><dd>${r.uphUnshaped != null ? r.uphUnshaped.toLocaleString() : '-'}</dd>
            <dt>진동 감소율</dt><dd>${r.vibReduction != null ? r.vibReduction.toFixed(1) + '%' : '-'}</dd>
          </dl>
        </div>

        <button class="explog-detail-close" id="explog-detail-close">닫기</button>
      </div>
    `;

    document.body.appendChild(overlay);

    // Close handlers
    const close = () => { overlay.remove(); };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#explog-detail-close').addEventListener('click', close);
  }

  // ─────────────────────────────────────────────
  // Comparison
  // ─────────────────────────────────────────────

  compareSelected() {
    const ids = [...this.selectedIds];
    if (ids.length < 2 || ids.length > 3) return;

    const exps = ids.map(id => this.experiments.find(e => e.id === id)).filter(Boolean);
    if (exps.length < 2) return;

    const panel = document.getElementById('explog-compare-panel');
    const body = document.getElementById('explog-compare-body');

    // Define comparison metrics (label, key, unit, higherIsBetter)
    const metrics = [
      { label: '프로파일', key: 'profile', isParam: true },
      { label: '쉐이퍼', key: 'shaper', isParam: true },
      { label: 'V_max', key: 'vMax', isParam: true, inParams: true },
      { label: 'A_max', key: 'aMax', isParam: true, inParams: true },
      { label: 'β', key: 'beta', isParam: true, inParams: true },
      { label: 'γ', key: 'gamma', isParam: true, inParams: true },
      { label: '거리 (mm)', key: 'distance', isParam: true, inParams: true },
      { label: '모션 시간', key: 'motionTime', unit: 's', higherIsBetter: false },
      { label: '정착시간 (쉐이핑)', key: 'settlingTimeShaped', unit: 's', higherIsBetter: false },
      { label: '정착시간 (원본)', key: 'settlingTimeUnshaped', unit: 's', higherIsBetter: false },
      { label: '피크 진동 (쉐이핑)', key: 'peakVibShaped', unit: '', higherIsBetter: false },
      { label: '피크 진동 (원본)', key: 'peakVibUnshaped', unit: '', higherIsBetter: false },
      { label: 'UPH (쉐이핑)', key: 'uphShaped', unit: '', higherIsBetter: true },
      { label: 'UPH (원본)', key: 'uphUnshaped', unit: '', higherIsBetter: true },
      { label: '진동 감소율', key: 'vibReduction', unit: '%', higherIsBetter: true },
    ];

    // Header
    let html = '<table class="explog-compare-table"><thead><tr><th>항목</th>';
    exps.forEach(e => {
      html += `<th>실험 #${e.id}</th>`;
    });
    if (exps.length === 2) {
      html += '<th>차이 (Δ)</th>';
    }
    html += '</tr></thead><tbody>';

    for (const m of metrics) {
      html += '<tr>';
      html += `<td>${m.label}</td>`;

      const vals = exps.map(e => {
        if (m.isParam && !m.inParams) return e[m.key];
        if (m.inParams) return e.params[m.key];
        return e.results[m.key];
      });

      // Find best index for results
      let bestIdx = -1;
      if (!m.isParam && vals.every(v => v != null && typeof v === 'number')) {
        if (m.higherIsBetter) {
          const maxVal = Math.max(...vals);
          bestIdx = vals.indexOf(maxVal);
        } else {
          const minVal = Math.min(...vals);
          bestIdx = vals.indexOf(minVal);
        }
      }

      vals.forEach((v, i) => {
        const isBest = (i === bestIdx && bestIdx !== -1);
        const cls = isBest ? 'explog-cell-best' : '';
        let formatted = this._formatValue(v, m);
        html += `<td class="${cls}">${formatted}</td>`;
      });

      // Delta column (only for 2 experiments & numeric results)
      if (exps.length === 2 && !m.isParam) {
        const v0 = vals[0];
        const v1 = vals[1];
        if (v0 != null && v1 != null && typeof v0 === 'number' && typeof v1 === 'number' && v0 !== 0) {
          const diff = v1 - v0;
          const pct = ((v1 - v0) / Math.abs(v0) * 100).toFixed(1);
          const sign = diff > 0 ? '+' : '';

          // Determine if the delta is good or bad
          let deltaClass = '';
          if (m.higherIsBetter) {
            deltaClass = diff > 0 ? 'explog-delta-pos' : (diff < 0 ? 'explog-delta-neg' : '');
          } else {
            deltaClass = diff < 0 ? 'explog-delta-pos' : (diff > 0 ? 'explog-delta-neg' : '');
          }

          html += `<td class="${deltaClass}">${sign}${pct}%</td>`;
        } else {
          html += '<td>-</td>';
        }
      }

      html += '</tr>';
    }

    html += '</tbody></table>';

    body.innerHTML = html;
    panel.classList.add('active');

    // Scroll comparison into view
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  _formatValue(v, metric) {
    if (v == null) return '-';
    if (typeof v === 'boolean') return v ? '적재' : '무적재';
    if (typeof v === 'string') return v;
    if (typeof v === 'number') {
      if (metric.key === 'vibReduction') return v.toFixed(1) + '%';
      if (metric.key === 'uphShaped' || metric.key === 'uphUnshaped') return Math.floor(v).toLocaleString();
      if (metric.key === 'motionTime' || metric.key === 'settlingTimeShaped' || metric.key === 'settlingTimeUnshaped') return v.toFixed(4) + 's';
      if (metric.key === 'peakVibShaped' || metric.key === 'peakVibUnshaped') return v.toFixed(5);
      // generic numeric
      return v % 1 === 0 ? v.toLocaleString() : v.toFixed(3);
    }
    return String(v);
  }

  // ─────────────────────────────────────────────
  // CSV Export
  // ─────────────────────────────────────────────

  exportCSV() {
    if (this.experiments.length === 0) {
      alert('내보낼 실험 기록이 없습니다.');
      return;
    }

    const headers = [
      'ID', 'Timestamp', 'Profile', 'Shaper',
      'vMax', 'aMax', 'beta', 'gamma', 'fn', 'zeta', 'distance', 'payloadLoaded',
      'motionTime', 'settlingTimeShaped', 'settlingTimeUnshaped',
      'peakVibShaped', 'peakVibUnshaped',
      'uphShaped', 'uphUnshaped', 'vibReduction(%)',
    ];

    const rows = this.experiments.map(e => {
      const p = e.params;
      const r = e.results;
      return [
        e.id, e.timestamp, e.profile, e.shaper,
        p.vMax, p.aMax, p.beta, p.gamma, p.fn, p.zeta, p.distance, p.payloadLoaded,
        r.motionTime, r.settlingTimeShaped, r.settlingTimeUnshaped,
        r.peakVibShaped, r.peakVibUnshaped,
        r.uphShaped, r.uphUnshaped, r.vibReduction,
      ].map(v => (v == null ? '' : String(v)));
    });

    let csv = '\uFEFF'; // BOM for Korean Excel
    csv += headers.join(',') + '\n';
    csv += rows.map(r => r.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `experiment_log_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ─────────────────────────────────────────────
  // Delete
  // ─────────────────────────────────────────────

  deleteSelected() {
    if (this.selectedIds.size === 0) return;
    this.experiments = this.experiments.filter(e => !this.selectedIds.has(e.id));
    this.selectedIds.clear();
    this._save();
    this.renderTable();
    document.getElementById('explog-compare-panel').classList.remove('active');
  }

  clearAll() {
    if (this.experiments.length === 0) return;
    if (!confirm('전체 실험 기록을 삭제하시겠습니까?')) return;
    this.experiments = [];
    this.selectedIds.clear();
    this._save();
    this.renderTable();
    document.getElementById('explog-compare-panel').classList.remove('active');
  }

  // ─────────────────────────────────────────────
  // Relative Time (Korean)
  // ─────────────────────────────────────────────

  /**
   * Return a Korean-language relative time string.
   * @param {string} isoString
   * @returns {string}
   */
  getRelativeTime(isoString) {
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diffSec = Math.floor((now - then) / 1000);

    if (diffSec < 0) return '방금 전';
    if (diffSec < 10) return '방금 전';
    if (diffSec < 60) return `${diffSec}초 전`;

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}분 전`;

    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}시간 전`;

    const diffDay = Math.floor(diffHour / 24);
    if (diffDay === 1) return '어제';
    if (diffDay < 7) return `${diffDay}일 전`;

    const diffWeek = Math.floor(diffDay / 7);
    if (diffWeek < 5) return `${diffWeek}주 전`;

    const diffMonth = Math.floor(diffDay / 30);
    if (diffMonth < 12) return `${diffMonth}개월 전`;

    const diffYear = Math.floor(diffDay / 365);
    return `${diffYear}년 전`;
  }

  // ─────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────

  destroy() {
    if (this._relativeTimeTimer) {
      clearInterval(this._relativeTimeTimer);
      this._relativeTimeTimer = null;
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

window.ExperimentLog = ExperimentLog;
