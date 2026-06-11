import sys
try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from pathlib import Path
from matplotlib import font_manager
sys.path.insert(0, r'd:\dongwon\PICKPLACEROBOT\python')
from run_all_experiments import run_experiment, compute_shaper

# 한국어 폰트 설정
font_paths = ['C:/Windows/Fonts/malgun.ttf', 'C:/Windows/Fonts/NanumGothic.ttf']
font_path = next((fp for fp in font_paths if Path(fp).exists()), None)
if font_path:
    font_prop = font_manager.FontProperties(fname=font_path)
    plt.rcParams['font.family'] = font_prop.get_name()

plt.rcParams.update({
    'font.size': 12, 'axes.titlesize': 14, 'axes.labelsize': 12,
    'figure.facecolor': 'white', 'axes.facecolor': '#fafafa',
    'axes.grid': True, 'grid.alpha': 0.3, 'figure.dpi': 200,
    'axes.unicode_minus': False,
})
OUT = Path(r'd:\dongwon\PICKPLACEROBOT\experiments')

# 1. exp1_3profile_kr.png
exp1_data = [
    {'desc':'사다리꼴\n(Trapezoidal)', 'vib':36.395, 'settle':3.101, 'uph':624},
    {'desc':'AS-Curve', 'vib':34.835, 'settle':3.101, 'uph':630},
    {'desc':'AS-Curve\n+ ZVD', 'vib':31.344, 'settle':3.202, 'uph':1060}
]
fig, axes = plt.subplots(1, 3, figsize=(14, 5))
labels = [e['desc'] for e in exp1_data]
colors = ['#dc2626', '#ea580c', '#2563eb']

axes[0].bar(labels, [e['vib'] for e in exp1_data], color=colors, alpha=0.85)
axes[0].set_ylabel('잔류 진동 (mm)')
axes[0].set_title('최대 잔류 진동', fontweight='bold')
for i, v in enumerate([e['vib'] for e in exp1_data]):
    axes[0].text(i, v*1.02+0.01, f'{v:.2f}mm', ha='center', fontweight='bold')

axes[1].bar(labels, [e['settle'] for e in exp1_data], color=colors, alpha=0.85)
axes[1].set_ylabel('시간 (초)')
axes[1].set_title('완전 정착 시간 (±5μm 이내)', fontweight='bold')
for i, v in enumerate([e['settle'] for e in exp1_data]):
    axes[1].text(i, v*1.02+0.01, f'{v:.2f}s', ha='center', fontweight='bold')

axes[2].bar(labels, [e['uph'] for e in exp1_data], color=colors, alpha=0.85)
axes[2].set_ylabel('UPH (단위: 개)')
axes[2].set_title('시간당 생산량 (UPH)', fontweight='bold')
for i, v in enumerate([e['uph'] for e in exp1_data]):
    axes[2].text(i, v+30, f'{v:,}', ha='center', fontweight='bold', color='#2563eb' if i==2 else 'black')

plt.suptitle('핵심 성능 비교 (V=1000, fn=10Hz, d=50mm)', fontsize=16, fontweight='bold')
plt.tight_layout()
plt.savefig(OUT/'exp1_3profile_kr.png', bbox_inches='tight')
plt.close()

# 2. exp3_speed_kr.png (Velocity Sweep)
speeds = [300, 500, 700, 1000, 1500, 2000, 2500, 3000]
uph_none = [645, 709, 640, 630, 630, 630, 630, 630]
uph_zvd = [1011, 1044, 1056, 1060, 1060, 1060, 1060, 1060]
vib_none = [8.22, 26.69, 32.80, 34.84, 34.84, 34.84, 34.84, 34.84]
vib_zvd = [7.99, 22.26, 28.68, 31.34, 31.34, 31.34, 31.34, 31.34]

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))
ax1.plot(speeds, uph_none, 'o-', color='#dc2626', linewidth=2, label='미제어 (None)')
ax1.plot(speeds, uph_zvd, 's-', color='#2563eb', linewidth=2, label='ZVD 제어 적용')
ax1.fill_between(speeds, uph_none, uph_zvd, alpha=0.08, color='#2563eb')
ax1.set_xlabel('최고 이동 속도 (mm/s)'); ax1.set_ylabel('생산성 (UPH)')
ax1.set_title('이동 속도에 따른 UPH 변화', fontweight='bold'); ax1.legend()

ax2.plot(speeds, vib_none, 'o-', color='#dc2626', linewidth=2, label='미제어 (None)')
ax2.plot(speeds, vib_zvd, 's-', color='#2563eb', linewidth=2, label='ZVD 제어 적용')
ax2.set_xlabel('최고 이동 속도 (mm/s)'); ax2.set_ylabel('잔류 진동 (mm)')
ax2.set_title('이동 속도에 따른 진동 크기 변화', fontweight='bold'); ax2.legend()
plt.suptitle('속도 강건성 (Velocity Sweep)', fontsize=16, fontweight='bold')
plt.tight_layout(); plt.savefig(OUT/'exp3_speed_kr.png', bbox_inches='tight'); plt.close()

# 3. exp4_distance_kr.png (Distance Sweep)
dists = [10, 20, 30, 50, 70, 100]
settle_none = [3.046, 3.065, 3.079, 3.101, 3.121, 3.151]
settle_zvd = [3.147, 3.166, 3.180, 3.202, 3.222, 3.252]

fig, ax = plt.subplots(figsize=(10, 5))
x = np.arange(len(dists)); w = 0.35
ax.bar(x-w/2, settle_none, w, color='#dc2626', alpha=0.85, label='미제어 (None)')
ax.bar(x+w/2, settle_zvd, w, color='#2563eb', alpha=0.85, label='ZVD 제어 적용')
ax.set_xticks(x); ax.set_xticklabels([f'{d}mm' for d in dists])
ax.set_ylabel('정착 시간 (초)'); ax.set_xlabel('이동 거리')
ax.set_title('이송 거리에 따른 정착 시간 변화 (거리 강건성)', fontweight='bold'); ax.legend()
plt.tight_layout(); plt.savefig(OUT/'exp4_distance_kr.png', bbox_inches='tight'); plt.close()

# 4. exp5_sensitivity_kr.png (Sensitivity)
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

fig, ax = plt.subplots(figsize=(10, 6))
ax.plot(ratios, sens_zv, '-', color='#ea580c', linewidth=2.5, label='ZV (허용오차 0%)')
ax.plot(ratios, sens_zvd, '-', color='#2563eb', linewidth=2.5, label='ZVD (허용오차 ±13.5%)')
ax.plot(ratios, sens_ei, '-', color='#16a34a', linewidth=2.5, label='EI (허용오차 ±20.1%)')
ax.axhline(y=5, color='#888', linewidth=1, linestyle='--', alpha=0.7, label='5% 진동 허용선')
ax.axvline(x=1.0, color='#888', linewidth=1, linestyle='--', alpha=0.5)
ax.axhspan(0, 5, alpha=0.05, color='green')
ax.set_xlabel('주파수 오차 비율 (실제 주파수 / 설계 주파수)')
ax.set_ylabel('진동 억제 실패율 (잔류 진동 %)')
ax.set_title('시스템 노후화(주파수 변동)에 대한 강건성 분석', fontweight='bold')
ax.legend(fontsize=11); ax.set_xlim(0.3, 1.7); ax.set_ylim(0, 120)
ax.text(1.0, 115, '설계 주파수\n(기준점)', ha='center', fontsize=10, color='gray')
plt.tight_layout(); plt.savefig(OUT/'exp5_sensitivity_kr.png', bbox_inches='tight'); plt.close()

# 5. exp7_uph_kr.png (Industrial 10Hz vs 40Hz)
cats = ['교육용\n(10Hz)', '일반 장비\n(25Hz)', '고성능 장비\n(40Hz)']
uph_base = [657, 3066, 6185]
uph_zvd = [6716, 8530, 9045]
imp = [922, 178, 46]

fig, ax = plt.subplots(figsize=(10, 6))
x = np.arange(len(cats)); w = 0.35
ax.bar(x-w/2, uph_base, w, label='미제어 (Baseline)', color='#9ca3af', alpha=0.8)
ax.bar(x+w/2, uph_zvd, w, label='ZVD 제어 적용', color='#2563eb', alpha=0.9)
for i in range(len(cats)):
    ax.text(x[i]-w/2, uph_base[i]+100, f'{uph_base[i]:,}', ha='center', fontsize=10)
    ax.text(x[i]+w/2, uph_zvd[i]+100, f'{uph_zvd[i]:,}', ha='center', fontweight='bold', color='#1d4ed8', fontsize=10)
    ax.annotate(f'+{imp[i]}%', xy=(x[i], uph_zvd[i]+800), ha='center', color='#dc2626', fontweight='bold',
                bbox=dict(boxstyle='round,pad=0.2', facecolor='#fef2f2', edgecolor='#f87171'))
ax.set_xticks(x); ax.set_xticklabels(cats)
ax.set_ylabel('생산성 (UPH)'); ax.set_ylim(0, 11000)
ax.set_title('실제 산업용 장비(강성 40Hz)에서의 UPH 향상 검증', fontweight='bold'); ax.legend(loc='upper left')
plt.tight_layout(); plt.savefig(OUT/'exp7_uph_kr.png', bbox_inches='tight'); plt.close()

print("ALL KOREAN RESULTS GENERATED.")
