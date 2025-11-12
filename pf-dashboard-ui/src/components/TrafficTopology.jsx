import { useState, useEffect, useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';

/**
 * TrafficTopology 컴포넌트
 * React Flow를 사용한 Federation 토폴로지 시각화
 */
function TrafficTopology({ deploymentName = 'frontend', namespace = 'default' }) {
  const [graph, setGraph] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // API에서 그래프 데이터 가져오기
  useEffect(() => {
    let isInitialLoad = true;

    const fetchGraph = async () => {
      try {
        if (isInitialLoad) setLoading(true);
        
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
        const response = await fetch(
          `${apiUrl}/api/traffic/graph?deployment=${deploymentName}&namespace=${namespace}`
        );
        
        if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
        
        const data = await response.json();
        setGraph(data);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        if (isInitialLoad) {
          setLoading(false);
          isInitialLoad = false;
        }
      }
    };

    fetchGraph();
    const interval = setInterval(fetchGraph, 10000);
    return () => clearInterval(interval);
  }, [deploymentName, namespace]);

  // 그래프 데이터를 React Flow 노드/엣지로 변환
  useEffect(() => {
    if (!graph?.nodes) return;

    const member1Nodes = graph.nodes.filter(n => n.cluster === 'karmada-member1-ctx');
    const member2Nodes = graph.nodes.filter(n => n.cluster === 'karmada-member2-ctx');

    const flowNodes = [];
    const flowEdges = [];

    // GSLB 노드 추가 (최상단 중앙)
    flowNodes.push({
      id: 'gslb',
      type: 'input',
      position: { x: 450, y: 30 },
      data: {
        label: (
          <div className="text-center">
            <div className="text-lg">🌐</div>
            <div className="font-bold text-xs">GSLB</div>
            <div className="text-xs text-gray-500">Load Balancer</div>
          </div>
        ),
      },
      style: {
        backgroundColor: '#dbeafe',
        border: '2px solid #3b82f6',
        borderRadius: '8px',
        padding: '8px',
        width: 120,
      },
    });

    // 클러스터 높이 계산 (api-gateway 헤더 + 나머지 3열 그리드)
    const member1BackendCount = member1Nodes.filter(n => n.name !== 'api-gateway').length;
    const member2BackendCount = member2Nodes.filter(n => n.name !== 'api-gateway').length;
    const member1Height = 100 + Math.ceil(member1BackendCount / 3) * 110 + 60;
    const member2Height = 100 + Math.ceil(member2BackendCount / 3) * 110 + 60;

    // Member1 클러스터 그룹 노드
    flowNodes.push({
      id: 'cluster-member1',
      type: 'group',
      position: { x: 20, y: 180 },
      style: {
        width: 450,
        height: member1Height,
        backgroundColor: 'rgba(59, 130, 246, 0.05)',
        border: '2px solid #3b82f6',
        borderRadius: '12px',
        padding: '20px',
      },
      data: { label: 'Member1 Cluster' },
    });

    // Member2 클러스터 그룹 노드
    flowNodes.push({
      id: 'cluster-member2',
      type: 'group',
      position: { x: 510, y: 180 },
      style: {
        width: 450,
        height: member2Height,
        backgroundColor: 'rgba(16, 185, 129, 0.05)',
        border: '2px solid #10b981',
        borderRadius: '12px',
        padding: '20px',
      },
      data: { label: 'Member2 Cluster' },
    });

    // Member1 서비스 노드들 (계층적 배치)
    let member1Index = 0;
    member1Nodes.forEach((node) => {
      const statusColor = getStatusColor(node.status);
      const isHealthy = node.readyReplicas === node.replicas;
      
      let position;
      let nodeStyle;
      let nodeData;
      
      if (node.name === 'api-gateway') {
        // api-gateway는 헤더 형태로 추상화
        position = { x: 20, y: 50 };
        nodeStyle = {
          backgroundColor: '#e0f2fe',
          border: '2px solid #0284c7',
          borderRadius: '6px',
          padding: '6px 12px',
          width: 410,
          height: 35,
        };
        nodeData = {
          label: (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-sm">🚪</span>
                <span className="font-bold text-xs text-gray-700">API Gateway</span>
              </div>
              <div className="text-xs text-gray-500">
                {node.readyReplicas}/{node.replicas} replicas
              </div>
            </div>
          ),
        };
      } else {
        // 나머지 서비스들은 아래에 3열로 배치
        const col = member1Index % 3;
        const row = Math.floor(member1Index / 3);
        position = { x: 20 + col * 140, y: 110 + row * 110 };
        member1Index++;
        
        const statusColor = getStatusColor(node.status);
        nodeStyle = {
          backgroundColor: getStatusBg(node.status),
          border: `2px solid ${statusColor}`,
          borderRadius: '8px',
          padding: '10px',
          width: 130,
        };
        nodeData = {
          label: (
            <div className="text-left">
              <div className="font-semibold text-xs text-gray-800">{node.name}</div>
              <div className={`text-xs font-bold mt-0.5 ${isHealthy ? 'text-green-600' : 'text-orange-500'}`}>
                {node.readyReplicas}/{node.replicas} replicas
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{node.status}</div>
            </div>
          ),
        };
      }
      
      flowNodes.push({
        id: `${node.cluster}-${node.name}`,
        type: 'default',
        position: position,
        parentNode: 'cluster-member1',
        extent: 'parent',
        data: nodeData,
        style: nodeStyle,
      });
    });

    // Member2 서비스 노드들 (계층적 배치)
    let member2Index = 0;
    member2Nodes.forEach((node) => {
      const statusColor = getStatusColor(node.status);
      const isHealthy = node.readyReplicas === node.replicas;
      
      let position;
      let nodeStyle;
      let nodeData;
      
      if (node.name === 'api-gateway') {
        // api-gateway는 헤더 형태로 추상화
        position = { x: 20, y: 50 };
        nodeStyle = {
          backgroundColor: '#d1fae5',
          border: '2px solid #059669',
          borderRadius: '6px',
          padding: '6px 12px',
          width: 410,
          height: 35,
        };
        nodeData = {
          label: (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-sm">🚪</span>
                <span className="font-bold text-xs text-gray-700">API Gateway</span>
              </div>
              <div className="text-xs text-gray-500">
                {node.readyReplicas}/{node.replicas} replicas
              </div>
            </div>
          ),
        };
      } else {
        // 나머지 서비스들은 아래에 3열로 배치
        const col = member2Index % 3;
        const row = Math.floor(member2Index / 3);
        position = { x: 20 + col * 140, y: 110 + row * 110 };
        member2Index++;
        
        const statusColor = getStatusColor(node.status);
        nodeStyle = {
          backgroundColor: getStatusBg(node.status),
          border: `2px solid ${statusColor}`,
          borderRadius: '8px',
          padding: '10px',
          width: 130,
        };
        nodeData = {
          label: (
            <div className="text-left">
              <div className="font-semibold text-xs text-gray-800">{node.name}</div>
              <div className={`text-xs font-bold mt-0.5 ${isHealthy ? 'text-green-600' : 'text-orange-500'}`}>
                {node.readyReplicas}/{node.replicas} replicas
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{node.status}</div>
            </div>
          ),
        };
      }
      
      flowNodes.push({
        id: `${node.cluster}-${node.name}`,
        type: 'default',
        position: position,
        parentNode: 'cluster-member2',
        extent: 'parent',
        data: nodeData,
        style: nodeStyle,
      });
    });

    // East-West Gateway 엔드포인트 (각 클러스터 경계선 중앙)
    if (graph.edges?.some(e => e.metrics.protocol === 'istio-eastwest')) {
      const clusterMidHeight = member1Height / 2;
      
      // Member1 East-West Gateway Endpoint (오른쪽 경계선 중앙)
      flowNodes.push({
        id: 'eastwest-member1',
        type: 'default',
        position: { x: 435, y: clusterMidHeight - 15 },
        parentNode: 'cluster-member1',
        data: {
          label: (
            <div className="text-center">
              <div className="text-xs font-bold text-white">⚡</div>
            </div>
          ),
        },
        style: {
          backgroundColor: '#a855f7',
          border: '2px solid #9333ea',
          borderRadius: '50%',
          padding: '6px',
          width: 30,
          height: 30,
          zIndex: 10,
        },
      });

      // Member2 East-West Gateway Endpoint (왼쪽 경계선 중앙)
      flowNodes.push({
        id: 'eastwest-member2',
        type: 'default',
        position: { x: -15, y: clusterMidHeight - 15 },
        parentNode: 'cluster-member2',
        data: {
          label: (
            <div className="text-center">
              <div className="text-xs font-bold text-white">⚡</div>
            </div>
          ),
        },
        style: {
          backgroundColor: '#a855f7',
          border: '2px solid #9333ea',
          borderRadius: '50%',
          padding: '6px',
          width: 30,
          height: 30,
          zIndex: 10,
        },
      });
    }

    // GSLB -> api-gateway 연결 추가
    member1Nodes.forEach(node => {
      if (node.name === 'api-gateway') {
        flowEdges.push({
          id: 'gslb-to-member1-apigw',
          source: 'gslb',
          target: `${node.cluster}-${node.name}`,
          animated: true,
          type: 'smoothstep',
          style: {
            stroke: '#10b981',
            strokeWidth: 3,
          },
          markerEnd: {
            type: 'arrowclosed',
            color: '#10b981',
          },
          label: 'GSLB',
          labelStyle: { fill: '#10b981', fontWeight: 700, fontSize: 10 },
        });
      }
    });

    member2Nodes.forEach(node => {
      if (node.name === 'api-gateway') {
        flowEdges.push({
          id: 'gslb-to-member2-apigw',
          source: 'gslb',
          target: `${node.cluster}-${node.name}`,
          animated: true,
          type: 'smoothstep',
          style: {
            stroke: '#10b981',
            strokeWidth: 3,
          },
          markerEnd: {
            type: 'arrowclosed',
            color: '#10b981',
          },
          label: 'GSLB',
          labelStyle: { fill: '#10b981', fontWeight: 700, fontSize: 10 },
        });
      }
    });

    // 엣지 생성
    graph.edges?.forEach((edge, i) => {
      const isCrossCluster = edge.metrics.protocol === 'istio-eastwest';
      const isInternalFlow = edge.metrics.protocol === 'http';

      flowEdges.push({
        id: `edge-${i}`,
        source: edge.source,
        target: edge.target,
        animated: isCrossCluster,
        type: 'smoothstep',
        style: {
          stroke: isCrossCluster ? '#a855f7' : (isInternalFlow ? '#3b82f6' : '#d1d5db'),
          strokeWidth: isCrossCluster ? 3 : 2,
          strokeDasharray: isCrossCluster ? '5,5' : '0',
        },
        markerEnd: {
          type: 'arrowclosed',
          color: isCrossCluster ? '#a855f7' : (isInternalFlow ? '#3b82f6' : '#d1d5db'),
        },
        label: isCrossCluster ? '⚡' : '',
        labelStyle: { fill: '#a855f7', fontWeight: 700 },
      });
    });

    // 초기 로드 시에만 노드 위치 설정, 이후에는 기존 위치 유지
    if (isInitialLoad) {
      setNodes(flowNodes);
      setEdges(flowEdges);
      setIsInitialLoad(false);
    } else {
      // 기존 노드의 위치를 보존하면서 데이터만 업데이트
      setNodes((nds) =>
        flowNodes.map((newNode) => {
          const existingNode = nds.find((n) => n.id === newNode.id);
          if (existingNode) {
            // 기존 노드가 있으면 위치는 유지하고 데이터만 업데이트
            return {
              ...newNode,
              position: existingNode.position,
            };
          }
          return newNode;
        })
      );
      setEdges(flowEdges);
    }
  }, [graph, setNodes, setEdges, isInitialLoad]);

  // 헬퍼 함수들

  const getStatusColor = (status) => {
    if (status === 'healthy' || status === 'Running') return '#10b981';
    if (status === 'degraded') return '#f59e0b';
    return '#ef4444';
  };

  const getStatusBg = (status) => {
    if (status === 'healthy' || status === 'Running') return '#d1fae5';
    if (status === 'degraded') return '#fef3c7';
    return '#fee2e2';
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="text-center text-red-500">
          <p className="font-semibold">Failed to load traffic topology</p>
          <p className="text-sm mt-2">{error}</p>
        </div>
      </div>
    );
  }

  const crossClusterEdges = graph?.edges?.filter(e => e.metrics.protocol === 'istio-eastwest') || [];

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Traffic Topology</h2>
          <p className="text-xs text-gray-500 mt-1">
            <span className="font-semibold text-blue-600">{namespace}</span> / <span className="font-semibold text-blue-600">{deploymentName}</span>
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs text-gray-600">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span>Live Traffic</span>
        </div>
      </div>

      {/* React Flow 그래프 */}
      <div className="relative bg-gray-50 rounded-lg" style={{ height: '600px' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView={nodes.length === 0}
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          attributionPosition="bottom-left"
          nodesDraggable={true}
          nodesConnectable={false}
          elementsSelectable={true}
          minZoom={0.4}
          maxZoom={1.5}
          defaultViewport={{ x: 100, y: 50, zoom: 0.85 }}
        >
          <Background color="#e5e7eb" gap={16} />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={(node) => {
              if (node.type === 'group') return '#e5e7eb';
              return '#3b82f6';
            }}
            maskColor="rgba(0, 0, 0, 0.1)"
            style={{ height: 100, width: 150 }}
          />
        </ReactFlow>
      </div>

      {/* East-West Gateway 안내 */}
      {crossClusterEdges.length > 0 && (
        <div className="mt-4 bg-purple-50 border border-purple-200 rounded-lg p-3">
          <div className="flex items-center justify-center space-x-2">
            <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
            <span className="text-xs font-semibold text-purple-700">⚡ East-West Gateway</span>
            <span className="text-xs text-gray-600">- Cross-cluster communication endpoints</span>
          </div>
        </div>
      )}

      {/* 통계 */}
      <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
        <div className="bg-blue-50 rounded-lg p-3">
          <div className="text-2xl font-bold text-blue-600">{graph?.nodes?.length || 0}</div>
          <div className="text-xs text-gray-600 mt-1">Total Services</div>
        </div>
        <div className="bg-green-50 rounded-lg p-3">
          <div className="text-2xl font-bold text-green-600">
            {graph?.nodes?.filter(n => n.status === 'healthy').length || 0}
          </div>
          <div className="text-xs text-gray-600 mt-1">Healthy</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-3">
          <div className="text-2xl font-bold text-purple-600">{crossClusterEdges.length}</div>
          <div className="text-xs text-gray-600 mt-1">Cross-Cluster</div>
        </div>
      </div>
    </div>
  );
}

export default TrafficTopology;
