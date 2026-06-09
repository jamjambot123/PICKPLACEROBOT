/**
 * Motion Profile Generators
 * 
 * Implements AS-Curve (Asymmetric S-Curve) based on Keunho Rew's algorithm,
 * plus standard S-Curve (7-segment, jerk-limited) and Trapezoidal profiles
 * for comparison.
 * 
 * AS-Curve Parameters:
 *   beta  (β) : smoothness factor (0, 1] — higher = smoother
 *   gamma (γ) : asymmetricity factor (0, inf) — ratio of decel to accel
 *   Vmax      : maximum velocity
 *   Amax      : maximum acceleration
 *   delta     : total travel distance
 * 
 * AS-Curve Segments (7 phases):
 *   T1: jerk = +J          (accel ramp up)
 *   T2: jerk = 0           (constant accel)
 *   T3: jerk = -J          (accel ramp down)
 *   T4: jerk = 0           (constant velocity)
 *   T5: jerk = -J/γ²       (decel ramp up, asymmetric)
 *   T6: jerk = 0           (constant decel)
 *   T7: jerk = +J/γ²       (decel ramp down, asymmetric)
 * 
 * Reference: as_curve1_1.m by Keunho Rew, 2018
 */

class ASCurveProfile {
  /**
   * @param {Object} params
   * @param {number} params.vMax - Maximum velocity
   * @param {number} params.aMax - Maximum acceleration
   * @param {number} params.beta - Smoothness (0, 1], default 0.5
   * @param {number} params.gamma - Asymmetricity (0, inf), default 0.1
   * @param {number} params.distance - Total travel distance
   * @param {number} [params.dt=0.001] - Computation timestep
   */
  constructor({ vMax, aMax, beta = 0.5, gamma = 0.1, distance, dt = 0.001 }) {
    this.vMax = Math.abs(vMax);
    this.aMax = Math.abs(aMax);
    this.beta = Math.max(0.01, Math.min(1, beta));
    this.gamma = Math.max(0.01, gamma);
    this.distance = Math.abs(distance);
    this.direction = distance >= 0 ? 1 : -1;
    this.dt = dt;

    // Computed segment times
    this.t = [0, 0, 0, 0, 0, 0, 0]; // t1..t7 (cumulative end times)
    this.totalTime = 0;
    this.jerkValue = 0;
    this.dcase = '';

    // Pre-computed arrays
    this._time = null;
    this._jerk = null;
    this._acc = null;
    this._vel = null;
    this._pos = null;

    this._compute();
  }

  _compute() {
    const { vMax, aMax, beta, gamma, distance, dt } = this;

    if (distance < 1e-10) {
      this._time = [0];
      this._jerk = [0];
      this._acc = [0];
      this._vel = [0];
      this._pos = [0];
      return;
    }

    // Critical distances (from reference algorithm)
    const deltaShort = (1 + gamma) * beta * beta * vMax * vMax / aMax;
    const deltaLong = (1 + gamma) * (1 + beta) / 2 * vMax * vMax / aMax;

    // Base segment durations
    const tjs = beta * vMax / aMax;      // jerk time at max
    const tas = (1 - beta) * vMax / aMax; // const accel time at max

    let tj, ta, tv;

    // Determine distance case
    if (distance <= deltaShort) {
      // Short distance: can't reach Amax or Vmax
      this.dcase = 'short';
      tv = 0;
      ta = 0;
      tj = Math.pow(tjs / (1 + gamma) / aMax * distance, 1 / 3);
    } else if (distance >= deltaLong) {
      // Long distance: reaches both Amax and Vmax
      this.dcase = 'long';
      tj = tjs;
      ta = tas;
      tv = (distance - deltaLong) / vMax;
    } else {
      // Medium distance: reaches Amax but not Vmax
      this.dcase = 'medium';
      tj = tjs;
      ta = -1.5 * beta * vMax / aMax +
           Math.sqrt(
             Math.pow(beta * vMax / aMax / 2, 2) +
             (2 * distance / aMax / (1 + gamma))
           );
      tv = 0;
    }

    // Jerk magnitude
    this.jerkValue = (aMax * aMax) / (beta * vMax);
    const J = this.jerkValue;

    // Cumulative segment end times
    const t1 = tj;
    const t2 = t1 + ta;
    const t3 = t2 + tj;
    const t4 = t3 + tv;
    const t5 = t4 + gamma * tj;
    const t6 = t5 + gamma * ta;
    const t7 = t6 + gamma * tj;

    this.t = [t1, t2, t3, t4, t5, t6, t7];
    this.totalTime = t7;

    // Generate profile arrays using numerical integration (matching MATLAB reference)
    const len = Math.max(2, Math.round((t7 + 0.1) / dt));
    const time = new Float64Array(len);
    const jerk = new Float64Array(len);
    const acc = new Float64Array(len);
    const vel = new Float64Array(len);
    const pos = new Float64Array(len);

    // Initialize time array
    for (let i = 0; i < len; i++) {
      time[i] = i * dt;
    }

    // Numerical integration loop (matches MATLAB reference exactly)
    for (let k = 0; k < len - 1; k++) {
      const tt = time[k];

      if (tt <= t1) {
        // Phase 1: positive jerk (acceleration increasing)
        jerk[k + 1] = J;
      } else if (tt <= t2) {
        // Phase 2: zero jerk (constant acceleration)
        jerk[k + 1] = 0;
      } else if (tt <= t3) {
        // Phase 3: negative jerk (acceleration decreasing)
        jerk[k + 1] = -J;
      } else if (tt <= t4) {
        // Phase 4: constant velocity
        jerk[k + 1] = 0;
      } else if (tt <= t5) {
        // Phase 5: deceleration ramp up (asymmetric: J/γ²)
        jerk[k + 1] = -J / (gamma * gamma);
      } else if (tt <= t6) {
        // Phase 6: constant deceleration
        jerk[k + 1] = 0;
      } else if (tt <= t7) {
        // Phase 7: deceleration ramp down (asymmetric: J/γ²)
        jerk[k + 1] = J / (gamma * gamma);
      } else {
        // Settled
        jerk[k + 1] = 0;
      }

      acc[k + 1] = acc[k] + jerk[k + 1] * dt;
      vel[k + 1] = vel[k] + acc[k + 1] * dt;
      pos[k + 1] = pos[k] + vel[k + 1] * dt;

      // Phase 4 correction (constant velocity, no acceleration)
      if (tt > t3 && tt <= t4) {
        acc[k + 1] = acc[k];
        vel[k + 1] = vel[k];
        pos[k + 1] = pos[k] + vel[k] * dt;
      }

      // After t7: settled
      if (tt > t7) {
        acc[k + 1] = 0;
        vel[k + 1] = 0;
        pos[k + 1] = pos[k];
      }
    }

    this._time = Array.from(time);
    this._jerk = Array.from(jerk);
    this._acc = Array.from(acc);
    this._vel = Array.from(vel);
    this._pos = Array.from(pos);

    // Compute peak velocity reached
    this.vReach = 0;
    for (let i = 0; i < len; i++) {
      if (vel[i] > this.vReach) this.vReach = vel[i];
    }
  }

  /**
   * Get motion state at time t (via interpolation of pre-computed arrays)
   */
  getState(t) {
    if (!this._time || this._time.length === 0) {
      return { position: 0, velocity: 0, acceleration: 0, jerk: 0 };
    }

    if (t <= 0) {
      return { position: 0, velocity: 0, acceleration: 0, jerk: 0 };
    }

    if (t >= this.totalTime) {
      const last = this._pos.length - 1;
      return {
        position: this.direction * this._pos[last],
        velocity: 0,
        acceleration: 0,
        jerk: 0
      };
    }

    // Find index via time
    const idx = t / this.dt;
    const i = Math.floor(idx);
    const frac = idx - i;

    if (i >= this._time.length - 1) {
      const last = this._pos.length - 1;
      return {
        position: this.direction * this._pos[last],
        velocity: 0,
        acceleration: 0,
        jerk: 0
      };
    }

    // Linear interpolation
    const lerp = (a, b) => a + (b - a) * frac;
    const d = this.direction;

    return {
      position: d * lerp(this._pos[i], this._pos[i + 1]),
      velocity: d * lerp(this._vel[i], this._vel[i + 1]),
      acceleration: d * lerp(this._acc[i], this._acc[i + 1]),
      jerk: d * this._jerk[i + 1]
    };
  }

  /**
   * Generate array of sampled states
   */
  getSamples(dt) {
    if (dt && Math.abs(dt - this.dt) > 1e-8) {
      // Re-sample at different dt
      const samples = [];
      for (let t = 0; t <= this.totalTime + dt; t += dt) {
        const state = this.getState(t);
        state.time = Math.min(t, this.totalTime);
        samples.push(state);
      }
      return samples;
    }

    // Return pre-computed arrays directly
    const samples = [];
    const n = Math.min(this._time.length, this._pos.length);
    for (let i = 0; i < n; i++) {
      if (this._time[i] > this.totalTime + this.dt) break;
      samples.push({
        time: this._time[i],
        position: this.direction * this._pos[i],
        velocity: this.direction * this._vel[i],
        acceleration: this.direction * this._acc[i],
        jerk: this.direction * this._jerk[i]
      });
    }
    return samples;
  }

  /**
   * Get segment info for visualization
   */
  getSegmentInfo() {
    const names = [
      'Jerk+ (Accel↑)',
      'Const Accel',
      'Jerk- (Accel↓)',
      'Const Velocity',
      'Jerk- (Decel↑) [γ]',
      'Const Decel [γ]',
      'Jerk+ (Decel↓) [γ]'
    ];

    return this.t.map((endTime, i) => ({
      index: i + 1,
      name: names[i],
      startTime: i === 0 ? 0 : this.t[i - 1],
      endTime,
      duration: endTime - (i === 0 ? 0 : this.t[i - 1]),
    }));
  }
}


/**
 * Standard S-Curve (7-segment symmetric) Motion Profile
 * Standard jerk-limited trajectory with Vmax, Amax, Jmax constraints.
 */
class SCurveProfile {
  constructor({ vMax, aMax, jMax, distance }) {
    this.vMax = Math.abs(vMax);
    this.aMax = Math.abs(aMax);
    this.jMax = Math.abs(jMax);
    this.distance = Math.abs(distance);
    this.direction = distance >= 0 ? 1 : -1;

    this.segments = [];
    this.boundaries = [];
    this.totalTime = 0;
    this.vReach = 0;
    this.aReach = 0;

    this._compute();
  }

  _compute() {
    let { vMax, aMax, jMax, distance } = this;

    if (distance < 1e-10) {
      this.segments = Array(7).fill(null).map(() => ({ duration: 0, jerk: 0 }));
      this.boundaries = Array(8).fill(null).map(() => ({ p: 0, v: 0, a: 0 }));
      this.totalTime = 0;
      return;
    }

    let Tj, Ta;

    if (aMax * aMax / jMax <= vMax) {
      Tj = aMax / jMax;
      Ta = vMax / aMax - Tj;
    } else {
      Tj = Math.sqrt(vMax / jMax);
      Ta = 0;
    }
    if (Ta < 0) Ta = 0;

    let aEff = jMax * Tj;
    let vReach = aEff * (Tj + Ta);
    let dAccel = this._calcAccelDist(Tj, Ta, jMax);

    let Tv;
    if (2 * dAccel <= distance + 1e-10) {
      Tv = Math.max(0, (distance - 2 * dAccel) / vReach);
    } else {
      Tv = 0;
      let vLo = 0, vHi = vReach;
      for (let iter = 0; iter < 80; iter++) {
        let vMid = (vLo + vHi) / 2;
        let result = this._solveForVelocity(vMid, aMax, jMax);
        if (2 * result.dist <= distance + 1e-10) vLo = vMid;
        else vHi = vMid;
      }
      let result = this._solveForVelocity(vLo, aMax, jMax);
      Tj = result.tj; Ta = result.ta;
      aEff = jMax * Tj;
      vReach = vLo;
      dAccel = result.dist;
    }

    this.vReach = vReach;
    this.aReach = aEff;

    this.segments = [
      { duration: Tj, jerk: jMax },
      { duration: Ta, jerk: 0 },
      { duration: Tj, jerk: -jMax },
      { duration: Tv, jerk: 0 },
      { duration: Tj, jerk: -jMax },
      { duration: Ta, jerk: 0 },
      { duration: Tj, jerk: jMax },
    ];

    this.totalTime = this.segments.reduce((s, seg) => s + seg.duration, 0);
    this._computeBoundaries();
  }

  _calcAccelDist(Tj, Ta, J) {
    let v1 = 0.5 * J * Tj * Tj;
    let p1 = (1 / 6) * J * Tj * Tj * Tj;
    let a1 = J * Tj;
    let v2 = v1 + a1 * Ta;
    let p2 = p1 + v1 * Ta + 0.5 * a1 * Ta * Ta;
    let p3 = p2 + v2 * Tj + 0.5 * a1 * Tj * Tj - (1 / 6) * J * Tj * Tj * Tj;
    return p3;
  }

  _solveForVelocity(v, aMax, jMax) {
    let Tj, Ta;
    if (v < 1e-12) return { tj: 0, ta: 0, dist: 0 };
    if (aMax * aMax / jMax <= v) {
      Tj = aMax / jMax;
      Ta = v / (jMax * Tj) - Tj;
    } else {
      Tj = Math.sqrt(v / jMax);
      Ta = 0;
    }
    if (Ta < 0) Ta = 0;
    return { tj: Tj, ta: Ta, dist: this._calcAccelDist(Tj, Ta, jMax) };
  }

  _computeBoundaries() {
    this.boundaries = [{ p: 0, v: 0, a: 0 }];
    let p = 0, v = 0, a = 0;
    for (const seg of this.segments) {
      const T = seg.duration;
      const J = seg.jerk;
      p += v * T + 0.5 * a * T * T + (1 / 6) * J * T * T * T;
      v += a * T + 0.5 * J * T * T;
      a += J * T;
      if (Math.abs(a) < 1e-10) a = 0;
      if (Math.abs(v) < 1e-10) v = 0;
      this.boundaries.push({ p, v, a });
    }
  }

  getState(t) {
    if (t <= 0) return { position: 0, velocity: 0, acceleration: 0, jerk: 0 };
    if (t >= this.totalTime) return { position: this.direction * this.distance, velocity: 0, acceleration: 0, jerk: 0 };

    let elapsed = 0;
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      const nextElapsed = elapsed + seg.duration;
      if (t < nextElapsed || i === this.segments.length - 1) {
        const tau = t - elapsed;
        const { p, v, a } = this.boundaries[i];
        const J = seg.jerk;
        const d = this.direction;
        return {
          position: d * (p + v * tau + 0.5 * a * tau * tau + (1 / 6) * J * tau * tau * tau),
          velocity: d * (v + a * tau + 0.5 * J * tau * tau),
          acceleration: d * (a + J * tau),
          jerk: d * J
        };
      }
      elapsed = nextElapsed;
    }
    return { position: this.direction * this.distance, velocity: 0, acceleration: 0, jerk: 0 };
  }

  getSamples(dt = 0.001) {
    const samples = [];
    for (let t = 0; t <= this.totalTime + dt; t += dt) {
      const state = this.getState(t);
      state.time = Math.min(t, this.totalTime);
      samples.push(state);
    }
    return samples;
  }

  getSegmentInfo() {
    let cumTime = 0;
    const names = [
      'Jerk+ (Accel↑)', 'Const Accel', 'Jerk- (Accel↓)',
      'Const Velocity',
      'Jerk- (Decel↑)', 'Const Decel', 'Jerk+ (Decel↓)'
    ];
    return this.segments.map((seg, i) => {
      const start = cumTime;
      cumTime += seg.duration;
      return { index: i + 1, name: names[i], startTime: start, endTime: cumTime, duration: seg.duration, jerk: seg.jerk };
    });
  }
}


/**
 * Trapezoidal (bang-bang acceleration) Motion Profile
 */
class TrapezoidalProfile {
  constructor({ vMax, aMax, distance }) {
    this.vMax = Math.abs(vMax);
    this.aMax = Math.abs(aMax);
    this.distance = Math.abs(distance);
    this.direction = distance >= 0 ? 1 : -1;
    this.tAccel = 0; this.tConst = 0; this.tDecel = 0;
    this.totalTime = 0; this.vReach = 0;
    this._compute();
  }

  _compute() {
    let { vMax, aMax, distance } = this;
    if (distance < 1e-10) { this.totalTime = 0; return; }

    let tAccel = vMax / aMax;
    let dAccel = 0.5 * aMax * tAccel * tAccel;

    if (2 * dAccel > distance) {
      tAccel = Math.sqrt(distance / aMax);
      this.vReach = aMax * tAccel;
      this.tAccel = tAccel; this.tDecel = tAccel; this.tConst = 0;
    } else {
      this.vReach = vMax;
      this.tAccel = tAccel; this.tDecel = tAccel;
      this.tConst = (distance - 2 * dAccel) / vMax;
    }
    this.totalTime = this.tAccel + this.tConst + this.tDecel;
  }

  getState(t) {
    const d = this.direction;
    if (t <= 0) return { position: 0, velocity: 0, acceleration: 0, jerk: 0 };
    if (t >= this.totalTime) return { position: d * this.distance, velocity: 0, acceleration: 0, jerk: 0 };
    const { tAccel, tConst, aMax, vReach } = this;
    if (t < tAccel) return { position: d * 0.5 * aMax * t * t, velocity: d * aMax * t, acceleration: d * aMax, jerk: 0 };
    const dAccel = 0.5 * aMax * tAccel * tAccel;
    if (t < tAccel + tConst) { const dt2 = t - tAccel; return { position: d * (dAccel + vReach * dt2), velocity: d * vReach, acceleration: 0, jerk: 0 }; }
    const dConst = dAccel + vReach * tConst;
    const dt3 = t - tAccel - tConst;
    return { position: d * (dConst + vReach * dt3 - 0.5 * aMax * dt3 * dt3), velocity: d * (vReach - aMax * dt3), acceleration: d * (-aMax), jerk: 0 };
  }

  getSamples(dt = 0.001) {
    const samples = [];
    for (let t = 0; t <= this.totalTime + dt; t += dt) {
      const state = this.getState(t);
      state.time = Math.min(t, this.totalTime);
      samples.push(state);
    }
    return samples;
  }
}

// Make globally available
window.ASCurveProfile = ASCurveProfile;
window.SCurveProfile = SCurveProfile;
window.TrapezoidalProfile = TrapezoidalProfile;
