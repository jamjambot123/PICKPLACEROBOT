/**
 * AI Auto-Tuner using Stochastic Hill Climbing / Particle Swarm Optimization
 * Evaluates thousands of motion profiles against the 4th-order physics engine
 * to find the optimal parameters that minimize movement time and vibration.
 */

class AIOptimizer {
  constructor(iterations = 500) {
    this.iterations = iterations;
    this.history = [];
    
    // Bounds for AS-Curve parameters
    this.bounds = {
      vMax: { min: 100, max: 3000 },
      aMax: { min: 1000, max: 50000 },
      beta: { min: 0.1, max: 1.0 },
      gamma: { min: 0.1, max: 2.0 },
      jMax: { min: 50000, max: 1000000 }
    };
  }

  /**
   * Run the optimization asynchronously so it doesn't block the UI completely
   */
  async optimize(envParams, onProgress) {
    let bestParams = {
      vMax: envParams.vMax,
      aMax: envParams.aMax,
      beta: envParams.beta,
      gamma: envParams.gamma,
      jMax: envParams.jMax
    };
    
    this.history = [];
    let bestEval = this._evaluateCost(bestParams, envParams);
    let bestCost = bestEval.cost;

    // Number of particles for a simple PSO-like search
    const numParticles = 50;
    const particles = [];

    // Initialize particles randomly within bounds
    for (let i = 0; i < numParticles; i++) {
      let p = {
        vMax: this._random(this.bounds.vMax.min, this.bounds.vMax.max),
        aMax: this._random(this.bounds.aMax.min, this.bounds.aMax.max),
        beta: this._random(this.bounds.beta.min, this.bounds.beta.max),
        gamma: this._random(this.bounds.gamma.min, this.bounds.gamma.max),
        jMax: this._random(this.bounds.jMax.min, this.bounds.jMax.max)
      };
      let evalRes = this._evaluateCost(p, envParams);
      let cost = evalRes.cost;
      particles.push({ params: p, bestParams: { ...p }, bestCost: cost });

      if (cost < bestCost) {
        bestCost = cost;
        bestEval = evalRes;
        bestParams = { ...p };
      }
    }

    // Run generations
    const generations = Math.floor(this.iterations / numParticles);
    
    for (let gen = 0; gen < generations; gen++) {
      // Allow UI to update
      if (gen % 5 === 0 && onProgress) {
        await new Promise(resolve => setTimeout(resolve, 0));
        onProgress(gen / generations);
      }

      for (let i = 0; i < numParticles; i++) {
        let p = particles[i];
        
        // Mutate towards global best + some randomness
        let newParams = {
          vMax: this._mutate(p.params.vMax, bestParams.vMax, this.bounds.vMax),
          aMax: this._mutate(p.params.aMax, bestParams.aMax, this.bounds.aMax),
          beta: this._mutate(p.params.beta, bestParams.beta, this.bounds.beta),
          gamma: this._mutate(p.params.gamma, bestParams.gamma, this.bounds.gamma),
          jMax: this._mutate(p.params.jMax, bestParams.jMax, this.bounds.jMax)
        };

        let evalRes = this._evaluateCost(newParams, envParams);
        let cost = evalRes.cost;

        if (cost < p.bestCost) {
          p.bestCost = cost;
          p.bestParams = { ...newParams };
        }
        
        p.params = { ...newParams };

        if (cost < bestCost) {
          bestCost = cost;
          bestEval = evalRes;
          bestParams = { ...newParams };
        }
      }

      // Log generation best to history
      this.history.push({
        generation: gen + 1,
        vMax: bestParams.vMax.toFixed(2),
        aMax: bestParams.aMax.toFixed(2),
        beta: bestParams.beta.toFixed(3),
        gamma: bestParams.gamma.toFixed(3),
        jMax: bestParams.jMax.toFixed(0),
        cost: bestCost.toFixed(4),
        motionTime: bestEval.motionTime.toFixed(4),
        settlingTime: bestEval.settlingTime.toFixed(4),
        peakVib: bestEval.peakVib.toFixed(4)
      });
    }

    if (onProgress) onProgress(1.0);
    return bestParams;
  }

  _mutate(current, target, bounds) {
    // 70% chance to move towards target, 30% random exploration
    let val;
    if (Math.random() < 0.7) {
      const step = (target - current) * Math.random() * 0.5;
      val = current + step;
    } else {
      const range = bounds.max - bounds.min;
      val = current + (Math.random() - 0.5) * range * 0.2;
    }
    return Math.max(bounds.min, Math.min(bounds.max, val));
  }

  _random(min, max) {
    return min + Math.random() * (max - min);
  }

  _evaluateCost(testParams, env) {
    const distance = env.distance;
    const dt = 0.001; // Match app.js high-speed resolution

    // 1. Generate kinematic profile
    let profile;
    try {
      if (env.profileType === 'ascurve') {
        profile = new window.ASCurveProfile({ 
          vMax: testParams.vMax, 
          aMax: testParams.aMax, 
          beta: testParams.beta, 
          gamma: testParams.gamma, 
          distance, 
          dt 
        });
      } else if (env.profileType === 'scurve') {
        profile = new window.SCurveProfile({ 
          vMax: testParams.vMax, 
          aMax: testParams.aMax, 
          jMax: testParams.jMax, 
          distance 
        });
      } else {
        profile = new window.TrapezoidalProfile({ 
          vMax: testParams.vMax, 
          aMax: testParams.aMax, 
          distance 
        });
      }
    } catch (e) {
      return { cost: 999999, peakVib: 0, settlingTime: 0, motionTime: 0 };
    }

    if (!profile || !profile.totalTime) return { cost: 999999, peakVib: 0, settlingTime: 0, motionTime: 0 };
    const motionTime = profile.totalTime;
    if (motionTime > 10.0) return { cost: 999999, peakVib: 0, settlingTime: 0, motionTime: 0 };

    const samples = profile.getSamples(dt);
    if (!samples || samples.length === 0) return { cost: 999999, peakVib: 0, settlingTime: 0, motionTime: 0 };
    
    const position = samples.map(s => s.position);

    let shaper = null;
    let shapedPosition = position;

    if (env.shaperType !== 'none') {
      switch (env.shaperType) {
        case 'ZV': shaper = window.InputShaper.computeZV(env.fn, env.zeta); break;
        case 'ZVD': shaper = window.InputShaper.computeZVD(env.fn, env.zeta); break;
        case 'EI': shaper = window.InputShaper.computeEI(env.fn, env.zeta); break;
      }
      if (shaper) {
        shapedPosition = window.InputShaper.convolve(position, dt, shaper);
      }
    }

    const simOpts = {
      payloadLoaded: env.payloadLoaded
    };

    // Pad position array with final value for post-motion vibration analysis
    const finalPos = position[position.length - 1];
    const padSamples = Math.floor(2.0 / dt); // 2 seconds of settling observation
    const paddedPosition = [...position];
    for (let p = 0; p < padSamples; p++) paddedPosition.push(finalPos);

    let paddedShaped = shapedPosition;
    if (shaper) {
      paddedShaped = window.InputShaper.convolve(paddedPosition, dt, shaper);
    } else {
      paddedShaped = paddedPosition;
    }

    // 2. Simulate physics
    const simResult = window.InputShaper.simulateResponse(paddedShaped, dt, env.fn, env.zeta, simOpts);
    const responsePos = simResult.position;

    // 3. Calculate Settling Time & Peak Residual Vibration
    // Only measure vibration AFTER motion completes (deviation from target position)
    const tol = 0.005; // 5μm tolerance
    const targetPos = finalPos;
    
    // Find when shaped command reaches final value
    let motionEndIdx = paddedShaped.length - 1;
    for (let i = paddedShaped.length - 1; i >= 0; i--) {
      if (Math.abs(paddedShaped[i] - targetPos) > 0.001) {
        motionEndIdx = i + 1;
        break;
      }
    }
    
    // Settling time: last index AFTER motion where |response - target| > tol
    let settlingTime = motionEndIdx * dt; // At minimum, settling = motion end
    for (let i = responsePos.length - 1; i >= motionEndIdx; i--) {
      if (Math.abs(responsePos[i] - targetPos) > tol) {
        settlingTime = i * dt;
        break;
      }
    }

    // Peak vibration: only measure AFTER motion ends
    let peakVib = 0;
    for (let i = motionEndIdx; i < responsePos.length; i++) {
      const v = Math.abs(responsePos[i] - targetPos);
      if (v > peakVib) peakVib = v;
    }

    // 4. Cost Function
    // The ultimate goal is to minimize settling time (maximize UPH)
    // Add peakVib as a minor secondary penalty to distinguish between ties
    let cost = settlingTime + (peakVib * 0.1);

    return { cost, peakVib, settlingTime, motionTime };
  }

  exportCSV() {
    if (this.history.length === 0) return;
    const headers = ["Generation", "vMax", "aMax", "beta", "gamma", "jMax", "Cost", "MotionTime(s)", "SettlingTime(s)", "PeakVibration(units)"];
    const rows = this.history.map(h => 
      [h.generation, h.vMax, h.aMax, h.beta, h.gamma, h.jMax, h.cost, h.motionTime, h.settlingTime, h.peakVib].join(",")
    );
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "ai_optimization_log.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

window.AIOptimizer = AIOptimizer;
