"""ZVD 파괴적 간섭 차트 — 한국어 버전"""
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
else:
    print("WARNING: No Korean font found!")

plt.rcParams.update({
    'font.size': 12, 'figure.facecolor': 'white', 'axes.facecolor': '#fafafa',
    'axes.grid': True, 'grid.alpha': 0.3, 'figure.dpi': 200,
    'axes.unicode_minus': False,
})
OUT = Path(r'd:\dongwon\PICKPLACEROBOT\experiments')

fn = 10; zeta = 0.05
wd = 2*np.pi*fn*np.sqrt(1-zeta**2)
K = np.exp(-zeta*np.pi/np.sqrt(1-zeta**2))
hp = np.pi/wd
d = 1+2*K+K**2
a1, a2, a3 = 1/d, 2*K/d, K**2/d

t = np.linspace(0, 0.5, 2000)

def vib(t, amp, delay, fn, zeta):
    v = np.zeros_like(t)
    mask = t >= delay
    td = t[mask] - delay
    wd_local = 2*np.pi*fn*np.sqrt(1-zeta**2)
    v[mask] = amp * np.exp(-zeta*2*np.pi*fn*td) * np.sin(wd_local*td)
    return v

v1 = vib(t, a1, 0, fn, zeta)
v2 = vib(t, a2, hp, fn, zeta)
v3 = vib(t, a3, 2*hp, fn, zeta)
v_total = v1 + v2 + v3

fig, axes = plt.subplots(4, 1, figsize=(10, 10), sharex=True)

# Panel 1
axes[0].plot(t*1000, v1, color='#dc2626', linewidth=2)
axes[0].fill_between(t*1000, v1, alpha=0.1, color='#dc2626')
axes[0].set_ylabel('진폭')
axes[0].set_title(f'임펄스 1:  A₁ = {a1:.3f},  t = 0ms', fontweight='bold', fontsize=12)

# Panel 2
axes[1].plot(t*1000, v2, color='#ea580c', linewidth=2)
axes[1].fill_between(t*1000, v2, alpha=0.1, color='#ea580c')
axes[1].set_ylabel('진폭')
axes[1].set_title(f'임펄스 2:  A₂ = {a2:.3f},  t = {hp*1000:.0f}ms', fontweight='bold', fontsize=12)

# Panel 3
axes[2].plot(t*1000, v3, color='#2563eb', linewidth=2)
axes[2].fill_between(t*1000, v3, alpha=0.1, color='#2563eb')
axes[2].set_ylabel('진폭')
axes[2].set_title(f'임펄스 3:  A₃ = {a3:.3f},  t = {2*hp*1000:.0f}ms', fontweight='bold', fontsize=12)

# Panel 4 - Sum
axes[3].plot(t*1000, v_total, color='#16a34a', linewidth=2.5)
axes[3].fill_between(t*1000, v_total, alpha=0.1, color='#16a34a')
axes[3].set_ylabel('진폭')
axes[3].set_xlabel('시간 (ms)')
axes[3].set_title('합산 = 파괴적 간섭 → 진동 ≈ 0', fontweight='bold', fontsize=12, color='#16a34a')

plt.suptitle('ZVD: 3개 임펄스의 진동이 서로 상쇄됨', fontsize=15, fontweight='bold')
plt.tight_layout()
plt.savefig(OUT/'slide_zvd_interference_kr.png', bbox_inches='tight')
plt.close()
print("Saved: slide_zvd_interference_kr.png")

# ═══ 다른 차트들도 한국어로 ═══

# slide_problem.png 한국어 버전
print("Generating: slide_problem_kr.png...")
sys.path.insert(0, r'd:\dongwon\PICKPLACEROBOT\python')
from run_all_experiments import *

fig, ax = plt.subplots(figsize=(12, 5))
dt = 0.001
pos_t, mt = gen_trapezoidal(1000, 20000, 50, dt)
pad = np.full(3000, 50)
padded = np.concatenate([pos_t, pad])
resp = simulate_2mass(padded, dt, 10, 0.05, payload=False)
t_arr = np.arange(len(resp)) * dt * 1000

ax.plot(t_arr[:3500], resp[:3500], color='#1e40af', linewidth=2, label='로드 위치')
ax.plot(t_arr[:3500], padded[:3500], color='#9ca3af', linewidth=1.5, linestyle='--', label='명령', alpha=0.7)

motion_end = mt * 1000
settle_end = 2661

ax.axvspan(0, motion_end, alpha=0.08, color='#2563eb')
ax.axvspan(motion_end, settle_end, alpha=0.08, color='#dc2626')

ax.annotate(f'이동\n{motion_end:.0f}ms\n(4%)', xy=(motion_end/2, 55), fontsize=13,
            ha='center', fontweight='bold', color='#2563eb')
ax.annotate(f'진동 대기\n{settle_end-motion_end:.0f}ms\n(96%)',
            xy=((motion_end+settle_end)/2, 55), fontsize=13,
            ha='center', fontweight='bold', color='#dc2626')

ax.set_xlabel('시간 (ms)')
ax.set_ylabel('위치 (mm)')
ax.set_title('문제: 사이클의 96%가 진동 정착 대기로 낭비됨', fontsize=14, fontweight='bold', color='#dc2626')
ax.legend(loc='center right', fontsize=10)
ax.set_xlim(0, 3500)
plt.tight_layout()
plt.savefig(OUT/'slide_problem_kr.png', bbox_inches='tight')
plt.close()
print("Saved: slide_problem_kr.png")

# slide_control_block.png 한국어 버전
print("Generating: slide_control_block_kr.png...")
import matplotlib.patches as patches

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

draw_block(ax, 0.3, 2.5, 2.0, 1.2, '경로\n계획', 'Pick/Place 좌표', '#eff6ff', '#2563eb')
draw_block(ax, 3.0, 2.5, 2.2, 1.2, '모션\n프로파일', 'Trap/S/AS-Curve', '#fef3c7', '#d97706')
draw_block(ax, 5.9, 2.5, 2.0, 1.2, '인풋\n쉐이퍼', 'ZV/ZVD/EI', '#dcfce7', '#16a34a')
draw_block(ax, 8.6, 2.5, 2.0, 1.2, '서보\n드라이브', 'Perfect Servo', '#f3f4f6', '#6b7280')
draw_block(ax, 11.3, 2.5, 2.2, 1.2, '기구부\n(갠트리)', '2-Mass 모델', '#fce7f3', '#db2777')

for x1, x2 in [(2.3,3.0),(5.2,5.9),(7.9,8.6),(10.6,11.3)]:
    ax.annotate('', xy=(x2, 3.1), xytext=(x1, 3.1), arrowprops=dict(arrowstyle='->', lw=2, color='#374151'))

ax.annotate('', xy=(13.8, 3.1), xytext=(13.5, 3.1), arrowprops=dict(arrowstyle='->', lw=2, color='#374151'))
ax.text(13.9, 3.1, '엔드이펙터\n위치 (x₂)', fontsize=9, va='center', fontweight='bold', color='#db2777')

bracket_y = 1.5
ax.plot([3.0, 3.0], [bracket_y, bracket_y+0.4], color='#dc2626', linewidth=3)
ax.plot([3.0, 7.9], [bracket_y, bracket_y], color='#dc2626', linewidth=3)
ax.plot([7.9, 7.9], [bracket_y, bracket_y+0.4], color='#dc2626', linewidth=3)
ax.text(5.45, bracket_y-0.35, '본 연구의 범위', ha='center', fontsize=14, fontweight='bold', color='#dc2626')

ax.annotate('피드포워드\n(센서 불필요)', xy=(5.45, 4.2), fontsize=11, ha='center',
            fontweight='bold', color='#16a34a',
            bbox=dict(boxstyle='round,pad=0.3', facecolor='#f0fdf4', edgecolor='#16a34a', linewidth=1.5))

ax.set_title('시스템 구조', fontsize=16, fontweight='bold', pad=15)
plt.tight_layout()
plt.savefig(OUT/'slide_control_block_kr.png', bbox_inches='tight')
plt.close()
print("Saved: slide_control_block_kr.png")

print("\n=== 한국어 차트 생성 완료 ===")
for f in sorted(OUT.glob('*_kr.png')):
    print(f"  {f.name} ({f.stat().st_size//1024}KB)")
