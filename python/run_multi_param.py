"""교육용 vs 산업용 파라미터 비교 실험"""
import sys; sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, r'd:\dongwon\PICKPLACEROBOT\python')
from run_all_experiments import *
import numpy as np
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

plt.rcParams.update({
    'font.size': 11, 'axes.titlesize': 13, 'axes.labelsize': 11,
    'figure.facecolor': 'white', 'axes.facecolor': '#fafafa',
    'axes.grid': True, 'grid.alpha': 0.3, 'figure.dpi': 200,
})
OUT = Path(r'd:\dongwon\PICKPLACEROBOT\experiments')

def run_clean(vmax,amax,dist,fn,zeta,profile,shaper,dt=0.001):
    if profile=='trapezoidal':
        pos,mt = gen_trapezoidal(vmax,amax,dist,dt)
    else:
        pos,mt = gen_ascurve(vmax,amax,0.5,0.2,dist,dt)
    
    pad_n = int(3.0/dt)
    padded = np.concatenate([pos, np.full(pad_n, dist)])
    
    shaper_delay = 0
    if shaper != 'none':
        sa,st = compute_shaper(shaper,fn,zeta)
        shaped = convolve_shaper(padded,dt,sa,st)
        shaper_delay = st[-1]
    else:
        shaped = padded.copy()
    
    resp = simulate_2mass(shaped,dt,fn,zeta,payload=False)
    
    measure_start = int((mt + shaper_delay + 0.02)/dt)
    peak_vib = 0
    for i in range(measure_start, min(len(resp),len(shaped))):
        v = abs(resp[i] - dist)
        if v > peak_vib: peak_vib = v
    
    settle = get_settling_time(resp, dist, dt)
    
    # Return trip
    resp_ret = simulate_2mass(shaped,dt,fn,zeta,payload=False)
    settle_ret = get_settling_time(resp_ret, dist, dt)
    
    # Realistic UPH: add Z-axis overhead (pick+place = ~0.15s total)
    z_overhead = 0.15  # seconds for Z moves + vacuum
    total_cycle = settle + settle_ret + z_overhead
    uph_real = int(3600/total_cycle) if total_cycle > 0.001 else 99999
    uph_xonly = int(3600/(settle+settle_ret)) if (settle+settle_ret) > 0.001 else 99999
    
    return {
        'peak_vib_mm': round(peak_vib, 4),
        'settle': round(settle, 4),
        'settle_ret': round(settle_ret, 4),
        'uph_xonly': uph_xonly,
        'uph_real': uph_real,
        'motion_time': round(mt, 4),
        'shaper_delay': round(shaper_delay*1000, 1),
        'response': resp,
        'command': shaped,
    }

# ═══════════════════════════════════════
# 3가지 파라미터 세트
# ═══════════════════════════════════════
param_sets = [
    {'name': 'Educational',    'label': '교육용\n(fn=10, ζ=0.05)', 'fn': 10, 'zeta': 0.05, 'color': '#6366f1'},
    {'name': 'Standard',       'label': '일반 장비\n(fn=25, ζ=0.08)', 'fn': 25, 'zeta': 0.08, 'color': '#2563eb'},
    {'name': 'High-Perf',      'label': '고성능 장비\n(fn=40, ζ=0.12)', 'fn': 40, 'zeta': 0.12, 'color': '#0d9488'},
]

profiles = [
    ('trapezoidal', 'none', 'Trapezoidal'),
    ('ascurve', 'none', 'AS-Curve'),
    ('ascurve', 'ZVD', 'AS-Curve+ZVD'),
]

print("="*80)
print("MULTI-PARAMETER COMPARISON")
print("  V=1000, A=20000, d=50mm, Z-overhead=0.15s")
print("="*80)

all_data = {}
for ps in param_sets:
    print(f"\n--- {ps['name']} (fn={ps['fn']}Hz, zeta={ps['zeta']}) ---")
    results = []
    for prof, shp, desc in profiles:
        r = run_clean(1000, 20000, 50, ps['fn'], ps['zeta'], prof, shp)
        results.append({'desc': desc, **r})
        print(f"  {desc:18s} | vib={r['peak_vib_mm']:8.4f}mm | settle={r['settle']:.4f}s | UPH(X)={r['uph_xonly']:>6,} | UPH(real)={r['uph_real']:>6,}")
    all_data[ps['name']] = results

# ═══════════════════════════════════════
# 개선율 비교 테이블
# ═══════════════════════════════════════
print(f"\n{'='*80}")
print("IMPROVEMENT SUMMARY")
print("="*80)
print(f"{'Parameter':15s} | {'Baseline UPH':>12s} | {'ZVD UPH':>10s} | {'Improvement':>12s} | {'Vib Reduction':>14s}")
print("-"*80)
for ps in param_sets:
    d = all_data[ps['name']]
    base = d[0]  # Trapezoidal
    zvd = d[2]   # AS-Curve+ZVD
    uph_imp = (zvd['uph_real']/base['uph_real'] - 1)*100
    vib_red = (1 - zvd['peak_vib_mm']/base['peak_vib_mm'])*100 if base['peak_vib_mm'] > 0.0001 else 100
    print(f"{ps['name']:15s} | {base['uph_real']:>12,} | {zvd['uph_real']:>10,} | {uph_imp:>+11.1f}% | {vib_red:>13.1f}%")

# ═══════════════════════════════════════
# Chart 1: 3-parameter bar comparison
# ═══════════════════════════════════════
fig, axes = plt.subplots(1, 3, figsize=(16, 6))

x = np.arange(len(profiles))
width = 0.25
colors_param = [ps['color'] for ps in param_sets]

for idx, (key, ylabel, title) in enumerate([
    ('peak_vib_mm', 'Residual Vibration (mm)', 'Residual Vibration'),
    ('settle', 'Settling Time (s)', 'Settling Time'),
    ('uph_real', 'UPH (with Z overhead)', 'Realistic UPH'),
]):
    for pi, ps in enumerate(param_sets):
        vals = [all_data[ps['name']][j][key] for j in range(3)]
        bars = axes[idx].bar(x + pi*width - width, vals, width, 
                            color=ps['color'], alpha=0.85, label=ps['label'].replace('\n',' '))
        for i, v in enumerate(vals):
            if key == 'uph_real':
                axes[idx].text(x[i]+pi*width-width, v+50, f'{v:,}', ha='center', fontsize=7, fontweight='bold')
            elif key == 'peak_vib_mm' and v < 0.01:
                axes[idx].text(x[i]+pi*width-width, v+0.1, '~0', ha='center', fontsize=8, fontweight='bold')
    
    axes[idx].set_xticks(x)
    axes[idx].set_xticklabels([p[2] for p in profiles], fontsize=9)
    axes[idx].set_ylabel(ylabel)
    axes[idx].set_title(title, fontweight='bold')
    if idx == 0:
        axes[idx].legend(fontsize=8, loc='upper right')

plt.suptitle('3-Profile × 3-Parameter Comparison (V=1000, A=20000, d=50mm)', fontsize=14, fontweight='bold')
plt.tight_layout()
plt.savefig(OUT/'exp7_multi_param.png', bbox_inches='tight')
plt.close()
print(f"\nSaved: exp7_multi_param.png")

# ═══════════════════════════════════════
# Chart 2: Time-domain comparison (3 param sets, ZVD only)
# ═══════════════════════════════════════
fig, axes = plt.subplots(3, 1, figsize=(14, 10), sharex=True)

dt = 0.001
for pi, ps in enumerate(param_sets):
    ax = axes[pi]
    for prof, shp, desc in profiles:
        r = run_clean(1000, 20000, 50, ps['fn'], ps['zeta'], prof, shp)
        resp = r['response']
        cmd = r['command']
        min_len = min(len(resp), len(cmd))
        vib = (resp[:min_len] - cmd[:min_len]) * 1000  # to um
        
        start = max(0, int(r['motion_time']/dt) - 100)
        end = min(start + 3000, min_len)
        t = (np.arange(end-start)) * dt * 1000  # to ms
        
        color = '#dc2626' if shp=='none' and prof=='trapezoidal' else ('#ea580c' if shp=='none' else '#2563eb')
        ax.plot(t, vib[start:end], color=color, linewidth=1.2, label=desc, alpha=0.85)
    
    ax.axhspan(-5, 5, alpha=0.1, color='green')
    ax.set_ylabel('Vibration (um)')
    ax.set_title(f'{ps["name"]} — fn={ps["fn"]}Hz, zeta={ps["zeta"]}', fontweight='bold')
    ax.legend(fontsize=9, loc='upper right')
    
    # Auto-scale y to show detail
    all_vibs = []
    for prof, shp, desc in profiles:
        r = run_clean(1000, 20000, 50, ps['fn'], ps['zeta'], prof, shp)
        resp = r['response']; cmd = r['command']
        ml = min(len(resp),len(cmd))
        si = int(r['motion_time']/dt)
        for i in range(si, min(si+3000, ml)):
            all_vibs.append(abs(resp[i]-cmd[i])*1000)
    if all_vibs:
        ymax = min(max(all_vibs)*1.2, 30000)
        ax.set_ylim(-ymax, ymax)

axes[2].set_xlabel('Time after motion start (ms)')
plt.suptitle('Residual Vibration: Educational vs Industrial Parameters', fontsize=14, fontweight='bold')
plt.tight_layout()
plt.savefig(OUT/'exp7_timeseries_compare.png', bbox_inches='tight')
plt.close()
print(f"Saved: exp7_timeseries_compare.png")

# ═══════════════════════════════════════
# Chart 3: UPH improvement bar chart
# ═══════════════════════════════════════
fig, ax = plt.subplots(figsize=(10, 6))

param_labels = [ps['label'].replace('\n', ' ') for ps in param_sets]
base_uphs = [all_data[ps['name']][0]['uph_real'] for ps in param_sets]
zvd_uphs = [all_data[ps['name']][2]['uph_real'] for ps in param_sets]
improvements = [(z/b - 1)*100 for b, z in zip(base_uphs, zvd_uphs)]

x = np.arange(len(param_sets))
w = 0.35
bars1 = ax.bar(x - w/2, base_uphs, w, color='#dc2626', alpha=0.85, label='Trapezoidal (Baseline)')
bars2 = ax.bar(x + w/2, zvd_uphs, w, color='#2563eb', alpha=0.85, label='AS-Curve + ZVD')

for i in range(len(x)):
    ax.text(x[i]-w/2, base_uphs[i]+50, f'{base_uphs[i]:,}', ha='center', fontsize=10, fontweight='bold')
    ax.text(x[i]+w/2, zvd_uphs[i]+50, f'{zvd_uphs[i]:,}', ha='center', fontsize=10, fontweight='bold', color='#2563eb')
    ax.annotate(f'+{improvements[i]:.0f}%', xy=(x[i]+w/2, zvd_uphs[i]),
                xytext=(x[i]+w/2+0.15, zvd_uphs[i]*0.85),
                fontsize=12, fontweight='bold', color='#16a34a',
                arrowprops=dict(arrowstyle='->', color='#16a34a', lw=1.5))

ax.set_xticks(x)
ax.set_xticklabels(param_labels, fontsize=10)
ax.set_ylabel('UPH (with Z-axis overhead)')
ax.set_title('UPH Improvement by Parameter Set', fontsize=14, fontweight='bold')
ax.legend(fontsize=11)
plt.tight_layout()
plt.savefig(OUT/'exp7_uph_improvement.png', bbox_inches='tight')
plt.close()
print(f"Saved: exp7_uph_improvement.png")

print(f"\n{'='*80}")
print("DONE - All charts saved to experiments/")
print("="*80)
