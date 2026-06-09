import numpy as np

def compute_zv(fn, zeta):
    wd = fn * np.sqrt(1 - zeta**2)
    dt_shaper = np.pi / wd
    K = np.exp(-zeta * np.pi / np.sqrt(1 - zeta**2))
    A1 = 1 / (1 + K)
    A2 = K / (1 + K)
    return {
        "amplitudes": [A1, A2],
        "times": [0.0, dt_shaper],
        "delay": dt_shaper
    }

def compute_zvd(fn, zeta):
    wd = fn * np.sqrt(1 - zeta**2)
    dt_shaper = np.pi / wd
    K = np.exp(-zeta * np.pi / np.sqrt(1 - zeta**2))
    
    A1 = 1 / (1 + 2*K + K**2)
    A2 = 2*K / (1 + 2*K + K**2)
    A3 = K**2 / (1 + 2*K + K**2)
    
    return {
        "amplitudes": [A1, A2, A3],
        "times": [0.0, dt_shaper, 2 * dt_shaper],
        "delay": 2 * dt_shaper
    }

def compute_ei(fn, zeta):
    # Simplified EI parameters
    Vtol = 0.05
    wd = fn * np.sqrt(1 - zeta**2)
    dt_shaper = np.pi / wd
    
    K = np.exp(-zeta * np.pi / np.sqrt(1 - zeta**2))
    
    # 3-impulse EI shaper simplified approx
    A1 = 0.25 * (1 + Vtol)
    A2 = 0.5 * (1 - Vtol)
    A3 = 0.25 * (1 + Vtol)
    
    return {
        "amplitudes": [A1, A2, A3],
        "times": [0.0, dt_shaper, 2 * dt_shaper],
        "delay": 2 * dt_shaper
    }

def convolve(signal, dt, shaper):
    num_samples = len(signal)
    max_delay = max(shaper["times"])
    delay_samples = int(np.ceil(max_delay / dt))
    
    out_len = num_samples + delay_samples
    result = np.zeros(out_len)
    
    for i in range(out_len):
        val = 0.0
        for amp, t in zip(shaper["amplitudes"], shaper["times"]):
            idx = i - int(round(t / dt))
            # Clamp to boundaries like a real signal holding its final position
            if idx < 0:
                s_val = 0.0
            elif idx >= num_samples:
                s_val = signal[-1]
            else:
                s_val = signal[idx]
            val += amp * s_val
        result[i] = val
        
    return result

def simulate_response(command_pos, dt, fn, zeta, friction=0.0):
    """
    Simulates the actual robot arm position using a 4th-order ODE (approx. as spring-mass system).
    """
    wn = fn * 2 * np.pi
    
    num_samples = len(command_pos)
    response_pos = np.zeros(num_samples)
    
    # State variables
    p1, v1 = 0.0, 0.0
    
    for i in range(num_samples):
        cmd = command_pos[i]
        
        # Simple spring-mass-damper simulation step (Euler)
        # m*a + c*v + k*x = k*cmd -> a = wn^2*(cmd - x) - 2*zeta*wn*v
        
        a1 = wn**2 * (cmd - p1) - 2 * zeta * wn * v1
        
        # Add non-linear Coulomb friction
        if friction > 0:
            f_fric = friction * np.tanh(v1 / 0.01)
            a1 -= f_fric
            
        v1 += a1 * dt
        p1 += v1 * dt
        
        response_pos[i] = p1
        
    return response_pos

def compute_vibration(actual_pos, command_pos):
    # Error = actual - command
    n = min(len(actual_pos), len(command_pos))
    return actual_pos[:n] - command_pos[:n]
