import React from 'react';

/**
 * PodTable 컴포넌트
 * 클러스터의 Pod 상세 정보를 테이블 형태로 표시
 */
function PodTable({ pods }) {
  if (!pods || pods.length === 0) {
    return (
      <div className="text-center py-4 text-gray-400 text-sm">
        No pods with label app=pf-dashboard
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Ready
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Restarts
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Age
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              IP
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Node
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {pods.map((pod, index) => (
            <tr key={index} className="hover:bg-gray-50">
              <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                {pod.name}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                {pod.ready}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-sm">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    pod.status === 'Running'
                      ? 'bg-green-100 text-green-800'
                      : pod.status === 'Pending'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {pod.status}
                </span>
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                {pod.restarts}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                {pod.age}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                {pod.ip}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                {pod.node}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default PodTable;
