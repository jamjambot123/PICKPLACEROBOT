"""자동제어 관점 슬라이드용 다이어그램 생성"""
import sys; sys.stdout.reconfigure(encoding='utf-8')
import numpy as np
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches

plt.rcParams.update({
    'font.size': 11, 'figure.facecolor': 'white', 'figure.dpi': 200,
    'font.family': 'sans-serif',
})
OUT = Path(r'd:\dongwon\PICKPLACEROBOT\experiments')

# ═══════════════════════════════════════
# CHART F: Control System Block Diagram
# ═══════════════════════════════════════
print("Generating: Control System Block Diagram...")

fig, ax = plt.subplots(figsize=(14, 6))
ax.set_xlim(0, 14); ax.set_ylim(0, 6)
ax.axis('off')

def draw_block(ax, x, y, w, h, label, sublabel, facecolor, edgecolor, fontsize=11):
    box = patches.FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.1",
                                  facecolor=facecolor, edgecolor=edgecolor, linewidth=2)
    ax.add_patch(box)
    ax.text(x+w/2, y+h/2+0.15, label, ha='center', va='center', fontsize=fontsize, fontweight='bold', color=edgecolor)
    if sublabel:
        ax.text(x+w/2, y+h/2-0.25, sublabel, ha='center', va='center', fontsize=8, color='#6b7280', style='italic')

def draw_arrow(ax, x1, y1, x2, y2, label=''):
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle='->', lw=2, color='#374151'))
    if label:
        ax.text((x1+x2)/2, (y1+y2)/2+0.2, label, ha='center', fontsize=8, color='#6b7280')

# Blocks
draw_block(ax, 0.3, 2.5, 2.0, 1.2, 'Path\nPlanning', 'Pick/Place coord', '#eff6ff', '#2563eb')
draw_block(ax, 3.0, 2.5, 2.2, 1.2, 'Motion\nProfile', 'Trap/S/AS-Curve', '#fef3c7', '#d97706')
draw_block(ax, 5.9, 2.5, 2.0, 1.2, 'Input\nShaper', 'ZV/ZVD/EI', '#dcfce7', '#16a34a')
draw_block(ax, 8.6, 2.5, 2.0, 1.2, 'Servo\nDrive', 'Perfect Servo', '#f3f4f6', '#6b7280')
draw_block(ax, 11.3, 2.5, 2.2, 1.2, 'Plant\n(Gantry)', '2-Mass Model', '#fce7f3', '#db2777')

# Arrows between blocks
draw_arrow(ax, 2.3, 3.1, 3.0, 3.1, 'd=50mm')
draw_arrow(ax, 5.2, 3.1, 5.9, 3.1, 'x_cmd(t)')
draw_arrow(ax, 7.9, 3.1, 8.6, 3.1, 'x_shaped(t)')
draw_arrow(ax, 10.6, 3.1, 11.3, 3.1, 'x₁(t)')

# Output arrow
ax.annotate('', xy=(13.8, 3.1), xytext=(13.5, 3.1),
            arrowprops=dict(arrowstyle='->', lw=2, color='#374151'))
ax.text(13.9, 3.1, 'x₂(t)\nEnd-effector\nPosition', fontsize=9, va='center', fontweight='bold', color='#db2777')

# Research scope bracket
bracket_y = 1.5
ax.plot([3.0, 3.0], [bracket_y, bracket_y+0.4], color='#dc2626', linewidth=3)
ax.plot([3.0, 7.9], [bracket_y, bracket_y], color='#dc2626', linewidth=3)
ax.plot([7.9, 7.9], [bracket_y, bracket_y+0.4], color='#dc2626', linewidth=3)
ax.text(5.45, bracket_y-0.35, 'Scope of This Research', ha='center', fontsize=13, 
        fontweight='bold', color='#dc2626')

# Feedforward label
ax.annotate('FEEDFORWARD\n(Open-Loop)', xy=(5.45, 4.2), fontsize=11, ha='center',
            fontweight='bold', color='#16a34a',
            bbox=dict(boxstyle='round,pad=0.3', facecolor='#f0fdf4', edgecolor='#16a34a', linewidth=1.5))

# No feedback arrow annotation
ax.text(11.0, 1.5, 'No Sensor\nRequired', ha='center', fontsize=10, 
        color='#6b7280', style='italic')

ax.set_title('Motion Control System Architecture', fontsize=16, fontweight='bold', pad=15)
plt.tight_layout()
plt.savefig(OUT/'slide_control_block.png', bbox_inches='tight')
plt.close()
print("  Saved: slide_control_block.png")

# ═══════════════════════════════════════
# CHART G: Feedforward vs Feedback Comparison
# ═══════════════════════════════════════
print("Generating: Feedforward vs Feedback Comparison...")

fig, axes = plt.subplots(1, 2, figsize=(14, 6))

# Left: Feedback (PID)
ax = axes[0]
ax.set_xlim(0, 10); ax.set_ylim(0, 8); ax.axis('off')
ax.set_title('Feedback Control (PID)', fontsize=14, fontweight='bold', color='#dc2626')

# Blocks
fb_blocks = [
    (0.5, 4, 1.5, 1.0, 'cmd', 'Command', '#f3f4f6', '#6b7280'),
    (3.0, 4, 1.8, 1.0, 'PID', 'Controller', '#fef2f2', '#dc2626'),
    (6.0, 4, 1.8, 1.0, 'Plant', '(Gantry)', '#fce7f3', '#db2777'),
]
for x, y, w, h, label, sub, fc, ec in fb_blocks:
    box = patches.FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.08",
                                  facecolor=fc, edgecolor=ec, linewidth=2)
    ax.add_patch(box)
    ax.text(x+w/2, y+h/2+0.12, label, ha='center', va='center', fontsize=12, fontweight='bold', color=ec)
    ax.text(x+w/2, y+h/2-0.2, sub, ha='center', fontsize=8, color='#6b7280')

# Arrows
ax.annotate('', xy=(3.0, 4.5), xytext=(2.0, 4.5), arrowprops=dict(arrowstyle='->', lw=2, color='#374151'))
ax.annotate('', xy=(6.0, 4.5), xytext=(4.8, 4.5), arrowprops=dict(arrowstyle='->', lw=2, color='#374151'))
ax.annotate('', xy=(9.0, 4.5), xytext=(7.8, 4.5), arrowprops=dict(arrowstyle='->', lw=2, color='#374151'))
ax.text(9.1, 4.5, 'x₂(t)', fontsize=11, fontweight='bold', color='#db2777', va='center')

# Feedback loop
ax.plot([8.5, 8.5], [4.5, 2.5], color='#dc2626', linewidth=2)
ax.plot([8.5, 2.5], [2.5, 2.5], color='#dc2626', linewidth=2)
ax.annotate('', xy=(2.5, 4.0), xytext=(2.5, 2.5), arrowprops=dict(arrowstyle='->', lw=2, color='#dc2626'))

# Sensor
sensor = patches.FancyBboxPatch((5.5, 2.0, ), 2.0, 0.8, boxstyle="round,pad=0.08",
                                 facecolor='#fef2f2', edgecolor='#dc2626', linewidth=1.5)
ax.add_patch(sensor)
ax.text(6.5, 2.4, 'Sensor', ha='center', fontsize=10, fontweight='bold', color='#dc2626')
ax.text(6.5, 2.1, '(IMU/Encoder)', ha='center', fontsize=7, color='#6b7280')

# Sum circle
circle = plt.Circle((2.5, 4.5), 0.3, fill=False, edgecolor='#374151', linewidth=2)
ax.add_patch(circle)
ax.text(2.5, 4.5, '+\n-', ha='center', va='center', fontsize=8, fontweight='bold')

# Characteristics
chars = [
    (0.5, 1.3, 'Reactive', 'Suppresses after vibration occurs'),
    (0.5, 0.7, 'Phase Lag', 'Cannot suppress high-freq vibration'),
    (0.5, 0.1, 'Stability Risk', 'High gain may cause instability'),
]
for x, y, title, desc in chars:
    ax.text(x, y, f'  {title}:', fontsize=9, fontweight='bold', color='#dc2626')
    ax.text(x+3.5, y, desc, fontsize=8, color='#6b7280')

# Right: Feedforward (Input Shaping)
ax = axes[1]
ax.set_xlim(0, 10); ax.set_ylim(0, 8); ax.axis('off')
ax.set_title('Feedforward Control (Input Shaping)', fontsize=14, fontweight='bold', color='#16a34a')

ff_blocks = [
    (0.3, 4, 1.5, 1.0, 'cmd', 'Command', '#f3f4f6', '#6b7280'),
    (2.5, 4, 1.8, 1.0, 'Shaper', 'ZVD Filter', '#dcfce7', '#16a34a'),
    (5.0, 4, 1.8, 1.0, 'Servo', 'Drive', '#f3f4f6', '#6b7280'),
    (7.5, 4, 1.8, 1.0, 'Plant', '(Gantry)', '#fce7f3', '#db2777'),
]
for x, y, w, h, label, sub, fc, ec in ff_blocks:
    box = patches.FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.08",
                                  facecolor=fc, edgecolor=ec, linewidth=2)
    ax.add_patch(box)
    ax.text(x+w/2, y+h/2+0.12, label, ha='center', va='center', fontsize=12, fontweight='bold', color=ec)
    ax.text(x+w/2, y+h/2-0.2, sub, ha='center', fontsize=8, color='#6b7280')

# Arrows
ax.annotate('', xy=(2.5, 4.5), xytext=(1.8, 4.5), arrowprops=dict(arrowstyle='->', lw=2, color='#374151'))
ax.annotate('', xy=(5.0, 4.5), xytext=(4.3, 4.5), arrowprops=dict(arrowstyle='->', lw=2, color='#374151'))
ax.annotate('', xy=(7.5, 4.5), xytext=(6.8, 4.5), arrowprops=dict(arrowstyle='->', lw=2, color='#374151'))
ax.annotate('', xy=(9.8, 4.5), xytext=(9.3, 4.5), arrowprops=dict(arrowstyle='->', lw=2, color='#374151'))
ax.text(9.9, 4.5, 'x₂(t)', fontsize=11, fontweight='bold', color='#db2777', va='center')

# No feedback
ax.text(5.0, 2.5, 'No Feedback Loop\nNo Sensor Needed', ha='center', fontsize=12,
        fontweight='bold', color='#16a34a', style='italic',
        bbox=dict(boxstyle='round,pad=0.3', facecolor='#f0fdf4', edgecolor='#16a34a', linewidth=1.5, alpha=0.8))

# Characteristics
chars = [
    (0.5, 1.3, 'Proactive', 'Prevents vibration from occurring'),
    (0.5, 0.7, 'No Phase Lag', 'Exact cancellation at any frequency'),
    (0.5, 0.1, 'Always Stable', 'Can add on top of existing servo'),
]
for x, y, title, desc in chars:
    ax.text(x, y, f'  {title}:', fontsize=9, fontweight='bold', color='#16a34a')
    ax.text(x+3.5, y, desc, fontsize=8, color='#6b7280')

plt.suptitle('Why Input Shaping Instead of PID?', fontsize=16, fontweight='bold', y=1.02)
plt.tight_layout()
plt.savefig(OUT/'slide_ff_vs_fb.png', bbox_inches='tight')
plt.close()
print("  Saved: slide_ff_vs_fb.png")

# ═══════════════════════════════════════
# CHART H: Notch Filter Frequency Response
# ═══════════════════════════════════════
print("Generating: ZVD Frequency Response (Notch Filter)...")

fig, ax = plt.subplots(figsize=(10, 5))

fn = 10; zeta = 0.05
wd = 2*np.pi*fn*np.sqrt(1-zeta**2)
K = np.exp(-zeta*np.pi/np.sqrt(1-zeta**2))
hp = np.pi/wd
d = 1+2*K+K**2
a1, a2, a3 = 1/d, 2*K/d, K**2/d

freqs = np.linspace(0.1, 30, 1000)
mag_zvd = np.zeros(len(freqs))

for i, f in enumerate(freqs):
    w = 2*np.pi*f
    # H(jw) = A1 + A2*exp(-jwT) + A3*exp(-j2wT)
    H = a1 + a2*np.exp(-1j*w*hp) + a3*np.exp(-1j*w*2*hp)
    mag_zvd[i] = np.abs(H)

ax.plot(freqs, mag_zvd, color='#2563eb', linewidth=2.5, label='ZVD Shaper |H(jω)|')
ax.axvline(x=fn, color='#dc2626', linewidth=2, linestyle='--', alpha=0.7, label=f'fn = {fn} Hz')
ax.fill_between(freqs, 0, mag_zvd, alpha=0.05, color='#2563eb')

# Annotate notch
ax.annotate('Notch at fn\n|H(jωn)| ≈ 0\n→ Vibration blocked!', 
            xy=(fn, 0.01), xytext=(fn+5, 0.3),
            fontsize=11, fontweight='bold', color='#dc2626',
            arrowprops=dict(arrowstyle='->', color='#dc2626', lw=2),
            bbox=dict(boxstyle='round,pad=0.3', facecolor='#fef2f2', edgecolor='#dc2626'))

ax.set_xlabel('Frequency (Hz)', fontsize=12)
ax.set_ylabel('Magnitude |H(jω)|', fontsize=12)
ax.set_title('ZVD Shaper = Notch Filter at System Natural Frequency', fontsize=14, fontweight='bold')
ax.legend(fontsize=11)
ax.set_xlim(0, 30)
ax.set_ylim(0, 1.2)
plt.tight_layout()
plt.savefig(OUT/'slide_notch_filter.png', bbox_inches='tight')
plt.close()
print("  Saved: slide_notch_filter.png")

print("\n=== ALL CONTROL THEORY CHARTS GENERATED ===")
for f in sorted(OUT.glob('slide_*.png')):
    print(f"  {f.name} ({f.stat().st_size//1024}KB)")
