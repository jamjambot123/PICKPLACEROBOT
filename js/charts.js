/**
 * Chart Manager
 * 
 * Manages 4 Chart.js real-time charts:
 * 1. Position vs Time (command + response)
 * 2. Velocity vs Time
 * 3. Acceleration vs Time (+ jerk)
 * 4. Vibration comparison (shaped vs unshaped)
 */

class ChartManager {
  constructor() {
    this.charts = {};
    this.maxDataPoints = 600;

    // Professional engineering color scheme
    this.colors = {
      cyan: 'rgba(37, 99, 235, 1)',        // Professional blue
      cyanDim: 'rgba(37, 99, 235, 0.1)',
      magenta: 'rgba(13, 148, 136, 1)',     // Professional teal
      magentaDim: 'rgba(13, 148, 136, 0.1)',
      green: 'rgba(22, 163, 74, 1)',        // Professional green
      greenDim: 'rgba(22, 163, 74, 0.1)',
      orange: 'rgba(234, 88, 12, 1)',       // Professional orange
      orangeDim: 'rgba(234, 88, 12, 0.1)',
      red: 'rgba(220, 38, 38, 1)',          // Professional red
      redDim: 'rgba(220, 38, 38, 0.1)',
      yellow: 'rgba(202, 138, 4, 0.8)',
      grid: 'rgba(0, 0, 0, 0.06)',
      gridBorder: 'rgba(0, 0, 0, 0.12)',
      textDim: 'rgba(100, 116, 139, 1)',
    };
  }

  /**
   * Initialize all 4 charts
   * @param {Object} canvasIds - {position, velocity, acceleration, vibration}
   */
  init(canvasIds) {
    const defaultOpts = this._getDefaultOptions();

    // 1. Position Chart
    this.charts.position = new Chart(
      document.getElementById(canvasIds.position).getContext('2d'),
      {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'Command',
              data: [],
              borderColor: this.colors.cyan,
              backgroundColor: this.colors.cyanDim,
              borderWidth: 2,
              fill: true,
              pointRadius: 0,
              tension: 0.2,
            },
            {
              label: 'Shaped Response',
              data: [],
              borderColor: this.colors.green,
              borderWidth: 1.5,
              borderDash: [4, 2],
              pointRadius: 0,
              fill: false,
              tension: 0.2,
            },
            {
              label: 'Unshaped Response',
              data: [],
              borderColor: this.colors.red,
              borderWidth: 1,
              borderDash: [2, 3],
              pointRadius: 0,
              fill: false,
              tension: 0.2,
            },
          ],
        },
        options: {
          ...defaultOpts,
          scales: {
            ...defaultOpts.scales,
            y: {
              ...defaultOpts.scales.y,
              title: { display: true, text: 'Position (mm)', color: this.colors.textDim, font: { size: 9 } },
            },
          },
        },
      }
    );

    // 2. Velocity Chart
    this.charts.velocity = new Chart(
      document.getElementById(canvasIds.velocity).getContext('2d'),
      {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'Command Vel',
              data: [],
              borderColor: this.colors.magenta,
              backgroundColor: this.colors.magentaDim,
              borderWidth: 2,
              fill: true,
              pointRadius: 0,
              tension: 0.2,
            },
            {
              label: 'Shaped Vel',
              data: [],
              borderColor: this.colors.green,
              borderWidth: 1.5,
              borderDash: [4, 2],
              pointRadius: 0,
              fill: false,
              tension: 0.2,
            },
            {
              label: 'Unshaped Vel',
              data: [],
              borderColor: this.colors.red,
              borderWidth: 1,
              borderDash: [2, 3],
              pointRadius: 0,
              fill: false,
              tension: 0.2,
            },
          ],
        },
        options: {
          ...defaultOpts,
          scales: {
            ...defaultOpts.scales,
            y: {
              ...defaultOpts.scales.y,
              title: { display: true, text: 'Velocity (mm/s)', color: this.colors.textDim, font: { size: 9 } },
            },
          },
        },
      }
    );

    // 3. Acceleration Chart (with jerk)
    this.charts.acceleration = new Chart(
      document.getElementById(canvasIds.acceleration).getContext('2d'),
      {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'Command Accel',
              data: [],
              borderColor: this.colors.orange,
              backgroundColor: this.colors.orangeDim,
              borderWidth: 2,
              fill: true,
              pointRadius: 0,
              tension: 0.2,
            },
            {
              label: 'Shaped Accel',
              data: [],
              borderColor: this.colors.cyan,
              borderWidth: 1.5,
              borderDash: [4, 2],
              pointRadius: 0,
              fill: false,
              tension: 0.2,
            },
            {
              label: 'Unshaped Accel',
              data: [],
              borderColor: this.colors.red,
              borderWidth: 1,
              borderDash: [2, 3],
              pointRadius: 0,
              fill: false,
              tension: 0.2,
            },
            {
              label: 'Jerk',
              data: [],
              borderColor: this.colors.yellow,
              borderWidth: 1,
              borderDash: [3, 3],
              pointRadius: 0,
              fill: false,
              tension: 0,
            },
          ],
        },
        options: {
          ...defaultOpts,
          scales: {
            ...defaultOpts.scales,
            y: {
              ...defaultOpts.scales.y,
              title: { display: true, text: 'Accel (mm/s²)', color: this.colors.textDim, font: { size: 9 } },
            },
          },
        },
      }
    );

    // 4. Vibration Comparison Chart
    this.charts.vibration = new Chart(
      document.getElementById(canvasIds.vibration).getContext('2d'),
      {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'Unshaped Vibration',
              data: [],
              borderColor: this.colors.red,
              backgroundColor: this.colors.redDim,
              borderWidth: 2,
              fill: true,
              pointRadius: 0,
              tension: 0.2,
            },
            {
              label: 'Shaped Vibration',
              data: [],
              borderColor: this.colors.cyan,
              backgroundColor: this.colors.cyanDim,
              borderWidth: 2,
              fill: true,
              pointRadius: 0,
              tension: 0.2,
            },
          ],
        },
        options: {
          ...defaultOpts,
          scales: {
            ...defaultOpts.scales,
            y: {
              ...defaultOpts.scales.y,
              title: { display: true, text: 'Vibration (mm)', color: this.colors.textDim, font: { size: 9 } },
            },
          },
        },
      }
    );

    // Double-click to reset zoom on all charts
    Object.values(canvasIds).forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('dblclick', () => {
          Object.values(this.charts).forEach(c => c.resetZoom());
        });
      }
    });
  }

  /**
   * Load pre-computed profile data and prepare cache for real-time rendering
   * @param {Object} data
   * @param {boolean} showShaped - Whether to display the shaped datasets
   */
  loadProfileData(data, showShaped = true) {
    this.showShaped = showShaped;
    const step = Math.max(1, Math.floor(data.time.length / this.maxDataPoints));
    this.cache = {
      labels: [],
      pos: [], shapedPos: [], unshapedPos: [],
      vel: [], shapedVel: [], unshapedVel: [],
      acc: [], shapedAcc: [], unshapedAcc: [], jerk: [],
      shapedVib: [], unshapedVib: []
    };

    for (let i = 0; i < data.time.length; i += step) {
      this.cache.labels.push(data.time[i].toFixed(3));
      this.cache.pos.push(data.position[i]);
      this.cache.vel.push(data.velocity[i]);
      this.cache.acc.push(data.acceleration[i]);
      this.cache.jerk.push(data.jerk ? data.jerk[i] : 0);

      if (data.shapedResponse) this.cache.shapedPos.push(data.shapedResponse[i]);
      if (data.unshapedResponse) this.cache.unshapedPos.push(data.unshapedResponse[i]);
      if (data.shapedVelResponse) this.cache.shapedVel.push(data.shapedVelResponse[i]);
      if (data.unshapedVelResponse) this.cache.unshapedVel.push(data.unshapedVelResponse[i]);
      if (data.shapedAccResponse) this.cache.shapedAcc.push(data.shapedAccResponse[i]);
      if (data.unshapedAccResponse) this.cache.unshapedAcc.push(data.unshapedAccResponse[i]);
      if (data.shapedVibration) this.cache.shapedVib.push(data.shapedVibration[i]);
      if (data.unshapedVibration) this.cache.unshapedVib.push(data.unshapedVibration[i]);
    }

    // Set fixed x-axis max to prevent layout shifting during real-time plotting
    const maxLabel = this.cache.labels[this.cache.labels.length - 1];
    for (const key in this.charts) {
      this.charts[key].options.scales.x.max = maxLabel;
    }

    // Add arrival time vertical line annotations to all charts
    const arrivalTime = data.arrivalTime || data.totalTime;
    const shaperArrivalTime = data.shaperArrivalTime || arrivalTime;
    this._setArrivalAnnotations(arrivalTime, shaperArrivalTime);

    // Default to drawing full initially
    this.drawFull();
  }

  /**
   * Draw the entire profile at once
   */
  drawFull() {
    if (!this.cache) return;
    this._updateChartsWithSlices(this.cache.labels.length);
  }

  /**
   * Update charts in real-time based on progress (0.0 to 1.0)
   * @param {number} progress
   */
  updateRealtime(progress) {
    if (!this.cache) return;
    const len = this.cache.labels.length;
    let limit = Math.floor(progress * len);
    if (limit < 1) limit = 1;
    if (limit > len) limit = len;
    
    this._updateChartsWithSlices(limit);
  }

  _updateChartsWithSlices(limit) {
    const c = this.cache;
    const fullLabels = c.labels;

    // Update Position chart
    const posChart = this.charts.position;
    posChart.data.labels = fullLabels;
    posChart.data.datasets[0].data = c.pos; // Full Command Position
    posChart.data.datasets[1].hidden = !this.showShaped;
    posChart.data.datasets[1].data = c.shapedPos.slice(0, limit);
    posChart.data.datasets[2].data = c.unshapedPos.slice(0, limit);
    posChart.update('none');

    // Update Velocity chart
    const velChart = this.charts.velocity;
    velChart.data.labels = fullLabels;
    velChart.data.datasets[0].data = c.vel; // Full Command Velocity
    velChart.data.datasets[1].hidden = !this.showShaped;
    velChart.data.datasets[1].data = c.shapedVel.slice(0, limit);
    velChart.data.datasets[2].data = c.unshapedVel.slice(0, limit);
    velChart.update('none');

    // Update Acceleration chart
    const accChart = this.charts.acceleration;
    accChart.data.labels = fullLabels;
    accChart.data.datasets[0].data = c.acc; // Full Command Accel
    accChart.data.datasets[1].hidden = !this.showShaped;
    accChart.data.datasets[1].data = c.shapedAcc.slice(0, limit);
    accChart.data.datasets[2].data = c.unshapedAcc.slice(0, limit);
    accChart.data.datasets[3].data = c.jerk; // Full Command Jerk
    accChart.update('none');

    // Update Vibration chart
    const vibChart = this.charts.vibration;
    vibChart.data.labels = fullLabels;
    vibChart.data.datasets[0].data = c.unshapedVib.slice(0, limit);
    vibChart.data.datasets[1].hidden = !this.showShaped;
    vibChart.data.datasets[1].data = c.shapedVib.slice(0, limit);
    vibChart.update('none');
  }

  /**
   * Update time cursor on all charts
   * @param {number} currentIndex - Current time index in the data
   */
  setTimeCursor(currentIndex) {
    // Could add a vertical line annotation at current time
    // For now, we rely on the trail visualization in 3D
  }

  /**
   * Clear all chart data
   */
  reset() {
    for (const key in this.charts) {
      const chart = this.charts[key];
      chart.data.labels = [];
      for (const ds of chart.data.datasets) {
        ds.data = [];
      }
      // Clear annotations
      if (chart.options.plugins.annotation) {
        chart.options.plugins.annotation.annotations = {};
      }
      chart.update('none');
    }
  }

  /**
   * Set arrival time annotations on all charts
   */
  _setArrivalAnnotations(arrivalTime, shaperArrivalTime) {
    for (const key in this.charts) {
      const chart = this.charts[key];
      if (!chart.options.plugins.annotation) {
        chart.options.plugins.annotation = { annotations: {} };
      }
      
      chart.options.plugins.annotation.annotations = {
        arrivalLine: {
          type: 'line',
          scaleID: 'x',
          value: arrivalTime.toFixed(3),
          borderColor: 'rgba(234, 88, 12, 0.8)',
          borderWidth: 2,
          borderDash: [6, 3],
          label: {
            display: true,
            content: 'Profile End',
            position: 'start',
            backgroundColor: 'rgba(234, 88, 12, 0.85)',
            color: '#fff',
            font: { size: 9, family: 'Inter', weight: '600' },
            padding: { x: 6, y: 3 },
          }
        },
        shaperArrivalLine: {
          type: 'line',
          scaleID: 'x',
          value: shaperArrivalTime.toFixed(3),
          borderColor: 'rgba(37, 99, 235, 0.8)',
          borderWidth: 2,
          borderDash: [6, 3],
          label: {
            display: true,
            content: '▼ Arrival',
            position: 'start',
            backgroundColor: 'rgba(37, 99, 235, 0.85)',
            color: '#fff',
            font: { size: 9, family: 'Inter', weight: '600' },
            padding: { x: 6, y: 3 },
          }
        },
      };
      chart.update('none');
    }
  }

  /**
   * Default Chart.js options for dark theme
   */
  _getDefaultOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: 'rgba(71, 85, 105, 1)',
            font: { size: 9, family: 'Inter' },
            boxWidth: 12,
            boxHeight: 2,
            padding: 8,
            usePointStyle: false,
          },
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          titleColor: '#1e293b',
          bodyColor: '#475569',
          titleFont: { size: 10, family: 'JetBrains Mono' },
          bodyFont: { size: 10, family: 'JetBrains Mono' },
          borderColor: 'rgba(0, 0, 0, 0.1)',
          borderWidth: 1,
          cornerRadius: 4,
          padding: 8,
          displayColors: true,
          boxWidth: 8,
          boxHeight: 8,
          boxPadding: 4,
        },
        zoom: {
          zoom: {
            wheel: { enabled: true, speed: 0.1 },
            drag: { enabled: true, backgroundColor: 'rgba(37, 99, 235, 0.15)' },
            pinch: { enabled: true },
            mode: 'x',
          },
          pan: {
            enabled: true,
            mode: 'x',
          }
        },
        annotation: {
          annotations: {}
        }
      },
      scales: {
        x: {
          display: true,
          grid: {
            color: this.colors.grid,
            drawBorder: false,
          },
          ticks: {
            color: this.colors.textDim,
            font: { size: 8, family: 'JetBrains Mono' },
            maxTicksLimit: 8,
            maxRotation: 0,
          },
          title: {
            display: true,
            text: 'Time (s)',
            color: this.colors.textDim,
            font: { size: 9 },
          },
        },
        y: {
          display: true,
          grid: {
            color: this.colors.grid,
            drawBorder: false,
          },
          ticks: {
            color: this.colors.textDim,
            font: { size: 8, family: 'JetBrains Mono' },
            maxTicksLimit: 6,
          },
        },
      },
    };
  }
}

// Make globally available
window.ChartManager = ChartManager;
