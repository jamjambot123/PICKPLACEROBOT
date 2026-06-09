import numpy as np
import matplotlib.pyplot as plt
import motion_profile as mp
import input_shaping as ish

def main():
    # --- 1. USER PARAMETERS ---
    DISTANCE = 50.0       # Pick to Place distance (units)
    V_MAX = 80.0          # Maximum velocity (units/s)
    A_MAX = 20.0          # Maximum acceleration (units/s^2)
    BETA = 0.5            # Smoothness factor (0.1 to 1.0)
    GAMMA = 0.2           # Asymmetricity (0.1 to 2.0). Lower = longer deceleration
    
    # System Dynamics
    FN = 10.0             # Natural Frequency (Hz)
    ZETA = 0.05           # Damping ratio
    FRICTION = 0.0        # Coulomb friction coefficient
    DT = 0.005            # Time step (5ms)
    
    print("==================================================")
    print(" Pick & Place Robot Simulation (Digital Twin)")
    print("==================================================")
    print(f"Distance: {DISTANCE}")
    print(f"V_max: {V_MAX}, A_max: {A_MAX}")
    print(f"beta: {BETA}, gamma: {GAMMA}")
    print(f"fn: {FN}Hz, zeta: {ZETA}")
    print("==================================================\n")

    # --- 2. GENERATE PROFILES ---
    print("Generating Motion Profiles...")
    
    # Trapezoidal (Baseline)
    trap = mp.TrapezoidalProfile(V_MAX, A_MAX, DISTANCE, DT)
    t_trap, p_trap, v_trap, a_trap = trap.get_samples()
    
    # Asymmetric S-Curve (Proposed)
    ascurve = mp.ASCurveProfile(V_MAX, A_MAX, BETA, GAMMA, DISTANCE, DT)
    t_asc, p_asc, v_asc, a_asc = ascurve.get_samples()
    
    # --- 3. APPLY INPUT SHAPING ---
    print("Applying Input Shaping (ZVD)...")
    shaper = ish.compute_zvd(FN, ZETA)
    p_shaped = ish.convolve(p_asc, DT, shaper)
    
    # --- 4. SIMULATE PHYSICS (ODE) ---
    print("Simulating System Dynamics (ODE)...")
    
    # Simulate unshaped Trapezoidal
    p_actual_trap = ish.simulate_response(p_trap, DT, FN, ZETA, FRICTION)
    vib_trap = ish.compute_vibration(p_actual_trap, p_trap)
    
    # Simulate unshaped AS-Curve
    p_actual_asc = ish.simulate_response(p_asc, DT, FN, ZETA, FRICTION)
    vib_asc = ish.compute_vibration(p_actual_asc, p_asc)
    
    # Simulate SHAPED AS-Curve
    # Note: Shaped command has length len(p_shaped), and time vector needs extending
    t_shaped = np.arange(0, len(p_shaped) * DT, DT)
    p_actual_shaped = ish.simulate_response(p_shaped, DT, FN, ZETA, FRICTION)
    vib_shaped = ish.compute_vibration(p_actual_shaped, p_shaped)

    # Calculate Settling Times
    def calc_settling_time(actual, time_arr, target, threshold=0.1):
        for i in range(len(actual)-1, -1, -1):
            if abs(actual[i] - target) > threshold:
                return time_arr[i]
        return time_arr[-1]

    st_trap = calc_settling_time(p_actual_trap, t_trap, DISTANCE)
    st_asc = calc_settling_time(p_actual_asc, t_asc, DISTANCE)
    st_shaped = calc_settling_time(p_actual_shaped, t_shaped, DISTANCE)
    
    print(f"[Results]")
    print(f"Trapezoidal Settling Time:  {st_trap:.3f} s  (Peak Vib: {np.max(np.abs(vib_trap)):.3f})")
    print(f"AS-Curve Settling Time:     {st_asc:.3f} s  (Peak Vib: {np.max(np.abs(vib_asc)):.3f})")
    print(f"Shaped AS-Curve Settling:   {st_shaped:.3f} s  (Peak Vib: {np.max(np.abs(vib_shaped)):.3f})")

    # --- 5. PLOTTING ---
    print("\nGenerating Plots (results.png)...")
    
    # Use standard academic style
    plt.style.use('seaborn-v0_8-paper')
    fig, axs = plt.subplots(3, 1, figsize=(10, 12), dpi=150)
    
    # 1. Velocity Profile
    axs[0].set_title("Command Velocity Profile", fontsize=14, fontweight='bold')
    axs[0].plot(t_trap, v_trap, 'r--', label='Trapezoidal', alpha=0.7)
    axs[0].plot(t_asc, v_asc, 'b-', label='AS-Curve', linewidth=2)
    axs[0].set_ylabel('Velocity (units/s)')
    axs[0].grid(True, linestyle=':', alpha=0.6)
    axs[0].legend()
    
    # 2. Position Tracking
    axs[1].set_title("Position Tracking (Simulated Actual Position)", fontsize=14, fontweight='bold')
    axs[1].plot(t_trap, p_actual_trap, 'r--', label='Actual (Trapezoidal)', alpha=0.5)
    axs[1].plot(t_asc, p_actual_asc, 'g-.', label='Actual (AS-Curve)', alpha=0.7)
    axs[1].plot(t_shaped, p_actual_shaped, 'b-', label='Actual (Shaped AS-Curve)', linewidth=2)
    
    # Highlight settling area
    axs[1].axhline(DISTANCE, color='k', linestyle=':', alpha=0.5, label='Target Position')
    axs[1].set_ylabel('Position (units)')
    axs[1].grid(True, linestyle=':', alpha=0.6)
    axs[1].legend()
    
    # 3. Residual Vibration Error
    axs[2].set_title("Residual Vibration Error", fontsize=14, fontweight='bold')
    axs[2].plot(t_trap, vib_trap, 'r--', label='Error (Trapezoidal)', alpha=0.5)
    axs[2].plot(t_asc, vib_asc, 'g-.', label='Error (AS-Curve)', alpha=0.7)
    axs[2].plot(t_shaped, vib_shaped, 'b-', label='Error (Shaped AS-Curve)', linewidth=2)
    
    axs[2].axhline(0, color='k', linestyle='-', linewidth=1)
    axs[2].set_xlabel('Time (s)')
    axs[2].set_ylabel('Error (units)')
    axs[2].grid(True, linestyle=':', alpha=0.6)
    axs[2].legend()
    
    plt.tight_layout()
    plt.savefig('results.png')
    print("Done! Saved as 'results.png'.")

if __name__ == "__main__":
    main()
