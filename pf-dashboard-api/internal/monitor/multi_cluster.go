package monitor

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/minkyulee/pf-dashboard-backend/internal/eventlog"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
)

const (
	// Member 클러스터 Context 이름
	Member1ContextName = "karmada-member1-ctx"
	Member2ContextName = "karmada-member2-ctx"
)

// MultiClusterMonitor 멀티 클러스터 모니터링
type MultiClusterMonitor struct {
	clusterMonitor *ClusterMonitor
	trafficMonitor *TrafficMonitor
	eventLog       *eventlog.EventLog
	memberClusters map[string]*kubernetes.Clientset
	watchers       []chan []ClusterInfo
	mu             sync.RWMutex
	lastStatus     map[string]string            // 이전 클러스터 상태 추적
	lastNodeStatus map[string]map[string]string // 이전 노드 상태 추적 [clusterID][nodeName]status
}

// NewMultiClusterMonitor 새 멀티 클러스터 모니터 생성
func NewMultiClusterMonitor(eventLog *eventlog.EventLog) *MultiClusterMonitor {
	mcm := &MultiClusterMonitor{
		eventLog:       eventLog,
		memberClusters: make(map[string]*kubernetes.Clientset),
		lastStatus:     make(map[string]string),
		lastNodeStatus: make(map[string]map[string]string),
	}

	// Member 클러스터 클라이언트 생성
	mcm.initMemberClusters()

	// 기본 ClusterMonitor 생성
	mcm.clusterMonitor = NewClusterMonitor(eventLog)

	// TrafficMonitor 생성
	mcm.trafficMonitor = NewTrafficMonitor(mcm.memberClusters)

	return mcm
}

// initMemberClusters Member 클러스터 클라이언트 초기화
func (mcm *MultiClusterMonitor) initMemberClusters() {
	kubeconfig := os.Getenv("KUBECONFIG")
	if kubeconfig == "" {
		kubeconfig = os.Getenv("HOME") + "/.kube/config"
	}

	// kubeconfig 로드
	config, err := clientcmd.LoadFromFile(kubeconfig)
	if err != nil {
		log.Printf("Failed to load kubeconfig: %v", err)
		return
	}

	// member-cluster1, member-cluster2 context 찾기
	memberContexts := []string{Member1ContextName, Member2ContextName}

	for _, contextName := range memberContexts {
		if _, exists := config.Contexts[contextName]; !exists {
			log.Printf("Context %s not found in kubeconfig", contextName)
			continue
		}

		// Context별로 clientset 생성
		clientConfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
			&clientcmd.ClientConfigLoadingRules{ExplicitPath: kubeconfig},
			&clientcmd.ConfigOverrides{CurrentContext: contextName},
		)

		restConfig, err := clientConfig.ClientConfig()
		if err != nil {
			log.Printf("Failed to create config for %s: %v", contextName, err)
			continue
		}

		clientset, err := kubernetes.NewForConfig(restConfig)
		if err != nil {
			log.Printf("Failed to create clientset for %s: %v", contextName, err)
			continue
		}

		mcm.memberClusters[contextName] = clientset
		log.Printf("Successfully connected to %s", contextName)
	}
}

// CheckClusters 실제 클러스터 상태 체크
func (mcm *MultiClusterMonitor) CheckClusters() []ClusterInfo {
	clusters := make([]ClusterInfo, 0, 2)

	// 네임스페이스 설정
	namespace := os.Getenv("APP_NAMESPACE")
	if namespace == "" {
		namespace = "default"
	}

	// Member Cluster 1
	member1Info := mcm.getClusterInfo(Member1ContextName, "member1", "Member1 Cluster", namespace)
	clusters = append(clusters, member1Info)
	mcm.checkNodeStatusChanges("member1", member1Info.Name, member1Info.Nodes)
	mcm.checkStatusChange("member1", member1Info.Name, member1Info.Status, member1Info.Nodes)

	// Member Cluster 2
	member2Info := mcm.getClusterInfo(Member2ContextName, "member2", "Member2 Cluster", namespace)
	clusters = append(clusters, member2Info)
	mcm.checkNodeStatusChanges("member2", member2Info.Name, member2Info.Nodes)
	mcm.checkStatusChange("member2", member2Info.Name, member2Info.Status, member2Info.Nodes)

	return clusters
}

// checkStatusChange 클러스터 상태 변화 감지 및 이벤트 생성
func (mcm *MultiClusterMonitor) checkStatusChange(clusterID, clusterName, currentStatus string, nodes []NodeInfo) {
	mcm.mu.Lock()
	defer mcm.mu.Unlock()

	lastStatus, exists := mcm.lastStatus[clusterID]
	
	// 상태 변화가 있는 경우에만 이벤트 생성
	if exists && lastStatus != currentStatus {
		var eventType, message string
		
		if currentStatus == "failure" {
			eventType = "critical"
			message = fmt.Sprintf("🔴 %s is DOWN - No ready nodes available", clusterName)
			log.Printf("[ALERT] %s", message)
		} else if currentStatus == "ready" && lastStatus == "failure" {
			// Ready 노드 개수 계산
			readyCount := 0
			for _, node := range nodes {
				if node.Status == "Ready" {
					readyCount++
				}
			}
			
			eventType = "success"
			if readyCount == len(nodes) {
				message = fmt.Sprintf("✅ %s RECOVERED - All %d nodes are ready", clusterName, len(nodes))
			} else {
				message = fmt.Sprintf("✅ %s RECOVERED - %d/%d nodes are ready", clusterName, readyCount, len(nodes))
			}
			log.Printf("[INFO] %s", message)
		}
		
		if message != "" {
			mcm.eventLog.AddEvent(eventType, message)
		}
	}
	
	// 현재 상태 저장
	mcm.lastStatus[clusterID] = currentStatus
}

// checkNodeStatusChanges 노드별 상태 변화 감지 및 이벤트 생성
func (mcm *MultiClusterMonitor) checkNodeStatusChanges(clusterID, clusterName string, nodes []NodeInfo) {
	mcm.mu.Lock()
	defer mcm.mu.Unlock()

	// 클러스터별 노드 상태 맵이 없으면 생성
	if mcm.lastNodeStatus[clusterID] == nil {
		mcm.lastNodeStatus[clusterID] = make(map[string]string)
	}

	// 각 노드의 상태 변화 확인
	for _, node := range nodes {
		lastStatus, exists := mcm.lastNodeStatus[clusterID][node.Name]
		currentStatus := node.Status

		// 상태 변화가 있는 경우에만 이벤트 생성
		if exists && lastStatus != currentStatus {
			var eventType, message string

			if currentStatus == "Ready" && lastStatus != "Ready" {
				eventType = "success"
				message = fmt.Sprintf("✅ Node %s in %s is now READY", node.Name, clusterName)
				log.Printf("[INFO] %s", message)
			} else if currentStatus != "Ready" && lastStatus == "Ready" {
				eventType = "critical"
				message = fmt.Sprintf("🔴 Node %s in %s is now NOT READY", node.Name, clusterName)
				log.Printf("[ALERT] %s", message)
			}

			if message != "" {
				mcm.eventLog.AddEvent(eventType, message)
			}
		}

		// 현재 상태 저장
		mcm.lastNodeStatus[clusterID][node.Name] = currentStatus
	}
}

// getClusterInfo 특정 클러스터 정보 조회
func (mcm *MultiClusterMonitor) getClusterInfo(contextName, id, name, namespace string) ClusterInfo {
	info := ClusterInfo{
		ID:       id,
		Name:     name,
		Status:   "ready",
		Pods:     0,
		Region:   "Seoul",
		Sessions: 0,
		Nodes:    []NodeInfo{},
		PodList:  []PodInfo{},
	}

	clientset, exists := mcm.memberClusters[contextName]
	if !exists {
		log.Printf("Clientset for %s not found", contextName)
		info.Status = "failure"
		return info
	}

	ctx := context.Background()

	// 노드 정보 수집
	nodes, err := clientset.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		log.Printf("Failed to list nodes in %s: %v", contextName, err)
		info.Status = "failure"
		return info
	}

	// 최소 1개 이상의 노드가 Ready 상태인지 확인
	readyNodeCount := 0
	for _, node := range nodes.Items {
		nodeInfo := mcm.extractNodeInfo(&node)
		info.Nodes = append(info.Nodes, nodeInfo)

		if nodeInfo.Status == "Ready" {
			readyNodeCount++
		}
	}

	// 노드가 없거나 Ready 노드가 하나도 없으면 failure
	if len(nodes.Items) == 0 || readyNodeCount == 0 {
		info.Status = "failure"
		log.Printf("[%s] Cluster status: FAILURE (Ready nodes: %d/%d)", name, readyNodeCount, len(nodes.Items))
	} else {
		info.Status = "ready"
		log.Printf("[%s] Cluster status: READY (Ready nodes: %d/%d)", name, readyNodeCount, len(nodes.Items))
	}

	// Pod 목록 조회 (모든 네임스페이스)
	pods, err := clientset.CoreV1().Pods("").List(ctx, metav1.ListOptions{
		LabelSelector: "app=pf-dashboard", // 대시보드 앱 라벨
	})
	if err != nil {
		log.Printf("Failed to list pods in %s: %v", contextName, err)
		// Pod 조회 실패해도 노드 정보는 보여주기
	} else {
		// Running 상태의 Pod 개수
		runningPods := 0
		for _, pod := range pods.Items {
			podInfo := mcm.extractPodInfo(&pod)
			info.PodList = append(info.PodList, podInfo)

			if pod.Status.Phase == corev1.PodRunning {
				runningPods++
			}
		}

		info.Pods = runningPods
		info.Sessions = runningPods * 2500 // Pod당 약 2500 세션 가정
	}

	return info
}

// extractNodeInfo 노드 상세 정보 추출
func (mcm *MultiClusterMonitor) extractNodeInfo(node *corev1.Node) NodeInfo {
	nodeInfo := NodeInfo{
		Name: node.Name,
	}

	// Status
	for _, condition := range node.Status.Conditions {
		if condition.Type == corev1.NodeReady {
			if condition.Status == corev1.ConditionTrue {
				nodeInfo.Status = "Ready"
			} else {
				nodeInfo.Status = "NotReady"
			}
			break
		}
	}

	// Roles
	roles := []string{}
	for label := range node.Labels {
		if strings.HasPrefix(label, "node-role.kubernetes.io/") {
			role := strings.TrimPrefix(label, "node-role.kubernetes.io/")
			if role != "" {
				roles = append(roles, role)
			}
		}
	}
	if len(roles) == 0 {
		nodeInfo.Roles = "<none>"
	} else {
		nodeInfo.Roles = strings.Join(roles, ",")
	}

	// Age
	age := time.Since(node.CreationTimestamp.Time)
	nodeInfo.Age = formatDuration(age)

	// Version
	nodeInfo.Version = node.Status.NodeInfo.KubeletVersion

	// Internal IP
	for _, addr := range node.Status.Addresses {
		if addr.Type == corev1.NodeInternalIP {
			nodeInfo.InternalIP = addr.Address
			break
		}
	}

	// OS Image
	nodeInfo.OSImage = node.Status.NodeInfo.OSImage

	// Kernel Version
	nodeInfo.KernelVersion = node.Status.NodeInfo.KernelVersion

	// Container Runtime
	nodeInfo.ContainerRuntime = node.Status.NodeInfo.ContainerRuntimeVersion

	return nodeInfo
}

// extractPodInfo Pod 상세 정보 추출
func (mcm *MultiClusterMonitor) extractPodInfo(pod *corev1.Pod) PodInfo {
	podInfo := PodInfo{
		Name:   pod.Name,
		Status: string(pod.Status.Phase),
		IP:     pod.Status.PodIP,
		Node:   pod.Spec.NodeName,
	}

	// Ready (ready containers / total containers)
	totalContainers := len(pod.Spec.Containers)
	readyContainers := 0
	for _, containerStatus := range pod.Status.ContainerStatuses {
		if containerStatus.Ready {
			readyContainers++
		}
	}
	podInfo.Ready = fmt.Sprintf("%d/%d", readyContainers, totalContainers)

	// Restarts
	var totalRestarts int32 = 0
	for _, containerStatus := range pod.Status.ContainerStatuses {
		totalRestarts += containerStatus.RestartCount
	}
	podInfo.Restarts = totalRestarts

	// Age
	age := time.Since(pod.CreationTimestamp.Time)
	podInfo.Age = formatDuration(age)

	return podInfo
}

// formatDuration 시간을 kubectl과 유사한 형식으로 변환
func formatDuration(d time.Duration) string {
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	} else if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	} else if d < 24*time.Hour {
		return fmt.Sprintf("%dh", int(d.Hours()))
	} else {
		return fmt.Sprintf("%dd", int(d.Hours()/24))
	}
}

// Start 모니터링 시작 (ClusterMonitor 래핑)
func (mcm *MultiClusterMonitor) Start() {
	mcm.clusterMonitor.Start()
}

// GetClusters 현재 클러스터 상태 반환
func (mcm *MultiClusterMonitor) GetClusters() []ClusterInfo {
	return mcm.CheckClusters()
}

// Watch 클러스터 변경 감지
func (mcm *MultiClusterMonitor) Watch() chan []ClusterInfo {
	mcm.mu.Lock()
	defer mcm.mu.Unlock()

	watcher := make(chan []ClusterInfo, 10)
	mcm.watchers = append(mcm.watchers, watcher)
	log.Printf("[Watch] New watcher registered. Total watchers: %d", len(mcm.watchers))
	return watcher
}

// Unwatch 감시 해제
func (mcm *MultiClusterMonitor) Unwatch(watcher chan []ClusterInfo) {
	mcm.mu.Lock()
	defer mcm.mu.Unlock()

	for i, w := range mcm.watchers {
		if w == watcher {
			close(w)
			mcm.watchers = append(mcm.watchers[:i], mcm.watchers[i+1:]...)
			break
		}
	}
}

// NotifyWatchers 모든 watcher에게 변경 알림 (public)
func (mcm *MultiClusterMonitor) NotifyWatchers(clusters []ClusterInfo) {
	mcm.mu.RLock()
	defer mcm.mu.RUnlock()

	log.Printf("[NotifyWatchers] Notifying %d watchers with cluster data: %+v", len(mcm.watchers), clusters)

	for i, watcher := range mcm.watchers {
		select {
		case watcher <- clusters:
			log.Printf("[NotifyWatchers] Successfully sent to watcher %d", i)
		default:
			// 버퍼가 가득 찬 경우 스킵
			log.Printf("[NotifyWatchers] WARNING: Watcher %d buffer full, skipping", i)
		}
	}
}

// GetServiceGraph 서비스 그래프 조회 (TrafficMonitor 위임)
func (mcm *MultiClusterMonitor) GetServiceGraph(deploymentName, namespace string) (*ServiceGraph, error) {
	return mcm.trafficMonitor.GetServiceGraph(deploymentName, namespace)
}
