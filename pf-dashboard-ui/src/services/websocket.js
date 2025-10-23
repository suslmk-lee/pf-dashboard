/**
 * WebSocket 서비스
 * 백엔드와 실시간 통신을 담당
 */
class WebSocketService {
  constructor() {
    this.ws = null;
    this.reconnectInterval = null;
    this.reconnectDelay = 3000; // 3초 후 재연결
    this.listeners = {
      clusters: [],
      events: [],
      event: [],
      connected: [],
      disconnected: []
    };
  }

  /**
   * WebSocket 연결
   * @param {string} url - WebSocket 서버 URL
   */
  connect(url) {
    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.clearReconnectInterval();
        this.notifyListeners('connected', { connected: true });
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('[WebSocket] Message received:', message);
          console.log('[WebSocket] Message type:', message.type);
          console.log('[WebSocket] Message data:', message.data);
          console.log('[WebSocket] Listeners for this type:', this.listeners[message.type]?.length || 0);

          // 메시지 타입별로 리스너에게 전달
          if (this.listeners[message.type]) {
            this.notifyListeners(message.type, message.data);
          } else {
            console.warn('[WebSocket] No listeners registered for type:', message.type);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.notifyListeners('disconnected', { connected: false });
        this.scheduleReconnect(url);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      this.scheduleReconnect(url);
    }
  }

  /**
   * WebSocket 연결 해제
   */
  disconnect() {
    this.clearReconnectInterval();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * 재연결 스케줄링
   * @param {string} url - WebSocket 서버 URL
   */
  scheduleReconnect(url) {
    this.clearReconnectInterval();
    this.reconnectInterval = setTimeout(() => {
      console.log('Attempting to reconnect WebSocket...');
      this.connect(url);
    }, this.reconnectDelay);
  }

  /**
   * 재연결 타이머 클리어
   */
  clearReconnectInterval() {
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }
  }

  /**
   * 이벤트 리스너 등록
   * @param {string} type - 이벤트 타입 (clusters, events, event, connected, disconnected)
   * @param {Function} callback - 콜백 함수
   */
  on(type, callback) {
    if (this.listeners[type]) {
      this.listeners[type].push(callback);
    }
  }

  /**
   * 이벤트 리스너 제거
   * @param {string} type - 이벤트 타입
   * @param {Function} callback - 콜백 함수
   */
  off(type, callback) {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter(cb => cb !== callback);
    }
  }

  /**
   * 리스너들에게 알림
   * @param {string} type - 이벤트 타입
   * @param {*} data - 전달할 데이터
   */
  notifyListeners(type, data) {
    if (this.listeners[type]) {
      console.log(`[WebSocket] Notifying ${this.listeners[type].length} listeners for type: ${type}`);
      this.listeners[type].forEach((callback, index) => {
        try {
          console.log(`[WebSocket] Calling listener ${index} for type: ${type}`);
          callback(data);
          console.log(`[WebSocket] Listener ${index} completed successfully`);
        } catch (error) {
          console.error(`Error in ${type} listener ${index}:`, error);
        }
      });
    }
  }

  /**
   * 메시지 전송 (필요 시)
   * @param {*} data - 전송할 데이터
   */
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket is not connected');
    }
  }
}

// Singleton 인스턴스 export
export default new WebSocketService();
