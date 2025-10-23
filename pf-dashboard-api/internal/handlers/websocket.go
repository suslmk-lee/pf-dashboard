package handlers

import (
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/minkyulee/pf-dashboard-backend/internal/eventlog"
	"github.com/minkyulee/pf-dashboard-backend/internal/monitor"
)

// WebSocketMessage WebSocket 메시지 구조체
type WebSocketMessage struct {
	Type      string      `json:"type"` // clusters, events
	Data      interface{} `json:"data"`
	Timestamp string      `json:"timestamp"`
}

// WebSocketHandler WebSocket 핸들러
type WebSocketHandler struct {
	clusterMonitor monitor.ClusterMonitorInterface
	eventLog       *eventlog.EventLog
	upgrader       websocket.Upgrader
}

// NewWebSocketHandler 새 WebSocket 핸들러 생성
func NewWebSocketHandler(clusterMonitor monitor.ClusterMonitorInterface, eventLog *eventlog.EventLog) *WebSocketHandler {
	return &WebSocketHandler{
		clusterMonitor: clusterMonitor,
		eventLog:       eventLog,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				return true // CORS 허용 (프로덕션에서는 제한 필요)
			},
		},
	}
}

// HandleWebSocket WebSocket 연결 처리
func (h *WebSocketHandler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	log.Printf("New WebSocket connection from %s", r.RemoteAddr)

	// 초기 데이터 전송
	log.Printf("[WebSocket] Sending initial data to client")
	h.sendInitialData(conn)

	// 클러스터 변경 감지
	log.Printf("[WebSocket] Registering cluster watcher")
	clusterWatcher := h.clusterMonitor.Watch()
	defer h.clusterMonitor.Unwatch(clusterWatcher)
	log.Printf("[WebSocket] Cluster watcher registered, waiting for updates...")

	// 이벤트 로그 변경 감지
	eventWatcher := h.eventLog.Watch()
	defer h.eventLog.Unwatch(eventWatcher)

	// Ping/Pong으로 연결 유지
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	// 메시지 수신 및 전송
	for {
		select {
		case clusters := <-clusterWatcher:
			// 클러스터 정보 업데이트
			log.Printf("[WebSocket] Received cluster update from watcher: %+v", clusters)
			if err := h.sendMessage(conn, "clusters", clusters); err != nil {
				log.Printf("Failed to send cluster update: %v", err)
				return
			}
			log.Printf("[WebSocket] Successfully sent cluster update to client")

		case event := <-eventWatcher:
			// 새 이벤트 전송
			if err := h.sendMessage(conn, "event", event); err != nil {
				log.Printf("Failed to send event: %v", err)
				return
			}

		case <-ticker.C:
			// Ping 전송
			if err := conn.WriteControl(websocket.PingMessage, []byte{}, time.Now().Add(10*time.Second)); err != nil {
				log.Printf("Failed to send ping: %v", err)
				return
			}
		}
	}
}

// sendInitialData 초기 데이터 전송
func (h *WebSocketHandler) sendInitialData(conn *websocket.Conn) {
	// 현재 클러스터 정보
	clusters := h.clusterMonitor.GetClusters()
	log.Printf("[WebSocket] Initial clusters data: %+v", clusters)
	if err := h.sendMessage(conn, "clusters", clusters); err != nil {
		log.Printf("Failed to send initial clusters: %v", err)
	} else {
		log.Printf("[WebSocket] Successfully sent initial clusters")
	}

	// 현재 이벤트 로그
	events := h.eventLog.GetEvents()
	log.Printf("[WebSocket] Initial events count: %d", len(events))
	if err := h.sendMessage(conn, "events", events); err != nil {
		log.Printf("Failed to send initial events: %v", err)
	} else {
		log.Printf("[WebSocket] Successfully sent initial events")
	}
}

// sendMessage 메시지 전송
func (h *WebSocketHandler) sendMessage(conn *websocket.Conn, msgType string, data interface{}) error {
	message := WebSocketMessage{
		Type:      msgType,
		Data:      data,
		Timestamp: time.Now().Format(time.RFC3339),
	}

	return conn.WriteJSON(message)
}
