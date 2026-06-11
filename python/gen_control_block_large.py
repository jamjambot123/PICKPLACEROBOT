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

# 한국어 폰트 설정
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
    print(f"Using font: {font_prop.get_name()}")

plt.rcParams.update({
    'font.size': 14, 'figure.facecolor': 'white', 'axes.facecolor': '#fafafa',
    'axes.grid': False, 'figure.dpi': 300,
    'axes.unicode_minus': False,
})
OUT = Path(r'd:\dongwon\PICKPLACEROBOT\experiments')

print("Generating: slide_control_block_kr.png (Large Version)...")

fig, ax = plt.subplots(figsize=(9, 8))
ax.set_xlim(0, 9); ax.set_ylim(0, 8)
ax.axis('off')

def draw_block(ax, x, y, w, h, label, sublabel, facecolor, edgecolor, fontsize=16):
    box = patches.FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.1",
                                  facecolor=facecolor, edgecolor=edgecolor, linewidth=2.5)
    ax.add_patch(box)
    ax.text(x+w/2, y+h/2+0.25, label, ha='center', va='center', fontsize=fontsize, fontweight='bold', color=edgecolor)
    if sublabel:
        ax.text(x+w/2, y+h/2-0.35, sublabel, ha='center', va='center', fontsize=12, color='#6b7280', style='italic')

# Row 1 (Top, y=5.0)
draw_block(ax, 0.4, 5.0, 2.2, 1.6, '경로\n계획', 'Pick/Place 좌표', '#eff6ff', '#2563eb')
draw_block(ax, 3.4, 5.0, 2.2, 1.6, '모션\n프로파일', 'Trap/S/AS-Curve', '#fef3c7', '#d97706')
draw_block(ax, 6.4, 5.0, 2.2, 1.6, '인풋\n쉐이퍼', 'ZV/ZVD/EI', '#dcfce7', '#16a34a')

# Row 2 (Bottom, y=2.0)
draw_block(ax, 6.4, 2.0, 2.2, 1.6, '서보\n드라이브', 'Perfect Servo', '#f3f4f6', '#6b7280')
draw_block(ax, 3.4, 2.0, 2.2, 1.6, '기구부\n(갠트리)', '2-Mass 모델', '#fce7f3', '#db2777')

# Arrows Row 1
ax.annotate('', xy=(3.4, 5.8), xytext=(2.6, 5.8), arrowprops=dict(arrowstyle='->', lw=3, color='#374151'))
ax.annotate('', xy=(6.4, 5.8), xytext=(5.6, 5.8), arrowprops=dict(arrowstyle='->', lw=3, color='#374151'))

# Arrow Down
ax.annotate('', xy=(7.5, 3.6), xytext=(7.5, 5.0), arrowprops=dict(arrowstyle='->', lw=3, color='#374151'))

# Arrows Row 2
ax.annotate('', xy=(5.6, 2.8), xytext=(6.4, 2.8), arrowprops=dict(arrowstyle='->', lw=3, color='#374151'))
ax.annotate('', xy=(2.6, 2.8), xytext=(3.4, 2.8), arrowprops=dict(arrowstyle='->', lw=3, color='#374151'))

# Final Output text
ax.text(1.3, 2.8, '엔드이펙터\n최종 위치\n(잔류 진동)', fontsize=14, va='center', ha='center', fontweight='bold', color='#db2777')

# Scope bracket for Row 1
bracket_y = 4.3
ax.plot([3.4, 3.4], [bracket_y, bracket_y+0.3], color='#dc2626', linewidth=4)
ax.plot([3.4, 8.6], [bracket_y, bracket_y], color='#dc2626', linewidth=4)
ax.plot([8.6, 8.6], [bracket_y, bracket_y+0.3], color='#dc2626', linewidth=4)
ax.text(6.0, bracket_y-0.4, '본 연구의 집중 범위', ha='center', fontsize=16, fontweight='bold', color='#dc2626')

ax.annotate('피드포워드\n(센서 불필요)', xy=(6.0, 7.3), fontsize=15, ha='center',
            fontweight='bold', color='#16a34a',
            bbox=dict(boxstyle='round,pad=0.5', facecolor='#f0fdf4', edgecolor='#16a34a', linewidth=2))

ax.set_title('제어 시스템 구조 및 신호 흐름', fontsize=22, fontweight='bold', pad=10)
plt.tight_layout()
plt.savefig(OUT/'slide_control_block_kr.png', bbox_inches='tight')
plt.close()
print("Saved: slide_control_block_kr.png (Large version)")
