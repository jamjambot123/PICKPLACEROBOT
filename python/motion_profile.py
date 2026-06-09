import numpy as np

class TrapezoidalProfile:
    def __init__(self, v_max, a_max, distance, dt=0.005):
        self.v_max = v_max
        self.a_max = a_max
        self.distance = distance
        self.dt = dt
        self._calculate()

    def _calculate(self):
        t_acc = self.v_max / self.a_max
        d_acc = 0.5 * self.a_max * t_acc**2
        
        if 2 * d_acc > self.distance:
            t_acc = np.sqrt(self.distance / self.a_max)
            self.v_max = self.a_max * t_acc
            t_cruise = 0
            d_acc = self.distance / 2
        else:
            t_cruise = (self.distance - 2 * d_acc) / self.v_max
            
        self.t_acc = t_acc
        self.t_cruise = t_cruise
        self.t_dec = t_acc
        self.total_time = 2 * t_acc + t_cruise

    def get_samples(self):
        times = np.arange(0, self.total_time, self.dt)
        if times[-1] < self.total_time:
            times = np.append(times, self.total_time)
            
        positions = np.zeros_like(times)
        velocities = np.zeros_like(times)
        accelerations = np.zeros_like(times)
        
        for i, t in enumerate(times):
            if t <= self.t_acc:
                positions[i] = 0.5 * self.a_max * t**2
                velocities[i] = self.a_max * t
                accelerations[i] = self.a_max
            elif t <= self.t_acc + self.t_cruise:
                t_c = t - self.t_acc
                d_acc = 0.5 * self.a_max * self.t_acc**2
                positions[i] = d_acc + self.v_max * t_c
                velocities[i] = self.v_max
                accelerations[i] = 0
            else:
                t_d = t - (self.t_acc + self.t_cruise)
                d_acc_cruise = 0.5 * self.a_max * self.t_acc**2 + self.v_max * self.t_cruise
                positions[i] = d_acc_cruise + self.v_max * t_d - 0.5 * self.a_max * t_d**2
                velocities[i] = self.v_max - self.a_max * t_d
                accelerations[i] = -self.a_max
                
        return times, positions, velocities, accelerations

class ASCurveProfile:
    def __init__(self, v_max, a_max, beta, gamma, distance, dt=0.005):
        """
        beta: Smoothness (0.1 ~ 1.0)
        gamma: Asymmetricity (0.1 ~ 2.0). If <1.0, decel is longer.
        """
        self.v_max = float(v_max)
        self.a_acc_max = float(a_max)
        self.a_dec_max = float(a_max * gamma)
        self.distance = float(distance)
        self.beta = float(beta)
        self.dt = dt
        self._calculate()

    def _calculate(self):
        # Time for acceleration phase
        t_acc = self.v_max / self.a_acc_max
        d_acc = 0.5 * self.v_max * t_acc
        
        # Time for deceleration phase
        t_dec = self.v_max / self.a_dec_max
        d_dec = 0.5 * self.v_max * t_dec
        
        if d_acc + d_dec > self.distance:
            # Triangle profile
            ratio = self.a_dec_max / (self.a_acc_max + self.a_dec_max)
            d_acc = self.distance * ratio
            d_dec = self.distance - d_acc
            self.v_max = np.sqrt(2 * self.a_acc_max * d_acc)
            t_acc = self.v_max / self.a_acc_max
            t_dec = self.v_max / self.a_dec_max
            t_cruise = 0.0
        else:
            t_cruise = (self.distance - (d_acc + d_dec)) / self.v_max
            
        self.t_acc = t_acc
        self.t_cruise = t_cruise
        self.t_dec = t_dec
        self.total_time = t_acc + t_cruise + t_dec

    def get_samples(self):
        times = np.arange(0, self.total_time, self.dt)
        if times[-1] < self.total_time:
            times = np.append(times, self.total_time)
            
        positions = np.zeros_like(times)
        velocities = np.zeros_like(times)
        accelerations = np.zeros_like(times)
        jerks = np.zeros_like(times)
        
        pi = np.pi
        
        for i, t in enumerate(times):
            if t <= self.t_acc:
                # Accel phase
                phase = pi * t / self.t_acc
                # Velocity using smooth step
                v = self.v_max * (t / self.t_acc - (self.beta / pi) * np.sin(phase))
                # Acceleration
                a = (self.v_max / self.t_acc) * (1 - self.beta * np.cos(phase))
                # Position (integral of v)
                p = self.v_max * (0.5 * t**2 / self.t_acc + (self.beta * self.t_acc / pi**2) * (np.cos(phase) - 1))
                
                positions[i] = p
                velocities[i] = v
                accelerations[i] = a
                jerks[i] = (self.v_max * self.beta * pi / (self.t_acc**2)) * np.sin(phase)
                
            elif t <= self.t_acc + self.t_cruise:
                # Cruise phase
                t_c = t - self.t_acc
                p_acc = self.v_max * (0.5 * self.t_acc + (self.beta * self.t_acc / pi**2) * (-2))
                
                positions[i] = p_acc + self.v_max * t_c
                velocities[i] = self.v_max
                accelerations[i] = 0
                jerks[i] = 0
                
            else:
                # Decel phase
                t_d = t - (self.t_acc + self.t_cruise)
                phase = pi * t_d / self.t_dec
                
                p_acc = self.v_max * (0.5 * self.t_acc + (self.beta * self.t_acc / pi**2) * (-2))
                p_cruise = self.v_max * self.t_cruise
                p_start_dec = p_acc + p_cruise
                
                v = self.v_max * (1 - (t_d / self.t_dec - (self.beta / pi) * np.sin(phase)))
                a = -(self.v_max / self.t_dec) * (1 - self.beta * np.cos(phase))
                
                p = p_start_dec + self.v_max * t_d - self.v_max * (0.5 * t_d**2 / self.t_dec + (self.beta * self.t_dec / pi**2) * (np.cos(phase) - 1))
                
                positions[i] = p
                velocities[i] = v
                accelerations[i] = a
                jerks[i] = -(self.v_max * self.beta * pi / (self.t_dec**2)) * np.sin(phase)
                
        # Fix boundary logic exactly like JS
        positions[-1] = self.distance
        velocities[-1] = 0
        accelerations[-1] = 0
        
        return times, positions, velocities, accelerations
