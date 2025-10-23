package monitor

import (
	"context"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"github.com/minkyulee/pf-dashboard-backend/internal/eventlog"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

// NodeInfo 노드 정보 구조체
type NodeInfo struct {
	Name             string `json:"name"`
	Status           string `json:"status"`
	Roles            string `json:"roles"`
	Age              string `json:"age"`
	Version          string `json:"version"`
	InternalIP       string `json:"internalIP"`
	OSImage          string `json:"osImage"`
	KernelVersion    string `json:"kernelVersion"`
	ContainerRuntime string `json:"containerRuntime"`
}

// PodInfo Pod 정보 구조체
type PodInfo struct {
	Name     string `json:"name"`
	Ready    string `json:"ready"`
	Status   string `json:"status"`
	Restarts int32  `json:"restarts"`
	Age      string `json:"age"`
	IP       string `json:"ip"`
	Node     string `json:"node"`
}

// ClusterInfo 클러스터 정보 구조체
type ClusterInfo struct {
	ID       string     `json:"id"`
	Name     string     `json:"name"`
	Status   string     `json:"status"`   // ready, failure
	Pods     int        `json:"pods"`     // Pod 개수
	Region   string     `json:"region"`   // 리전
	Sessions int        `json:"sessions"` // 활성 세션 수 (계산값)
	Nodes    []NodeInfo `json:"nodes"`    // 노드 상세 정보
	PodList  []PodInfo  `json:"podList"`  // Pod 상세 정보
}

// ClusterMonitor 클러스터 모니터링
type ClusterMonitor struct {
	clusters  []ClusterInfo
	mu        sync.RWMutex
	eventLog  *eventlog.EventLog
	clientset *kubernetes.Clientset
	watchers  []chan []ClusterInfo
}

// NewClusterMonitor 새 클러스터 모니터 생성
func NewClusterMonitor(eventLog *eventlog.EventLog) *ClusterMonitor {
	clientset := getKubernetesClient()

	return &ClusterMonitor{
		clusters: []ClusterInfo{
			{
				ID:       "member1",
				Name:     "Member1 Cluster",
				Status:   "ready",
				Pods:     2,
				Region:   "Seoul",
				Sessions: 5000,
			},
			{
				ID:       "member2",
				Name:     "Member2 Cluster",
				Status:   "ready",
				Pods:     2,
				Region:   "Seoul",
				Sessions: 5000,
			},
		},
		eventLog:  eventLog,
		clientset: clientset,
		watchers:  make([]chan []ClusterInfo, 0),
	}
}

// getKubernetesClient Kubernetes 클라이언트 생성
func getKubernetesClient() *kubernetes.Clientset {
	var config *rest.Config
	var err error

	// In-Cluster 설정 시도
	config, err = rest.InClusterConfig()
	if err != nil {
		// 로컬 kubeconfig 사용
		kubeconfig := os.Getenv("KUBECONFIG")
		if kubeconfig == "" {
			kubeconfig = os.Getenv("HOME") + "/.kube/config"
		}
		config, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
		if err != nil {
			log.Printf("Warning: Failed to create Kubernetes client: %v", err)
			return nil
		}
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		log.Printf("Warning: Failed to create Kubernetes clientset: %v", err)
		return nil
	}

	return clientset
}

// Start 모니터링 시작
func (cm *ClusterMonitor) Start() {
	// 초기 이벤트 로그
	cm.eventLog.AddEvent("info", "시스템 정상. Member1/Member2 클러스터에 트래픽 분산 중.")

	// 주기적으로 클러스터 상태 확인
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		cm.checkClusters()
		cm.notifyWatchers()
	}
}

// UpdateClusters 클러스터 정보 업데이트 (외부에서 호출)
func (cm *ClusterMonitor) UpdateClusters(clusters []ClusterInfo) {
	cm.mu.Lock()
	cm.clusters = clusters
	cm.mu.Unlock()
	cm.notifyWatchers()
}

// checkClusters 클러스터 상태 확인
func (cm *ClusterMonitor) checkClusters() {
	if cm.clientset == nil {
		return
	}

	ctx := context.Background()

	// 네임스페이스 설정 (환경변수에서 가져오거나 기본값 사용)
	namespace := os.Getenv("APP_NAMESPACE")
	if namespace == "" {
		namespace = "default"
	}

	// Pod 목록 조회
	pods, err := cm.clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: "app=pf-dashboard", // 대시보드 앱 라벨
	})
	if err != nil {
		log.Printf("Failed to list pods: %v", err)
		return
	}

	// 클러스터별 Pod 카운트 (간단한 시뮬레이션)
	cm.mu.Lock()
	defer cm.mu.Unlock()

	// 실제 Pod 수 기반으로 업데이트
	totalPods := len(pods.Items)
	if totalPods > 0 {
		// 간단한 로직: 전체 Pod를 클러스터에 분배
		cm.clusters[0].Pods = totalPods / 2
		cm.clusters[1].Pods = totalPods - cm.clusters[0].Pods

		// 세션 수도 Pod 수에 비례하여 업데이트
		cm.clusters[0].Sessions = cm.clusters[0].Pods * 2500
		cm.clusters[1].Sessions = cm.clusters[1].Pods * 2500
	}

	// 클러스터 상태 확인 (노드 상태 기반)
	cm.checkClusterHealth()

	// watcher에게 변경 알림
	cm.notifyWatchers()
}

// checkClusterHealth 클러스터 헬스 체크
func (cm *ClusterMonitor) checkClusterHealth() {
	if cm.clientset == nil {
		return
	}

	ctx := context.Background()
	nodes, err := cm.clientset.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return
	}

	// 노드 상태 확인
	notReadyNodes := 0
	for _, node := range nodes.Items {
		for _, condition := range node.Status.Conditions {
			if condition.Type == corev1.NodeReady && condition.Status != corev1.ConditionTrue {
				notReadyNodes++
			}
		}
	}

	// 장애 감지 시뮬레이션 (실제로는 Karmada API에서 가져와야 함)
	// 여기서는 노드가 NotReady 상태일 때 클러스터 장애로 간주
	if notReadyNodes > 0 {
		cm.simulateClusterFailure()
	}
}

// simulateClusterFailure 클러스터 장애 시뮬레이션
func (cm *ClusterMonitor) simulateClusterFailure() {
	// Member1 클러스터 장애
	if cm.clusters[0].Status == "ready" {
		cm.clusters[0].Status = "failure"
		cm.clusters[0].Pods = 0
		cm.clusters[0].Sessions = 0

		// Member2로 Failover
		cm.clusters[1].Pods = 4
		cm.clusters[1].Sessions = 10000

		// 이벤트 로그 추가
		cm.eventLog.AddEvent("critical", fmt.Sprintf("%s 클러스터 응답 없음 감지!", cm.clusters[0].Name))
		time.Sleep(1 * time.Second)
		cm.eventLog.AddEvent("auto", fmt.Sprintf("Karmada, %s 클러스터를 즉시 서비스에서 격리 조치.", cm.clusters[0].Name))
		time.Sleep(1 * time.Second)
		cm.eventLog.AddEvent("auto", fmt.Sprintf("모든 트래픽을 %s로 자동 전환.", cm.clusters[1].Name))
		time.Sleep(1 * time.Second)
		cm.eventLog.AddEvent("auto", fmt.Sprintf("%s 클러스터의 Pod를 %s로 이전 완료.", cm.clusters[0].Name, cm.clusters[1].Name))
		time.Sleep(1 * time.Second)
		cm.eventLog.AddEvent("success", "서비스 중단 없이 정상 운영 중.")
	}
}

// GetClusters 현재 클러스터 정보 반환
func (cm *ClusterMonitor) GetClusters() []ClusterInfo {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	clusters := make([]ClusterInfo, len(cm.clusters))
	copy(clusters, cm.clusters)
	return clusters
}

// Watch 클러스터 변경 감지 채널 등록
func (cm *ClusterMonitor) Watch() chan []ClusterInfo {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	watcher := make(chan []ClusterInfo, 10)
	cm.watchers = append(cm.watchers, watcher)
	return watcher
}

// Unwatch 클러스터 감시 해제
func (cm *ClusterMonitor) Unwatch(watcher chan []ClusterInfo) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	for i, w := range cm.watchers {
		if w == watcher {
			close(w)
			cm.watchers = append(cm.watchers[:i], cm.watchers[i+1:]...)
			break
		}
	}
}

// notifyWatchers 모든 watcher에게 변경 알림
func (cm *ClusterMonitor) notifyWatchers() {
	clusters := cm.GetClusters()
	for _, watcher := range cm.watchers {
		select {
		case watcher <- clusters:
		default:
			// 버퍼가 가득 찬 경우 스킵
		}
	}
}
