package gslb

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"
)

// GSLBClient NHN Cloud DNS Plus API 클라이언트
type GSLBClient struct {
	baseURL string
	appKey  string
	client  *http.Client
}

// GSLBEndpoint GSLB 엔드포인트 정보
type GSLBEndpoint struct {
	EndpointAddress  string  `json:"endpointAddress"`
	EndpointWeight   float64 `json:"endpointWeight"`
	EndpointDisabled bool    `json:"endpointDisabled"`
}

// GSLBPool GSLB 풀 정보
type GSLBPool struct {
	PoolID         string         `json:"poolId"`
	PoolName       string         `json:"poolName"`
	PoolDisabled   bool           `json:"poolDisabled"`
	HealthCheckID  string         `json:"healthCheckId"`
	EndpointList   []GSLBEndpoint `json:"endpointList"`
	CreatedAt      string         `json:"createdAt"`
	UpdatedAt      string         `json:"updatedAt"`
}

// GSLBConnectedPool 연결된 풀 정보
type GSLBConnectedPool struct {
	PoolID                    string   `json:"poolId"`
	ConnectedPoolOrder        int      `json:"connectedPoolOrder"`
	ConnectedPoolRegionContent string  `json:"connectedPoolRegionContent"`
	Pool                      GSLBPool `json:"pool"`
}

// GSLB GSLB 정보
type GSLB struct {
	GslbID             string              `json:"gslbId"`
	GslbName           string              `json:"gslbName"`
	GslbDomain         string              `json:"gslbDomain"`
	GslbTTL            int                 `json:"gslbTtl"`
	GslbRoutingRule    string              `json:"gslbRoutingRule"`
	GslbDisabled       bool                `json:"gslbDisabled"`
	ConnectedPoolList  []GSLBConnectedPool `json:"connectedPoolList"`
	CreatedAt          string              `json:"createdAt"`
	UpdatedAt          string              `json:"updatedAt"`
}

// GSLBPoolDetail GSLB 풀 상세 정보 (UI용)
type GSLBPoolDetail struct {
	Pool      GSLBPool       `json:"pool"`
	Endpoints []GSLBEndpoint `json:"endpoints"`
}

// GSLBResponse API 응답
type GSLBResponse struct {
	Header struct {
		IsSuccessful  bool   `json:"isSuccessful"`
		ResultCode    int    `json:"resultCode"`
		ResultMessage string `json:"resultMessage"`
	} `json:"header"`
	TotalCount int    `json:"totalCount"`
	GslbList   []GSLB `json:"gslbList"`
}

// NewGSLBClient 새 GSLB 클라이언트 생성
func NewGSLBClient() *GSLBClient {
	baseURL := os.Getenv("GSLB_API_URL")
	if baseURL == "" {
		baseURL = "https://dnsplus.api.nhncloudservice.com"
	}

	appKey := os.Getenv("GSLB_APP_KEY")
	if appKey == "" {
		log.Printf("Warning: GSLB_APP_KEY not set")
	}

	return &GSLBClient{
		baseURL: baseURL,
		appKey:  appKey,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// GetGSLBPools GSLB 목록 조회
func (c *GSLBClient) GetGSLBPools() ([]GSLB, error) {
	if c.appKey == "" {
		return nil, fmt.Errorf("GSLB_APP_KEY is not configured")
	}

	url := fmt.Sprintf("%s/dnsplus/v1.0/appkeys/%s/gslbs", c.baseURL, c.appKey)
	
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
	}

	var gslbResp GSLBResponse
	if err := json.Unmarshal(body, &gslbResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if !gslbResp.Header.IsSuccessful {
		return nil, fmt.Errorf("API error: %s (code: %d)", 
			gslbResp.Header.ResultMessage, gslbResp.Header.ResultCode)
	}

	log.Printf("[GSLB] Successfully fetched %d GSLBs", len(gslbResp.GslbList))
	return gslbResp.GslbList, nil
}

// GetAllGSLBDetails 모든 GSLB 풀의 상세 정보 조회
func (c *GSLBClient) GetAllGSLBDetails() ([]GSLBPoolDetail, error) {
	gslbs, err := c.GetGSLBPools()
	if err != nil {
		return nil, err
	}

	details := make([]GSLBPoolDetail, 0)
	
	// 각 GSLB의 연결된 풀들을 상세 정보로 변환
	for _, gslb := range gslbs {
		for _, connectedPool := range gslb.ConnectedPoolList {
			detail := GSLBPoolDetail{
				Pool:      connectedPool.Pool,
				Endpoints: connectedPool.Pool.EndpointList,
			}
			details = append(details, detail)
			
			log.Printf("[GSLB] Pool %s (%s) has %d endpoints", 
				connectedPool.Pool.PoolName, connectedPool.Pool.PoolID, len(connectedPool.Pool.EndpointList))
		}
	}

	return details, nil
}

// GetGSLBByName 특정 이름의 GSLB 정보 조회
func (c *GSLBClient) GetGSLBByName(gslbName string) (*GSLB, error) {
	gslbs, err := c.GetGSLBPools()
	if err != nil {
		return nil, err
	}

	for _, gslb := range gslbs {
		if gslb.GslbName == gslbName {
			log.Printf("[GSLB] Found GSLB: %s (%s)", gslb.GslbName, gslb.GslbDomain)
			return &gslb, nil
		}
	}

	return nil, fmt.Errorf("GSLB with name '%s' not found", gslbName)
}
