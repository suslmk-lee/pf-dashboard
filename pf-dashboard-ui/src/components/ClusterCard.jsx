import React, { useState } from 'react';
import NodeTable from './NodeTable';
import PodTable from './PodTable';

/**
 * ClusterCard 컴포넌트
 * 개별 클러스터의 상태 정보를 표시하는 카드
 * 평시: 녹색 테두리로 안정적인 상태 표시
 * 장애 시: 붉은색 오버레이와 CRITICAL FAILURE 표시, 내부 텍스트 회색 처리
 */
const ClusterCard = ({ cluster }) => {
  const isFailure = cluster.status === 'failure';
  const [showNodes, setShowNodes] = useState(true);
  const [showPods, setShowPods] = useState(true);

  // 상태에 따른 스타일 정의
  const borderColor = isFailure ? 'border-red-500' : 'border-green-500';
  const bgColor = 'bg-white/80';
  const textColor = isFailure ? 'text-gray-400' : 'text-gray-900';

  return (
    <div
      className={`relative ${bgColor} backdrop-blur-xl ${borderColor} border-2 rounded-2xl p-6 shadow-lg transition-all duration-500`}
    >
      {/* 장애 시 붉은색 오버레이 */}
      {isFailure && (
        <div className="absolute inset-0 bg-red-500/20 rounded-2xl flex items-center justify-center z-10 animate-pulse-red">
          <div className="text-center">
            <div className="text-6xl mb-2">⚠️</div>
            <div className="text-2xl font-bold text-red-600 drop-shadow-sm">
              Critical Failure
            </div>
          </div>
        </div>
      )}

      {/* 클러스터 정보 */}
      <div className={`relative z-0 ${textColor}`}>
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center space-x-3">
            <h3 className="text-2xl font-semibold">{cluster.name}</h3>
            {/* 상태 아이콘 */}
            <div className={`w-4 h-4 rounded-full ${isFailure ? 'bg-red-500' : 'bg-green-500'} shadow-lg`}></div>
          </div>
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <span>Pods: <span className="font-semibold">{cluster.pods}</span></span>
          </div>
        </div>

        {/* Failover 표시 (member2에서만, 장애 시) */}
        {cluster.id === 'member2' && isFailure === false && cluster.pods > 2 && (
          <div className="mb-4 p-3 bg-orange-100 border border-orange-300 rounded-xl">
            <div className="flex items-center space-x-2">
              <span className="text-xl">🔄</span>
              <span className="text-sm font-semibold text-orange-700">
                Failover Active - Handling increased load
              </span>
            </div>
          </div>
        )}

        {/* Nodes Section */}
        <div className="mb-4">
          <button
            onClick={() => setShowNodes(!showNodes)}
            className="w-full flex items-center justify-between py-2 px-3 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <span className="font-semibold text-gray-700">
              Nodes ({cluster.nodes?.length || 0})
            </span>
            <svg
              className={`w-5 h-5 transform transition-transform ${showNodes ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showNodes && (
            <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
              <NodeTable nodes={cluster.nodes} />
            </div>
          )}
        </div>

        {/* Pods Section */}
        <div>
          <button
            onClick={() => setShowPods(!showPods)}
            className="w-full flex items-center justify-between py-2 px-3 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <span className="font-semibold text-gray-700">
              Pods ({cluster.podList?.length || 0})
            </span>
            <svg
              className={`w-5 h-5 transform transition-transform ${showPods ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showPods && (
            <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
              <PodTable pods={cluster.podList} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClusterCard;
