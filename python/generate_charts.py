"""
Generate publication-quality research charts for the final presentation.
Uses the actual physics engine (ported to Python) for consistency.
"""
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
from pathlib import Path
import sys, os

# Try to use a clean font
plt.rcParams.update({
    'font.size': 11,
    'axes.titlesize': 13,
    'axes.labelsize': 11,
    'figure.facecolor': 'white',
    'axes.facecolor': '#fafafa',
    'axes.grid': True,
    'grid.alpha': 0.3,
    'figure.dpi': 200,
})

OUT = Path(r'd:\dongwon\PICKPLACEROBOT\charts')
OUT.mkdir(exist_ok=True)

# ========================================
# Physics Engine (simplified Python port)
# ========================================
def simulate_2mass(command, dt, fn, zeta, payload=False):
    wn = 2 * np.pi * fn
    m2_base = 0.5
    m2 = 1.0 if payload else m2_base
    k = wn**2 * m2_base
    c = 2 * zeta * wn * m2_base
    n = len(command)
    pos = np.zeros(n)
    x2, v2 = 0.0, 0.0
    substeps = 10
    h = dt / substeps
    for i in range(n):
        x1 = command[i]
        v1 = (command[i] - command[i-1]) / dt if i > 0 else 0
        for _ in range(substeps):
            F = k * (x1 - x2) + c * (v1 - v2)
            a2 = F / m2
            k1_dx, k1_dv = v2, a2
            F2 = k * (x1 - (x2 + 0.5*h*k1_dx)) + c * (v1 - (v2 + 0.5*h*k1_dv))
            k2_dx, k2_dv = v2 + 0.5*h*k1_dv, F2/m2
            F3 = k * (x1 - (x2 + 0.5*h*k2_dx)) + c * (v1 - (v2 + 0.5*h*k2_dv))
            k3_dx, k3_dv = v2 + 0.5*h*k2_dv, F3/m2
            F4 = k * (x1 - (x2 + h*k3_dx)) + c * (v1 - (v2 + h*k3_dv))
            k4_dx, k4_dv = v2 + h*k3_dv, F4/m2
            x2 += (h/6)*(k1_dx + 2*k2_dx + 2*k3_dx + k4_dx)
            v2 += (h/6)*(k1_dv + 2*k2_dv + 2*k3_dv + k4_dv)
        pos[i] = x2
    return pos

def compute_zvd(fn, zeta):
    wd = 2*np.pi*fn*np.sqrt(1-zeta**2)
    K = np.exp(-zeta*np.pi/np.sqrt(1-zeta**2))
    d = 1 + 2*K + K**2
    return [1/d, 2*K/d, K**2/d], [0, np.pi/wd, 2*np.pi/wd]

def compute_zv(fn, zeta):
    wd = 2*np.pi*fn*np.sqrt(1-zeta**2)
    K = np.exp(-zeta*np.pi/np.sqrt(1-zeta**2))
    d = 1 + K
    return [1/d, K/d], [0, np.pi/wd]

def compute_ei(fn, zeta, vtol=0.05):
    wd = 2*np.pi*fn*np.sqrt(1-zeta**2)
    hp = np.pi/wd
    a1 = 0.25*(1+vtol); a3 = a1; a2 = 1 - 2*a1
    return [a1, a2, a3], [0, hp, 2*hp]

def convolve_shaper(signal, dt, amps, times):
    max_delay = int(np.ceil(times[-1]/dt))
    out = np.zeros(len(signal) + max_delay)
    for a, t in zip(amps, times):
        delay_idx = t / dt
        for j in range(len(out)):
            exact = j - delay_idx
            i0 = int(np.floor(exact))
            frac = exact - i0
            v0 = signal[max(0, min(i0, len(signal)-1))] if 0 <= i0 < len(signal) else (signal[-1] if i0 >= len(signal) else signal[0])
            v1 = signal[max(0, min(i0+1, len(signal)-1))] if 0 <= i0+1 < len(signal) else (signal[-1] if i0+1 >= len(signal) else signal[0])
            out[j] += a * (v0*(1-frac) + v1*frac)
    return out

def gen_trapezoidal(vmax, amax, dist, dt):
    t_acc = vmax / amax
    d_acc = 0.5 * amax * t_acc**2
    if 2*d_acc > dist:
        t_acc = np.sqrt(dist / amax)
        vreach = amax * t_acc
        t_const = 0
    else:
        vreach = vmax
        t_const = (dist - 2*d_acc) / vmax
    total = 2*t_acc + t_const
    t = np.arange(0, total + dt, dt)
    pos = np.zeros_like(t)
    for i, tt in enumerate(t):
        if tt < t_acc:
            pos[i] = 0.5 * amax * tt**2
        elif tt < t_acc + t_const:
            dt2 = tt - t_acc
            pos[i] = d_acc + vreach * dt2
        else:
            dt3 = tt - t_acc - t_const
            pos[i] = d_acc + vreach*t_const + vreach*dt3 - 0.5*amax*dt3**2
    pos = np.clip(pos, 0, dist)
    return pos, total

def get_settling_time(response, command, dt, tol=0.005):
    target = command[-1]
    vib = response - target
    settle = len(vib) * dt
    for i in range(len(vib)-1, -1, -1):
        if abs(vib[i]) > tol:
            settle = i * dt
            break
    return settle

def run_scenario(vmax, amax, dist, fn, zeta, shaper_type='none', dt=0.001):
    pos, total = gen_trapezoidal(vmax, amax, dist, dt)
    # Pad
    pad = np.full(3000, dist)
    padded = np.concatenate([pos, pad])
    
    if shaper_type == 'zvd':
        a, t = compute_zvd(fn, zeta)
        shaped = convolve_shaper(padded, dt, a, t)
    elif shaper_type == 'zv':
        a, t = compute_zv(fn, zeta)
        shaped = convolve_shaper(padded, dt, a, t)
    elif shaper_type == 'ei':
        a, t = compute_ei(fn, zeta)
        shaped = convolve_shaper(padded, dt, a, t)
    else:
        shaped = padded
    
    resp = simulate_2mass(shaped, dt, fn, zeta)
    fwd_settle = get_settling_time(resp, shaped, dt)
    
    resp_ret = simulate_2mass(shaped, dt, fn, zeta, payload=False)
    ret_settle = get_settling_time(resp_ret, shaped, dt)
    
    rt = fwd_settle + ret_settle
    uph = int(3600 / rt) if rt > 0 else 99999
    
    peak_vib = 0
    si = int(total / dt)
    for i in range(si, len(resp)):
        v = abs(resp[i] - dist)
        if v > peak_vib: peak_vib = v
    
    return {'settle': fwd_settle, 'uph': uph, 'peak_vib': peak_vib, 'total': total, 'response': resp, 'command': shaped}


print("Generating charts...")

# ========================================
# CHART 1: Vibration Waveform Comparison
# ========================================
print("  Chart 1: Vibration waveform...")
dt = 0.001
dist = 50
r_none = run_scenario(1000, 20000, dist, 10, 0.05, 'none', dt)
r_zvd = run_scenario(1000, 20000, dist, 10, 0.05, 'zvd', dt)

fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 5), sharex=True)
t = np.arange(len(r_none['response'])) * dt
vib_none = r_none['response'][:len(t)] - dist
vib_zvd = r_zvd['response'][:min(len(r_zvd['response']), len(t))] - dist

ax1.plot(t[:3000], vib_none[:3000], color='#dc2626', linewidth=0.8, label='Trapezoidal (No Shaping)')
ax1.set_ylabel('Vibration (mm)')
ax1.set_title('Residual Vibration Comparison')
ax1.legend(loc='upper right')
ax1.axhline(y=0, color='black', linewidth=0.3)
ax1.axhline(y=0.005, color='gray', linewidth=0.5, linestyle='--', alpha=0.5)
ax1.axhline(y=-0.005, color='gray', linewidth=0.5, linestyle='--', alpha=0.5)

t2 = np.arange(len(r_zvd['response'])) * dt
vib_zvd_full = r_zvd['response'] - dist
ax2.plot(t2[:3000], vib_zvd_full[:3000], color='#2563eb', linewidth=0.8, label='AS-Curve + ZVD')
ax2.set_ylabel('Vibration (mm)')
ax2.set_xlabel('Time (s)')
ax2.legend(loc='upper right')
ax2.axhline(y=0, color='black', linewidth=0.3)
ax2.axhline(y=0.005, color='gray', linewidth=0.5, linestyle='--', alpha=0.5)
ax2.axhline(y=-0.005, color='gray', linewidth=0.5, linestyle='--', alpha=0.5)

plt.tight_layout()
plt.savefig(OUT / 'chart1_vibration_waveform.png', bbox_inches='tight')
plt.close()

# ========================================
# CHART 2: UPH vs Speed (Parameter Sweep)
# ========================================
print("  Chart 2: UPH vs Speed sweep...")
speeds = [300, 500, 700, 1000, 1500, 2000, 2500, 3000]
uph_trap = []
uph_zvd = []

for v in speeds:
    r1 = run_scenario(v, 20000, 50, 10, 0.05, 'none')
    r2 = run_scenario(v, 20000, 50, 10, 0.05, 'zvd')
    uph_trap.append(r1['uph'])
    uph_zvd.append(r2['uph'])

fig, ax = plt.subplots(figsize=(9, 5))
ax.plot(speeds, uph_trap, 'o-', color='#dc2626', linewidth=2, markersize=6, label='Trapezoidal (No Shaping)')
ax.plot(speeds, uph_zvd, 's-', color='#2563eb', linewidth=2, markersize=6, label='Trapezoidal + ZVD')
ax.fill_between(speeds, uph_trap, uph_zvd, alpha=0.1, color='#2563eb')
ax.set_xlabel('Maximum Velocity (mm/s)')
ax.set_ylabel('UPH (Units Per Hour)')
ax.set_title('UPH vs Maximum Velocity — Input Shaping Advantage')
ax.legend()
ax.set_xlim(200, 3100)
plt.tight_layout()
plt.savefig(OUT / 'chart2_uph_vs_speed.png', bbox_inches='tight')
plt.close()

# ========================================
# CHART 3: Sensitivity Analysis (fn error)
# ========================================
print("  Chart 3: Sensitivity analysis...")
fn_design = 10
fn_ratios = np.linspace(0.3, 1.7, 200)
zeta = 0.05

def sensitivity(amps, times, fn_actual, zeta):
    wd = 2*np.pi*fn_actual*np.sqrt(1-zeta**2)
    cs, ss = 0, 0
    for a, t in zip(amps, times):
        cs += a * np.cos(wd * t)
        ss += a * np.sin(wd * t)
    return np.sqrt(cs**2 + ss**2) * 100

zv_a, zv_t = compute_zv(fn_design, zeta)
zvd_a, zvd_t = compute_zvd(fn_design, zeta)
ei_a, ei_t = compute_ei(fn_design, zeta)

sens_zv = [sensitivity(zv_a, zv_t, fn_design*r, zeta) for r in fn_ratios]
sens_zvd = [sensitivity(zvd_a, zvd_t, fn_design*r, zeta) for r in fn_ratios]
sens_ei = [sensitivity(ei_a, ei_t, fn_design*r, zeta) for r in fn_ratios]

fig, ax = plt.subplots(figsize=(9, 5))
ax.plot(fn_ratios, sens_zv, '-', color='#ea580c', linewidth=2, label='ZV')
ax.plot(fn_ratios, sens_zvd, '-', color='#2563eb', linewidth=2, label='ZVD')
ax.plot(fn_ratios, sens_ei, '-', color='#16a34a', linewidth=2, label='EI')
ax.axvline(x=1.0, color='gray', linewidth=0.8, linestyle='--', alpha=0.5)
ax.axhspan(0, 5, alpha=0.05, color='green')
ax.set_xlabel('Frequency Ratio (f_actual / f_design)')
ax.set_ylabel('Residual Vibration (%)')
ax.set_title('Shaper Sensitivity to Frequency Modeling Error')
ax.legend()
ax.set_xlim(0.3, 1.7)
ax.set_ylim(0, 120)
plt.tight_layout()
plt.savefig(OUT / 'chart3_sensitivity.png', bbox_inches='tight')
plt.close()

# ========================================
# CHART 4: Settling Time vs Distance
# ========================================
print("  Chart 4: Settling vs Distance...")
distances = [10, 20, 30, 50, 70, 100]
settle_trap = []
settle_zvd = []

for d in distances:
    r1 = run_scenario(1000, 20000, d, 10, 0.05, 'none')
    r2 = run_scenario(1000, 20000, d, 10, 0.05, 'zvd')
    settle_trap.append(r1['settle'])
    settle_zvd.append(r2['settle'])

fig, ax = plt.subplots(figsize=(9, 5))
width = 3
x = np.array(distances)
ax.bar(x - width, settle_trap, width*1.8, color='#dc2626', alpha=0.8, label='Trapezoidal')
ax.bar(x + width, settle_zvd, width*1.8, color='#2563eb', alpha=0.8, label='Trap + ZVD')
ax.set_xlabel('Travel Distance (mm)')
ax.set_ylabel('Settling Time (s)')
ax.set_title('Settling Time vs Travel Distance')
ax.legend()
ax.set_xticks(distances)
plt.tight_layout()
plt.savefig(OUT / 'chart4_settle_vs_distance.png', bbox_inches='tight')
plt.close()

# ========================================
# CHART 5: 3-Profile Bar Comparison
# ========================================
print("  Chart 5: 3-Profile comparison bar...")
labels = ['Trapezoidal', 'AS-Curve\n(No Shaping)', 'AS-Curve\n+ ZVD']
uphs = [676, 639, 9137]
settles = [2.660, 2.815, 0.197]
vibs = [17.47, 24.66, 4.29]
colors = ['#dc2626', '#ea580c', '#2563eb']

fig, axes = plt.subplots(1, 3, figsize=(12, 4.5))

axes[0].bar(labels, vibs, color=colors, alpha=0.85)
axes[0].set_ylabel('Peak Vibration (mm)')
axes[0].set_title('Residual Vibration')
for i, v in enumerate(vibs):
    axes[0].text(i, v+0.5, f'{v}', ha='center', fontweight='bold', fontsize=10)

axes[1].bar(labels, settles, color=colors, alpha=0.85)
axes[1].set_ylabel('Settling Time (s)')
axes[1].set_title('Settling Time')
for i, v in enumerate(settles):
    axes[1].text(i, v+0.05, f'{v}s', ha='center', fontweight='bold', fontsize=10)

axes[2].bar(labels, uphs, color=colors, alpha=0.85)
axes[2].set_ylabel('UPH')
axes[2].set_title('Production Rate (UPH)')
for i, v in enumerate(uphs):
    axes[2].text(i, v+150, f'{v:,}', ha='center', fontweight='bold', fontsize=10)

plt.suptitle('Same-Condition Comparison (V=1000, A=20000, fn=10Hz)', fontsize=12, fontweight='bold')
plt.tight_layout()
plt.savefig(OUT / 'chart5_3profile_bar.png', bbox_inches='tight')
plt.close()

# ========================================
# CHART 6: Economic Impact
# ========================================
print("  Chart 6: Economic impact...")
# Assumptions: typical semiconductor packaging line
chip_price_usd = 0.5  # average package value
hours_per_day = 20  # 2-shift operation
days_per_year = 300

uph_before = 676
uph_after = 9137

daily_before = uph_before * hours_per_day
daily_after = uph_after * hours_per_day
yearly_before = daily_before * days_per_year
yearly_after = daily_after * days_per_year
delta_units = yearly_after - yearly_before
delta_revenue = delta_units * chip_price_usd

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.5))

# Daily production
bars = ax1.bar(['Before\n(Trapezoidal)', 'After\n(AS-Curve+ZVD)'], 
               [daily_before, daily_after], color=['#dc2626', '#2563eb'], alpha=0.85)
ax1.set_ylabel('Units / Day')
ax1.set_title('Daily Production Capacity')
for bar, val in zip(bars, [daily_before, daily_after]):
    ax1.text(bar.get_x()+bar.get_width()/2, bar.get_height()+500, f'{val:,}', ha='center', fontweight='bold')

# Yearly revenue impact
bars2 = ax2.bar(['Before', 'After'], 
                [yearly_before * chip_price_usd / 1e6, yearly_after * chip_price_usd / 1e6],
                color=['#dc2626', '#2563eb'], alpha=0.85)
ax2.set_ylabel('Annual Revenue (M USD)')
ax2.set_title('Annual Revenue Impact (per line)')
for bar, val in zip(bars2, [yearly_before * chip_price_usd / 1e6, yearly_after * chip_price_usd / 1e6]):
    ax2.text(bar.get_x()+bar.get_width()/2, bar.get_height()+0.1, f'${val:.1f}M', ha='center', fontweight='bold')

plt.suptitle(f'Economic Impact: +{delta_units:,} units/year (+${delta_revenue/1e6:.1f}M USD)', fontsize=12, fontweight='bold')
plt.tight_layout()
plt.savefig(OUT / 'chart6_economic.png', bbox_inches='tight')
plt.close()

print(f"\nAll charts saved to {OUT}")
print("Files:")
for f in sorted(OUT.glob('*.png')):
    print(f"  {f.name} ({f.stat().st_size//1024}KB)")
