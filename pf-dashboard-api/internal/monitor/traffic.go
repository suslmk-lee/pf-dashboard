package monitor

import (
	"context"
	"fmt"
	"log"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// TrafficMetrics 트래픽 메트릭 정보
type TrafficMetrics struct {
	SourceWorkload      string  `json:"sourceWorkload"`
	DestinationWorkload string  `json:"destinationWorkload"`
	SourceCluster       string  `json:"sourceCluster"`
	DestinationCluster  string  `json:"destinationCluster"`
	RequestRate         float64 `json:"requestRate"`  // requests/sec
	ErrorRate           float64 `json:"errorRate"`    // %
	Protocol            string  `json:"protocol"`     // http, tcp, grpc
}

// ServiceNode 서비스 노드 정보
type ServiceNode struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Cluster   string `json:"cluster"`
	Type      string `json:"type"` // deployment, service, pod
	Replicas  int32  `json:"replicas"`
	Status    string `json:"status"` // healthy, degraded, failed
}

// ServiceEdge 서비스 간 연결 정보
type ServiceEdge struct {
	Source  string         `json:"source"` // node ID
	Target  string         `json:"target"` // node ID
	Metrics TrafficMetrics `json:"metrics"`
}

// ServiceGraph 서비스 그래프
type ServiceGraph struct {
	Nodes []ServiceNode `json:"nodes"`
	Edges []ServiceEdge `json:"edges"`
}

// TrafficMonitor 트래픽 모니터링
type TrafficMonitor struct {
	clientsets map[string]*kubernetes.Clientset
}

// NewTrafficMonitor 새 트래픽 모니터 생성
func NewTrafficMonitor(clientsets map[string]*kubernetes.Clientset) *TrafficMonitor {
	return &TrafficMonitor{
		clientsets: clientsets,
	}
}

// GetServiceGraph 네임스페이스의 Deployment 간 관계 그래프 조회
func (tm *TrafficMonitor) GetServiceGraph(deploymentName, namespace string) (*ServiceGraph, error) {
	graph := &ServiceGraph{
		Nodes: []ServiceNode{},
		Edges: []ServiceEdge{},
	}

	// 각 클러스터에서 Deployment 정보 수집
	for clusterName, clientset := range tm.clientsets {
		ctx := context.Background()

		// 네임스페이스의 모든 Deployment 조회
		deployments, err := clientset.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			log.Printf("Failed to list deployments in namespace %s, cluster %s: %v", namespace, clusterName, err)
			continue
		}

		// 각 Deployment를 노드로 추가 (Pod와 Service는 제외)
		for _, deployment := range deployments.Items {
			node := ServiceNode{
				Name:      deployment.Name,
				Namespace: deployment.Namespace,
				Cluster:   clusterName,
				Type:      "deployment",
				Replicas:  *deployment.Spec.Replicas,
				Status:    getDeploymentStatus(deployment.Status.ReadyReplicas, *deployment.Spec.Replicas),
			}
			graph.Nodes = append(graph.Nodes, node)
		}
	}

	// 크로스 클러스터 트래픽 감지 (East-West Gateway)
	tm.detectCrossClusterTraffic(graph, deploymentName, namespace)

	return graph, nil
}

// detectCrossClusterTraffic East-West Gateway를 통한 크로스 클러스터 트래픽 감지
func (tm *TrafficMonitor) detectCrossClusterTraffic(graph *ServiceGraph, deploymentName, namespace string) {
	// Member1과 Member2 클러스터 간 연결 확인
	member1Nodes := []ServiceNode{}
	member2Nodes := []ServiceNode{}

	for _, node := range graph.Nodes {
		if node.Cluster == Member1ContextName && node.Type == "deployment" {
			member1Nodes = append(member1Nodes, node)
		} else if node.Cluster == Member2ContextName && node.Type == "deployment" {
			member2Nodes = append(member2Nodes, node)
		}
	}

	// 양방향 크로스 클러스터 트래픽 엣지 추가
	for _, m1Node := range member1Nodes {
		for _, m2Node := range member2Nodes {
			if m1Node.Name == m2Node.Name && m1Node.Namespace == m2Node.Namespace {
				// Member1 → Member2
				edge1 := ServiceEdge{
					Source: fmt.Sprintf("%s-%s-%s", m1Node.Name, m1Node.Namespace, m1Node.Cluster),
					Target: fmt.Sprintf("%s-%s-%s", m2Node.Name, m2Node.Namespace, m2Node.Cluster),
					Metrics: TrafficMetrics{
						SourceWorkload:      m1Node.Name,
						DestinationWorkload: m2Node.Name,
						SourceCluster:       "member1",
						DestinationCluster:  "member2",
						Protocol:            "istio-eastwest",
					},
				}
				graph.Edges = append(graph.Edges, edge1)

				// Member2 → Member1
				edge2 := ServiceEdge{
					Source: fmt.Sprintf("%s-%s-%s", m2Node.Name, m2Node.Namespace, m2Node.Cluster),
					Target: fmt.Sprintf("%s-%s-%s", m1Node.Name, m1Node.Namespace, m1Node.Cluster),
					Metrics: TrafficMetrics{
						SourceWorkload:      m2Node.Name,
						DestinationWorkload: m1Node.Name,
						SourceCluster:       "member2",
						DestinationCluster:  "member1",
						Protocol:            "istio-eastwest",
					},
				}
				graph.Edges = append(graph.Edges, edge2)
			}
		}
	}
}

// getDeploymentStatus Deployment 상태 판단
func getDeploymentStatus(ready, desired int32) string {
	if ready == 0 {
		return "failed"
	} else if ready < desired {
		return "degraded"
	}
	return "healthy"
}

// matchesSelector Service Selector가 Label과 매칭되는지 확인
func matchesSelector(selector, labels map[string]string) bool {
	if len(selector) == 0 {
		return false
	}

	for key, value := range selector {
		if labels[key] != value {
			return false
		}
	}
	return true
}

// GetTrafficMetrics Istio 메트릭 기반 실시간 트래픽 정보 조회 (향후 구현)
func (tm *TrafficMonitor) GetTrafficMetrics(deploymentName, namespace string) ([]TrafficMetrics, error) {
	// TODO: Prometheus API를 통해 Istio 메트릭 조회
	// Query: rate(istio_requests_total{destination_workload="deploymentName"}[1m])
	
	metrics := []TrafficMetrics{}
	
	// 현재는 더미 데이터 반환
	log.Printf("Getting traffic metrics for deployment: %s in namespace: %s", deploymentName, namespace)
	
	return metrics, nil
}

// MonitorTraffic 주기적으로 트래픽 모니터링 (백그라운드)
func (tm *TrafficMonitor) MonitorTraffic(deploymentName, namespace string, interval time.Duration, callback func(*ServiceGraph)) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for range ticker.C {
		graph, err := tm.GetServiceGraph(deploymentName, namespace)
		if err != nil {
			log.Printf("Failed to get service graph: %v", err)
			continue
		}

		callback(graph)
	}
}
