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

  // GSLB와 클러스터 위치 (픽셀 단위)
  const gslbPos = { x: 400, y: 50 };
  const clusterPositions = {
    member1: { x: 200, y: 200 },
    member2: { x: 600, y: 200 }
  };

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
    <div className="relative w-full h-64 bg-white/50 backdrop-blur-sm rounded-2xl my-6 border border-gray-200 overflow-hidden flex items-center justify-center">
      <svg width="800" height="256" viewBox="0 0 800 256" className="block">
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
              opacity={isFailure ? 0.3 : 0.4}
            />
          );
        })}

        {/* 애니메이션 파티클 (SVG 내부) */}
        {particles.map((particle) => (
          <motion.circle
            key={particle.id}
            r="4"
            fill="#3b82f6"
            initial={{
              cx: particle.start.x,
              cy: particle.start.y,
              opacity: 0
            }}
            animate={{
              cx: particle.end.x,
              cy: particle.end.y,
              opacity: [0, 1, 1, 0]
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
                y={pos.y - 45}
                fill="#1d1d1f"
                fontSize="12"
                fontWeight="600"
                textAnchor="middle"
              >
                {cluster.name}
              </text>
              {!isFailure && (
                <text
                  x={pos.x}
                  y={pos.y + 50}
                  fill="#666"
                  fontSize="11"
                  fontWeight="500"
                  textAnchor="middle"
                >
                  ~{cluster.sessions.toLocaleString()} sessions
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default TrafficFlow;
