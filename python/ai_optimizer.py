import numpy as np
import motion_profile as mp
import input_shaping as ish

class AIOptimizer:
    def __init__(self, iterations=500):
        self.iterations = iterations
        self.bounds = {
            'v_max': (10.0, 200.0),
            'a_max': (5.0, 100.0),
            'beta': (0.1, 1.0),
            'gamma': (0.1, 2.0)
        }

    def optimize(self, distance, fn, zeta, friction=0.0):
        print(f"Starting AI Optimization for Distance: {distance}")
        
        num_particles = 20
        particles = []
        
        best_global_cost = float('inf')
        best_global_params = None
        best_global_eval = None
        
        # Initialize
        for _ in range(num_particles):
            p = {
                'v_max': np.random.uniform(*self.bounds['v_max']),
                'a_max': np.random.uniform(*self.bounds['a_max']),
                'beta': np.random.uniform(*self.bounds['beta']),
                'gamma': np.random.uniform(*self.bounds['gamma'])
            }
            eval_res = self._evaluate_cost(p, distance, fn, zeta, friction)
            particles.append({
                'params': p,
                'best_params': p.copy(),
                'best_cost': eval_res['cost']
            })
            
            if eval_res['cost'] < best_global_cost:
                best_global_cost = eval_res['cost']
                best_global_params = p.copy()
                best_global_eval = eval_res
                
        generations = self.iterations // num_particles
        
        for gen in range(generations):
            for i in range(num_particles):
                p = particles[i]
                
                # Mutate towards global best
                new_p = {
                    'v_max': self._mutate(p['params']['v_max'], best_global_params['v_max'], self.bounds['v_max']),
                    'a_max': self._mutate(p['params']['a_max'], best_global_params['a_max'], self.bounds['a_max']),
                    'beta': self._mutate(p['params']['beta'], best_global_params['beta'], self.bounds['beta']),
                    'gamma': self._mutate(p['params']['gamma'], best_global_params['gamma'], self.bounds['gamma'])
                }
                
                eval_res = self._evaluate_cost(new_p, distance, fn, zeta, friction)
                
                if eval_res['cost'] < p['best_cost']:
                    p['best_cost'] = eval_res['cost']
                    p['best_params'] = new_p.copy()
                    
                p['params'] = new_p.copy()
                
                if eval_res['cost'] < best_global_cost:
                    best_global_cost = eval_res['cost']
                    best_global_params = new_p.copy()
                    best_global_eval = eval_res
                    
            if gen % 5 == 0:
                print(f"Gen {gen:03d} | Best Cost: {best_global_cost:.1f} | V:{best_global_params['v_max']:.1f} A:{best_global_params['a_max']:.1f} T_set:{best_global_eval['settling_time']:.3f}s")
                
        print("\n--- OPTIMIZATION COMPLETE ---")
        print(f"Optimal V_max: {best_global_params['v_max']:.2f}")
        print(f"Optimal A_max: {best_global_params['a_max']:.2f}")
        print(f"Optimal Beta:  {best_global_params['beta']:.3f}")
        print(f"Optimal Gamma: {best_global_params['gamma']:.3f}")
        print(f"Settling Time: {best_global_eval['settling_time']:.4f} s")
        print(f"Peak Vib:      {best_global_eval['peak_vib']:.4f}")
        return best_global_params

    def _mutate(self, current, target, bounds):
        if np.random.rand() < 0.7:
            step = (target - current) * np.random.rand() * 0.5
            val = current + step
        else:
            rng = bounds[1] - bounds[0]
            val = current + (np.random.rand() - 0.5) * rng * 0.2
        return np.clip(val, bounds[0], bounds[1])

    def _evaluate_cost(self, params, distance, fn, zeta, friction):
        dt = 0.005
        try:
            profile = mp.ASCurveProfile(params['v_max'], params['a_max'], params['beta'], params['gamma'], distance, dt)
        except:
            return {'cost': 999999, 'settling_time': 999, 'peak_vib': 999}
            
        if profile.total_time > 10.0:
            return {'cost': 999999, 'settling_time': 999, 'peak_vib': 999}
            
        t_asc, p_asc, _, _ = profile.get_samples()
        
        shaper = ish.compute_zvd(fn, zeta)
        p_shaped = ish.convolve(p_asc, dt, shaper)
        
        p_actual = ish.simulate_response(p_shaped, dt, fn, zeta, friction)
        vib = ish.compute_vibration(p_actual, p_shaped)
        peak_vib = np.max(np.abs(vib))
        
        threshold = 0.1
        settling_time = len(p_actual) * dt
        for i in range(len(p_actual)-1, -1, -1):
            if abs(p_actual[i] - distance) > threshold:
                settling_time = i * dt
                break
                
        motion_time = profile.total_time
        total_time = max(motion_time + shaper['delay'], settling_time)
        
        cost = (total_time * 100.0) + (peak_vib * 50.0)
        return {'cost': cost, 'settling_time': total_time, 'peak_vib': peak_vib}

if __name__ == "__main__":
    opt = AIOptimizer(iterations=200)
    opt.optimize(distance=50.0, fn=10.0, zeta=0.05, friction=0.0)
