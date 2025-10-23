# Karmada Multi-Cluster Dashboard

PlugFest 시연을 위한 실시간 멀티 클러스터 모니터링 대시보드입니다.

## 주요 기능

- **전체 서비스 상태 표시**: 재해 상황에도 불구하고 서비스는 항상 OPERATIONAL 상태 유지
- **GSLB 트래픽 흐름 시각화**: 애니메이션으로 트래픽 흐름을 실시간 표시
- **클러스터 상태 모니터링**: Naver Cloud와 NHN Cloud의 실시간 상태 표시
- **이벤트 로그**: 시스템 변화를 타임스탬프와 함께 기록
- **자동 재해 시나리오**: 10초 후 자동으로 재해 시나리오 시작

## 시나리오

### T+0초 (초기 상태)
- 모든 클러스터 정상 운영
- Naver Cloud: 2 Pods, Ready
- NHN Cloud: 2 Pods, Ready
- 트래픽 균등 분산 (각 5,000 세션)

### T+10초 (재해 발생)
- Naver Cloud 장애 발생
- Karmada 자동 Failover 작동
- 모든 트래픽이 NHN Cloud로 전환
- NHN Cloud Pod 4개로 자동 증가
- 서비스 중단 없음 (GLOBAL STATUS는 계속 OPERATIONAL)

## 로컬 개발 환경 실행

### 사전 요구사항
- Node.js 18 이상
- 백엔드 서버 실행 중 (`pf-dashboard-backend`)

### 의존성 설치
```bash
npm install
```

### 환경 변수 설정
`.env` 파일을 생성하고 백엔드 WebSocket URL을 설정:
```bash
cp .env.example .env
```

`.env` 파일:
```
VITE_WS_URL=ws://localhost:8080/ws
```

### 개발 서버 실행
```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 접속

**중요**: 백엔드 서버가 먼저 실행되어 있어야 합니다.

### 프로덕션 빌드
```bash
npm run build
```

빌드된 파일은 `dist/` 디렉토리에 생성됩니다.

## Docker 빌드 및 실행

### Docker 이미지 빌드
```bash
docker build -t karmada-dashboard:latest .
```

### Docker 컨테이너 실행
```bash
docker run -d -p 8080:80 --name karmada-dashboard karmada-dashboard:latest
```

브라우저에서 `http://localhost:8080` 접속

### 컨테이너 중지 및 제거
```bash
docker stop karmada-dashboard
docker rm karmada-dashboard
```

## 기술 스택

- **Frontend**: React 18
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Container**: Docker (Nginx Alpine)

## 프로젝트 구조

```
pf-dashboard/
├── src/
│   ├── components/
│   │   ├── GlobalStatus.jsx    # 전체 서비스 상태 패널
│   │   ├── TrafficFlow.jsx     # GSLB 트래픽 흐름 시각화
│   │   ├── ClusterCard.jsx     # 클러스터 정보 카드
│   │   └── EventLog.jsx        # 이벤트 로그 패널
│   ├── App.jsx                 # 메인 애플리케이션
│   ├── main.jsx                # 엔트리 포인트
│   └── index.css               # 글로벌 스타일
├── Dockerfile                   # 멀티-스테이지 빌드 설정
├── nginx.conf                   # Nginx 설정
├── package.json                 # 프로젝트 의존성
└── vite.config.js              # Vite 설정
```

## 주요 컴포넌트 설명

### GlobalStatus
최상단에 고정되어 전체 서비스 상태를 표시합니다. 재해 시나리오 동안 항상 "OPERATIONAL" 상태를 유지하여 서비스 연속성을 강조합니다.

### TrafficFlow
GSLB에서 각 클러스터로 향하는 트래픽을 애니메이션 효과로 시각화합니다. 장애 발생 시 해당 클러스터로의 연결이 붉게 표시되거나 사라집니다.

### ClusterCard
개별 클러스터의 상태를 표시합니다. 장애 시 붉은색 오버레이와 "CRITICAL FAILURE" 메시지가 드라마틱하게 표시됩니다.

### EventLog
시스템의 모든 변화를 타임스탬프와 함께 실시간으로 기록합니다.

## 라이선스

MIT
