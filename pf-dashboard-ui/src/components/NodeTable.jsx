import React from 'react';

/**
 * NodeTable 컴포넌트
 * 클러스터의 노드 상세 정보를 테이블 형태로 표시
 */
function NodeTable({ nodes }) {
  if (!nodes || nodes.length === 0) {
    return (
      <div className="text-center py-4 text-gray-400 text-sm">
        No nodes available
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
              Status
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Roles
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Age
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Version
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Internal-IP
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              OS-Image
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Kernel-Version
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Container-Runtime
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {nodes.map((node, index) => (
            <tr key={index} className="hover:bg-gray-50">
              <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                {node.name}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-sm">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    node.status === 'Ready'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {node.status}
                </span>
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                {node.roles}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                {node.age}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                {node.version}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                {node.internalIP}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                {node.osImage}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                {node.kernelVersion}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                {node.containerRuntime}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default NodeTable;
