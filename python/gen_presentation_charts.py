"""발표에 필요한 누락 차트 전부 생성"""
import sys; sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, r'd:\dongwon\PICKPLACEROBOT\python')
from run_all_experiments import *
import numpy as np
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.patches import FancyArrowPatch

plt.rcParams.update({
    'font.size': 11, 'axes.titlesize': 13, 'axes.labelsize': 11,
    'figure.facecolor': 'white', 'axes.facecolor': '#fafafa',
    'axes.grid': True, 'grid.alpha': 0.3, 'figure.dpi': 200,
    'font.family': 'sans-serif',
})
OUT = Path(r'd:\dongwon\PICKPLACEROBOT\experiments')

dt = 0.001

# ═══════════════════════════════════════
# CHART A: 3-Profile Shape Comparison
# Position / Velocity / Acceleration / Jerk
# ═══════════════════════════════════════
print("Generating: 3-Profile Waveform Comparison...")

fig, axes = plt.subplots(4, 1, figsize=(12, 14), sharex=True)

profiles_data = []
for prof, label, color in [
    ('trapezoidal', 'Trapezoidal', '#dc2626'),
    ('ascurve', 'AS-Curve', '#ea580c'),
]:
    if prof == 'trapezoidal':
        pos, mt = gen_trapezoidal(1000, 20000, 50, dt)
    else:
        pos, mt = gen_ascurve(1000, 20000, 0.5, 0.2, 50, dt)
    
    # Compute derivatives
    vel = np.gradient(pos, dt)
    acc = np.gradient(vel, dt)
    jerk = np.gradient(acc, dt)
    
    # Clip jerk for display
    jerk = np.clip(jerk, -1e8, 1e8)
    
    t = np.arange(len(pos)) * dt * 1000  # ms
    
    profiles_data.append((t, pos, vel, acc, jerk, label, color))

# Also add ZVD-shaped AS-Curve command
pos_as, mt_as = gen_ascurve(1000, 20000, 0.5, 0.2, 50, dt)
pad = np.full(500, 50)
padded = np.concatenate([pos_as, pad])
sa, st = compute_shaper('ZVD', 10, 0.05)
shaped = convolve_shaper(padded, dt, sa, st)
t_shaped = np.arange(len(shaped)) * dt * 1000

vel_s = np.gradient(shaped, dt)
acc_s = np.gradient(vel_s, dt)
jerk_s = np.gradient(acc_s, dt)
jerk_s = np.clip(jerk_s, -1e8, 1e8)

show_n = int(0.2 / dt)  # show first 200ms

titles = ['Position (mm)', 'Velocity (mm/s)', 'Acceleration (mm/s²)', 'Jerk (mm/s³)']
for idx, (data_idx, ylabel) in enumerate(zip([1,2,3,4], titles)):
    ax = axes[idx]
    for t, pos, vel, acc, jerk, label, color in profiles_data:
        data = [pos, vel, acc, jerk][idx]
        ax.plot(t[:show_n], data[:show_n], color=color, linewidth=2, label=label, alpha=0.85)
    
    # ZVD shaped
    data_s = [shaped, vel_s, acc_s, jerk_s][idx]
    ax.plot(t_shaped[:show_n], data_s[:show_n], color='#2563eb', linewidth=2, label='AS-Curve + ZVD', alpha=0.85, linestyle='-')
    
    ax.set_ylabel(ylabel)
    if idx == 0:
        ax.legend(fontsize=10, loc='lower right')

axes[3].set_xlabel('Time (ms)')
axes[0].set_title('Motion Profile Comparison: Position / Velocity / Acceleration / Jerk', fontsize=14, fontweight='bold')
plt.tight_layout()
plt.savefig(OUT/'slide_profiles.png', bbox_inches='tight')
plt.close()
print("  Saved: slide_profiles.png")

# ═══════════════════════════════════════
# CHART B: ZVD Convolution Before/After
# ═══════════════════════════════════════
print("Generating: ZVD Convolution Before/After...")

fig, axes = plt.subplots(3, 1, figsize=(12, 10))

# Original command
pos_orig, mt = gen_ascurve(1000, 20000, 0.5, 0.2, 50, dt)
pad = np.full(2000, 50)
padded = np.concatenate([pos_orig, pad])
t_orig = np.arange(len(padded)) * dt * 1000

# Shaped command
sa, st = compute_shaper('ZVD', 10, 0.05)
shaped = convolve_shaper(padded, dt, sa, st)
t_sh = np.arange(len(shaped)) * dt * 1000

# System responses
resp_orig = simulate_2mass(padded, dt, 10, 0.05, payload=False)
resp_shaped = simulate_2mass(shaped, dt, 10, 0.05, payload=False)

show = 600  # 600ms

# Panel 1: Command signals
axes[0].plot(t_orig[:show], padded[:show], color='#dc2626', linewidth=2, label='Original Command')
axes[0].plot(t_sh[:show], shaped[:show], color='#2563eb', linewidth=2, label='ZVD Shaped Command', linestyle='--')
axes[0].axvline(x=st[-1]*1000, color='gray', linestyle=':', alpha=0.5)
axes[0].annotate(f'ZVD delay\n{st[-1]*1000:.0f}ms', xy=(st[-1]*1000, 25), fontsize=10, color='gray', ha='center')
axes[0].set_ylabel('Position (mm)')
axes[0].set_title('Step 1: Command Signal', fontweight='bold')
axes[0].legend()

# Panel 2: ZVD impulses
axes[1].set_xlim(0, show)
for i, (a, t_imp) in enumerate(zip(sa, st)):
    axes[1].bar(t_imp*1000, a, width=3, color=['#dc2626','#ea580c','#2563eb'][i], alpha=0.85, 
                label=f'A{i+1}={a:.3f} @ {t_imp*1000:.0f}ms')
axes[1].set_ylabel('Amplitude')
axes[1].set_title('Step 2: ZVD Shaper Impulses (3 impulses)', fontweight='bold')
axes[1].legend()
axes[1].set_ylim(0, 1)

# Panel 3: System response
vib_orig = (resp_orig[:show] - padded[:show]) * 1000  # um
min_len = min(show, len(resp_shaped), len(shaped))
vib_shaped = (resp_shaped[:min_len] - shaped[:min_len]) * 1000

t_r = np.arange(show) * dt * 1000
axes[2].plot(t_r, vib_orig[:show], color='#dc2626', linewidth=1.5, label='Without Shaping', alpha=0.85)
axes[2].plot(t_r[:min_len], vib_shaped, color='#2563eb', linewidth=1.5, label='With ZVD', alpha=0.85)
axes[2].axhspan(-5, 5, alpha=0.1, color='green')
axes[2].set_ylabel('Vibration (um)')
axes[2].set_xlabel('Time (ms)')
axes[2].set_title('Step 3: Load Response — Vibration Comparison', fontweight='bold')
axes[2].legend()

plt.suptitle('ZVD Input Shaping: How It Works', fontsize=15, fontweight='bold')
plt.tight_layout()
plt.savefig(OUT/'slide_zvd_howto.png', bbox_inches='tight')
plt.close()
print("  Saved: slide_zvd_howto.png")

# ═══════════════════════════════════════
# CHART C: 2-Mass Model Diagram
# ═══════════════════════════════════════
print("Generating: 2-Mass Model Diagram...")

fig, ax = plt.subplots(figsize=(12, 5))
ax.set_xlim(0, 12); ax.set_ylim(0, 5)
ax.set_aspect('equal')
ax.axis('off')

# Motor block
motor = patches.FancyBboxPatch((1, 1.5), 2.5, 2, boxstyle="round,pad=0.15", 
                                 facecolor='#dbeafe', edgecolor='#2563eb', linewidth=2)
ax.add_patch(motor)
ax.text(2.25, 2.5, 'Motor\n(Carriage)\nm₁', ha='center', va='center', fontsize=12, fontweight='bold', color='#1e40af')
ax.text(2.25, 1.0, 'x₁ = command(t)\nPerfect Servo', ha='center', va='center', fontsize=9, color='#6b7280', style='italic')

# Spring-Damper
ax.annotate('', xy=(5.8, 3.0), xytext=(3.5, 3.0), arrowprops=dict(arrowstyle='-', lw=2, color='#059669'))
ax.text(4.65, 3.4, 'k (spring)', ha='center', fontsize=10, color='#059669', fontweight='bold')
ax.annotate('', xy=(5.8, 2.0), xytext=(3.5, 2.0), arrowprops=dict(arrowstyle='-', lw=2, color='#d97706'))
ax.text(4.65, 1.6, 'c (damper)', ha='center', fontsize=10, color='#d97706', fontweight='bold')

# Spring zigzag
for i in range(6):
    x_start = 3.7 + i * 0.3
    y_offset = 0.15 if i % 2 == 0 else -0.15
    ax.plot([x_start, x_start+0.3], [3.0+y_offset, 3.0-y_offset], color='#059669', linewidth=2)

# Damper box
ax.add_patch(patches.Rectangle((4.2, 1.85), 0.8, 0.3, facecolor='#fef3c7', edgecolor='#d97706', linewidth=2))

# Load block
load = patches.FancyBboxPatch((6, 1.5), 2.5, 2, boxstyle="round,pad=0.15",
                                facecolor='#fce7f3', edgecolor='#db2777', linewidth=2)
ax.add_patch(load)
ax.text(7.25, 2.5, 'Load\n(End-effector)\nm₂', ha='center', va='center', fontsize=12, fontweight='bold', color='#9d174d')
ax.text(7.25, 1.0, 'x₂ (response)\nF = k(x₁-x₂)+c(v₁-v₂)', ha='center', va='center', fontsize=9, color='#6b7280', style='italic')

# Equations box
eq_box = patches.FancyBboxPatch((9.2, 1.2), 2.5, 2.6, boxstyle="round,pad=0.15",
                                  facecolor='#f0fdf4', edgecolor='#16a34a', linewidth=1.5)
ax.add_patch(eq_box)
ax.text(10.45, 3.3, 'Parameters', ha='center', fontsize=11, fontweight='bold', color='#166534')
ax.text(10.45, 2.7, 'k = (2πfn)²·m₂', ha='center', fontsize=10, color='#333')
ax.text(10.45, 2.2, 'c = 2ζ·(2πfn)·m₂', ha='center', fontsize=10, color='#333')
ax.text(10.45, 1.7, 'fn = 10~40 Hz', ha='center', fontsize=10, color='#333')

ax.set_title('2-Mass Perfect Servo Model', fontsize=16, fontweight='bold', pad=20)
plt.tight_layout()
plt.savefig(OUT/'slide_2mass_diagram.png', bbox_inches='tight')
plt.close()
print("  Saved: slide_2mass_diagram.png")

# ═══════════════════════════════════════
# CHART D: ZVD Destructive Interference
# ═══════════════════════════════════════
print("Generating: ZVD Destructive Interference Concept...")

fig, axes = plt.subplots(4, 1, figsize=(10, 10), sharex=True)

fn = 10; zeta = 0.05
wd = 2*np.pi*fn*np.sqrt(1-zeta**2)
K = np.exp(-zeta*np.pi/np.sqrt(1-zeta**2))
hp = np.pi/wd
d = 1+2*K+K**2
a1, a2, a3 = 1/d, 2*K/d, K**2/d

t = np.linspace(0, 0.5, 2000)

# Individual vibrations from each impulse
def vib(t, amp, delay, fn, zeta):
    v = np.zeros_like(t)
    mask = t >= delay
    td = t[mask] - delay
    wd = 2*np.pi*fn*np.sqrt(1-zeta**2)
    v[mask] = amp * np.exp(-zeta*2*np.pi*fn*td) * np.sin(wd*td)
    return v

v1 = vib(t, a1, 0, fn, zeta)
v2 = vib(t, a2, hp, fn, zeta)
v3 = vib(t, a3, 2*hp, fn, zeta)
v_total = v1 + v2 + v3

axes[0].plot(t*1000, v1, color='#dc2626', linewidth=2)
axes[0].set_ylabel('Impulse 1'); axes[0].set_title(f'A₁ = {a1:.3f} @ t = 0ms', fontweight='bold', fontsize=11)
axes[0].fill_between(t*1000, v1, alpha=0.1, color='#dc2626')

axes[1].plot(t*1000, v2, color='#ea580c', linewidth=2)
axes[1].set_ylabel('Impulse 2'); axes[1].set_title(f'A₂ = {a2:.3f} @ t = {hp*1000:.0f}ms', fontweight='bold', fontsize=11)
axes[1].fill_between(t*1000, v2, alpha=0.1, color='#ea580c')

axes[2].plot(t*1000, v3, color='#2563eb', linewidth=2)
axes[2].set_ylabel('Impulse 3'); axes[2].set_title(f'A₃ = {a3:.3f} @ t = {2*hp*1000:.0f}ms', fontweight='bold', fontsize=11)
axes[2].fill_between(t*1000, v3, alpha=0.1, color='#2563eb')

axes[3].plot(t*1000, v_total, color='#16a34a', linewidth=2.5)
axes[3].set_ylabel('Sum'); axes[3].set_title('Sum = Destructive Interference → Near Zero!', fontweight='bold', fontsize=11, color='#16a34a')
axes[3].fill_between(t*1000, v_total, alpha=0.1, color='#16a34a')
axes[3].set_xlabel('Time (ms)')

plt.suptitle('ZVD: 3 Impulses Cancel Each Other (Destructive Interference)', fontsize=14, fontweight='bold')
plt.tight_layout()
plt.savefig(OUT/'slide_zvd_interference.png', bbox_inches='tight')
plt.close()
print("  Saved: slide_zvd_interference.png")

# ═══════════════════════════════════════
# CHART E: Problem Statement - Vibration waste
# ═══════════════════════════════════════
print("Generating: Problem visualization...")

fig, ax = plt.subplots(figsize=(12, 5))

# Show a typical unshaped response
pos_t, mt = gen_trapezoidal(1000, 20000, 50, dt)
pad = np.full(3000, 50)
padded = np.concatenate([pos_t, pad])
resp = simulate_2mass(padded, dt, 10, 0.05, payload=False)
t = np.arange(len(resp)) * dt * 1000

ax.plot(t[:3500], resp[:3500], color='#1e40af', linewidth=2, label='Load Position')
ax.plot(t[:3500], padded[:3500], color='#9ca3af', linewidth=1.5, linestyle='--', label='Command', alpha=0.7)
ax.axhline(y=50, color='#16a34a', linewidth=1, linestyle=':', alpha=0.5)
ax.axhline(y=50.005, color='#16a34a', linewidth=0.5, alpha=0.3)
ax.axhline(y=49.995, color='#16a34a', linewidth=0.5, alpha=0.3)

# Annotate motion time vs settling time
motion_end = mt * 1000
settle_end = 2661  # ms

ax.axvspan(0, motion_end, alpha=0.08, color='#2563eb', label=f'Motion ({motion_end:.0f}ms)')
ax.axvspan(motion_end, settle_end, alpha=0.08, color='#dc2626', label=f'Vibration Wait ({settle_end-motion_end:.0f}ms)')

ax.annotate(f'Motion\n{motion_end:.0f}ms\n(4%)', xy=(motion_end/2, 55), fontsize=12, 
            ha='center', fontweight='bold', color='#2563eb')
ax.annotate(f'Vibration Wait\n{settle_end-motion_end:.0f}ms\n(96%)', 
            xy=((motion_end+settle_end)/2, 55), fontsize=12,
            ha='center', fontweight='bold', color='#dc2626')

ax.set_xlabel('Time (ms)')
ax.set_ylabel('Position (mm)')
ax.set_title('The Problem: 96% of Cycle Time is Wasted Waiting for Vibration to Settle', 
             fontsize=13, fontweight='bold', color='#dc2626')
ax.legend(loc='center right', fontsize=9)
ax.set_xlim(0, 3500)
plt.tight_layout()
plt.savefig(OUT/'slide_problem.png', bbox_inches='tight')
plt.close()
print("  Saved: slide_problem.png")

print("\n=== ALL PRESENTATION CHARTS GENERATED ===")
for f in sorted(OUT.glob('slide_*.png')):
    print(f"  {f.name} ({f.stat().st_size//1024}KB)")
