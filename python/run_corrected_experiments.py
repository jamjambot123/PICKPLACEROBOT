"""Corrected peak vibration measurement - measure AFTER motion+shaper delay ends"""
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

def run_corrected(vmax,amax,dist,fn,zeta,profile='trapezoidal',shaper='none',
                  beta=0.5,gamma=0.2,dt=0.001,payload_fwd=False):
    if profile=='trapezoidal':
        pos,mt = gen_trapezoidal(vmax,amax,dist,dt)
    else:
        pos,mt = gen_ascurve(vmax,amax,beta,gamma,dist,dt)
    
    pad_n = int(3.0/dt)
    padded = np.concatenate([pos, np.full(pad_n, dist)])
    
    shaper_delay = 0
    if shaper != 'none':
        sa,st = compute_shaper(shaper,fn,zeta)
        shaped = convolve_shaper(padded,dt,sa,st)
        shaper_delay = st[-1]
    else:
        shaped = padded.copy()
    
    fn_eff = fn/np.sqrt(2) if payload_fwd else fn
    resp = simulate_2mass(shaped,dt,fn_eff,zeta,payload=payload_fwd)
    
    # CORRECTED: measure vibration AFTER motion time + shaper delay + settling margin
    measure_start = int((mt + shaper_delay + 0.05) / dt)  # 50ms after all motion ends
    
    peak_vib = 0
    residual_rms = 0
    count = 0
    for i in range(measure_start, min(len(resp), len(shaped))):
        v = abs(resp[i] - dist)
        if v > peak_vib: peak_vib = v
        residual_rms += v*v
        count += 1
    residual_rms = np.sqrt(residual_rms/max(count,1))
    
    settle = get_settling_time(resp, dist, dt)
    
    # Return trip (no payload)
    resp_ret = simulate_2mass(shaped, dt, fn, zeta, payload=False)
    settle_ret = get_settling_time(resp_ret, dist, dt)
    
    total_rt = settle + settle_ret
    uph = int(3600/total_rt) if total_rt > 0.001 else 99999
    
    return {
        'motion_time': round(mt,4),
        'shaper_delay_ms': round(shaper_delay*1000,1),
        'peak_vib': round(peak_vib,4),
        'rms_vib': round(residual_rms,6),
        'settle_fwd': round(settle,4),
        'settle_ret': round(settle_ret,4),
        'uph': uph,
        'response': resp,
        'command': shaped,
    }

# ═══════════════════════════════════════
# CORRECTED Experiment 1
# ═══════════════════════════════════════
print("="*60)
print("CORRECTED Exp 1: 3-Profile (No payload, fn=10Hz matches)")
print("="*60)

exp1 = []
for eid,prof,shp,desc in [('1-A','trapezoidal','none','Trapezoidal'),
                            ('1-B','ascurve','none','AS-Curve'),
                            ('1-C','ascurve','ZVD','AS-Curve+ZVD')]:
    r = run_corrected(1000,20000,50,10,0.05,prof,shp,payload_fwd=False)
    exp1.append({'id':eid,'desc':desc,**{k:v for k,v in r.items() if k not in ['response','command']}})
    print(f"  {eid} {desc:18s} | peak_vib={r['peak_vib']:8.4f}mm | rms={r['rms_vib']:.6f}mm | settle={r['settle_fwd']:.4f}s | UPH={r['uph']:>6,}")

# Time-domain vibration plot
print("\n  Generating time-domain vibration plot...")
fig, axes = plt.subplots(2, 1, figsize=(12, 8))

dt = 0.001
for idx, (eid,prof,shp,desc,color) in enumerate([
    ('1-A','trapezoidal','none','Trapezoidal','#dc2626'),
    ('1-B','ascurve','none','AS-Curve','#ea580c'),
    ('1-C','ascurve','ZVD','AS-Curve+ZVD','#2563eb'),
]):
    r = run_corrected(1000,20000,50,10,0.05,prof,shp,payload_fwd=False)
    resp = r['response']
    cmd = r['command']
    min_len = min(len(resp),len(cmd))
    vib = resp[:min_len] - cmd[:min_len]
    t = np.arange(min_len)*dt
    
    # Position
    axes[0].plot(t[:min(4000,min_len)], resp[:min(4000,min_len)], color=color, linewidth=1.5, label=desc, alpha=0.8)
    
    # Vibration (after motion)
    start = int(r['motion_time']/dt)
    end = min(start+3000, min_len)
    tv = t[start:end] - t[start]
    axes[1].plot(tv, vib[start:end]*1000, color=color, linewidth=1.5, label=desc, alpha=0.8)  # convert to um

axes[0].axhline(y=50, color='gray', linestyle='--', alpha=0.5, label='Target (50mm)')
axes[0].set_ylabel('Position (mm)'); axes[0].set_xlabel('Time (s)')
axes[0].set_title('Load Position Response', fontweight='bold'); axes[0].legend()

axes[1].axhspan(-5,5, alpha=0.1, color='green', label='Settling band (5um)')
axes[1].set_ylabel('Residual Vibration (um)'); axes[1].set_xlabel('Time after motion end (s)')
axes[1].set_title('Residual Vibration (Settling Region)', fontweight='bold'); axes[1].legend()

plt.suptitle('Exp 1: 3-Profile Comparison (V=1000, A=20000, fn=10Hz, d=50mm)', fontsize=13, fontweight='bold')
plt.tight_layout()
plt.savefig(OUT/'exp1_corrected_timeseries.png', bbox_inches='tight')
plt.close()
print(f"  Saved: exp1_corrected_timeseries.png")

# Bar chart
fig, axes = plt.subplots(1, 3, figsize=(14, 5))
labels = [e['desc'] for e in exp1]
colors = ['#dc2626', '#ea580c', '#2563eb']

for idx, (key, ylabel, title) in enumerate([
    ('peak_vib','Residual Vibration (mm)','Peak Residual Vibration'),
    ('settle_fwd','Settling Time (s)','Settling Time'),
    ('uph','UPH','Throughput (UPH)'),
]):
    vals = [e[key] for e in exp1]
    axes[idx].bar(labels, vals, color=colors, alpha=0.85, edgecolor='white', linewidth=1.5)
    axes[idx].set_ylabel(ylabel); axes[idx].set_title(title, fontweight='bold')
    for i,v in enumerate(vals):
        fmt = f'{v:,.0f}' if key=='uph' else (f'{v:.3f}s' if key=='settle_fwd' else f'{v:.2f}mm')
        axes[idx].text(i, v*1.03+0.01, fmt, ha='center', fontweight='bold', fontsize=10)

# Add improvement annotations
if exp1[2]['uph'] > exp1[0]['uph']:
    imp = (exp1[2]['uph']/exp1[0]['uph'] - 1)*100
    axes[2].annotate(f'+{imp:.0f}%', xy=(2, exp1[2]['uph']), fontsize=14, fontweight='bold', color='#2563eb', ha='center', va='bottom')

plt.suptitle('Exp 1: Core 3-Profile Comparison', fontsize=13, fontweight='bold')
plt.tight_layout()
plt.savefig(OUT/'exp1_corrected_bars.png', bbox_inches='tight')
plt.close()
print(f"  Saved: exp1_corrected_bars.png")

# ═══════════════════════════════════════
# CORRECTED Experiment 2
# ═══════════════════════════════════════
print(f"\n{'='*60}")
print("CORRECTED Exp 2: Shaper Comparison (No payload)")
print("="*60)

exp2 = []
for eid,shp,desc in [('2-A','none','None'),('2-B','ZV','ZV'),('2-C','ZVD','ZVD'),('2-D','EI','EI')]:
    r = run_corrected(1000,20000,50,10,0.05,'ascurve',shp,payload_fwd=False)
    exp2.append({'id':eid,'desc':desc,**{k:v for k,v in r.items() if k not in ['response','command']}})
    print(f"  {eid} {desc:5s} | delay={r['shaper_delay_ms']:5.1f}ms | peak_vib={r['peak_vib']:8.4f}mm | settle={r['settle_fwd']:.4f}s | UPH={r['uph']:>6,}")

# ═══════════════════════════════════════
# CORRECTED Experiment 3: Speed sweep
# ═══════════════════════════════════════
print(f"\n{'='*60}")
print("CORRECTED Exp 3: Speed Sweep (No payload)")
print("="*60)

speeds = [300,500,700,1000,1500,2000,2500,3000]
exp3n = []; exp3z = []
for v in speeds:
    r1 = run_corrected(v,20000,50,10,0.05,'ascurve','none',payload_fwd=False)
    r2 = run_corrected(v,20000,50,10,0.05,'ascurve','ZVD',payload_fwd=False)
    exp3n.append(r1); exp3z.append(r2)
    print(f"  V={v:5d} | None: UPH={r1['uph']:>6,} settle={r1['settle_fwd']:.3f}s | ZVD: UPH={r2['uph']:>6,} settle={r2['settle_fwd']:.3f}s")

fig,(ax1,ax2) = plt.subplots(1,2,figsize=(14,5))
ax1.plot(speeds,[r['uph'] for r in exp3n],'o-',color='#dc2626',linewidth=2,markersize=7,label='No Shaping')
ax1.plot(speeds,[r['uph'] for r in exp3z],'s-',color='#2563eb',linewidth=2,markersize=7,label='ZVD')
ax1.fill_between(speeds,[r['uph'] for r in exp3n],[r['uph'] for r in exp3z],alpha=0.08,color='#2563eb')
ax1.set_xlabel('V_max (mm/s)'); ax1.set_ylabel('UPH'); ax1.set_title('UPH vs Velocity',fontweight='bold'); ax1.legend()

ax2.plot(speeds,[r['settle_fwd'] for r in exp3n],'o-',color='#dc2626',linewidth=2,markersize=7,label='No Shaping')
ax2.plot(speeds,[r['settle_fwd'] for r in exp3z],'s-',color='#2563eb',linewidth=2,markersize=7,label='ZVD')
ax2.set_xlabel('V_max (mm/s)'); ax2.set_ylabel('Settling Time (s)'); ax2.set_title('Settling Time vs Velocity',fontweight='bold'); ax2.legend()

plt.suptitle('Exp 3: Effect of Maximum Velocity (No Payload)',fontsize=13,fontweight='bold')
plt.tight_layout()
plt.savefig(OUT/'exp3_corrected.png',bbox_inches='tight')
plt.close()
print(f"  Saved: exp3_corrected.png")

# ═══════════════════════════════════════
# CORRECTED Experiment 4: Distance sweep
# ═══════════════════════════════════════
print(f"\n{'='*60}")
print("CORRECTED Exp 4: Distance Sweep (No payload)")
print("="*60)

dists = [10,20,30,50,70,100]
exp4n=[]; exp4z=[]
for d in dists:
    r1 = run_corrected(1000,20000,d,10,0.05,'ascurve','none',payload_fwd=False)
    r2 = run_corrected(1000,20000,d,10,0.05,'ascurve','ZVD',payload_fwd=False)
    exp4n.append(r1); exp4z.append(r2)
    print(f"  d={d:4d}mm | None: settle={r1['settle_fwd']:.3f}s UPH={r1['uph']:>6,} | ZVD: settle={r2['settle_fwd']:.3f}s UPH={r2['uph']:>6,}")

fig,ax = plt.subplots(figsize=(10,5))
x = np.arange(len(dists)); w=0.35
ax.bar(x-w/2,[r['settle_fwd'] for r in exp4n],w,color='#dc2626',alpha=0.85,label='No Shaping')
ax.bar(x+w/2,[r['settle_fwd'] for r in exp4z],w,color='#2563eb',alpha=0.85,label='ZVD')
ax.set_xticks(x); ax.set_xticklabels([f'{d}mm' for d in dists])
ax.set_ylabel('Settling Time (s)'); ax.set_xlabel('Travel Distance')
ax.set_title('Exp 4: Settling Time vs Distance (No Payload)',fontweight='bold'); ax.legend()
plt.tight_layout()
plt.savefig(OUT/'exp4_corrected.png',bbox_inches='tight')
plt.close()
print(f"  Saved: exp4_corrected.png")

print(f"\n{'='*60}")
print("ALL CORRECTED EXPERIMENTS COMPLETE")
print("="*60)
