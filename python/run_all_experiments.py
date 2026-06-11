"""
실험 설계서 기반 전체 실험 자동 실행 v2
JS 물리 엔진을 정확히 포팅하여 결과 일치 보장
"""
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from pathlib import Path
import csv, sys

# Fix encoding
sys.stdout.reconfigure(encoding='utf-8')

plt.rcParams.update({
    'font.size': 11, 'axes.titlesize': 13, 'axes.labelsize': 11,
    'figure.facecolor': 'white', 'axes.facecolor': '#fafafa',
    'axes.grid': True, 'grid.alpha': 0.3, 'figure.dpi': 200,
})

OUT = Path(r'd:\dongwon\PICKPLACEROBOT\experiments')
OUT.mkdir(exist_ok=True)

# ═══════════════════════════════════════
# Physics Engine — 정확한 JS 포팅
# ═══════════════════════════════════════

def gen_trapezoidal(vmax, amax, dist, dt=0.001):
    """Trapezoidal motion profile"""
    t_acc = vmax / amax
    d_acc = 0.5 * amax * t_acc**2
    
    if 2 * d_acc >= dist:
        t_acc = np.sqrt(dist / amax)
        vr = amax * t_acc
        t_const = 0
    else:
        vr = vmax
        t_const = (dist - 2*d_acc) / vmax
    
    total_time = 2*t_acc + t_const
    N = int(np.ceil(total_time / dt)) + 1
    pos = np.zeros(N)
    
    for i in range(N):
        t = i * dt
        if t <= t_acc:
            pos[i] = 0.5 * amax * t**2
        elif t <= t_acc + t_const:
            pos[i] = 0.5*amax*t_acc**2 + vr*(t - t_acc)
        else:
            t3 = t - t_acc - t_const
            pos[i] = 0.5*amax*t_acc**2 + vr*t_const + vr*t3 - 0.5*amax*t3**2
    
    pos = np.clip(pos, 0, dist)
    return pos, total_time

def gen_scurve(vmax, amax, jmax, dist, dt=0.001):
    """S-Curve with jerk limitation"""
    tj = amax / jmax
    ta = vmax / amax
    
    if ta < 2*tj:
        tj = np.sqrt(vmax/jmax)
        ta = 2*tj
        amax_eff = jmax * tj
    else:
        amax_eff = amax
    
    d_acc = 0.5 * vmax * ta
    if 2*d_acc >= dist:
        scale = np.sqrt(dist / (2*d_acc)) if d_acc > 0 else 1
        ta *= scale; tj *= scale; vmax *= scale
        d_acc = 0.5 * vmax * ta
        t_const = 0
    else:
        t_const = (dist - 2*d_acc) / vmax
    
    total = 2*ta + t_const
    N = int(np.ceil(total/dt)) + 1
    pos = np.zeros(N)
    
    for i in range(N):
        t = i*dt
        v = 0
        if t < tj:
            v = 0.5*jmax*t**2 / ta * 2
        elif t < ta - tj:
            v = amax_eff*(t - tj/2)
        elif t < ta:
            v = vmax - 0.5*jmax*(ta-t)**2/ta*2
        elif t < ta + t_const:
            v = vmax
        elif t < total:
            tr = total - t
            if tr < tj:
                v = 0.5*jmax*tr**2/ta*2
            elif tr < ta - tj:
                v = amax_eff*(tr - tj/2)
            else:
                v = vmax - 0.5*jmax*(ta-tr)**2/ta*2
        pos[i] = pos[max(0,i-1)] + v*dt if i > 0 else 0
    
    pos = np.clip(pos, 0, dist)
    return pos, total

def gen_ascurve(vmax, amax, beta, gamma, dist, dt=0.001):
    """AS-Curve: use trapezoidal as base, apply Gaussian smoothing for jerk limiting"""
    pos, total = gen_trapezoidal(vmax, amax, dist, dt)
    
    # Apply jerk-limiting via smoothing kernel proportional to beta
    sigma = int(beta * 0.02 / dt)  # beta controls smoothing width
    if sigma > 1:
        from scipy.ndimage import gaussian_filter1d
        pos = gaussian_filter1d(pos, sigma=sigma, mode='nearest')
    
    pos[0] = 0.0
    pos[-1] = dist
    pos = np.clip(pos, 0, dist)
    return pos, total

def compute_shaper(shaper_type, fn, zeta):
    """Compute shaper impulse amplitudes and times"""
    wd = 2*np.pi*fn*np.sqrt(1 - zeta**2)
    K = np.exp(-zeta*np.pi / np.sqrt(1 - zeta**2))
    hp = np.pi / wd
    
    if shaper_type == 'ZV':
        d = 1 + K
        return [1/d, K/d], [0, hp]
    elif shaper_type == 'ZVD':
        d = 1 + 2*K + K**2
        return [1/d, 2*K/d, K**2/d], [0, hp, 2*hp]
    elif shaper_type == 'EI':
        vtol = 0.05
        a1 = 0.25*(1+vtol); a3 = a1; a2 = 1 - 2*a1
        return [a1, a2, a3], [0, hp, 2*hp]
    return [1.0], [0.0]

def convolve_shaper(signal, dt, amps, times):
    """Convolve signal with shaper — exact JS port with linear interpolation"""
    max_delay = int(np.ceil(times[-1]/dt)) if len(times) > 1 else 0
    out_len = len(signal) + max_delay
    result = np.zeros(out_len)
    last_val = signal[-1] if len(signal) > 0 else 0
    first_val = signal[0] if len(signal) > 0 else 0
    
    def get_val(idx):
        if idx < 0: return first_val
        if idx >= len(signal): return last_val
        return signal[idx]
    
    for amp, t in zip(amps, times):
        exact_delay = t / dt
        for j in range(out_len):
            exact_idx = j - exact_delay
            idx0 = int(np.floor(exact_idx))
            frac = exact_idx - idx0
            val = get_val(idx0) * (1-frac) + get_val(idx0+1) * frac
            result[j] += amp * val
    
    return result

def simulate_2mass(command, dt, fn, zeta, payload=False):
    """2-Mass Perfect Servo model — exact JS port"""
    wn = 2*np.pi*fn
    m2_base = 0.5
    m2 = 1.0 if payload else m2_base
    k = wn**2 * m2_base
    c = 2*zeta*wn*m2_base
    
    n = len(command)
    pos = np.zeros(n)
    x2, v2 = 0.0, 0.0
    substeps = 10
    h = dt / substeps
    
    for i in range(n):
        x1 = command[i]
        v1 = (command[i] - command[max(0,i-1)]) / dt
        
        for _ in range(substeps):
            F = k*(x1-x2) + c*(v1-v2)
            a2 = F/m2
            k1x, k1v = v2, a2
            
            F2 = k*(x1-(x2+0.5*h*k1x)) + c*(v1-(v2+0.5*h*k1v))
            k2x, k2v = v2+0.5*h*k1v, F2/m2
            
            F3 = k*(x1-(x2+0.5*h*k2x)) + c*(v1-(v2+0.5*h*k2v))
            k3x, k3v = v2+0.5*h*k2v, F3/m2
            
            F4 = k*(x1-(x2+h*k3x)) + c*(v1-(v2+h*k3v))
            k4x, k4v = v2+h*k3v, F4/m2
            
            x2 += (h/6)*(k1x + 2*k2x + 2*k3x + k4x)
            v2 += (h/6)*(k1v + 2*k2v + 2*k3v + k4v)
        
        pos[i] = x2
    
    return pos

def compute_vibration(response, command):
    """Compute vibration = difference between load response and command"""
    min_len = min(len(response), len(command))
    return response[:min_len] - command[:min_len]

def get_settling_time(response, target, dt, tol=0.005):
    """Find last time |response - target| > tol"""
    last_exceed = 0
    for i in range(len(response)-1, -1, -1):
        if abs(response[i] - target) > tol:
            last_exceed = (i+1) * dt
            break
    return last_exceed

def run_experiment(vmax, amax, dist, fn, zeta, profile='trapezoidal', shaper='none',
                   beta=0.5, gamma=0.2, dt=0.001, payload_fwd=True):
    """Run complete experiment: forward + return"""
    
    # Generate motion profile
    if profile == 'trapezoidal':
        pos, mt = gen_trapezoidal(vmax, amax, dist, dt)
    elif profile == 'scurve':
        pos, mt = gen_scurve(vmax, amax, 500000, dist, dt)
    else:  # ascurve
        pos, mt = gen_ascurve(vmax, amax, beta, gamma, dist, dt)
    
    # Pad for settling observation (3 seconds)
    pad_n = int(3.0 / dt)
    padded = np.concatenate([pos, np.full(pad_n, dist)])
    
    # Apply shaper
    shaper_delay = 0
    if shaper != 'none':
        sa, st = compute_shaper(shaper, fn, zeta)
        shaped = convolve_shaper(padded, dt, sa, st)
        shaper_delay = st[-1]
    else:
        shaped = padded.copy()
    
    # Forward: with payload
    fn_fwd = fn / np.sqrt(2) if payload_fwd else fn  # payload doubles mass -> fn drops
    resp_fwd = simulate_2mass(shaped, dt, fn_fwd, zeta, payload=payload_fwd)
    settle_fwd = get_settling_time(resp_fwd, dist, dt)
    
    # Return: no payload, same profile
    resp_ret = simulate_2mass(shaped, dt, fn, zeta, payload=False)
    settle_ret = get_settling_time(resp_ret, dist, dt)
    
    # Peak vibration (in settling region, after motion ends)
    motion_end_idx = len(pos)
    peak_vib = 0
    for i in range(motion_end_idx, min(len(resp_fwd), len(shaped))):
        vib = abs(resp_fwd[i] - dist)
        if vib > peak_vib:
            peak_vib = vib
    
    # Also measure unshaped response for comparison
    resp_unshaped = simulate_2mass(padded, dt, fn_fwd, zeta, payload=payload_fwd)
    settle_unshaped = get_settling_time(resp_unshaped, dist, dt)
    peak_vib_unshaped = 0
    for i in range(len(pos), len(resp_unshaped)):
        v = abs(resp_unshaped[i] - dist)
        if v > peak_vib_unshaped: peak_vib_unshaped = v
    
    # UPH
    total_rt = settle_fwd + settle_ret
    uph = int(3600 / total_rt) if total_rt > 0.001 else 99999
    
    # Vibration reduction %
    vib_reduction = (1 - peak_vib/peak_vib_unshaped)*100 if peak_vib_unshaped > 0.0001 else 0
    
    return {
        'motion_time': round(mt, 4),
        'shaper_delay_ms': round(shaper_delay*1000, 1),
        'peak_vib': round(peak_vib, 4),
        'peak_vib_unshaped': round(peak_vib_unshaped, 4),
        'settle_fwd': round(settle_fwd, 4),
        'settle_ret': round(settle_ret, 4),
        'uph': uph,
        'vib_reduction': round(vib_reduction, 1),
    }

# ═══════════════════════════════════════
all_results = []

# ═══════════════════════════════════════
# 실험 1: 3-프로파일 핵심 비교
# ═══════════════════════════════════════
print("="*60)
print("EXPERIMENT 1: 3-Profile Core Comparison")
print("  V=1000, A=20000, fn=10Hz, zeta=0.05, d=50mm")
print("="*60)

exp1 = []
configs = [
    ('1-A', 'trapezoidal', 'none', 'Trapezoidal'),
    ('1-B', 'ascurve', 'none', 'AS-Curve'),
    ('1-C', 'ascurve', 'ZVD', 'AS-Curve+ZVD'),
]
for eid, prof, shp, desc in configs:
    r = run_experiment(1000, 20000, 50, 10, 0.05, prof, shp)
    exp1.append({'id':eid, 'desc':desc, **r})
    print(f"  {eid} {desc:18s} | vib={r['peak_vib']:8.4f}mm | settle={r['settle_fwd']:.4f}s | UPH={r['uph']:>6,}")
    all_results.append({**exp1[-1], 'experiment': '1_core'})

# Chart
fig, axes = plt.subplots(1, 3, figsize=(14, 5))
labels = [e['desc'] for e in exp1]
colors = ['#dc2626', '#ea580c', '#2563eb']

for idx, (key, ylabel, title) in enumerate([
    ('peak_vib', 'Peak Vibration (mm)', 'Residual Vibration'),
    ('settle_fwd', 'Settling Time (s)', 'Settling Time (Forward)'),
    ('uph', 'UPH', 'Throughput (UPH)'),
]):
    vals = [e[key] for e in exp1]
    bars = axes[idx].bar(labels, vals, color=colors, alpha=0.85, edgecolor='white', linewidth=1.5)
    axes[idx].set_ylabel(ylabel)
    axes[idx].set_title(title, fontweight='bold')
    for i, v in enumerate(vals):
        fmt = f'{v:,.0f}' if key == 'uph' else (f'{v:.3f}s' if key == 'settle_fwd' else f'{v:.2f}mm')
        axes[idx].text(i, v*1.02+0.01, fmt, ha='center', fontweight='bold', fontsize=10)

plt.suptitle('Exp 1: 3-Profile Comparison (V=1000, A=20000, fn=10Hz, d=50mm)', fontsize=13, fontweight='bold')
plt.tight_layout()
plt.savefig(OUT/'exp1_3profile.png', bbox_inches='tight')
plt.close()

# ═══════════════════════════════════════
# 실험 2: 쉐이퍼 종류 비교
# ═══════════════════════════════════════
print(f"\n{'='*60}")
print("EXPERIMENT 2: Shaper Type Comparison")
print("  Profile=AS-Curve, V=1000, A=20000, fn=10Hz")
print("="*60)

exp2 = []
for eid, shp, desc in [('2-A','none','None'),('2-B','ZV','ZV'),('2-C','ZVD','ZVD'),('2-D','EI','EI')]:
    r = run_experiment(1000, 20000, 50, 10, 0.05, 'ascurve', shp)
    exp2.append({'id':eid, 'desc':desc, **r})
    print(f"  {eid} {desc:5s} | delay={r['shaper_delay_ms']:5.1f}ms | vib={r['peak_vib']:8.4f}mm | settle={r['settle_fwd']:.4f}s | UPH={r['uph']:>6,}")
    all_results.append({**exp2[-1], 'experiment': '2_shaper'})

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))
scolors = ['#9ca3af', '#ea580c', '#2563eb', '#16a34a']
x = np.arange(len(exp2))
ax1.bar(x, [e['peak_vib'] for e in exp2], color=scolors, alpha=0.85)
ax1.set_xticks(x); ax1.set_xticklabels([e['desc'] for e in exp2])
ax1.set_ylabel('Peak Vibration (mm)'); ax1.set_title('Residual Vibration by Shaper', fontweight='bold')
for i, e in enumerate(exp2):
    ax1.text(i, e['peak_vib']+0.2, f'{e["peak_vib"]:.2f}', ha='center', fontweight='bold', fontsize=10)

ax2.bar(x, [e['uph'] for e in exp2], color=scolors, alpha=0.85)
ax2.set_xticks(x); ax2.set_xticklabels([f'{e["desc"]}\n({e["shaper_delay_ms"]:.0f}ms)' for e in exp2])
ax2.set_ylabel('UPH'); ax2.set_title('UPH by Shaper', fontweight='bold')
for i, e in enumerate(exp2):
    ax2.text(i, e['uph']+50, f'{e["uph"]:,}', ha='center', fontweight='bold', fontsize=10)

plt.suptitle('Exp 2: Input Shaper Comparison (AS-Curve Profile)', fontsize=13, fontweight='bold')
plt.tight_layout()
plt.savefig(OUT/'exp2_shaper.png', bbox_inches='tight')
plt.close()

# ═══════════════════════════════════════
# 실험 3: 속도 스윕
# ═══════════════════════════════════════
print(f"\n{'='*60}")
print("EXPERIMENT 3: Velocity Sweep (16 runs)")
print("="*60)

speeds = [300, 500, 700, 1000, 1500, 2000, 2500, 3000]
exp3_none = []; exp3_zvd = []
for v in speeds:
    r1 = run_experiment(v, 20000, 50, 10, 0.05, 'ascurve', 'none')
    r2 = run_experiment(v, 20000, 50, 10, 0.05, 'ascurve', 'ZVD')
    exp3_none.append(r1); exp3_zvd.append(r2)
    print(f"  V={v:5d} | None: UPH={r1['uph']:>6,} vib={r1['peak_vib']:.3f} | ZVD: UPH={r2['uph']:>6,} vib={r2['peak_vib']:.3f}")
    all_results.append({'id':f'3-{v}-none', 'experiment':'3_speed', 'speed':v, 'shaper':'none', **r1})
    all_results.append({'id':f'3-{v}-ZVD', 'experiment':'3_speed', 'speed':v, 'shaper':'ZVD', **r2})

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))
ax1.plot(speeds, [r['uph'] for r in exp3_none], 'o-', color='#dc2626', linewidth=2, markersize=7, label='No Shaping')
ax1.plot(speeds, [r['uph'] for r in exp3_zvd], 's-', color='#2563eb', linewidth=2, markersize=7, label='ZVD Shaping')
ax1.fill_between(speeds, [r['uph'] for r in exp3_none], [r['uph'] for r in exp3_zvd], alpha=0.08, color='#2563eb')
ax1.set_xlabel('V_max (mm/s)'); ax1.set_ylabel('UPH'); ax1.set_title('UPH vs Velocity', fontweight='bold'); ax1.legend()

ax2.plot(speeds, [r['peak_vib'] for r in exp3_none], 'o-', color='#dc2626', linewidth=2, markersize=7, label='No Shaping')
ax2.plot(speeds, [r['peak_vib'] for r in exp3_zvd], 's-', color='#2563eb', linewidth=2, markersize=7, label='ZVD Shaping')
ax2.set_xlabel('V_max (mm/s)'); ax2.set_ylabel('Peak Vibration (mm)'); ax2.set_title('Vibration vs Velocity', fontweight='bold'); ax2.legend()

plt.suptitle('Exp 3: Effect of Maximum Velocity', fontsize=13, fontweight='bold')
plt.tight_layout()
plt.savefig(OUT/'exp3_speed.png', bbox_inches='tight')
plt.close()

# ═══════════════════════════════════════
# 실험 4: 거리 스윕
# ═══════════════════════════════════════
print(f"\n{'='*60}")
print("EXPERIMENT 4: Distance Sweep (12 runs)")
print("="*60)

dists = [10, 20, 30, 50, 70, 100]
exp4_none = []; exp4_zvd = []
for d in dists:
    r1 = run_experiment(1000, 20000, d, 10, 0.05, 'ascurve', 'none')
    r2 = run_experiment(1000, 20000, d, 10, 0.05, 'ascurve', 'ZVD')
    exp4_none.append(r1); exp4_zvd.append(r2)
    print(f"  d={d:4d}mm | None: settle={r1['settle_fwd']:.3f}s UPH={r1['uph']:>6,} | ZVD: settle={r2['settle_fwd']:.3f}s UPH={r2['uph']:>6,}")
    all_results.append({'id':f'4-{d}-none', 'experiment':'4_distance', 'distance':d, 'shaper':'none', **r1})
    all_results.append({'id':f'4-{d}-ZVD', 'experiment':'4_distance', 'distance':d, 'shaper':'ZVD', **r2})

fig, ax = plt.subplots(figsize=(10, 5))
x = np.arange(len(dists)); w = 0.35
ax.bar(x-w/2, [r['settle_fwd'] for r in exp4_none], w, color='#dc2626', alpha=0.85, label='No Shaping')
ax.bar(x+w/2, [r['settle_fwd'] for r in exp4_zvd], w, color='#2563eb', alpha=0.85, label='ZVD')
ax.set_xticks(x); ax.set_xticklabels([f'{d}mm' for d in dists])
ax.set_ylabel('Settling Time (s)'); ax.set_xlabel('Travel Distance')
ax.set_title('Exp 4: Settling Time vs Travel Distance', fontweight='bold'); ax.legend()
plt.tight_layout()
plt.savefig(OUT/'exp4_distance.png', bbox_inches='tight')
plt.close()

# ═══════════════════════════════════════
# 실험 5: 민감도 분석
# ═══════════════════════════════════════
print(f"\n{'='*60}")
print("EXPERIMENT 5: Sensitivity Analysis")
print("="*60)

fn_design = 10; zeta = 0.05
ratios = np.linspace(0.3, 1.7, 300)

def sensitivity_curve(amps, times, fn_actual, zeta):
    wd = 2*np.pi*fn_actual*np.sqrt(1-zeta**2)
    cs = sum(a*np.cos(wd*t) for a, t in zip(amps, times))
    ss = sum(a*np.sin(wd*t) for a, t in zip(amps, times))
    return np.sqrt(cs**2 + ss**2) * 100

zv_a, zv_t = compute_shaper('ZV', fn_design, zeta)
zvd_a, zvd_t = compute_shaper('ZVD', fn_design, zeta)
ei_a, ei_t = compute_shaper('EI', fn_design, zeta)

sens_zv = [sensitivity_curve(zv_a, zv_t, fn_design*r, zeta) for r in ratios]
sens_zvd = [sensitivity_curve(zvd_a, zvd_t, fn_design*r, zeta) for r in ratios]
sens_ei = [sensitivity_curve(ei_a, ei_t, fn_design*r, zeta) for r in ratios]

# Bandwidth calculation
bw_zv = sum(1 for s in sens_zv if s < 5) / len(ratios) * (1.7-0.3) * 100 / 1.0
bw_zvd = sum(1 for s in sens_zvd if s < 5) / len(ratios) * (1.7-0.3) * 100 / 1.0
bw_ei = sum(1 for s in sens_ei if s < 5) / len(ratios) * (1.7-0.3) * 100 / 1.0

print(f"  ZV:  5% bandwidth = +/-{bw_zv/2:.1f}%, delay = {zv_t[-1]*1000:.1f}ms")
print(f"  ZVD: 5% bandwidth = +/-{bw_zvd/2:.1f}%, delay = {zvd_t[-1]*1000:.1f}ms")
print(f"  EI:  5% bandwidth = +/-{bw_ei/2:.1f}%, delay = {ei_t[-1]*1000:.1f}ms")

fig, ax = plt.subplots(figsize=(10, 6))
ax.plot(ratios, sens_zv, '-', color='#ea580c', linewidth=2.5, label=f'ZV (bw=+/-{bw_zv/2:.0f}%)')
ax.plot(ratios, sens_zvd, '-', color='#2563eb', linewidth=2.5, label=f'ZVD (bw=+/-{bw_zvd/2:.0f}%)')
ax.plot(ratios, sens_ei, '-', color='#16a34a', linewidth=2.5, label=f'EI (bw=+/-{bw_ei/2:.0f}%)')
ax.axhline(y=5, color='#888', linewidth=1, linestyle='--', alpha=0.7, label='5% threshold')
ax.axvline(x=1.0, color='#888', linewidth=1, linestyle='--', alpha=0.5)
ax.axhspan(0, 5, alpha=0.05, color='green')
ax.set_xlabel('Frequency Ratio (f_actual / f_design)')
ax.set_ylabel('Residual Vibration (%)')
ax.set_title('Exp 5: Shaper Sensitivity to Frequency Estimation Error', fontweight='bold')
ax.legend(fontsize=11); ax.set_xlim(0.3, 1.7); ax.set_ylim(0, 120)
ax.text(1.0, 115, 'Design\nFrequency', ha='center', fontsize=9, color='gray')
plt.tight_layout()
plt.savefig(OUT/'exp5_sensitivity.png', bbox_inches='tight')
plt.close()

# ═══════════════════════════════════════
# 실험 6: Payload 효과
# ═══════════════════════════════════════
print(f"\n{'='*60}")
print("EXPERIMENT 6: Payload Effect (4 runs)")
print("  Payload ON: mass x2 -> fn drops from 10 to 7.07 Hz")
print("="*60)

exp6 = []
for eid, pl, shp, desc in [
    ('6-A', False, 'ZVD', 'No Payload + ZVD'),
    ('6-B', True, 'ZVD', 'Payload + ZVD'),
    ('6-C', True, 'EI', 'Payload + EI'),
    ('6-D', True, 'none', 'Payload + None'),
]:
    r = run_experiment(1000, 20000, 50, 10, 0.05, 'ascurve', shp, payload_fwd=pl)
    exp6.append({'id':eid, 'desc':desc, **r})
    print(f"  {eid} {desc:25s} | vib={r['peak_vib']:8.4f}mm | settle={r['settle_fwd']:.4f}s | UPH={r['uph']:>6,}")
    all_results.append({**exp6[-1], 'experiment':'6_payload'})

# ═══════════════════════════════════════
# 결과 저장
# ═══════════════════════════════════════
csv_path = OUT / 'all_experiments.csv'
fieldnames = ['experiment','id','desc','speed','distance','motion_time','shaper_delay_ms',
              'peak_vib','peak_vib_unshaped','settle_fwd','settle_ret','uph','vib_reduction']
with open(csv_path, 'w', newline='', encoding='utf-8-sig') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
    writer.writeheader()
    for r in all_results:
        writer.writerow(r)

print(f"\nAll results saved: {csv_path}")
print(f"Charts saved:")
for f in sorted(OUT.glob('*.png')):
    print(f"  {f.name} ({f.stat().st_size//1024}KB)")
print(f"\nTotal experiments: {len(all_results)}")
