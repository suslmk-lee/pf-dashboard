import React from 'react';

/**
 * EventLog 컴포넌트
 * 실시간 이벤트를 타임스탬프와 함께 표시하는 로그 패널
 * 시스템의 상태 변화를 시간순으로 기록하여 스토리텔링 강화
 */
const EventLog = ({ events }) => {
  // 이벤트 타입별 색상
  const getEventColor = (type) => {
    switch (type) {
      case 'info':
        return 'text-blue-600';
      case 'critical':
        return 'text-red-600';
      case 'auto':
        return 'text-purple-600';
      case 'success':
        return 'text-green-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg p-6 max-h-96 overflow-y-auto border border-gray-200">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Event Log
      </h2>

      <div className="space-y-2">
        {events.length === 0 ? (
          <div className="text-gray-400 text-center py-8 text-sm">
            No events recorded yet...
          </div>
        ) : (
          events.map((event, index) => (
            <div
              key={index}
              className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0"
            >
              <span className="text-gray-400 text-xs font-mono mt-0.5 w-16 flex-shrink-0">
                {event.timestamp}
              </span>
              <span className={`font-medium text-xs uppercase w-16 flex-shrink-0 mt-0.5 ${getEventColor(event.type)}`}>
                {event.type}
              </span>
              <p className="text-gray-700 text-sm flex-1">
                {event.message}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default EventLog;
