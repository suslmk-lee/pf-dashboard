package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/minkyulee/pf-dashboard-backend/internal/gslb"
)

// GSLBHandler GSLB API 핸들러
type GSLBHandler struct {
	gslbClient *gslb.GSLBClient
}

// NewGSLBHandler 새 GSLB 핸들러 생성
func NewGSLBHandler(gslbClient *gslb.GSLBClient) *GSLBHandler {
	return &GSLBHandler{
		gslbClient: gslbClient,
	}
}

// HandleGSLBPools GSLB 풀 목록 조회
// GET /api/gslb/pools
func (h *GSLBHandler) HandleGSLBPools(w http.ResponseWriter, r *http.Request) {
	log.Printf("[GSLBHandler] Getting GSLB pools")

	pools, err := h.gslbClient.GetGSLBPools()
	if err != nil {
		log.Printf("[GSLBHandler] Failed to get GSLB pools: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(pools); err != nil {
		log.Printf("[GSLBHandler] Failed to encode response: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("[GSLBHandler] Successfully sent %d pools", len(pools))
}

// HandleGSLBDetails 모든 GSLB 풀의 상세 정보 조회
// GET /api/gslb/details
func (h *GSLBHandler) HandleGSLBDetails(w http.ResponseWriter, r *http.Request) {
	log.Printf("[GSLBHandler] Getting GSLB details")

	details, err := h.gslbClient.GetAllGSLBDetails()
	if err != nil {
		log.Printf("[GSLBHandler] Failed to get GSLB details: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(details); err != nil {
		log.Printf("[GSLBHandler] Failed to encode response: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("[GSLBHandler] Successfully sent %d pool details", len(details))
}

// HandleGSLBByName 특정 이름의 GSLB 정보 조회
// GET /api/gslb/info?name=<gslb_name>
func (h *GSLBHandler) HandleGSLBByName(w http.ResponseWriter, r *http.Request) {
	gslbName := r.URL.Query().Get("name")
	if gslbName == "" {
		http.Error(w, "name parameter is required", http.StatusBadRequest)
		return
	}

	log.Printf("[GSLBHandler] Getting GSLB info for: %s", gslbName)

	gslb, err := h.gslbClient.GetGSLBByName(gslbName)
	if err != nil {
		log.Printf("[GSLBHandler] Failed to get GSLB: %v", err)
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(gslb); err != nil {
		log.Printf("[GSLBHandler] Failed to encode response: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("[GSLBHandler] Successfully sent GSLB info for: %s", gslbName)
}
