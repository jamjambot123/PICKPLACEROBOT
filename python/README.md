# 🚀 Python Pick & Place 시뮬레이터 (Digital Twin)

이 폴더(`python/`)는 학술 및 논문 발표용으로 제작된 파이썬 기반 시뮬레이터입니다.
웹 UI 없이 파이썬 코드로 구동되며, 고해상도의 논문용 그래프(Plot)를 바로 생성해 냅니다.

## 📁 파일 구성
*   `motion_profile.py`: Trapezoidal, S-Curve, 비대칭 S-Curve(AS-Curve) 궤적 생성 클래스
*   `input_shaping.py`: ZV, ZVD, EI 인풋쉐이퍼 계산 및 4차 미분방정식(물리 엔진) 시뮬레이터
*   `main.py`: 메인 시뮬레이션 스크립트. 실행 시 궤적 비교 및 **`results.png`** 그래프 생성
*   `ai_optimizer.py`: 입자 군집 탐색(PSO) 알고리즘을 이용해 UPH를 극대화하는 파라미터를 찾는 오프라인 자동 튜닝 스크립트

## 💻 실행 방법

먼저 필요한 패키지를 설치합니다.
```bash
pip install numpy scipy matplotlib
```

### 1. 일반 시뮬레이션 및 그래프 생성
```bash
python main.py
```
*   실행 시 터미널에 이송 시간 및 정착 시간이 텍스트로 출력됩니다.
*   폴더 내에 `results.png` 파일이 생성됩니다. 이 이미지를 PPT나 논문에 그대로 사용하시면 됩니다.
*   파라미터(거리, 최대속도, 마찰력 등)를 바꾸고 싶으시다면 `main.py` 파일을 열고 10번째 줄의 변수들을 수정하신 후 다시 실행하시면 됩니다.

### 2. AI 파라미터 오토튠 (최적화)
```bash
python ai_optimizer.py
```
*   실행 시 수백 번의 시뮬레이션을 백그라운드에서 진행하며, 완료 후 가장 짧은 이송 시간과 진동 0을 달성하는 최적의 V_max, A_max, beta, gamma 값을 콘솔에 출력합니다.
