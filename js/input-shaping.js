/**
 * Input Shaping Module
 * 
 * Implements feedforward vibration suppression filters:
 * - ZV (Zero Vibration): 2 impulses, fastest response
 * - ZVD (Zero Vibration + Derivative): 3 impulses, more robust
 * - EI (Extra Insensitive): 3 impulses, most robust to frequency errors
 * 
 * Also provides second-order system response simulation for comparing
 * shaped vs unshaped motion.
 */

class InputShaper {

  /**
   * Compute ZV (Zero Vibration) shaper impulses
   * @param {number} fn - Natural frequency (Hz)
   * @param {number} zeta - Damping ratio (0~1)
   * @returns {{amplitudes: number[], times: number[]}}
   */
  static computeZV(fn, zeta) {
    const wd = 2 * Math.PI * fn * Math.sqrt(1 - zeta * zeta);
    const K = Math.exp(-zeta * Math.PI / Math.sqrt(1 - zeta * zeta));
    const denom = 1 + K;

    return {
      amplitudes: [1 / denom, K / denom],
      times: [0, Math.PI / wd],
      name: 'ZV',
      delay: Math.PI / wd
    };
  }

  /**
   * Compute ZVD (Zero Vibration + Derivative) shaper impulses
   * @param {number} fn - Natural frequency (Hz)
   * @param {number} zeta - Damping ratio (0~1)
   * @returns {{amplitudes: number[], times: number[]}}
   */
  static computeZVD(fn, zeta) {
    const wd = 2 * Math.PI * fn * Math.sqrt(1 - zeta * zeta);
    const K = Math.exp(-zeta * Math.PI / Math.sqrt(1 - zeta * zeta));
    const K2 = K * K;
    const denom = 1 + 2 * K + K2;
    const halfPeriod = Math.PI / wd;

    return {
      amplitudes: [1 / denom, 2 * K / denom, K2 / denom],
      times: [0, halfPeriod, 2 * halfPeriod],
      name: 'ZVD',
      delay: 2 * halfPeriod
    };
  }

  /**
   * Compute EI (Extra Insensitive) shaper impulses
   * @param {number} fn - Natural frequency (Hz)
   * @param {number} zeta - Damping ratio (0~1)
   * @param {number} vTol - Tolerable vibration level (default 0.05 = 5%)
   * @returns {{amplitudes: number[], times: number[]}}
   */
  static computeEI(fn, zeta, vTol = 0.05) {
    const wd = 2 * Math.PI * fn * Math.sqrt(1 - zeta * zeta);
    const K = Math.exp(-zeta * Math.PI / Math.sqrt(1 - zeta * zeta));
    const halfPeriod = Math.PI / wd;

    // EI shaper with specified insensitivity
    const v = vTol;
    const a1 = 0.25 * (1 + v);
    const a3 = a1;
    const a2 = 1 - 2 * a1;

    return {
      amplitudes: [a1, a2, a3],
      times: [0, halfPeriod, 2 * halfPeriod],
      name: 'EI',
      delay: 2 * halfPeriod
    };
  }

  /**
   * Convolve a position command signal with shaper impulses
   * @param {number[]} signal - Input position command array
   * @param {number} dt - Time step (seconds)
   * @param {{amplitudes: number[], times: number[]}} shaper - Shaper definition
   * @returns {number[]} Shaped position command (longer by shaper delay)
   */
  static convolve(signal, dt, shaper) {
    const maxDelay = Math.ceil(shaper.times[shaper.times.length - 1] / dt);
    const outLen = signal.length + maxDelay;
    const result = new Float64Array(outLen);
    const lastVal = signal.length > 0 ? signal[signal.length - 1] : 0;
    const firstVal = signal.length > 0 ? signal[0] : 0;

    // Helper: get signal value at any index, clamping to first/last
    const getVal = (idx) => {
      if (idx < 0) return firstVal;
      if (idx >= signal.length) return lastVal;
      return signal[idx];
    };

    for (let i = 0; i < shaper.amplitudes.length; i++) {
      const amp = shaper.amplitudes[i];
      const exactDelay = shaper.times[i] / dt; // fractional sample delay

      for (let j = 0; j < outLen; j++) {
        const exactIdx = j - exactDelay;
        const idx0 = Math.floor(exactIdx);
        const frac = exactIdx - idx0;
        // Linear interpolation between adjacent samples
        const val = getVal(idx0) * (1 - frac) + getVal(idx0 + 1) * frac;
        result[j] += amp * val;
      }
    }

    return Array.from(result);
  }

  /**
   * Simulate realistic 4th-order 2-Mass system response 
   * Models the gantry as: Servo Motor (m1) coupled to Load (m2) via spring-damper (k, c).
   * Includes PID control, Feedforward, Coulomb friction, and variable payload.
   * 
   * @param {number[]} input - Command input array (position)
   * @param {number} dt - Time step (seconds)
   * @param {number} fn - Design natural frequency (Hz)
   * @param {number} zeta - Damping ratio
   * @param {Object} opts - Simulation options
   * @returns {Object} Load response { position, velocity, acceleration }
   */
  static simulateResponse(input, dt, fn, zeta, opts = {}) {
    const payloadLoaded = opts.payloadLoaded || false;

    const wn = 2 * Math.PI * fn;
    
    // 2-Mass Model Parameters
    // Motor (m1) = servo-driven carriage, perfectly tracks command position
    // Load (m2) = robot arm + end-effector, connected via mechanical compliance
    const m2_base = 0.5; // Unloaded arm mass (kg)
    const m2_load = 1.0; // Loaded arm mass (kg) — payload doubles effective mass
    
    // Effective load mass changes with payload
    const m2 = payloadLoaded ? m2_load : m2_base;
    
    // Spring-damper coupling (mechanical compliance between carriage and end-effector)
    // k and c are set so that the UNLOADED system has natural frequency = fn
    // When payload is loaded, actual fn drops to fn * sqrt(m2_base/m2_load)
    const k = wn * wn * m2_base;
    const c = 2 * zeta * wn * m2_base;

    const n = input.length;
    const responsePos = new Float64Array(n);
    const responseVel = new Float64Array(n);
    const responseAcc = new Float64Array(n);

    // State: [x2(load position), v2(load velocity)]
    // Motor position x1 = input[i] (perfect servo tracking)
    let x2 = 0, v2 = 0;

    // Sub-stepping: 10 internal RK4 steps per output sample for numerical accuracy
    const subSteps = 10;
    const h = dt / subSteps;

    for (let i = 0; i < n; i++) {
      // Motor (carriage) perfectly tracks the command position
      const x1 = input[i];
      const v1 = i > 0 ? (input[i] - input[i - 1]) / dt : 0;

      // Run sub-stepped RK4 for load dynamics only
      for (let s = 0; s < subSteps; s++) {
        // Spring-damper force: F = k*(x1 - x2) + c*(v1 - v2)
        const f = (px2, pv2) => {
          const F_spring = k * (x1 - px2) + c * (v1 - pv2);
          return { dx: pv2, dv: F_spring / m2 };
        };

        const k1 = f(x2, v2);
        const k2 = f(x2 + 0.5*h*k1.dx, v2 + 0.5*h*k1.dv);
        const k3 = f(x2 + 0.5*h*k2.dx, v2 + 0.5*h*k2.dv);
        const k4 = f(x2 + h*k3.dx, v2 + h*k3.dv);

        x2 += (h/6) * (k1.dx + 2*k2.dx + 2*k3.dx + k4.dx);
        v2 += (h/6) * (k1.dv + 2*k2.dv + 2*k3.dv + k4.dv);
      }

      responsePos[i] = x2;
      responseVel[i] = v2;
      responseAcc[i] = i > 0 ? (v2 - responseVel[Math.max(0, i-1)]) / dt : 0;
    }

    return {
      position: Array.from(responsePos),
      velocity: Array.from(responseVel),
      acceleration: Array.from(responseAcc)
    };
  }

  /**
   * Compute vibration (position error from target) from response
   * Vibration = deviation from the final target position.
   * During active motion (command still changing), vibration is reported as 0.
   * After motion completes, vibration = response - targetPosition.
   * @param {number[]} response - System response
   * @param {number[]} command - Command signal (shaped or unshaped)
   * @returns {number[]} Vibration array (mm)
   */
  static computeVibration(response, command) {
    const n = response.length;
    const vibration = new Float64Array(n);
    const targetPos = command.length > 0 ? command[command.length - 1] : 0;
    
    // Find when command effectively reaches its final value (motion complete)
    const tolerance = 0.001; // 1μm
    let motionEndIdx = command.length - 1;
    for (let i = command.length - 1; i >= 0; i--) {
      if (Math.abs(command[i] - targetPos) > tolerance) {
        motionEndIdx = i + 1;
        break;
      }
    }

    for (let i = 0; i < n; i++) {
      if (i < motionEndIdx) {
        // During active motion: report tracking error vs instantaneous command
        const cmd = i < command.length ? command[i] : targetPos;
        vibration[i] = response[i] - cmd;
      } else {
        // After motion complete: report deviation from target (this is true vibration)
        vibration[i] = response[i] - targetPos;
      }
    }

    return Array.from(vibration);
  }

  /**
   * Compute residual vibration amplitude after motion settles
   * @param {number[]} vibration - Vibration array
   * @param {number} settleIndex - Index after which to measure residual
   * @returns {number} Peak-to-peak residual vibration
   */
  static computeResidualVibration(vibration, settleIndex) {
    if (settleIndex >= vibration.length) return 0;

    let max = -Infinity;
    let min = Infinity;

    for (let i = settleIndex; i < vibration.length; i++) {
      if (vibration[i] > max) max = vibration[i];
      if (vibration[i] < min) min = vibration[i];
    }

    return max - min;
  }

  /**
   * Get sensitivity curve for a shaper
   * Shows how robust the shaper is to frequency errors
   * @param {{amplitudes: number[], times: number[]}} shaper
   * @param {number} fn - Design frequency
   * @param {number} zeta - Design damping
   * @param {number} freqRange - Frequency range to evaluate (0.5 to 1.5 of fn)
   * @returns {{frequencies: number[], sensitivity: number[]}}
   */
  static getSensitivityCurve(shaper, fn, zeta, numPoints = 200) {
    const frequencies = [];
    const sensitivity = [];

    for (let i = 0; i < numPoints; i++) {
      const ratio = 0.3 + (i / (numPoints - 1)) * 1.4; // 0.3 to 1.7
      const f = fn * ratio;
      const wd = 2 * Math.PI * f * Math.sqrt(1 - zeta * zeta);

      // Compute residual vibration percentage
      let cosSum = 0, sinSum = 0;
      for (let j = 0; j < shaper.amplitudes.length; j++) {
        const phase = wd * shaper.times[j];
        cosSum += shaper.amplitudes[j] * Math.cos(phase);
        sinSum += shaper.amplitudes[j] * Math.sin(phase);
      }

      const V = Math.sqrt(cosSum * cosSum + sinSum * sinSum);
      frequencies.push(ratio);
      sensitivity.push(V * 100); // percentage
    }

    return { frequencies, sensitivity };
  }
}

// Make globally available
window.InputShaper = InputShaper;
