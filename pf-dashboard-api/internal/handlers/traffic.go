package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/minkyulee/pf-dashboard-backend/internal/monitor"
)

// TrafficHandler 트래픽 그래프 핸들러
type TrafficHandler struct {
	multiClusterMonitor *monitor.MultiClusterMonitor
}

// NewTrafficHandler 새 트래픽 핸들러 생성
func NewTrafficHandler(multiClusterMonitor *monitor.MultiClusterMonitor) *TrafficHandler {
	return &TrafficHandler{
		multiClusterMonitor: multiClusterMonitor,
	}
}

// HandleServiceGraph 서비스 그래프 조회 핸들러
// GET /api/traffic/graph?deployment=<name>&namespace=<namespace>
func (h *TrafficHandler) HandleServiceGraph(w http.ResponseWriter, r *http.Request) {
	// Query 파라미터 추출
	deploymentName := r.URL.Query().Get("deployment")
	namespace := r.URL.Query().Get("namespace")

	// 기본값 설정
	if namespace == "" {
		namespace = "default"
	}

	if deploymentName == "" {
		http.Error(w, "deployment parameter is required", http.StatusBadRequest)
		return
	}

	log.Printf("[TrafficHandler] Getting service graph for deployment: %s, namespace: %s", deploymentName, namespace)

	// 서비스 그래프 조회
	graph, err := h.multiClusterMonitor.GetServiceGraph(deploymentName, namespace)
	if err != nil {
		log.Printf("[TrafficHandler] Failed to get service graph: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// JSON 응답
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(graph); err != nil {
		log.Printf("[TrafficHandler] Failed to encode response: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("[TrafficHandler] Successfully sent service graph with %d nodes and %d edges", len(graph.Nodes), len(graph.Edges))
}
