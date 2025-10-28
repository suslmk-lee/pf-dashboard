import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

/**
 * TrafficTopology 컴포넌트
 * Istio Kiali 스타일의 트래픽 토폴로지 시각화
 */
function TrafficTopology({ deploymentName = 'frontend', namespace = 'iot-platform' }) {
  const [graph, setGraph] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  const getClusterResources = (clusterName) => {
    if (!graph?.nodes) return { deployments: [] };
    const clusterNodes = graph.nodes.filter(n => n.cluster === clusterName);
    return {
      deployments: clusterNodes.filter(n => n.type === 'deployment')
    };
  };

  const getCrossClusterEdges = () => {
    if (!graph?.edges) return [];
    return graph.edges.filter(e => e.metrics.protocol === 'istio-eastwest');
  };

  const getStatusColor = (status) => {
    if (status === 'healthy' || status === 'Running') return 'border-green-500 bg-green-50';
    if (status === 'degraded') return 'border-yellow-500 bg-yellow-50';
    return 'border-red-500 bg-red-50';
  };

  const renderCluster = (clusterName, displayName) => {
    const resources = getClusterResources(clusterName);
    
    return (
      <motion.div
        initial={{ opacity: 0, x: clusterName === 'karmada-member1-ctx' ? -50 : 50 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex-1"
      >
        <div className="border-4 border-blue-400 rounded-2xl p-6 bg-gradient-to-br from-blue-50 to-white shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-4 h-4 bg-blue-500 rounded-full animate-pulse"></div>
              <h3 className="text-xl font-bold text-gray-800">{displayName}</h3>
            </div>
            <div className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-semibold">
              {resources.deployments.length} deployments
            </div>
          </div>

          <div className="space-y-3">
            {resources.deployments.length > 0 ? (
              resources.deployments.map((deploy, index) => (
                <motion.div 
                  key={deploy.name} 
                  initial={{ scale: 0, opacity: 0 }} 
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className={`border-2 ${getStatusColor(deploy.status)} rounded-lg p-4 shadow-md hover:shadow-lg transition-shadow`}
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">📦</span>
                    <div className="flex-1">
                      <div className="font-bold text-base text-gray-800">{deploy.name}</div>
                      <div className="text-xs text-gray-600 mt-1">
                        <span className="bg-gray-100 px-2 py-0.5 rounded">{deploy.replicas} replicas</span>
                        <span className="ml-2 font-semibold">{deploy.status}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="text-center text-gray-400 py-8">
                No deployments found
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
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

  const crossClusterEdges = getCrossClusterEdges();

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Traffic Topology</h2>
          <p className="text-sm text-gray-500 mt-1">
            <span className="font-semibold text-blue-600">{namespace}</span> / <span className="font-semibold text-blue-600">{deploymentName}</span>
          </p>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span>Live Traffic</span>
        </div>
      </div>

      <div className="relative">
        <div className="flex gap-8 items-start">
          {renderCluster('karmada-member1-ctx', 'Member1 Cluster')}

          {crossClusterEdges.length > 0 && (
            <div className="flex flex-col items-center justify-center px-4">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3 }}>
                <div className="flex flex-col items-center space-y-2">
                  <motion.div animate={{ x: [0, 10, 0] }} transition={{ duration: 2, repeat: Infinity }}
                    className="text-3xl text-purple-600">→</motion.div>
                  
                  <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-lg shadow-lg">
                    <div className="text-xs font-bold text-center">⚡ East-West</div>
                    <div className="text-xs text-center">Gateway</div>
                  </div>
                  
                  <motion.div animate={{ x: [0, -10, 0] }} transition={{ duration: 2, repeat: Infinity }}
                    className="text-3xl text-purple-600">←</motion.div>
                </div>
              </motion.div>
            </div>
          )}

          {renderCluster('karmada-member2-ctx', 'Member2 Cluster')}
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="grid grid-cols-3 gap-4 text-center text-sm">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-3xl font-bold text-blue-600">{graph?.nodes?.length || 0}</div>
            <div className="text-xs text-gray-600 mt-1">Total Deployments</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-3xl font-bold text-green-600">
              {graph?.nodes?.filter(n => n.cluster === 'karmada-member1-ctx').length || 0}
            </div>
            <div className="text-xs text-gray-600 mt-1">Member1 Cluster</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <div className="text-3xl font-bold text-purple-600">{crossClusterEdges.length}</div>
            <div className="text-xs text-gray-600 mt-1">Cross-Cluster Links</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TrafficTopology;
