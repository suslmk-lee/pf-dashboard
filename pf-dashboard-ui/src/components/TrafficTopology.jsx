import { useState, useEffect, useCallback, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';

/**
 * TrafficTopology 컴포넌트
 * React Flow를 사용한 Federation 토폴로지 시각화
 */
function TrafficTopology({ deploymentName = 'frontend', namespace = 'tf-monitor' }) {
  const [graph, setGraph] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [previousNodeIds, setPreviousNodeIds] = useState(new Set());
  const [shouldFitView, setShouldFitView] = useState(true);
  const reactFlowInstance = useRef(null);

  // API에서 그래프 데이터 가져오기 (재시도 로직 포함)
  useEffect(() => {
    let isInitialLoad = true;
    let retryCount = 0;
    const maxRetries = 3;

    const fetchGraph = async () => {
      try {
        if (isInitialLoad) setLoading(true);
        
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
        
        // 타임아웃 설정 (15초 - 백엔드 클러스터 조회 시간 고려)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        const response = await fetch(
          `${apiUrl}/api/traffic/graph?deployment=${deploymentName}&namespace=${namespace}`,
          { signal: controller.signal }
        );
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // 데이터가 비어있거나 노드가 없으면 재시도
        if (!data || !data.nodes || data.nodes.length === 0) {
          if (retryCount < maxRetries) {
            retryCount++;
            console.log(`[TrafficTopology] Empty data received, retrying (${retryCount}/${maxRetries})...`);
            setTimeout(fetchGraph, 2000); // 2초 후 재시도
            return;
          }
        }
        
        // 클러스터 상태 정보 로깅
        console.log('[TrafficTopology] Received data:', {
          nodes: data.nodes?.length || 0,
          clusterStatus: data.clusterStatus,
          clusters: data.clusters
        });
        
        setGraph(data);
        setError(null);
        retryCount = 0; // 성공 시 재시도 카운트 리셋
      } catch (err) {
        console.error('[TrafficTopology] Fetch error:', err.message);
        
        // 재시도 로직
        if (retryCount < maxRetries && err.name !== 'AbortError') {
          retryCount++;
          console.log(`[TrafficTopology] Retrying (${retryCount}/${maxRetries})...`);
          setTimeout(fetchGraph, 2000); // 2초 후 재시도
        } else {
          // 최대 재시도 후에도 실패하면 에러 표시
          if (!isInitialLoad) {
            // 초기 로드가 아니면 이전 데이터 유지 (에러 표시 안 함)
            console.warn('[TrafficTopology] Failed to fetch, keeping previous data');
          } else {
            setError(err.message);
          }
          retryCount = 0;
        }
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
    
    // 클러스터 상태 확인
    // 1. graph.clusterStatus가 있으면 그것을 사용
    // 2. graph.clusters 배열이 있으면 해당 클러스터의 ready 상태 확인
    // 3. 둘 다 없으면 서비스 노드가 있는지로 판단
    let isMember1Available = true; // 기본값: 사용 가능
    
    if (graph.clusterStatus) {
      // clusterStatus 객체가 있으면 사용
      isMember1Available = graph.clusterStatus['karmada-member1-ctx'] !== false;
    } else if (graph.clusters && Array.isArray(graph.clusters)) {
      // clusters 배열에서 member1 찾기
      const member1Cluster = graph.clusters.find(c => c.name === 'karmada-member1-ctx');
      if (member1Cluster) {
        isMember1Available = member1Cluster.ready === true || member1Cluster.status === 'Ready';
      }
    } else {
      // 클러스터 상태 정보가 없으면 서비스 노드 존재 여부로 판단
      isMember1Available = member1Nodes.length > 0;
    }
    
    console.log('[TrafficTopology] Member1 availability:', isMember1Available, 
                'nodes:', member1Nodes.length);
    
    // Member2 클러스터 가용성 확인
    let isMember2Available = true;
    
    if (graph.clusterStatus) {
      isMember2Available = graph.clusterStatus['karmada-member2-ctx'] !== false;
    } else if (graph.clusters && Array.isArray(graph.clusters)) {
      const member2Cluster = graph.clusters.find(c => c.name === 'karmada-member2-ctx');
      if (member2Cluster) {
        isMember2Available = member2Cluster.ready === true || member2Cluster.status === 'Ready';
      }
    } else {
      isMember2Available = member2Nodes.length > 0;
    }
    
    console.log('[TrafficTopology] Member2 availability:', isMember2Available, 
                'nodes:', member2Nodes.length);

    const flowNodes = [];
    const flowEdges = [];

    // GSLB 노드 추가 (최상단 중앙 - 두 클러스터 사이)
    const gslbX = (20 + 610 + 550) / 2 - 60; // 두 클러스터 중앙
    flowNodes.push({
      id: 'gslb',
      type: 'input',
      position: { x: gslbX, y: 30 },
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

    // 클러스터 높이 계산 (계층적 레이아웃: API Gateway + frontend + 백엔드 동적 배치)
    const member1BackendCount = member1Nodes.filter(n => n.name !== 'api-gateway' && n.name !== 'frontend').length;
    const member2BackendCount = member2Nodes.filter(n => n.name !== 'api-gateway' && n.name !== 'frontend').length;
    // 백엔드 서비스 행 수 계산 (2열 그리드)
    const member1BackendRows = Math.ceil(member1BackendCount / 2);
    const member2BackendRows = Math.ceil(member2BackendCount / 2);
    // 기본 높이: API Gateway(50+35) + frontend(120+70) + 여백(50) = 325
    // 백엔드 행당 120px 추가
    const member1Height = Math.max(350, 240 + member1BackendRows * 120 + 40);
    const member2Height = Math.max(350, 240 + member2BackendRows * 120 + 40);
    
    // Member1이 비어있을 때는 Member2와 동일한 높이 사용
    const finalMember1Height = member1Nodes.length === 0 ? member2Height : member1Height;
    
    console.log('[TrafficTopology] Member1 backend count:', member1BackendCount, 'Height:', member1Height);
    console.log('[TrafficTopology] Member1 nodes:', member1Nodes.map(n => n.name));
    console.log('[TrafficTopology] Member2 backend count:', member2BackendCount, 'Height:', member2Height);
    console.log('[TrafficTopology] Member2 nodes:', member2Nodes.map(n => n.name));

    // Active 레이블 (Member1 위 중앙) - 가용성에 따라 색상 변경
    const activeLabelWidth = 120;
    const activeLabelX = 20 + (550 - activeLabelWidth) / 2; // 클러스터 중앙
    
    flowNodes.push({
      id: 'active-label',
      type: 'default',
      position: { x: activeLabelX, y: 120 },
      data: {
        label: (
          <div className="flex items-center justify-center space-x-2 px-4 py-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${isMember1Available ? 'bg-blue-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className={`font-bold text-sm ${isMember1Available ? 'text-blue-700' : 'text-red-700'}`}>ACTIVE</span>
          </div>
        ),
      },
      style: {
        backgroundColor: isMember1Available ? '#dbeafe' : '#fee2e2',
        border: isMember1Available ? '2px solid #3b82f6' : '2px solid #ef4444',
        borderRadius: '8px',
        padding: '2px',
        boxShadow: isMember1Available ? '0 2px 6px rgba(59, 130, 246, 0.3)' : '0 2px 6px rgba(239, 68, 68, 0.3)',
        width: activeLabelWidth,
      },
      draggable: false,
    });

    // Member1 클러스터 그룹 노드
    const member1Label = isMember1Available 
      ? 'Member1 Cluster (Active)' 
      : 'Member1 Cluster (Unavailable)';
    
    flowNodes.push({
      id: 'cluster-member1',
      type: 'group',
      position: { x: 20, y: 180 },
      style: {
        width: 550,
        height: finalMember1Height,
        backgroundColor: isMember1Available ? 'rgba(59, 130, 246, 0.05)' : 'rgba(239, 68, 68, 0.05)',
        border: isMember1Available ? '2px solid #3b82f6' : '2px solid #ef4444',
        borderRadius: '12px',
        padding: '20px',
      },
      data: { label: member1Label },
    });

    // Standby 레이블 (Member2 위 중앙) - 가용성에 따라 색상 변경
    const standbyLabelWidth = 120;
    const standbyLabelX = 610 + (550 - standbyLabelWidth) / 2; // 클러스터 중앙
    
    flowNodes.push({
      id: 'standby-label',
      type: 'default',
      position: { x: standbyLabelX, y: 120 },
      data: {
        label: (
          <div className="flex items-center justify-center space-x-2 px-4 py-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${isMember2Available ? 'bg-blue-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className={`font-bold text-sm ${isMember2Available ? 'text-blue-700' : 'text-red-700'}`}>STANDBY</span>
          </div>
        ),
      },
      style: {
        backgroundColor: isMember2Available ? '#dbeafe' : '#fee2e2',
        border: isMember2Available ? '2px solid #3b82f6' : '2px solid #ef4444',
        borderRadius: '8px',
        padding: '2px',
        boxShadow: isMember2Available ? '0 2px 6px rgba(59, 130, 246, 0.3)' : '0 2px 6px rgba(239, 68, 68, 0.3)',
        width: standbyLabelWidth,
      },
      draggable: false,
    });

    // Member2 클러스터 그룹 노드 (Standby) - 가용성에 따라 색상 변경
    const member2Label = isMember2Available 
      ? 'Member2 Cluster (Standby)' 
      : 'Member2 Cluster (Unavailable)';
    
    flowNodes.push({
      id: 'cluster-member2',
      type: 'group',
      position: { x: 610, y: 180 },
      style: {
        width: 550,
        height: member2Height,
        backgroundColor: isMember2Available ? 'rgba(59, 130, 246, 0.05)' : 'rgba(239, 68, 68, 0.05)',
        border: isMember2Available ? '2px solid #3b82f6' : '2px solid #ef4444',
        borderRadius: '12px',
        padding: '20px',
      },
      data: { label: member2Label },
    });

    // Member1이 비어있을 때 안내 메시지 표시
    if (member1Nodes.length === 0) {
      const msgWidth = 320;
      const msgHeight = 100;
      const centerX = (550 - msgWidth) / 2;
      const centerY = (finalMember1Height - msgHeight) / 2;
      
      if (!isMember1Available) {
        // 클러스터가 다운된 경우
        flowNodes.push({
          id: 'member1-unavailable-msg',
          type: 'default',
          position: { x: centerX, y: centerY },
          parentNode: 'cluster-member1',
          data: {
            label: (
              <div className="text-center text-gray-500">
                <div className="text-2xl mb-2">⚠️</div>
                <div className="text-xs font-semibold text-red-600">Cluster Unavailable</div>
                <div className="text-xs mt-1 text-gray-600">All nodes are NotReady</div>
              </div>
            ),
          },
          style: {
            backgroundColor: '#fee2e2',
            border: '2px dashed #ef4444',
            borderRadius: '8px',
            padding: '16px',
            width: msgWidth,
            height: msgHeight,
          },
          draggable: false,
        });
      } else {
        // 클러스터는 정상이지만 서비스가 없는 경우
        flowNodes.push({
          id: 'member1-no-services-msg',
          type: 'default',
          position: { x: centerX, y: centerY },
          parentNode: 'cluster-member1',
          data: {
            label: (
              <div className="text-center text-gray-500">
                <div className="text-xl mb-1">📦</div>
                <div className="text-xs font-semibold text-gray-600">No Services Deployed</div>
                <div className="text-xs mt-1 text-gray-500">Deploy services to {namespace} namespace</div>
              </div>
            ),
          },
          style: {
            backgroundColor: '#f9fafb',
            border: '2px dashed #d1d5db',
            borderRadius: '8px',
            padding: '12px',
            width: msgWidth,
            height: msgHeight,
          },
          draggable: false,
        });
      }
    }

    // Member1 서비스 노드들 (계층적 배치)
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
          width: 510,
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
      } else if (node.name === 'frontend') {
        // frontend는 API Gateway 바로 아래 중앙
        position = { x: 205, y: 120 };
        nodeStyle = {
          backgroundColor: getStatusBg(node.status),
          border: `2px solid ${statusColor}`,
          borderRadius: '8px',
          padding: '8px',
          width: 160,
          height: 70,
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
      } else {
        // 백엔드 서비스들 동적 배치 (api-gateway, frontend 제외한 서비스들)
        const backendServices = member1Nodes.filter(n => n.name !== 'api-gateway' && n.name !== 'frontend');
        const backendIndex = backendServices.findIndex(n => n.name === node.name);
        const totalBackend = backendServices.length;
        
        // 서비스 개수에 따라 배치 전략 결정
        if (totalBackend <= 2) {
          // 2개 이하: 한 줄에 양쪽 배치
          const col = backendIndex;
          position = { x: 30 + col * 350, y: 240 };
        } else if (totalBackend <= 4) {
          // 3~4개: 2x2 그리드 (1줄 양쪽, 2줄 중앙)
          if (backendIndex < 2) {
            position = { x: 30 + backendIndex * 350, y: 240 };
          } else {
            position = { x: 115 + (backendIndex - 2) * 190, y: 360 };
          }
        } else {
          // 5개 이상: 2열 그리드로 배치
          const col = backendIndex % 2;
          const row = Math.floor(backendIndex / 2);
          position = { x: 30 + col * 350, y: 240 + row * 120 };
        }
        
        nodeStyle = {
          backgroundColor: getStatusBg(node.status),
          border: `2px solid ${statusColor}`,
          borderRadius: '8px',
          padding: '8px',
          width: 150,
          height: 75,
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
      
      const nodeId = `${node.cluster}-${node.name}`;
      console.log('[TrafficTopology] Creating Member1 node:', nodeId, 'at position:', position);
      
      flowNodes.push({
        id: nodeId,
        type: 'default',
        position: position,
        parentNode: 'cluster-member1',
        extent: 'parent',
        data: nodeData,
        style: nodeStyle,
      });
    });

    // Member2가 비어있을 때 안내 메시지 표시
    if (member2Nodes.length === 0) {
      const msgWidth = 320;
      const msgHeight = 100;
      const centerX = (550 - msgWidth) / 2;
      const centerY = (member2Height - msgHeight) / 2;
      
      if (!isMember2Available) {
        // 클러스터가 다운된 경우
        flowNodes.push({
          id: 'member2-unavailable-msg',
          type: 'default',
          position: { x: centerX, y: centerY },
          parentNode: 'cluster-member2',
          data: {
            label: (
              <div className="text-center text-gray-500">
                <div className="text-2xl mb-2">⚠️</div>
                <div className="text-xs font-semibold text-red-600">Cluster Unavailable</div>
                <div className="text-xs mt-1 text-gray-600">All nodes are NotReady</div>
              </div>
            ),
          },
          style: {
            backgroundColor: '#fee2e2',
            border: '2px dashed #ef4444',
            borderRadius: '8px',
            padding: '16px',
            width: msgWidth,
            height: msgHeight,
          },
          draggable: false,
        });
      } else {
        // 클러스터는 정상이지만 서비스가 없는 경우
        flowNodes.push({
          id: 'member2-no-services-msg',
          type: 'default',
          position: { x: centerX, y: centerY },
          parentNode: 'cluster-member2',
          data: {
            label: (
              <div className="text-center text-gray-500">
                <div className="text-xl mb-1">📦</div>
                <div className="text-xs font-semibold text-gray-600">No Services Deployed</div>
                <div className="text-xs mt-1 text-gray-500">Deploy services to {namespace} namespace</div>
              </div>
            ),
          },
          style: {
            backgroundColor: '#f9fafb',
            border: '2px dashed #d1d5db',
            borderRadius: '8px',
            padding: '12px',
            width: msgWidth,
            height: msgHeight,
          },
          draggable: false,
        });
      }
    }

    // Member2 서비스 노드들 (계층적 배치 - Standby는 회색)
    member2Nodes.forEach((node) => {
      const statusColor = getStatusColor(node.status);
      const isHealthy = node.readyReplicas === node.replicas;
      
      let position;
      let nodeStyle;
      let nodeData;
      
      if (node.name === 'api-gateway') {
        // api-gateway는 헤더 형태 (Standby는 회색)
        position = { x: 20, y: 50 };
        nodeStyle = {
          backgroundColor: '#f3f4f6',
          border: '2px solid #9ca3af',
          borderRadius: '6px',
          padding: '6px 12px',
          width: 510,
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
      } else if (node.name === 'frontend') {
        // frontend는 API Gateway 바로 아래 중앙
        position = { x: 205, y: 120 };
        nodeStyle = {
          backgroundColor: getStatusBg(node.status),
          border: `2px solid ${statusColor}`,
          borderRadius: '8px',
          padding: '8px',
          width: 160,
          height: 70,
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
      } else {
        // 백엔드 서비스들 동적 배치 (api-gateway, frontend 제외한 서비스들)
        const backendServices = member2Nodes.filter(n => n.name !== 'api-gateway' && n.name !== 'frontend');
        const backendIndex = backendServices.findIndex(n => n.name === node.name);
        const totalBackend = backendServices.length;
        
        // 서비스 개수에 따라 배치 전략 결정
        if (totalBackend <= 2) {
          // 2개 이하: 한 줄에 양쪽 배치
          const col = backendIndex;
          position = { x: 30 + col * 350, y: 240 };
        } else if (totalBackend <= 4) {
          // 3~4개: 2x2 그리드 (1줄 양쪽, 2줄 중앙)
          if (backendIndex < 2) {
            position = { x: 30 + backendIndex * 350, y: 240 };
          } else {
            position = { x: 115 + (backendIndex - 2) * 190, y: 360 };
          }
        } else {
          // 5개 이상: 2열 그리드로 배치
          const col = backendIndex % 2;
          const row = Math.floor(backendIndex / 2);
          position = { x: 30 + col * 350, y: 240 + row * 120 };
        }
        
        nodeStyle = {
          backgroundColor: getStatusBg(node.status),
          border: `2px solid ${statusColor}`,
          borderRadius: '8px',
          padding: '8px',
          width: 150,
          height: 75,
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
      
      const nodeId = `${node.cluster}-${node.name}`;
      console.log('[TrafficTopology] Creating Member2 node:', nodeId, 'at position:', position);
      
      flowNodes.push({
        id: nodeId,
        type: 'default',
        position: position,
        parentNode: 'cluster-member2',
        extent: 'parent',
        data: nodeData,
        style: nodeStyle,
      });
    });


    // GSLB -> api-gateway 연결 추가
    member1Nodes.forEach(node => {
      if (node.name === 'api-gateway') {
        flowEdges.push({
          id: 'gslb-to-member1-apigw',
          source: 'gslb',
          target: `${node.cluster}-${node.name}`,
          sourceHandle: 'left',
          targetHandle: 'top',
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
          sourceHandle: 'right',
          targetHandle: 'top',
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

    // 엣지 생성 (크로스 클러스터 엣지 제외 - Active-Standby 구조)
    graph.edges?.forEach((edge, i) => {
      const isCrossCluster = edge.metrics.protocol === 'istio-eastwest';
      
      // Active-Standby 구조에서는 크로스 클러스터 엣지 제외
      if (isCrossCluster) return;
      
      const isInternalFlow = edge.metrics.protocol === 'http';
      
      // API Gateway에서 나가는 엣지는 target의 top handle로 연결
      const edgeConfig = {
        id: `edge-${i}`,
        source: edge.source,
        target: edge.target,
        animated: false,
        type: 'smoothstep',
        style: {
          stroke: isInternalFlow ? '#3b82f6' : '#d1d5db',
          strokeWidth: 2,
        },
        markerEnd: {
          type: 'arrowclosed',
          color: isInternalFlow ? '#3b82f6' : '#d1d5db',
        },
      };
      
      // API Gateway에서 나가는 내부 트래픽은 sourceHandle을 bottom으로 지정
      if (isInternalFlow && edge.source.includes('api-gateway')) {
        edgeConfig.sourceHandle = 'bottom';
        edgeConfig.targetHandle = 'top';
      }
      
      flowEdges.push(edgeConfig);
    });

    // 노드 목록 변경 감지 (서비스 추가/제거 시 재배치)
    const currentNodeIds = new Set(flowNodes.map(n => n.id));
    const nodeListChanged = 
      currentNodeIds.size !== previousNodeIds.size ||
      [...currentNodeIds].some(id => !previousNodeIds.has(id)) ||
      [...previousNodeIds].some(id => !currentNodeIds.has(id));
    
    // 초기 로드 또는 노드 목록 변경 시 전체 재배치
    if (isInitialLoad || nodeListChanged) {
      console.log('[TrafficTopology] Re-layouting nodes...');
      console.log('Previous:', Array.from(previousNodeIds));
      console.log('Current:', Array.from(currentNodeIds));
      
      setNodes(flowNodes);
      setEdges(flowEdges);
      setPreviousNodeIds(currentNodeIds);
      setIsInitialLoad(false);
      
      // 노드 변경 후 fitView 호출
      setTimeout(() => {
        if (reactFlowInstance.current) {
          reactFlowInstance.current.fitView({ padding: 0.1, maxZoom: 0.85, minZoom: 0.6 });
        }
      }, 100);
    } else {
      // 노드 목록이 동일하면 데이터만 업데이트 (위치 유지)
      setNodes((nds) =>
        flowNodes.map((newNode) => {
          const existingNode = nds.find((n) => n.id === newNode.id);
          if (existingNode && existingNode.position) {
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
  }, [graph, setNodes, setEdges, isInitialLoad, previousNodeIds]);

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
          fitView={shouldFitView}
          onInit={(instance) => {
            reactFlowInstance.current = instance;
            setShouldFitView(false);
          }}
          fitViewOptions={{ padding: 0.1, maxZoom: 0.85, minZoom: 0.6 }}
          attributionPosition="bottom-left"
          nodesDraggable={true}
          nodesConnectable={false}
          elementsSelectable={true}
          minZoom={0.4}
          maxZoom={1.5}
          defaultViewport={{ x: 50, y: 20, zoom: 0.75 }}
          connectionLineType="smoothstep"
          defaultEdgeOptions={{
            type: 'smoothstep',
            pathOptions: { offset: 20 }
          }}
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

    </div>
  );
}

export default TrafficTopology;
