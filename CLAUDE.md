# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Karmada Multi-Cluster Dashboard** (PlugFest Demo) - a real-time monitoring dashboard for demonstrating Kubernetes multi-cluster failover scenarios. The project consists of two main components:

- **pf-dashboard-api**: Go-based backend API server with WebSocket support
- **pf-dashboard-ui**: React-based frontend dashboard with real-time visualization

## Architecture

The system demonstrates automatic failover in a multi-cluster environment:

```
Frontend (React + WebSocket)
    ↓
Backend API (Go + gorilla/websocket)
    ↓
Kubernetes API (client-go)
    ↓
Multi-Cluster Environment (Karmada)
```

**Key Communication Pattern:**
- Backend polls Kubernetes API every 5 seconds (see `pf-dashboard-api/main.go:32-43`)
- Backend pushes updates via WebSocket to all connected clients
- Frontend receives real-time cluster status and event updates
- WebSocket auto-reconnects on connection loss (3-second interval)

## Common Development Commands

### Backend (Go API)

**Location:** `pf-dashboard-api/`

```bash
# Install dependencies
go mod download

# Run locally
go run main.go

# Build
go build -o pf-dashboard-api

# Docker build
docker build -t pf-dashboard-backend:latest .

# Docker run
docker run -d -p 8080:8080 -v ~/.kube/config:/root/.kube/config --name pf-dashboard-backend pf-dashboard-backend:latest
```

**Environment Variables:**
- `PORT`: Server port (default: 8080)
- `APP_NAMESPACE`: Kubernetes namespace to monitor (default: default)
- `KUBECONFIG`: Path to kubeconfig file (default: ~/.kube/config)

### Frontend (React + Vite)

**Location:** `pf-dashboard-ui/`

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Docker build
docker build -t karmada-dashboard:latest .

# Docker run
docker run -d -p 8080:80 --name karmada-dashboard karmada-dashboard:latest
```

**Environment Variables:**
- Create `.env` file based on `.env.example`
- `VITE_WS_URL`: WebSocket URL (default: ws://localhost:8080/ws)

## Code Architecture

### Backend Structure

**Entry Point:** `pf-dashboard-api/main.go`
- Initializes event log system (stores last 100 events in-memory)
- Creates multi-cluster monitor
- Starts background goroutine for 5-second Kubernetes polling
- Sets up WebSocket handler and health check endpoint

**Key Packages:**
- `internal/monitor/`: Cluster monitoring logic
  - `cluster.go`: Single cluster monitoring
  - `multi_cluster.go`: Multi-cluster coordination and watcher pattern
  - `interface.go`: Monitor interface definition
- `internal/handlers/`: HTTP/WebSocket handlers
  - `websocket.go`: WebSocket connection management and message broadcasting
- `internal/eventlog/`: In-memory event log (circular buffer, max 100 events)

**Important Patterns:**
- **Watcher Pattern**: `multi_cluster.go` maintains a list of WebSocket clients and broadcasts cluster updates to all watchers
- **Stateless Design**: Events stored in-memory only (lost on restart)
- **Background Polling**: 5-second ticker checks cluster status continuously

### Frontend Structure

**Entry Point:** `pf-dashboard-ui/src/main.jsx` → `App.jsx`

**Key Components:**
- `GlobalStatus.jsx`: Top banner showing overall service status (always "OPERATIONAL" during demo)
- `TrafficFlow.jsx`: Animated GSLB traffic flow visualization with particle effects
- `ClusterCard.jsx`: Individual cluster status cards with dramatic failure overlays
- `EventLog.jsx`: Real-time event timeline with timestamps
- `NodeTable.jsx`: Node information display
- `PodTable.jsx`: Pod information display

**WebSocket Service:** `services/websocket.js`
- Singleton pattern for WebSocket connection management
- Event emitter pattern for message distribution
- Automatic reconnection with 3-second delay
- Message types: `clusters`, `events`, `event`, `connected`, `disconnected`

**State Management:**
- No external state library used
- React `useState` for component-level state
- WebSocket service acts as event bus between backend and components

## Demo Scenario Logic

The dashboard demonstrates an automated disaster recovery scenario:

**T+0s (Initial State):**
- All clusters operational (Member1 and Member2)
- Each cluster: 2 pods, ready status
- Traffic evenly distributed (5,000 sessions each)

**T+10s (Disaster Occurs):**
- One cluster (e.g., Naver Cloud) fails
- Karmada triggers automatic failover
- All traffic redirected to healthy cluster (e.g., NHN Cloud)
- Healthy cluster auto-scales to 4 pods
- **Service remains OPERATIONAL** (zero downtime)

This logic is handled in the backend monitor and reflected in real-time through WebSocket updates.

## Important Implementation Details

**WebSocket Message Format:**
```json
{
  "type": "clusters|events|event",
  "data": [...],
  "timestamp": "2025-10-22T12:00:00Z"
}
```

**Cluster Data Structure:**
```json
{
  "id": "member1",
  "name": "Member1 Cluster",
  "status": "ready|failed|degraded",
  "pods": 2,
  "region": "Seoul",
  "sessions": 5000
}
```

**Event Types:**
- `info`: General information
- `critical`: Critical failures
- `auto`: Automated recovery actions
- `success`: Successful operations

## Kubernetes Deployment Notes

The backend requires RBAC permissions to read pods and nodes:
- ServiceAccount: `pf-dashboard-backend`
- ClusterRole: Read access to pods and nodes
- ClusterRoleBinding: Binds role to service account

For Karmada multi-cluster deployment, PropagationPolicy is used to distribute workloads across member clusters with weighted replica scheduling.

## Technology Stack

**Backend:**
- Go 1.21+
- gorilla/websocket for WebSocket
- k8s.io/client-go for Kubernetes API
- rs/cors for CORS handling

**Frontend:**
- React 18
- Vite (build tool)
- Tailwind CSS (styling)
- Framer Motion (animations)
- Native WebSocket API

**Containerization:**
- Backend: Multi-stage Docker build (Go → Alpine)
- Frontend: Multi-stage Docker build (Node → Nginx Alpine)
