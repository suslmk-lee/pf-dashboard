# PF Dashboard Backend

Karmada 멀티 클러스터 환경의 실시간 모니터링을 위한 Go 기반 백엔드 API 서버입니다.

## 주요 기능

- **WebSocket 실시간 통신**: 클러스터 상태와 이벤트를 실시간으로 프론트엔드에 전달
- **Kubernetes API 통합**: 실제 클러스터 상태를 조회
- **In-Memory 이벤트 로그**: 최근 100개 이벤트를 메모리에 저장
- **Stateless 아키텍처**: 수평 확장 가능

## 기술 스택

- **언어**: Go 1.21
- **WebSocket**: gorilla/websocket
- **Kubernetes Client**: k8s.io/client-go
- **CORS**: rs/cors

## 아키텍처

```
Frontend (React)
    ↓ WebSocket
Backend API Server (Go)
    ↓
├─ Kubernetes API (클러스터 상태)
├─ In-Memory EventLog (이벤트 히스토리)
└─ ClusterMonitor (실시간 모니터링)
```

## 프로젝트 구조

```
pf-dashboard-backend/
├── main.go                      # 엔트리 포인트
├── internal/
│   ├── eventlog/
│   │   └── eventlog.go         # In-Memory 이벤트 로그
│   ├── handlers/
│   │   └── websocket.go        # WebSocket 핸들러
│   └── monitor/
│       └── cluster.go          # 클러스터 모니터링
├── Dockerfile                   # 멀티-스테이지 빌드
├── go.mod                       # Go 모듈 정의
└── README.md
```

## 로컬 개발 환경 실행

### 사전 요구사항

- Go 1.21 이상
- Kubernetes 클러스터 접근 권한
- `~/.kube/config` 설정 완료

### 의존성 설치

```bash
go mod download
```

### 실행

```bash
go run main.go
```

서버는 `http://localhost:8080`에서 실행됩니다.

### 환경 변수

```bash
export PORT=8080                    # 서버 포트 (기본값: 8080)
export APP_NAMESPACE=default        # 모니터링할 네임스페이스
export KUBECONFIG=~/.kube/config    # kubeconfig 경로
```

## Docker 빌드 및 실행

### Docker 이미지 빌드

```bash
docker build -t pf-dashboard-backend:latest .
```

### Docker 컨테이너 실행

```bash
docker run -d \
  -p 8080:8080 \
  -v ~/.kube/config:/root/.kube/config \
  --name pf-dashboard-backend \
  pf-dashboard-backend:latest
```

### 컨테이너 로그 확인

```bash
docker logs -f pf-dashboard-backend
```

## API 엔드포인트

### WebSocket

```
ws://localhost:8080/ws
```

**메시지 형식**:

```json
{
  "type": "clusters",      // clusters, events, event
  "data": [...],          // 클러스터 정보 또는 이벤트 배열
  "timestamp": "2025-10-22T12:00:00Z"
}
```

**클러스터 정보 예시**:

```json
{
  "type": "clusters",
  "data": [
    {
      "id": "member1",
      "name": "Member1 Cluster",
      "status": "ready",
      "pods": 2,
      "region": "Seoul",
      "sessions": 5000
    },
    {
      "id": "member2",
      "name": "Member2 Cluster",
      "status": "ready",
      "pods": 2,
      "region": "Seoul",
      "sessions": 5000
    }
  ],
  "timestamp": "2025-10-22T12:00:00Z"
}
```

**이벤트 예시**:

```json
{
  "type": "event",
  "data": {
    "type": "info",
    "message": "시스템 정상. Member1/Member2 클러스터에 트래픽 분산 중.",
    "timestamp": "12:00:00"
  },
  "timestamp": "2025-10-22T12:00:00Z"
}
```

### 헬스 체크

```
GET /health
```

**응답**: `200 OK`

## Kubernetes 배포

### Deployment 매니페스트

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pf-dashboard-backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: pf-dashboard-backend
  template:
    metadata:
      labels:
        app: pf-dashboard-backend
    spec:
      serviceAccountName: pf-dashboard-backend
      containers:
      - name: backend
        image: pf-dashboard-backend:latest
        ports:
        - containerPort: 8080
        env:
        - name: PORT
          value: "8080"
        - name: APP_NAMESPACE
          value: "default"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: pf-dashboard-backend
spec:
  selector:
    app: pf-dashboard-backend
  ports:
  - port: 8080
    targetPort: 8080
  type: ClusterIP
```

### RBAC 설정

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: pf-dashboard-backend
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: pf-dashboard-backend
rules:
- apiGroups: [""]
  resources: ["pods", "nodes"]
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: pf-dashboard-backend
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: pf-dashboard-backend
subjects:
- kind: ServiceAccount
  name: pf-dashboard-backend
  namespace: default
```

## Karmada 배포 (멀티 클러스터)

### PropagationPolicy

```yaml
apiVersion: policy.karmada.io/v1alpha1
kind: PropagationPolicy
metadata:
  name: pf-dashboard-backend-propagation
spec:
  resourceSelectors:
    - apiVersion: apps/v1
      kind: Deployment
      name: pf-dashboard-backend
    - apiVersion: v1
      kind: Service
      name: pf-dashboard-backend
  placement:
    clusterAffinity:
      clusterNames:
        - member1
        - member2
    replicaScheduling:
      replicaDivisionPreference: Weighted
      replicaSchedulingType: Divided
      weightPreference:
        staticWeightList:
          - targetCluster:
              clusterNames:
                - member1
            weight: 1
          - targetCluster:
              clusterNames:
                - member2
            weight: 1
```

## 개발 가이드

### 새로운 모니터링 메트릭 추가

1. `internal/monitor/cluster.go`에서 `ClusterInfo` 구조체에 필드 추가
2. `checkClusters()` 함수에서 데이터 수집 로직 추가
3. WebSocket으로 자동 전송됨

### 이벤트 타입 추가

`internal/eventlog/eventlog.go`에서 이벤트 타입 정의:
- `info`: 일반 정보
- `critical`: 심각한 오류
- `auto`: 자동 복구 작업
- `success`: 성공 메시지

## 라이선스

MIT

## 문의

프로젝트 관련 문의는 이슈를 통해 남겨주세요.
