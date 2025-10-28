# NHN Cloud DNS Plus GSLB 통합 가이드

## 개요

NHN Cloud DNS Plus API를 사용하여 GSLB(Global Server Load Balancing) 정보를 실시간으로 조회하고 대시보드에 표시합니다.

## 설정 방법

### 1. Backend 환경 변수 설정

`.env` 파일을 생성하고 다음 내용을 추가하세요:

```bash
# NHN Cloud DNS Plus GSLB API
GSLB_API_URL=https://dnsplus.api.nhncloudservice.com
GSLB_APP_KEY=your_actual_app_key_here
```

**중요**: `GSLB_APP_KEY`를 실제 NHN Cloud 프로젝트의 Appkey로 교체하세요.

### 2. Appkey 확인 방법

1. NHN Cloud Console 접속
2. DNS Plus 서비스 선택
3. 프로젝트 설정 → Appkey 확인
4. 위 `.env` 파일에 복사

### 3. Backend 실행

```bash
cd pf-dashboard-api

# 환경 변수 로드 (선택사항)
export $(cat .env | xargs)

# 서버 실행
go run main.go
```

### 4. Frontend 실행

```bash
cd pf-dashboard-ui

# 환경 변수 설정 (.env 파일)
VITE_API_URL=http://localhost:8080

# 개발 서버 실행
npm run dev
```

## API 엔드포인트

### 1. GSLB 풀 목록 조회

```bash
GET /api/gslb/pools
```

**응답 예시**:
```json
[
  {
    "poolId": "pool-123",
    "poolName": "my-gslb-pool",
    "gslbDomain": "example.gslb.com",
    "routingRule": "GEOLOCATION",
    "disabledFlag": false,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
]
```

### 2. GSLB 풀 상세 정보 조회

```bash
GET /api/gslb/details
```

**응답 예시**:
```json
[
  {
    "pool": {
      "poolId": "pool-123",
      "poolName": "my-gslb-pool",
      "gslbDomain": "example.gslb.com",
      "routingRule": "GEOLOCATION"
    },
    "endpoints": [
      {
        "endpointId": "ep-1",
        "endpointName": "member1-endpoint",
        "endpointIp": "192.168.1.10",
        "endpointPort": 80,
        "weight": 100,
        "disabledFlag": false,
        "healthStatus": "UP"
      },
      {
        "endpointId": "ep-2",
        "endpointName": "member2-endpoint",
        "endpointIp": "192.168.1.20",
        "endpointPort": 80,
        "weight": 100,
        "disabledFlag": false,
        "healthStatus": "UP"
      }
    ]
  }
]
```

## UI 컴포넌트

### GSLBStatus 컴포넌트

**위치**: `src/components/GSLBStatus.jsx`

**기능**:
- GSLB 풀 목록 표시
- 각 풀의 엔드포인트 상태 표시
- Health Check 상태 (UP/DOWN)
- 엔드포인트 Weight 정보
- 실시간 자동 갱신 (30초 주기)

**표시 정보**:
- 풀 이름 및 도메인
- Routing Rule (GEOLOCATION, WEIGHTED, etc.)
- 엔드포인트 목록
  - IP 주소 및 포트
  - Health Status (UP/DOWN)
  - Weight 값
  - Disabled 상태
- 통계
  - 총 풀 개수
  - 총 엔드포인트 개수
  - Healthy 엔드포인트 개수

## 화면 구성

```
┌─────────────────────────────────────────────┐
│           Global Status                      │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│         GSLB Traffic Flow                    │
│    (애니메이션 트래픽 흐름)                    │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│         GSLB Status (새로 추가!)              │
│                                              │
│  🌐 my-gslb-pool                            │
│     example.gslb.com                         │
│     Routing: GEOLOCATION                     │
│                                              │
│     Endpoints (2)                            │
│     ┌──────────────┬──────────────┐         │
│     │ member1-ep   │ member2-ep   │         │
│     │ 192.168.1.10 │ 192.168.1.20 │         │
│     │ ✓ UP         │ ✓ UP         │         │
│     └──────────────┴──────────────┘         │
│                                              │
│     Total: 2  Healthy: 2  Down: 0           │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│       Traffic Topology                       │
│    (Deployment 간 관계도)                     │
└─────────────────────────────────────────────┘
```

## 트러블슈팅

### 1. "GSLB_APP_KEY is not configured" 에러

**원인**: 환경 변수가 설정되지 않음

**해결**:
```bash
export GSLB_APP_KEY=your_actual_app_key
```

### 2. "API returned status 401" 에러

**원인**: Appkey가 잘못되었거나 권한이 없음

**해결**:
- NHN Cloud Console에서 Appkey 재확인
- DNS Plus 서비스가 활성화되어 있는지 확인

### 3. "Failed to fetch GSLB data" 에러

**원인**: 
- Backend 서버가 실행되지 않음
- CORS 설정 문제
- 네트워크 연결 문제

**해결**:
```bash
# Backend 서버 상태 확인
curl http://localhost:8080/health

# GSLB API 직접 테스트
curl http://localhost:8080/api/gslb/pools
```

### 4. UI에 "No GSLB pools configured" 표시

**원인**: 
- GSLB 풀이 실제로 없음
- API 응답이 비어있음

**해결**:
- NHN Cloud Console에서 GSLB 풀 생성
- API 응답 확인: `curl http://localhost:8080/api/gslb/pools`

## 참고 자료

- [NHN Cloud DNS Plus API 가이드](https://docs.nhncloud.com/ko/Network/DNS%20Plus/ko/api-guide/)
- [GSLB 개념](https://docs.nhncloud.com/ko/Network/DNS%20Plus/ko/overview/)

## 보안 주의사항

⚠️ **중요**: Appkey는 민감한 정보입니다.

- `.env` 파일을 `.gitignore`에 추가
- 프로덕션 환경에서는 환경 변수로 주입
- 코드에 하드코딩하지 말 것
- 공개 저장소에 커밋하지 말 것

```bash
# .gitignore에 추가
.env
.env.local
.env.production
```

## 향후 개선 사항

- [ ] GSLB 풀 생성/수정/삭제 기능
- [ ] 엔드포인트 추가/제거 기능
- [ ] Health Check 설정 변경
- [ ] Weight 조정 UI
- [ ] 실시간 트래픽 통계 연동
- [ ] 알림 기능 (엔드포인트 DOWN 시)
