import sys
try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass
import numpy as np
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib import font_manager

# Korean font setup
font_paths = [
    'C:/Windows/Fonts/malgun.ttf',
    'C:/Windows/Fonts/NanumGothic.ttf',
]
font_path = None
for fp in font_paths:
    if Path(fp).exists():
        font_path = fp
        break

if font_path:
    font_prop = font_manager.FontProperties(fname=font_path)
    plt.rcParams['font.family'] = font_prop.get_name()
else:
    print("WARNING: No Korean font found!")

plt.rcParams.update({
    'font.size': 11, 'axes.titlesize': 13, 'axes.labelsize': 11,
    'figure.facecolor': 'white', 'axes.facecolor': '#fafafa',
    'axes.grid': True, 'grid.alpha': 0.3, 'figure.dpi': 200,
    'axes.unicode_minus': False,
})
OUT = Path(r'd:\dongwon\PICKPLACEROBOT\experiments')

fig, ax = plt.subplots(figsize=(12, 5))
ax.set_xlim(0, 12); ax.set_ylim(0, 5)
ax.set_aspect('equal')
ax.axis('off')

# Motor block
motor = patches.FancyBboxPatch((1, 1.5), 2.5, 2, boxstyle="round,pad=0.15", 
                                 facecolor='#dbeafe', edgecolor='#2563eb', linewidth=2)
ax.add_patch(motor)
ax.text(2.25, 2.5, '모터\n(갠트리)\nm₁', ha='center', va='center', fontsize=12, fontweight='bold', color='#1e40af')
ax.text(2.25, 1.0, 'x₁ = 명령(t)\nPerfect Servo', ha='center', va='center', fontsize=9, color='#6b7280', style='italic')

# Spring-Damper
ax.annotate('', xy=(5.8, 3.0), xytext=(3.5, 3.0), arrowprops=dict(arrowstyle='-', lw=2, color='#059669'))
ax.text(4.65, 3.4, 'k (스프링)', ha='center', fontsize=10, color='#059669', fontweight='bold')
ax.annotate('', xy=(5.8, 2.0), xytext=(3.5, 2.0), arrowprops=dict(arrowstyle='-', lw=2, color='#d97706'))
ax.text(4.65, 1.6, 'c (댐퍼)', ha='center', fontsize=10, color='#d97706', fontweight='bold')

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
ax.text(7.25, 2.5, '엔드이펙터\n(화물부)\nm₂', ha='center', va='center', fontsize=12, fontweight='bold', color='#9d174d')
ax.text(7.25, 1.0, 'x₂ (응답)\nF = k(x₁-x₂)+c(v₁-v₂)', ha='center', va='center', fontsize=9, color='#6b7280', style='italic')

# Equations box
eq_box = patches.FancyBboxPatch((9.2, 1.2), 2.5, 2.6, boxstyle="round,pad=0.15",
                                  facecolor='#f0fdf4', edgecolor='#16a34a', linewidth=1.5)
ax.add_patch(eq_box)
ax.text(10.45, 3.3, '물리 파라미터', ha='center', fontsize=11, fontweight='bold', color='#166534')
ax.text(10.45, 2.7, 'k = (2πfn)²·m₂', ha='center', fontsize=10, color='#333')
ax.text(10.45, 2.2, 'c = 2ζ·(2πfn)·m₂', ha='center', fontsize=10, color='#333')
ax.text(10.45, 1.7, 'fn = 10~40 Hz', ha='center', fontsize=10, color='#333')

ax.set_title('2-Mass 물리 모델 (수학적 갠트리 추종 모델)', fontsize=16, fontweight='bold', pad=20)
plt.tight_layout()
plt.savefig(OUT/'slide_2mass_diagram_kr.png', bbox_inches='tight')
plt.close()
print("Saved: slide_2mass_diagram_kr.png")
