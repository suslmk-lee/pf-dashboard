package eventlog

import (
	"sync"
	"time"
)

// Event 구조체 정의
type Event struct {
	Type      string    `json:"type"`      // info, critical, auto, success
	Message   string    `json:"message"`   // 이벤트 메시지
	Timestamp string    `json:"timestamp"` // 타임스탬프
	CreatedAt time.Time `json:"-"`         // 정렬용 (JSON 응답에는 포함 안됨)
}

// EventLog는 In-Memory 이벤트 로그를 관리
type EventLog struct {
	events   []Event
	maxSize  int
	mu       sync.RWMutex
	watchers []chan Event
}

// NewEventLog 새로운 이벤트 로그 생성
func NewEventLog(maxSize int) *EventLog {
	return &EventLog{
		events:   make([]Event, 0, maxSize),
		maxSize:  maxSize,
		watchers: make([]chan Event, 0),
	}
}

// AddEvent 이벤트 추가
func (el *EventLog) AddEvent(eventType, message string) {
	el.mu.Lock()
	defer el.mu.Unlock()

	event := Event{
		Type:      eventType,
		Message:   message,
		Timestamp: time.Now().Format("15:04:05"),
		CreatedAt: time.Now(),
	}

	// 최대 크기 초과 시 오래된 이벤트 제거
	if len(el.events) >= el.maxSize {
		el.events = el.events[1:]
	}

	el.events = append(el.events, event)

	// 모든 watcher에게 이벤트 전달
	for _, watcher := range el.watchers {
		select {
		case watcher <- event:
		default:
			// 버퍼가 가득 찬 경우 스킵
		}
	}
}

// GetEvents 모든 이벤트 조회
func (el *EventLog) GetEvents() []Event {
	el.mu.RLock()
	defer el.mu.RUnlock()

	// 복사본 반환
	events := make([]Event, len(el.events))
	copy(events, el.events)
	return events
}

// Watch 이벤트 변경 감지 채널 등록
func (el *EventLog) Watch() chan Event {
	el.mu.Lock()
	defer el.mu.Unlock()

	watcher := make(chan Event, 10)
	el.watchers = append(el.watchers, watcher)
	return watcher
}

// Unwatch 이벤트 감시 해제
func (el *EventLog) Unwatch(watcher chan Event) {
	el.mu.Lock()
	defer el.mu.Unlock()

	for i, w := range el.watchers {
		if w == watcher {
			close(w)
			el.watchers = append(el.watchers[:i], el.watchers[i+1:]...)
			break
		}
	}
}
