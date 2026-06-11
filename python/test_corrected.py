import sys; sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, r'd:\dongwon\PICKPLACEROBOT\python')
from run_all_experiments import *

print('=== CORRECTED Exp 1: payload_fwd=FALSE (fn=10Hz matches shaper) ===')
for eid,prof,shp,desc in [('1-A','trapezoidal','none','Trapezoidal'),('1-B','ascurve','none','AS-Curve'),('1-C','ascurve','ZVD','AS-Curve+ZVD')]:
    r = run_experiment(1000,20000,50,10,0.05,prof,shp,payload_fwd=False)
    pv = r['peak_vib']; sf = r['settle_fwd']; u = r['uph']
    print(f"  {eid} {desc:18s} | vib={pv:8.4f}mm | settle={sf:.4f}s | UPH={u:>6,}")

print()
print('=== CORRECTED Exp 2: no payload ===')
for eid,shp,desc in [('2-A','none','None'),('2-B','ZV','ZV'),('2-C','ZVD','ZVD'),('2-D','EI','EI')]:
    r = run_experiment(1000,20000,50,10,0.05,'ascurve',shp,payload_fwd=False)
    dl = r['shaper_delay_ms']; pv = r['peak_vib']; sf = r['settle_fwd']; u = r['uph']
    print(f"  {eid} {desc:5s} | delay={dl:5.1f}ms | vib={pv:8.4f}mm | settle={sf:.4f}s | UPH={u:>6,}")
