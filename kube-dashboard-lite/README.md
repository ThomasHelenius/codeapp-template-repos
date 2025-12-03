# kube-dashboard-lite

<div align="center">

**Minimalist Kubernetes dashboard - single binary, zero dependencies**

[![Go Version](https://img.shields.io/badge/Go-1.21+-00ADD8?logo=go)](https://go.dev/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://hub.docker.com)

[Quick Start](#quick-start) • [Features](#features) • [Configuration](#configuration) • [Deployment](#deployment)

</div>

---

## Why kube-dashboard-lite?

The official Kubernetes Dashboard is powerful but complex - it requires certificates, authentication setup, and multiple components. Sometimes you just need a quick way to see what's running.

**kube-dashboard-lite** is:
- **Single binary** - No dependencies, no setup, just run it
- **Read-only by default** - Safe to use in production
- **Real-time** - Live updates via Server-Sent Events
- **Lightweight** - <15MB binary, minimal resource usage
- **Secure** - Uses your existing kubeconfig, no extra auth layer

## Quick Start

### Download

```bash
# macOS (Apple Silicon)
curl -L https://github.com/yourorg/kube-dashboard-lite/releases/latest/download/kdl-darwin-arm64 -o kdl
chmod +x kdl

# macOS (Intel)
curl -L https://github.com/yourorg/kube-dashboard-lite/releases/latest/download/kdl-darwin-amd64 -o kdl
chmod +x kdl

# Linux
curl -L https://github.com/yourorg/kube-dashboard-lite/releases/latest/download/kdl-linux-amd64 -o kdl
chmod +x kdl

# Or use Docker
docker pull yourorg/kube-dashboard-lite
```

### Run

```bash
# Use default kubeconfig (~/.kube/config)
./kdl

# Specify kubeconfig
./kdl --kubeconfig /path/to/kubeconfig

# Use specific context
./kdl --context my-cluster

# Enable write operations (restart, delete)
./kdl --write-mode

# Custom port
./kdl --port 9090
```

Open http://localhost:8080 in your browser.

## Features

### Dashboard View

![Dashboard Screenshot](docs/screenshot.png)

- **Pods** - Status, restarts, age, resource usage
- **Deployments** - Replicas, available/ready status
- **Services** - Type, cluster IP, ports, endpoints
- **Events** - Real-time cluster events stream

### Live Log Streaming

Stream logs from any pod in real-time:

```bash
# Via API
curl http://localhost:8080/api/pods/default/my-pod/logs?follow=true
```

Or click any pod in the UI to view logs.

### Real-Time Updates

The dashboard uses Server-Sent Events (SSE) to push updates:

```javascript
const events = new EventSource('/api/events/stream');
events.onmessage = (e) => console.log(JSON.parse(e.data));
```

### Write Operations (Optional)

Enable with `--write-mode` flag:

- **Restart deployments** - Rolling restart
- **Delete pods** - Remove individual pods
- **Scale deployments** - Adjust replica count

```bash
# Restart a deployment
curl -X POST http://localhost:8080/api/deployments/default/my-app/restart

# Delete a pod
curl -X DELETE http://localhost:8080/api/pods/default/my-pod

# Scale deployment
curl -X POST http://localhost:8080/api/deployments/default/my-app/scale \
  -d '{"replicas": 3}'
```

## API Reference

### Pods

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pods` | GET | List all pods (all namespaces) |
| `/api/pods/:namespace` | GET | List pods in namespace |
| `/api/pods/:namespace/:name` | GET | Get pod details |
| `/api/pods/:namespace/:name` | DELETE | Delete pod (write-mode) |
| `/api/pods/:namespace/:name/logs` | GET | Get pod logs |

**Log query parameters:**
- `container` - Container name (default: first container)
- `follow` - Stream logs (SSE)
- `tail` - Number of lines (default: 100)
- `previous` - Get previous container logs

### Deployments

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/deployments` | GET | List all deployments |
| `/api/deployments/:namespace` | GET | List deployments in namespace |
| `/api/deployments/:namespace/:name` | GET | Get deployment details |
| `/api/deployments/:namespace/:name/restart` | POST | Rolling restart (write-mode) |
| `/api/deployments/:namespace/:name/scale` | POST | Scale replicas (write-mode) |

### Services

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/services` | GET | List all services |
| `/api/services/:namespace` | GET | List services in namespace |
| `/api/services/:namespace/:name` | GET | Get service details |

### Events

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/events` | GET | List recent events |
| `/api/events/:namespace` | GET | List events in namespace |
| `/api/events/stream` | GET | Stream events (SSE) |

### Health

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/ready` | GET | Readiness (cluster connected) |

## Configuration

### Command Line Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | 8080 | Port to listen on |
| `--host` | localhost | Host to bind to |
| `--kubeconfig` | ~/.kube/config | Path to kubeconfig |
| `--context` | (current) | Kubernetes context to use |
| `--write-mode` | false | Enable write operations |
| `--version` | - | Show version |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `KUBECONFIG` | Path to kubeconfig file |
| `KDL_PORT` | Port to listen on |
| `KDL_HOST` | Host to bind to |
| `KDL_WRITE_MODE` | Enable write mode (true/false) |

## Deployment

### Local Development

```bash
# Run directly
./kdl

# Or with go run
go run ./cmd/kdl
```

### Docker

```bash
# Run with mounted kubeconfig
docker run -p 8080:8080 \
  -v ~/.kube/config:/root/.kube/config:ro \
  yourorg/kube-dashboard-lite

# Or mount specific kubeconfig
docker run -p 8080:8080 \
  -v /path/to/kubeconfig:/app/kubeconfig:ro \
  -e KUBECONFIG=/app/kubeconfig \
  yourorg/kube-dashboard-lite
```

### Kubernetes (In-Cluster)

Deploy inside your cluster with a ServiceAccount:

```yaml
# deploy/kubernetes/deployment.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: kube-dashboard-lite
  namespace: kube-system
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: kube-dashboard-lite
rules:
  - apiGroups: [""]
    resources: ["pods", "pods/log", "services", "events", "namespaces"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: kube-dashboard-lite
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: kube-dashboard-lite
subjects:
  - kind: ServiceAccount
    name: kube-dashboard-lite
    namespace: kube-system
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kube-dashboard-lite
  namespace: kube-system
spec:
  replicas: 1
  selector:
    matchLabels:
      app: kube-dashboard-lite
  template:
    metadata:
      labels:
        app: kube-dashboard-lite
    spec:
      serviceAccountName: kube-dashboard-lite
      containers:
        - name: kdl
          image: yourorg/kube-dashboard-lite:latest
          args: ["--host", "0.0.0.0"]
          ports:
            - containerPort: 8080
          resources:
            limits:
              memory: 64Mi
              cpu: 100m
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
          readinessProbe:
            httpGet:
              path: /ready
              port: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: kube-dashboard-lite
  namespace: kube-system
spec:
  selector:
    app: kube-dashboard-lite
  ports:
    - port: 80
      targetPort: 8080
```

```bash
kubectl apply -f deploy/kubernetes/
kubectl port-forward -n kube-system svc/kube-dashboard-lite 8080:80
```

### With Write Mode (Kubernetes)

Add additional RBAC permissions:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: kube-dashboard-lite-write
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch", "delete"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "watch", "patch", "update"]
  - apiGroups: ["apps"]
    resources: ["deployments/scale"]
    verbs: ["patch", "update"]
```

## Security Considerations

1. **Read-only by default** - Write operations require explicit `--write-mode` flag
2. **No authentication layer** - Uses your kubeconfig credentials
3. **Bind to localhost** - By default only accessible locally
4. **In-cluster** - Use RBAC to limit permissions

For production deployments, consider:
- Running behind an ingress with authentication
- Using network policies to restrict access
- Limiting RBAC permissions to specific namespaces

## Building from Source

```bash
# Clone
git clone https://github.com/yourorg/kube-dashboard-lite.git
cd kube-dashboard-lite

# Build
make build

# Run
./bin/kdl

# Run tests
make test

# Build Docker image
make docker

# Build for all platforms
make release
```

## Comparison

| Feature | kube-dashboard-lite | Kubernetes Dashboard | k9s |
|---------|---------------------|---------------------|-----|
| Binary size | ~15MB | N/A (web app) | ~50MB |
| Setup time | Instant | 10+ minutes | Instant |
| Dependencies | None | cert-manager, metrics-server | None |
| Auth required | No | Yes | No |
| Terminal UI | No | No | Yes |
| Web UI | Yes | Yes | No |
| Resource usage | ~20MB RAM | ~200MB RAM | ~50MB RAM |

## Roadmap

- [ ] Namespace filtering in UI
- [ ] Resource metrics (CPU/memory graphs)
- [ ] ConfigMaps and Secrets viewer
- [ ] Node information
- [ ] Custom resource support
- [ ] Dark mode

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache 2.0
