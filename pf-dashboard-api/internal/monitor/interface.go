package monitor

// ClusterMonitorInterface 클러스터 모니터 인터페이스
type ClusterMonitorInterface interface {
	GetClusters() []ClusterInfo
	Watch() chan []ClusterInfo
	Unwatch(watcher chan []ClusterInfo)
}
