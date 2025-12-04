import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

/**
 * TrafficFlow 컴포넌트
 * GSLB에서 각 클러스터로 향하는 트래픽 흐름을 시각화
 * 파티클 애니메이션으로 트래픽이 실제로 흐르는 것처럼 표현
 * 장애 시 해당 클러스터로의 연결이 중단됨
 */
const TrafficFlow = ({ clusters }) => {
  const [particles, setParticles] = useState([]);
  const [gslbInfo, setGslbInfo] = useState(null);
  const [activeTab, setActiveTab] = useState('gslb'); // 'gslb' or 'member1' or 'member2'

  // GSLB와 클러스터 위치 (픽셀 단위)
  const gslbPos = { x: 300, y: 100 };
  const clusterPositions = {
    member1: { x: 100, y: 280 },
    member2: { x: 500, y: 280 }
  };

  // GSLB 정보 가져오기
  useEffect(() => {
    const fetchGSLBInfo = async () => {
      try {
        const gslbName = import.meta.env.VITE_GSLB_NAME || 'karmada';
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
        const response = await fetch(`${apiUrl}/api/gslb/info?name=${gslbName}`);
        
        if (response.ok) {
          const data = await response.json();
          console.log('[TrafficFlow] GSLB info:', data);
          setGslbInfo(data);
        }
      } catch (err) {
        console.error('[TrafficFlow] Failed to fetch GSLB info:', err);
      }
    };

    fetchGSLBInfo();
    const interval = setInterval(fetchGSLBInfo, 30000); // 30초마다 갱신
    return () => clearInterval(interval);
  }, []);

  // 파티클 생성
  useEffect(() => {
    const interval = setInterval(() => {
      const newParticles = [];

      clusters.forEach((cluster) => {
        if (cluster.status !== 'failure') {
          const targetPos = clusterPositions[cluster.id];
          if (!targetPos) return; // 위치 정보가 없으면 스킵

          const particleCount = cluster.id === 'member2' && cluster.pods > 2 ? 3 : 2;

          for (let i = 0; i < particleCount; i++) {
            newParticles.push({
              id: `${cluster.id}-${Date.now()}-${i}`,
              clusterId: cluster.id,
              start: gslbPos,
              end: targetPos,
              delay: i * 0.15
            });
          }
        }
      });

      setParticles(newParticles);
    }, 1000);

    return () => clearInterval(interval);
  }, [clusters]);

  return (
    <div className="bg-white rounded-2xl my-6 border border-gray-200 shadow-lg">
      <div className="flex">
        {/* 왼쪽: 그래프 */}
        <div className="w-1/2 relative h-96 flex items-center justify-center border-r border-gray-200">
          <svg width="100%" height="100%" viewBox="0 0 600 400" className="block" preserveAspectRatio="xMidYMid meet">
        {/* 트래픽 라인 (배경) */}
        {clusters.map((cluster) => {
          const isFailure = cluster.status === 'failure';
          const targetPos = clusterPositions[cluster.id];
          if (!targetPos) return null; // 위치 정보가 없으면 스킵

          const strokeColor = isFailure ? '#ef4444' : '#d1d5db';

          return (
            <line
              key={cluster.id}
              x1={gslbPos.x}
              y1={gslbPos.y}
              x2={targetPos.x}
              y2={targetPos.y}
              stroke={strokeColor}
              strokeWidth="2"
              strokeDasharray={isFailure ? '5 5' : '0'}
              opacity={isFailure ? 0.3 : 1}
            />
          );
        })}

        {/* 애니메이션 파티클 (SVG 내부) */}
        {particles.map((particle) => (
          <motion.circle
            key={particle.id}
            r="4"
            fill="#3b82f6"
            opacity="1"
            initial={{
              cx: particle.start.x,
              cy: particle.start.y
            }}
            animate={{
              cx: particle.end.x,
              cy: particle.end.y
            }}
            transition={{
              duration: 1.5,
              delay: particle.delay,
              ease: 'easeInOut'
            }}
            style={{
              filter: 'drop-shadow(0 0 4px rgba(59, 130, 246, 0.8))'
            }}
          />
        ))}

        {/* GSLB 노드 */}
        <g>
          <circle
            cx={gslbPos.x}
            cy={gslbPos.y}
            r="35"
            fill="#007aff"
            filter="drop-shadow(0 4px 6px rgba(0, 122, 255, 0.3))"
          />
          <text
            x={gslbPos.x}
            y={gslbPos.y + 5}
            fill="#ffffff"
            fontSize="14"
            fontWeight="600"
            textAnchor="middle"
          >
            GSLB
          </text>
        </g>

        {/* 클러스터 노드 */}
        {clusters.map((cluster) => {
          const isFailure = cluster.status === 'failure';
          const pos = clusterPositions[cluster.id];
          const fillColor = isFailure ? '#ef4444' : '#34c759';

          return (
            <g key={cluster.id}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r="30"
                fill={fillColor}
                opacity={isFailure ? 0.5 : 1}
                filter={!isFailure ? `drop-shadow(0 4px 6px rgba(52, 199, 89, 0.3))` : 'none'}
              />
              <text
                x={pos.x}
                y={pos.y - 50}
                fill="#333"
                fontSize="14"
                fontWeight="600"
                textAnchor="middle"
              >
                {cluster.name}
              </text>
            </g>
          );
        })}
      </svg>
        </div>

        {/* 오른쪽: 정보 패널 */}
        <div className="w-1/2 flex flex-col">
          {/* 탭 헤더 */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('gslb')}
              className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors ${
                activeTab === 'gslb'
                  ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              🌐 GSLB Info
            </button>
            <button
              onClick={() => setActiveTab('member1')}
              className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors ${
                activeTab === 'member1'
                  ? 'bg-green-50 text-green-600 border-b-2 border-green-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              📍 Member1
            </button>
            <button
              onClick={() => setActiveTab('member2')}
              className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors ${
                activeTab === 'member2'
                  ? 'bg-green-50 text-green-600 border-b-2 border-green-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              📍 Member2
            </button>
          </div>

          {/* 탭 컨텐츠 */}
          <div className="flex-1 p-6 overflow-y-auto" style={{ maxHeight: '360px' }}>
            {/* GSLB 정보 */}
            {activeTab === 'gslb' && gslbInfo && (
              <div>
                <div className="text-lg font-bold mb-4" style={{ color: '#000000' }}>
                  🌐 {gslbInfo.gslbName}
                </div>
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="font-bold text-gray-700">Domain</div>
                    <div className="text-gray-900 break-all bg-gray-50 p-2 rounded mt-1">
                      {gslbInfo.gslbDomain}
                    </div>
                  </div>
                  <div>
                    <div className="font-bold text-gray-700">Routing Rule</div>
                    <div className="text-gray-900 bg-gray-50 p-2 rounded mt-1">
                      {gslbInfo.gslbRoutingRule}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="font-bold text-gray-700">TTL</div>
                      <div className="text-gray-900 bg-gray-50 p-2 rounded mt-1">
                        {gslbInfo.gslbTtl}s
                      </div>
                    </div>
                    <div>
                      <div className="font-bold text-gray-700">Pools</div>
                      <div className="text-gray-900 bg-gray-50 p-2 rounded mt-1">
                        {gslbInfo.connectedPoolList?.length || 0}
                      </div>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-gray-200">
                    <span className={`text-sm font-bold px-3 py-1 rounded ${
                      gslbInfo.gslbDisabled ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                    }`}>
                      {gslbInfo.gslbDisabled ? '✗ DISABLED' : '✓ ENABLED'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Member1 클러스터 정보 */}
            {activeTab === 'member1' && gslbInfo && (
              <div>
                <div className="text-lg font-bold mb-4" style={{ color: '#000000' }}>
                  📍 Member1 Cluster
                </div>
                <div className="space-y-4">
                  {gslbInfo.connectedPoolList?.map((connectedPool, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="font-bold text-gray-900 mb-3">🌐 {connectedPool.pool.poolName}</div>
                      {connectedPool.pool.endpointList?.map((endpoint, epIndex) => (
                        <div key={epIndex} className="mb-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                          <div className="font-mono text-xs break-all p-2 rounded bg-blue-50 text-gray-900 font-semibold mb-2">
                            {endpoint.endpointAddress}
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className={`font-bold px-2 py-1 rounded ${
                              endpoint.endpointDisabled ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-600'
                            }`}>
                              {endpoint.endpointDisabled ? '✗ DISABLED' : '✓ ENABLED'}
                            </span>
                            <span className="text-gray-700 font-semibold">
                              Weight: {endpoint.endpointWeight}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Member2 클러스터 정보 */}
            {activeTab === 'member2' && gslbInfo && (
              <div>
                <div className="text-lg font-bold mb-4" style={{ color: '#000000' }}>
                  📍 Member2 Cluster
                </div>
                <div className="space-y-4">
                  {gslbInfo.connectedPoolList?.map((connectedPool, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="font-bold text-gray-900 mb-3">🌐 {connectedPool.pool.poolName}</div>
                      {connectedPool.pool.endpointList?.map((endpoint, epIndex) => (
                        <div key={epIndex} className="mb-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                          <div className="font-mono text-xs break-all p-2 rounded bg-blue-50 text-gray-900 font-semibold mb-2">
                            {endpoint.endpointAddress}
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className={`font-bold px-2 py-1 rounded ${
                              endpoint.endpointDisabled ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-600'
                            }`}>
                              {endpoint.endpointDisabled ? '✗ DISABLED' : '✓ ENABLED'}
                            </span>
                            <span className="text-gray-700 font-semibold">
                              Weight: {endpoint.endpointWeight}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrafficFlow;
