import { useState, useEffect } from 'react';
import GlobalStatus from './components/GlobalStatus';
import TrafficFlow from './components/TrafficFlow';
import ClusterCard from './components/ClusterCard';
import EventLog from './components/EventLog';
import websocketService from './services/websocket';

/**
 * App 컴포넌트
 * 메인 대시보드 애플리케이션
 * 백엔드 WebSocket을 통해 실시간 클러스터 상태와 이벤트를 수신
 */
function App() {
  // 클러스터 상태 관리
  const [clusters, setClusters] = useState([
    {
      id: 'member1',
      name: 'Member1 Cluster',
      status: 'ready',
      pods: 2,
      region: 'Seoul',
      sessions: 5000
    },
    {
      id: 'member2',
      name: 'Member2 Cluster',
      status: 'ready',
      pods: 2,
      region: 'Seoul',
      sessions: 5000
    }
  ]);

  // 이벤트 로그 관리
  const [events, setEvents] = useState([]);

  // WebSocket 연결 상태
  const [isConnected, setIsConnected] = useState(false);

  // 디버깅: isConnected 값 변경 시 로그
  useEffect(() => {
    console.log('[App.jsx] isConnected state changed to:', isConnected);
  }, [isConnected]);

  // WebSocket 연결 및 이벤트 리스너 설정
  useEffect(() => {
    // WebSocket 서버 URL (환경 변수 또는 기본값)
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';

    // 클러스터 업데이트 리스너
    const handleClustersUpdate = (data) => {
      console.log('[App.jsx] Clusters update received:', data);
      console.log('[App.jsx] Current clusters before update:', clusters);
      setClusters(data);
      console.log('[App.jsx] setClusters called with:', data);
    };

    // 초기 이벤트 로드 리스너
    const handleEventsLoad = (data) => {
      console.log('Events loaded:', data);
      setEvents(data);
    };

    // 새 이벤트 리스너
    const handleNewEvent = (data) => {
      console.log('New event:', data);
      setEvents((prevEvents) => [...prevEvents, data]);
    };

    // 연결 상태 리스너
    const handleConnected = () => {
      console.log('[App.jsx] WebSocket connected - setting isConnected to TRUE');
      setIsConnected(true);
    };

    const handleDisconnected = () => {
      console.log('[App.jsx] WebSocket disconnected - setting isConnected to FALSE');
      setIsConnected(false);
    };

    // 리스너 등록
    websocketService.on('clusters', handleClustersUpdate);
    websocketService.on('events', handleEventsLoad);
    websocketService.on('event', handleNewEvent);
    websocketService.on('connected', handleConnected);
    websocketService.on('disconnected', handleDisconnected);

    // WebSocket 연결
    websocketService.connect(wsUrl);

    // 클린업
    return () => {
      websocketService.off('clusters', handleClustersUpdate);
      websocketService.off('events', handleEventsLoad);
      websocketService.off('event', handleNewEvent);
      websocketService.off('connected', handleConnected);
      websocketService.off('disconnected', handleDisconnected);
      websocketService.disconnect();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50">
      {/* 전체 서비스 상태 패널 (최상단 고정) */}
      <GlobalStatus />

      {/* 메인 컨테이너 */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* GSLB 트래픽 흐름 시각화 */}
        <TrafficFlow clusters={clusters} />

        {/* 클러스터 카드 섹션 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {clusters.map((cluster) => (
            <ClusterCard key={cluster.id} cluster={cluster} />
          ))}
        </div>

        {/* 이벤트 로그 패널 */}
        <EventLog events={events} />

        {/* 푸터 정보 */}
        <div className="mt-8 text-center text-gray-400 text-sm">
          <p className="font-medium">Karmada Multi-Cluster Dashboard | PlugFest Demo</p>
          <div className="mt-2 flex items-center justify-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span>{isConnected ? 'Connected to Backend' : 'Disconnected - Attempting to reconnect...'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
