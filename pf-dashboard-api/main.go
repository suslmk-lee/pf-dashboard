package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/joho/godotenv"
	"github.com/minkyulee/pf-dashboard-backend/internal/eventlog"
	"github.com/minkyulee/pf-dashboard-backend/internal/gslb"
	"github.com/minkyulee/pf-dashboard-backend/internal/handlers"
	"github.com/minkyulee/pf-dashboard-backend/internal/monitor"
	"github.com/rs/cors"
)

func main() {
	// .env 파일 로드 (있으면)
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: .env file not found, using system environment variables")
	}

	// 환경변수에서 포트 가져오기 (기본값: 8080)
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// In-Memory 이벤트 로그 시스템 초기화
	eventLog := eventlog.NewEventLog(100) // 최근 100개 이벤트 저장

	// 멀티 클러스터 모니터링 시스템 초기화
	multiClusterMonitor := monitor.NewMultiClusterMonitor(eventLog)

	// GSLB 클라이언트 초기화
	gslbClient := gslb.NewGSLBClient()
	
	// GSLB 설정 확인
	if os.Getenv("GSLB_APP_KEY") != "" {
		log.Printf("GSLB API configured successfully")
	} else {
		log.Printf("Warning: GSLB_APP_KEY not set - GSLB features will be disabled")
	}

	// 초기 이벤트 로그
	eventLog.AddEvent("info", "시스템 정상. Member1/Member2 클러스터에 트래픽 분산 중.")

	// 백그라운드에서 실제 클러스터 상태 체크 및 watcher에 알림
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()

		for range ticker.C {
			clusters := multiClusterMonitor.CheckClusters()
			log.Printf("Cluster status updated: %+v", clusters)

			// watcher에 알림
			multiClusterMonitor.NotifyWatchers(clusters)
		}
	}()

	// HTTP 핸들러 설정
	mux := http.NewServeMux()

	// WebSocket 엔드포인트
	wsHandler := handlers.NewWebSocketHandler(multiClusterMonitor, eventLog)
	mux.HandleFunc("/ws", wsHandler.HandleWebSocket)

	// 트래픽 그래프 API 엔드포인트
	trafficHandler := handlers.NewTrafficHandler(multiClusterMonitor)
	mux.HandleFunc("/api/traffic/graph", trafficHandler.HandleServiceGraph)

	// GSLB API 엔드포인트
	gslbHandler := handlers.NewGSLBHandler(gslbClient)
	mux.HandleFunc("/api/gslb/pools", gslbHandler.HandleGSLBPools)
	mux.HandleFunc("/api/gslb/details", gslbHandler.HandleGSLBDetails)
	mux.HandleFunc("/api/gslb/info", gslbHandler.HandleGSLBByName)

	// 헬스 체크 엔드포인트
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// CORS 설정
	corsHandler := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	})

	handler := corsHandler.Handler(mux)

	log.Printf("Starting server on port %s", port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatal("Server failed to start:", err)
	}
}
