# Service Traffic Graph 사용 가이드

## 개요

Istio East-West Gateway가 구성된 Karmada 멀티 클러스터 환경에서 Deployment의 트래픽 경로를 실시간으로 추적하고 시각화합니다.

## 기능

### ✅ 구현된 기능

1. **서비스 그래프 시각화**
   - Deployment → Pod 관계
   - Service → Deployment 연결
   - 클러스터별 리소스 그룹화

2. **크로스 클러스터 트래픽 감지**
   - East-West Gateway를 통한 Member1 ↔ Member2 트래픽
   - Istio 멀티 클러스터 통신 표시

3. **실시간 모니터링**
   - 10초마다 자동 갱신
   - 노드 상태 실시간 업데이트 (healthy/degraded/failed)

4. **시각적 표현**
   - 노드 타입별 색상 구분
   - 아이콘 기반 리소스 식별
   - 애니메이션 효과

## 사용 방법

### Backend API

```bash
# 서버 실행
cd pf-dashboard-api
go run main.go

# API 테스트
curl "http://localhost:8080/api/traffic/graph?deployment=pf-dashboard&namespace=default"
```

**응답 구조**:
```json
{
  "nodes": [
    {
      "name": "pf-dashboard",
      "namespace": "default",
      "cluster": "karmada-member1-ctx",
      "type": "deployment",
      "replicas": 2,
      "status": "healthy"
    }
  ],
  "edges": [
    {
      "source": "service-id",
      "target": "deployment-id",
      "metrics": {
        "protocol": "http"
      }
    }
  ]
}
```

### Frontend UI

```bash
# 개발 서버 실행
cd pf-dashboard-ui
npm run dev

# 환경 변수 설정 (.env 파일)
VITE_WS_URL=ws://localhost:8080/ws
VITE_API_URL=http://localhost:8080
```

**UI 구성**:
- 상단: GSLB 트래픽 흐름
- 중간: **Service Traffic Graph** (새로 추가)
- 하단: 클러스터 카드 + 이벤트 로그

## 컴포넌트 구조

### Backend

```
internal/
├── monitor/
│   ├── traffic.go          # 트래픽 모니터링 로직
│   ├── multi_cluster.go    # 멀티 클러스터 통합
│   └── cluster.go
└── handlers/
    ├── traffic.go          # HTTP API 핸들러
    └── websocket.go
```

### Frontend

```
src/
├── components/
│   ├── ServiceGraph.jsx    # 트래픽 그래프 시각화 (새로 추가)
│   ├── TrafficFlow.jsx
│   └── ClusterCard.jsx
└── App.jsx                 # ServiceGraph 통합
```

## 시각화 요소

### 노드 타입

| 타입 | 아이콘 | 색상 | 설명 |
|------|--------|------|------|
| Service | 🌐 | 파란색 | Kubernetes Service |
| Deployment | 📦 | 초록/노랑/빨강 | 상태별 색상 |
| Pod | 🔷 | 초록/회색 | Running/기타 |

### 연결 타입

- **일반 연결**: 회색 화살표 (클러스터 내부)
- **East-West Gateway**: 보라색 애니메이션 (클러스터 간)

### 상태 표시

- **Healthy**: 초록색 - 모든 replica 정상
- **Degraded**: 노란색 - 일부 replica 비정상
- **Failed**: 빨간색 - 모든 replica 실패

## 커스터마이징

### Deployment 변경

```jsx
// App.jsx
<ServiceGraph 
  deploymentName="your-app" 
  namespace="your-namespace" 
/>
```

### 갱신 주기 변경

```jsx
// ServiceGraph.jsx (line 41)
const interval = setInterval(fetchGraph, 10000); // 10초 → 원하는 시간(ms)
```

### 노드 색상 변경

```jsx
// ServiceGraph.jsx의 getNodeColor 함수 수정
const getNodeColor = (node) => {
  if (node.type === 'service') return 'bg-purple-500'; // 색상 변경
  // ...
};
```

## 향후 확장

### Prometheus 통합 (실시간 메트릭)

```go
// traffic.go에 추가
func (tm *TrafficMonitor) GetTrafficMetrics(deploymentName, namespace string) ([]TrafficMetrics, error) {
    // Prometheus PromQL 쿼리
    query := fmt.Sprintf(`
        rate(istio_requests_total{
            destination_workload="%s",
            destination_workload_namespace="%s"
        }[1m])
    `, deploymentName, namespace)
    
    // 메트릭 수집 및 반환
}
```

### WebSocket 실시간 업데이트

```go
// main.go에 추가
go func() {
    ticker := time.NewTicker(5 * time.Second)
    defer ticker.Stop()
    
    for range ticker.C {
        graph := multiClusterMonitor.GetServiceGraph("pf-dashboard", "default")
        // WebSocket으로 브로드캐스트
    }
}()
```

### 고급 시각화

- **D3.js**: 복잡한 그래프 레이아웃
- **Cytoscape.js**: 인터랙티브 네트워크 다이어그램
- **React Flow**: 드래그 가능한 노드 편집

## 트러블슈팅

### "Clientset not found" 에러

```bash
# kubeconfig context 확인
kubectl config get-contexts

# Context 이름이 다른 경우 multi_cluster.go 수정
const (
    Member1ContextName = "your-member1-context"
    Member2ContextName = "your-member2-context"
)
```

### CORS 에러

Backend의 CORS 설정 확인:
```go
// main.go
corsHandler := cors.New(cors.Options{
    AllowedOrigins: []string{"http://localhost:5173"}, // Vite 개발 서버
})
```

### 그래프가 비어있음

1. Deployment가 존재하는지 확인
2. Label selector가 올바른지 확인
3. RBAC 권한 확인 (ServiceAccount)

## 예제 시나리오

### 1. 정상 상태
- Member1: 2 pods (healthy)
- Member2: 2 pods (healthy)
- East-West Gateway: 양방향 연결

### 2. 장애 발생
- Member1: 0 pods (failed)
- Member2: 4 pods (healthy)
- East-West Gateway: Member2로만 트래픽

### 3. 복구 중
- Member1: 1 pod (degraded)
- Member2: 3 pods (healthy)
- East-West Gateway: 불균형 트래픽

## 참고 자료

- [Istio Multi-Cluster](https://istio.io/latest/docs/setup/install/multicluster/)
- [Karmada Documentation](https://karmada.io/docs/)
- [Kubernetes client-go](https://github.com/kubernetes/client-go)
