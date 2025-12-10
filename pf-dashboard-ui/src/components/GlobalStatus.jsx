import React from 'react';

/**
 * GlobalStatus 컴포넌트
 * 전체 서비스 상태를 표시하는 최상단 패널
 * K-PaaS 로고와 함께 시나리오 내내 항상 "OPERATIONAL" 상태를 유지하여
 * 인프라 장애에도 불구하고 서비스는 중단되지 않음을 강조
 */
const GlobalStatus = () => {
  return (
    <div className="bg-white/80 backdrop-blur-xl border-b border-gray-200 py-4 px-8 shadow-sm">
      <div className="max-w-7xl mx-auto">
        {/* 헤더: 한 줄로 통합 */}
        <div className="flex items-center justify-between">
          {/* 좌측: K-PaaS 로고 */}
          <div className="flex items-center space-x-3">
            <svg width="36" height="36" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="100" height="100" rx="8" fill="#1DB489"/>
              <path d="M30 30 L50 50 L30 70 M45 30 L65 50 L45 70" stroke="white" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div>
              <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                K-PaaS
              </h1>
              <p className="text-xs text-gray-500 -mt-1">Multi-Cluster Dashboard</p>
            </div>
          </div>

          {/* 중앙: 제목 */}
          <div className="text-center">
            <h2 className="text-xl font-semibold tracking-tight text-gray-900">
              이중화 관제 시스템
            </h2>
            <p className="text-xs text-gray-500">
              Real-time cluster status and failover demonstration
            </p>
          </div>

          {/* 우측: 상태 표시 */}
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 rounded-full bg-green-500 shadow-lg animate-pulse"></div>
            <div>
              <p className="text-sm text-gray-600 font-medium">Service Status</p>
              <p className="text-lg font-semibold text-green-600">Operational</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GlobalStatus;
