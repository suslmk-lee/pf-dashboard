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
	Name           string `json:"name"`
	Namespace      string `json:"namespace"`
	Cluster        string `json:"cluster"`
	Type           string `json:"type"` // deployment, service, pod
	Replicas       int32  `json:"replicas"`       // desired replicas
	ReadyReplicas  int32  `json:"readyReplicas"`  // ready replicas
	Status         string `json:"status"`         // healthy, degraded, failed
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

		log.Printf("[TrafficMonitor] Querying deployments in namespace '%s' for cluster '%s'", namespace, clusterName)

		// 네임스페이스의 모든 Deployment 조회
		deployments, err := clientset.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			log.Printf("[TrafficMonitor] Failed to list deployments in namespace %s, cluster %s: %v", namespace, clusterName, err)
			continue
		}

		log.Printf("[TrafficMonitor] Found %d deployments in namespace '%s' for cluster '%s'", len(deployments.Items), namespace, clusterName)

		// 각 Deployment를 노드로 추가 (Pod와 Service는 제외)
		for _, deployment := range deployments.Items {
			replicas := int32(0)
			if deployment.Spec.Replicas != nil {
				replicas = *deployment.Spec.Replicas
			}
			
			status := getDeploymentStatus(deployment.Status.ReadyReplicas, replicas)
			
			// 상태가 failed인 경우 상세 로그
			if status == "failed" && replicas > 0 {
				log.Printf("[TrafficMonitor] WARNING: %s in %s is FAILED (ready: %d, desired: %d, available: %d, updated: %d)", 
					deployment.Name, clusterName, 
					deployment.Status.ReadyReplicas, replicas,
					deployment.Status.AvailableReplicas, deployment.Status.UpdatedReplicas)
			}
			
			node := ServiceNode{
				Name:          deployment.Name,
				Namespace:     deployment.Namespace,
				Cluster:       clusterName,
				Type:          "deployment",
				Replicas:      replicas,
				ReadyReplicas: deployment.Status.ReadyReplicas,
				Status:        status,
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

	// 클러스터 내부 서비스 간 연결 추가
	// 실제 트래픽 흐름: IngressGateway -> api-gateway -> backend services
	
	// api-gateway에서 백엔드 서비스로의 연결
	backendServices := []string{"data-api-service", "data-collector", "data-processor", "openapi-proxy-api"}
	
	// Member1 내부 연결
	for _, source := range member1Nodes {
		if source.Name == "api-gateway" {
			for _, target := range member1Nodes {
				for _, backendSvc := range backendServices {
					if target.Name == backendSvc {
						edge := ServiceEdge{
							Source: fmt.Sprintf("%s-%s", source.Cluster, source.Name),
							Target: fmt.Sprintf("%s-%s", target.Cluster, target.Name),
							Metrics: TrafficMetrics{
								SourceWorkload:      source.Name,
								DestinationWorkload: target.Name,
								SourceCluster:       "member1",
								DestinationCluster:  "member1",
								Protocol:            "http",
							},
						}
						graph.Edges = append(graph.Edges, edge)
					}
				}
			}
		}
	}

	// Member2 내부 연결
	for _, source := range member2Nodes {
		if source.Name == "api-gateway" {
			for _, target := range member2Nodes {
				for _, backendSvc := range backendServices {
					if target.Name == backendSvc {
						edge := ServiceEdge{
							Source: fmt.Sprintf("%s-%s", source.Cluster, source.Name),
							Target: fmt.Sprintf("%s-%s", target.Cluster, target.Name),
							Metrics: TrafficMetrics{
								SourceWorkload:      source.Name,
								DestinationWorkload: target.Name,
								SourceCluster:       "member2",
								DestinationCluster:  "member2",
								Protocol:            "http",
							},
						}
						graph.Edges = append(graph.Edges, edge)
					}
				}
			}
		}
	}

	// 크로스 클러스터 트래픽: frontend -> data-api-service (양방향)
	// Member1 frontend -> Member1 EW Gateway -> Member2 EW Gateway -> Member2 data-api-service
	for _, m1Node := range member1Nodes {
		if m1Node.Name == "frontend" {
			for _, m2Node := range member2Nodes {
				if m2Node.Name == "data-api-service" {
					// Member1 frontend -> Member1 EW Gateway
					edge1 := ServiceEdge{
						Source: fmt.Sprintf("%s-%s", m1Node.Cluster, m1Node.Name),
						Target: "eastwest-member1",
						Metrics: TrafficMetrics{
							SourceWorkload:      m1Node.Name,
							DestinationWorkload: "eastwest-gateway",
							SourceCluster:       "member1",
							DestinationCluster:  "member1",
							Protocol:            "istio-eastwest",
						},
					}
					graph.Edges = append(graph.Edges, edge1)

					// Member1 EW Gateway -> Member2 EW Gateway
					edge2 := ServiceEdge{
						Source: "eastwest-member1",
						Target: "eastwest-member2",
						Metrics: TrafficMetrics{
							SourceWorkload:      "eastwest-gateway",
							DestinationWorkload: "eastwest-gateway",
							SourceCluster:       "member1",
							DestinationCluster:  "member2",
							Protocol:            "istio-eastwest",
						},
					}
					graph.Edges = append(graph.Edges, edge2)

					// Member2 EW Gateway -> Member2 data-api-service
					edge3 := ServiceEdge{
						Source: "eastwest-member2",
						Target: fmt.Sprintf("%s-%s", m2Node.Cluster, m2Node.Name),
						Metrics: TrafficMetrics{
							SourceWorkload:      "eastwest-gateway",
							DestinationWorkload: m2Node.Name,
							SourceCluster:       "member2",
							DestinationCluster:  "member2",
							Protocol:            "istio-eastwest",
						},
					}
					graph.Edges = append(graph.Edges, edge3)
				}
			}
		}
	}

	// Member2 frontend -> Member2 EW Gateway -> Member1 EW Gateway -> Member1 data-api-service
	for _, m2Node := range member2Nodes {
		if m2Node.Name == "frontend" {
			for _, m1Node := range member1Nodes {
				if m1Node.Name == "data-api-service" {
					// Member2 frontend -> Member2 EW Gateway
					edge1 := ServiceEdge{
						Source: fmt.Sprintf("%s-%s", m2Node.Cluster, m2Node.Name),
						Target: "eastwest-member2",
						Metrics: TrafficMetrics{
							SourceWorkload:      m2Node.Name,
							DestinationWorkload: "eastwest-gateway",
							SourceCluster:       "member2",
							DestinationCluster:  "member2",
							Protocol:            "istio-eastwest",
						},
					}
					graph.Edges = append(graph.Edges, edge1)

					// Member2 EW Gateway -> Member1 EW Gateway
					edge2 := ServiceEdge{
						Source: "eastwest-member2",
						Target: "eastwest-member1",
						Metrics: TrafficMetrics{
							SourceWorkload:      "eastwest-gateway",
							DestinationWorkload: "eastwest-gateway",
							SourceCluster:       "member2",
							DestinationCluster:  "member1",
							Protocol:            "istio-eastwest",
						},
					}
					graph.Edges = append(graph.Edges, edge2)

					// Member1 EW Gateway -> Member1 data-api-service
					edge3 := ServiceEdge{
						Source: "eastwest-member1",
						Target: fmt.Sprintf("%s-%s", m1Node.Cluster, m1Node.Name),
						Metrics: TrafficMetrics{
							SourceWorkload:      "eastwest-gateway",
							DestinationWorkload: m1Node.Name,
							SourceCluster:       "member1",
							DestinationCluster:  "member1",
							Protocol:            "istio-eastwest",
						},
					}
					graph.Edges = append(graph.Edges, edge3)
				}
			}
		}
	}
}

// getDeploymentStatus Deployment 상태 판단
func getDeploymentStatus(ready, desired int32) string {
	if desired == 0 {
		return "healthy" // desired가 0이면 의도적으로 스케일 다운한 것
	}
	
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
