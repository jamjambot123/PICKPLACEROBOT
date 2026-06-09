/**
 * Robot Kinematics Module
 * 
 * EEZYbot-style 3-DOF articulated robot arm kinematics:
 *   Joint 1 (Base):     Rotation around Y-axis (horizontal plane)
 *   Joint 2 (Shoulder): Rotation around local Z-axis (vertical plane)
 *   Joint 3 (Elbow):    Rotation around local Z-axis (vertical plane)
 * 
 * Plus gripper open/close animation.
 * 
 * Coordinate system (Three.js):
 *   X: Along gantry (right)
 *   Y: Up (vertical)
 *   Z: Towards viewer (perpendicular to gantry)
 */

class EEZYbotArm {
  constructor(config = {}) {
    // Link lengths (in scene units)
    this.baseHeight = config.baseHeight || 4;       // Base pedestal height
    this.upperArmLen = config.upperArmLen || 10;    // Shoulder to elbow
    this.forearmLen = config.forearmLen || 11;       // Elbow to wrist
    this.gripperLen = config.gripperLen || 3;       // Wrist to tip

    // Joint limits (radians)
    this.limits = {
      theta1: { min: -Math.PI * 0.8, max: Math.PI * 0.8 },
      theta2: { min: -Math.PI / 2, max: Math.PI / 3 },
      theta3: { min: -2.5, max: 0.3 }
    };

    // Current state
    this.theta1 = 0;
    this.theta2 = 0;
    this.theta3 = -Math.PI / 4;
    this.gripperOpen = 1.0; // 0=closed, 1=fully open
  }

  /**
   * Forward Kinematics: joint angles → end-effector position
   * @param {number} theta1 - Base rotation (rad)
   * @param {number} theta2 - Shoulder angle (rad), 0=horizontal, negative=down
   * @param {number} theta3 - Elbow angle (rad), relative to upper arm
   * @returns {{x: number, y: number, z: number}} End-effector position relative to arm base
   */
  forwardKinematics(theta1, theta2, theta3) {
    const L1 = this.upperArmLen;
    const L2 = this.forearmLen + this.gripperLen;

    // In arm plane (radius and height from shoulder)
    const totalAngle = theta2 + theta3;
    const r = L1 * Math.cos(theta2) + L2 * Math.cos(totalAngle);
    const h = L1 * Math.sin(theta2) + L2 * Math.sin(totalAngle);

    // Apply base rotation (around Y axis)
    // Arm extends in the XZ plane based on theta1
    const x = r * Math.sin(theta1);
    const y = this.baseHeight + h;
    const z = r * Math.cos(theta1);

    return { x, y, z };
  }

  /**
   * Inverse Kinematics: target position → joint angles
   * @param {number} tx - Target X relative to arm base
   * @param {number} ty - Target Y relative to arm base
   * @param {number} tz - Target Z relative to arm base
   * @returns {{theta1: number, theta2: number, theta3: number, reachable: boolean}}
   */
  inverseKinematics(tx, ty, tz) {
    const L1 = this.upperArmLen;
    const L2 = this.forearmLen + this.gripperLen;

    // Base rotation
    const theta1 = Math.atan2(tx, tz);

    // Distance from arm base in the arm plane
    const r = Math.sqrt(tx * tx + tz * tz);
    const h = ty - this.baseHeight;

    // Distance from shoulder to target
    const d = Math.sqrt(r * r + h * h);

    // Check reachability
    const dMax = L1 + L2 - 0.1;
    const dMin = Math.abs(L1 - L2) + 0.1;
    let reachable = true;

    let dClamped = d;
    if (d > dMax) { dClamped = dMax; reachable = false; }
    if (d < dMin) { dClamped = dMin; reachable = false; }

    // Elbow angle (law of cosines)
    let cosTheta3 = (dClamped * dClamped - L1 * L1 - L2 * L2) / (2 * L1 * L2);
    cosTheta3 = Math.max(-1, Math.min(1, cosTheta3));
    const theta3Raw = Math.acos(cosTheta3);
    const theta3 = -theta3Raw; // Elbow bends "inward"

    // Shoulder angle
    const alpha = Math.atan2(h, r);
    let cosBeta = (L1 * L1 + dClamped * dClamped - L2 * L2) / (2 * L1 * dClamped);
    cosBeta = Math.max(-1, Math.min(1, cosBeta));
    const beta = Math.acos(cosBeta);
    const theta2 = alpha + beta;

    return {
      theta1: this._clamp(theta1, this.limits.theta1.min, this.limits.theta1.max),
      theta2: this._clamp(theta2, this.limits.theta2.min, this.limits.theta2.max),
      theta3: this._clamp(theta3, this.limits.theta3.min, this.limits.theta3.max),
      reachable
    };
  }

  _clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  /**
   * Set arm to a "home" position (arms up, out of the way)
   */
  getHomeAngles() {
    return {
      theta1: 0,
      theta2: Math.PI / 6,     // slightly raised
      theta3: -Math.PI / 4,    // slightly bent
      gripperOpen: 1.0
    };
  }

  /**
   * Get angles to reach down to work surface
   * @param {number} height - Work surface Y relative to arm base
   */
  getReachDownAngles(height = -12) {
    return this.inverseKinematics(0, height, 8);
  }
}


/**
 * Pick & Place Motion Sequence Controller
 * Orchestrates the full pick-and-place cycle with smooth transitions
 */
class PickPlaceSequence {
  /**
   * @param {Object} config
   * @param {number} config.pickX - Pick position on gantry X axis
   * @param {number} config.placeX - Place position on gantry X axis
   * @param {number} config.startX - Starting X position of carriage
   * @param {number} config.armBaseY - Y position of arm base (on carriage)
   * @param {number} config.workSurfaceY - Y position of work surface
   * @param {number} config.approachHeight - Height above work surface for approach
   * @param {EEZYbotArm} arm - Robot arm instance
   */
  constructor(config) {
    this.pickX = config.pickX || 15;
    this.placeX = config.placeX || 65;
    this.startX = config.startX || 15;
    this.armBaseY = config.armBaseY || 17;
    this.workSurfaceY = config.workSurfaceY || 2.5;
    this.approachHeight = config.approachHeight || 8;
    this.objectZ = config.objectZ || 15;
    this.arm = config.arm || new EEZYbotArm();

    // Pre-compute arm angles for key positions
    this._computeKeyPoses();

    // Phase definitions
    this.phases = this._buildPhases();
    this.totalTime = this.phases.reduce((sum, p) => sum + p.duration, 0);
  }

  _computeKeyPoses() {
    const arm = this.arm;

    // Home position: arm up and slightly forward
    this.homeAngles = arm.getHomeAngles();

    // Approach position: above the work surface
    const approachY = this.workSurfaceY + this.approachHeight - this.armBaseY;
    this.approachAngles = arm.inverseKinematics(0, approachY, this.objectZ);

    // Pick/Place position: at work surface
    // Note: The +2 or -2 adjustments are for visual fine-tuning of the gripper tip
    const pickY = this.workSurfaceY - this.armBaseY + 1.2;
    this.pickAngles = arm.inverseKinematics(0, pickY, this.objectZ);
  }

  _buildPhases() {
    return [
      { name: 'READY',         duration: 0.3, type: 'wait' },
      { name: 'ARM_DOWN_APPROACH', duration: 0.5, type: 'arm',  from: this.homeAngles,    to: this.approachAngles },
      { name: 'ARM_DOWN_PICK',     duration: 0.4, type: 'arm',  from: this.approachAngles, to: this.pickAngles },
      { name: 'GRIP_CLOSE',        duration: 0.3, type: 'grip', from: 1.0, to: 0.0 },
      { name: 'ARM_UP_WITH_OBJ',   duration: 0.5, type: 'arm',  from: this.pickAngles,    to: this.homeAngles },
      { name: 'GANTRY_MOVE',       duration: -1,  type: 'gantry' },  // Duration set externally
      { name: 'ARM_DOWN_APPROACH2', duration: 0.5, type: 'arm', from: this.homeAngles,    to: this.approachAngles },
      { name: 'ARM_DOWN_PLACE',    duration: 0.4, type: 'arm',  from: this.approachAngles, to: this.pickAngles },
      { name: 'GRIP_OPEN',         duration: 0.3, type: 'grip', from: 0.0, to: 1.0 },
      { name: 'ARM_UP_FINAL',      duration: 0.5, type: 'arm',  from: this.pickAngles,    to: this.homeAngles },
      { name: 'DONE',              duration: 0.5, type: 'wait' },
    ];
  }

  /**
   * Set the gantry motion duration (from motion profile calculation)
   */
  setGantryDuration(duration) {
    const gantryPhase = this.phases.find(p => p.name === 'GANTRY_MOVE');
    if (gantryPhase) {
      gantryPhase.duration = duration;
    }
    this.totalTime = this.phases.reduce((sum, p) => sum + p.duration, 0);
  }

  /**
   * Get the current state at time t
   * @param {number} t - Elapsed time
   * @param {number} gantryProgress - 0~1 progress of gantry motion (from motion profile)
   * @returns {Object} Current state
   */
  getState(t) {
    let elapsed = 0;

    for (let i = 0; i < this.phases.length; i++) {
      const phase = this.phases[i];
      if (phase.duration <= 0) continue;

      if (t < elapsed + phase.duration || i === this.phases.length - 1) {
        const localT = Math.max(0, Math.min(t - elapsed, phase.duration));
        const progress = phase.duration > 0 ? localT / phase.duration : 1;
        const eased = this._easeInOutCubic(progress);

        return this._evaluatePhase(phase, eased, i);
      }
      elapsed += phase.duration;
    }

    // Default: done
    return {
      phase: 'DONE',
      phaseIndex: this.phases.length - 1,
      theta1: this.homeAngles.theta1,
      theta2: this.homeAngles.theta2,
      theta3: this.homeAngles.theta3,
      gripperOpen: 1.0,
      gantryMoving: false,
      gantryProgress: 1,
      objectAttached: false,
      objectVisible: true
    };
  }

  _evaluatePhase(phase, progress, index) {
    const result = {
      phase: phase.name,
      phaseIndex: index,
      theta1: this.homeAngles.theta1,
      theta2: this.homeAngles.theta2,
      theta3: this.homeAngles.theta3,
      gripperOpen: 1.0,
      gantryMoving: false,
      gantryProgress: 0,
      objectAttached: false,
      objectVisible: true
    };

    // Determine if object is attached (after grip close, before grip open)
    const gripCloseIdx = this.phases.findIndex(p => p.name === 'GRIP_CLOSE');
    const gripOpenIdx = this.phases.findIndex(p => p.name === 'GRIP_OPEN');

    if (index > gripCloseIdx && index < gripOpenIdx) {
      result.objectAttached = true;
      result.gripperOpen = 0;
    } else if (index === gripCloseIdx) {
      result.objectAttached = progress > 0.5;
      result.gripperOpen = 1.0 - progress;
    } else if (index === gripOpenIdx) {
      result.objectAttached = progress < 0.5;
      result.gripperOpen = progress;
    } else if (index >= gripOpenIdx) {
      result.gripperOpen = 1.0;
    }

    switch (phase.type) {
      case 'arm': {
        const from = phase.from;
        const to = phase.to;
        result.theta1 = this._lerp(from.theta1, to.theta1, progress);
        result.theta2 = this._lerp(from.theta2, to.theta2, progress);
        result.theta3 = this._lerp(from.theta3, to.theta3, progress);
        break;
      }
      case 'grip': {
        // Keep arm at current position based on context
        if (index <= gripCloseIdx) {
          Object.assign(result, {
            theta1: this.pickAngles.theta1,
            theta2: this.pickAngles.theta2,
            theta3: this.pickAngles.theta3,
          });
        } else {
          Object.assign(result, {
            theta1: this.pickAngles.theta1,
            theta2: this.pickAngles.theta2,
            theta3: this.pickAngles.theta3,
          });
        }
        break;
      }
      case 'gantry': {
        result.gantryMoving = true;
        result.gantryProgress = progress;
        // Arm stays in home position during gantry move
        break;
      }
      case 'wait': {
        // Just hold current position
        if (index >= gripOpenIdx) {
          // After placing, arm is going up or done
        }
        break;
      }
    }

    return result;
  }

  /**
   * Get the time offset when the gantry motion phase starts
   */
  getGantryStartTime() {
    let elapsed = 0;
    for (const phase of this.phases) {
      if (phase.name === 'GANTRY_MOVE') return elapsed;
      elapsed += phase.duration;
    }
    return elapsed;
  }

  _lerp(a, b, t) {
    return a + (b - a) * t;
  }

  _easeInOutCubic(t) {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
}


// Make globally available
window.EEZYbotArm = EEZYbotArm;
window.PickPlaceSequence = PickPlaceSequence;
