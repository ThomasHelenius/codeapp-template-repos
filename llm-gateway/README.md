# llm-gateway

<div align="center">

**Lightweight, self-hosted proxy for LLM APIs**

[![Go Version](https://img.shields.io/badge/Go-1.21+-00ADD8?logo=go)](https://go.dev/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://hub.docker.com)

[Quick Start](#quick-start) • [Configuration](#configuration) • [API](#api) • [Deployment](#deployment)

</div>

---

## Why llm-gateway?

- **Drop-in replacement** - OpenAI-compatible API, just change the base URL
- **Multi-provider** - OpenAI, Anthropic, Azure, and more from one endpoint
- **Cost tracking** - Know exactly what you're spending per model/feature
- **Caching** - Save money on repeated requests
- **Rate limiting** - Protect your budget and API keys
- **Single binary** - No dependencies, <20MB, runs anywhere

## Quick Start

### Download

```bash
# macOS (Apple Silicon)
curl -L https://github.com/yourorg/llm-gateway/releases/latest/download/llm-gateway-darwin-arm64 -o llm-gateway
chmod +x llm-gateway

# Linux
curl -L https://github.com/yourorg/llm-gateway/releases/latest/download/llm-gateway-linux-amd64 -o llm-gateway
chmod +x llm-gateway

# Or use Docker
docker pull yourorg/llm-gateway
```

### Configure

```yaml
# gateway.yaml
providers:
  - name: openai
    apiKey: ${OPENAI_API_KEY}
    models: [gpt-4, gpt-4-turbo, gpt-3.5-turbo]

  - name: anthropic
    apiKey: ${ANTHROPIC_API_KEY}
    models: [claude-3-opus, claude-3-sonnet, claude-3-haiku]

routing:
  defaultProvider: openai
  fallbackChain: [openai, anthropic]

cache:
  enabled: true
  ttl: 1h
```

### Run

```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
./llm-gateway
```

### Use

```bash
# Just change the base URL!
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Features

### Multi-Provider Support

Route requests to different providers seamlessly:

```yaml
providers:
  - name: openai
    apiKey: ${OPENAI_API_KEY}
  - name: anthropic
    apiKey: ${ANTHROPIC_API_KEY}
  - name: azure
    apiKey: ${AZURE_API_KEY}
    baseUrl: https://your-resource.openai.azure.com
```

### Model Aliases

Create semantic aliases for models:

```yaml
routing:
  modelMappings:
    fast:
      provider: openai
      model: gpt-3.5-turbo
    smart:
      provider: openai
      model: gpt-4-turbo
    cheap:
      provider: anthropic
      model: claude-3-haiku
```

```bash
# Use aliases in requests
curl http://localhost:8080/v1/chat/completions \
  -d '{"model": "fast", "messages": [...]}'
```

### Automatic Fallback

If one provider fails, automatically try the next:

```yaml
routing:
  fallbackChain: [openai, anthropic, azure]
```

### Response Caching

Cache identical requests to save money:

```yaml
cache:
  enabled: true
  backend: memory  # or "redis"
  ttl: 1h
  maxSize: 512     # MB
```

Cached responses include `X-Cache: HIT` header.

### Rate Limiting

Protect your API keys and budget:

```yaml
rateLimit:
  enabled: true
  global:
    requests: 10000
    window: 1m
  perKey:
    requests: 1000
    window: 1m
  perModel:
    gpt-4:
      requests: 100
      window: 1m
```

### Cost Tracking

Track costs per model and provider:

```bash
# Get usage stats
curl http://localhost:8080/api/v1/usage

# Response
{
  "total_requests": 1523,
  "total_tokens": 2456789,
  "total_cost": 12.34,
  "cache_hits": 423,
  "cache_misses": 1100
}
```

### Prometheus Metrics

```bash
curl http://localhost:8080/metrics

# Output
llm_gateway_requests_total 1523
llm_gateway_tokens_total 2456789
llm_gateway_cost_total 12.340000
llm_gateway_cache_hits_total 423
llm_gateway_provider_requests_total{provider="openai"} 1200
llm_gateway_model_cost_total{model="gpt-4"} 8.50
```

## API Reference

### OpenAI-Compatible Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /v1/chat/completions` | Chat completion (streaming supported) |
| `GET /v1/models` | List available models |

### Gateway Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /ready` | Readiness check (verifies providers) |
| `GET /metrics` | Prometheus metrics |
| `GET /api/v1/usage` | Usage statistics |
| `GET /api/v1/providers/status` | Provider health status |
| `POST /api/v1/cache/clear` | Clear cache |

### Request Extensions

Add gateway-specific options to requests:

```json
{
  "model": "gpt-4",
  "messages": [...],
  "x-gateway": {
    "cache": false,
    "timeout": 30,
    "provider": "anthropic",
    "metadata": {
      "feature": "chat",
      "user_id": "u_123"
    }
  }
}
```

## Configuration Reference

```yaml
server:
  port: 8080
  host: 0.0.0.0
  readTimeout: 30s
  writeTimeout: 120s
  cors:
    enabled: true
    allowedOrigins: ["*"]

providers:
  - name: openai
    apiKey: ${OPENAI_API_KEY}
    baseUrl: https://api.openai.com/v1  # optional
    models: [gpt-4, gpt-4-turbo, gpt-3.5-turbo]
    priority: 1
    timeout: 60s
    maxRetries: 3

routing:
  defaultProvider: openai
  modelMappings:
    fast: { provider: openai, model: gpt-3.5-turbo }
  fallbackChain: [openai, anthropic]

cache:
  enabled: true
  backend: memory  # memory | redis
  ttl: 1h
  maxSize: 512

rateLimit:
  enabled: false
  global: { requests: 10000, window: 1m }
  perKey: { requests: 1000, window: 1m }

metrics:
  enabled: true
  endpoint: /metrics

logging:
  level: info      # debug | info | warn | error
  format: json     # json | console
  requestBody: false
```

## Deployment

### Docker

```bash
docker run -p 8080:8080 \
  -v $(pwd)/gateway.yaml:/app/gateway.yaml \
  -e OPENAI_API_KEY \
  -e ANTHROPIC_API_KEY \
  yourorg/llm-gateway
```

### Docker Compose

```bash
docker-compose up
```

### Kubernetes

```bash
helm install llm-gateway ./deploy/helm/llm-gateway \
  --set providers.openai.apiKey=$OPENAI_API_KEY
```

### Systemd

```ini
[Unit]
Description=LLM Gateway
After=network.target

[Service]
ExecStart=/usr/local/bin/llm-gateway --config /etc/llm-gateway/gateway.yaml
Restart=always
User=llm-gateway

[Install]
WantedBy=multi-user.target
```

## Client Examples

### Python

```python
import openai

client = openai.OpenAI(
    base_url="http://localhost:8080/v1",
    api_key="not-needed"  # Gateway handles auth
)

response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

### JavaScript/TypeScript

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://localhost:8080/v1',
  apiKey: 'not-needed',
});

const response = await client.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

### curl

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

## Building from Source

```bash
# Clone
git clone https://github.com/yourorg/llm-gateway.git
cd llm-gateway

# Build
make build

# Run
./bin/llm-gateway

# Run tests
make test

# Build Docker image
make docker
```

## Roadmap

- [ ] Redis cache backend
- [ ] Semantic caching (embedding similarity)
- [ ] Request hedging (parallel provider requests)
- [ ] Admin dashboard
- [ ] OpenTelemetry integration
- [ ] Prompt injection detection

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache 2.0
