# 멀티-스테이지 빌드
# Stage 1: 빌드 스테이지
FROM golang:1.21-alpine AS builder

# 필요한 패키지 설치
RUN apk add --no-cache git

# 작업 디렉토리 설정
WORKDIR /app

# Go 모듈 파일 복사 및 의존성 다운로드
COPY go.mod go.sum* ./
RUN go mod download

# 소스 코드 복사
COPY . .

# 빌드
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

# Stage 2: 실행 스테이지
FROM alpine:latest

# CA 인증서 설치 (HTTPS 통신용)
RUN apk --no-cache add ca-certificates

WORKDIR /root/

# 빌드된 바이너리 복사
COPY --from=builder /app/main .

# 포트 노출
EXPOSE 8080

# 헬스 체크
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# 실행
CMD ["./main"]
