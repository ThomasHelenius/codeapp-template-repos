package metrics

import (
	"fmt"
	"sync"
	"time"

	"github.com/yourorg/llm-gateway/internal/provider"
)

// Collector collects and aggregates metrics
type Collector struct {
	mu           sync.RWMutex
	requests     []provider.ProviderMetrics
	totalCost    float64
	totalTokens  int64
	cacheHits    int64
	cacheMisses  int64
	byProvider   map[string]*ProviderStats
	byModel      map[string]*ModelStats
}

type ProviderStats struct {
	Requests     int64
	Tokens       int64
	Cost         float64
	AvgLatencyMs float64
	Errors       int64
}

type ModelStats struct {
	Requests     int64
	PromptTokens int64
	CompletionTokens int64
	Cost         float64
	AvgLatencyMs float64
}

type AggregatedStats struct {
	TotalRequests int64
	TotalTokens   int64
	TotalCost     float64
	CacheHits     int64
	CacheMisses   int64
	ByProvider    map[string]*ProviderStats
	ByModel       map[string]*ModelStats
}

func NewCollector() *Collector {
	return &Collector{
		requests:   make([]provider.ProviderMetrics, 0),
		byProvider: make(map[string]*ProviderStats),
		byModel:    make(map[string]*ModelStats),
	}
}

func (c *Collector) RecordRequest(m provider.ProviderMetrics) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Store raw metric
	c.requests = append(c.requests, m)

	// Update totals
	c.totalCost += m.Cost
	c.totalTokens += int64(m.TotalTokens)

	// Update provider stats
	if _, ok := c.byProvider[m.Provider]; !ok {
		c.byProvider[m.Provider] = &ProviderStats{}
	}
	ps := c.byProvider[m.Provider]
	ps.Requests++
	ps.Tokens += int64(m.TotalTokens)
	ps.Cost += m.Cost
	ps.AvgLatencyMs = (ps.AvgLatencyMs*float64(ps.Requests-1) + float64(m.LatencyMs)) / float64(ps.Requests)
	if !m.Success {
		ps.Errors++
	}

	// Update model stats
	if _, ok := c.byModel[m.Model]; !ok {
		c.byModel[m.Model] = &ModelStats{}
	}
	ms := c.byModel[m.Model]
	ms.Requests++
	ms.PromptTokens += int64(m.PromptTokens)
	ms.CompletionTokens += int64(m.CompletionTokens)
	ms.Cost += m.Cost
	ms.AvgLatencyMs = (ms.AvgLatencyMs*float64(ms.Requests-1) + float64(m.LatencyMs)) / float64(ms.Requests)

	// Cleanup old metrics (keep last hour)
	cutoff := time.Now().Add(-time.Hour)
	newRequests := make([]provider.ProviderMetrics, 0)
	for _, req := range c.requests {
		if req.Timestamp.After(cutoff) {
			newRequests = append(newRequests, req)
		}
	}
	c.requests = newRequests
}

func (c *Collector) RecordCacheHit() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.cacheHits++
}

func (c *Collector) RecordCacheMiss() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.cacheMisses++
}

func (c *Collector) GetStats() AggregatedStats {
	c.mu.RLock()
	defer c.mu.RUnlock()

	return AggregatedStats{
		TotalRequests: int64(len(c.requests)),
		TotalTokens:   c.totalTokens,
		TotalCost:     c.totalCost,
		CacheHits:     c.cacheHits,
		CacheMisses:   c.cacheMisses,
		ByProvider:    c.byProvider,
		ByModel:       c.byModel,
	}
}

func (c *Collector) Prometheus() string {
	c.mu.RLock()
	defer c.mu.RUnlock()

	var output string

	// Total requests
	output += fmt.Sprintf("# HELP llm_gateway_requests_total Total number of requests\n")
	output += fmt.Sprintf("# TYPE llm_gateway_requests_total counter\n")
	output += fmt.Sprintf("llm_gateway_requests_total %d\n", len(c.requests))

	// Total tokens
	output += fmt.Sprintf("# HELP llm_gateway_tokens_total Total number of tokens processed\n")
	output += fmt.Sprintf("# TYPE llm_gateway_tokens_total counter\n")
	output += fmt.Sprintf("llm_gateway_tokens_total %d\n", c.totalTokens)

	// Total cost
	output += fmt.Sprintf("# HELP llm_gateway_cost_total Total cost in USD\n")
	output += fmt.Sprintf("# TYPE llm_gateway_cost_total counter\n")
	output += fmt.Sprintf("llm_gateway_cost_total %.6f\n", c.totalCost)

	// Cache stats
	output += fmt.Sprintf("# HELP llm_gateway_cache_hits_total Total cache hits\n")
	output += fmt.Sprintf("# TYPE llm_gateway_cache_hits_total counter\n")
	output += fmt.Sprintf("llm_gateway_cache_hits_total %d\n", c.cacheHits)

	output += fmt.Sprintf("# HELP llm_gateway_cache_misses_total Total cache misses\n")
	output += fmt.Sprintf("# TYPE llm_gateway_cache_misses_total counter\n")
	output += fmt.Sprintf("llm_gateway_cache_misses_total %d\n", c.cacheMisses)

	// Per-provider metrics
	output += fmt.Sprintf("# HELP llm_gateway_provider_requests_total Requests per provider\n")
	output += fmt.Sprintf("# TYPE llm_gateway_provider_requests_total counter\n")
	for name, stats := range c.byProvider {
		output += fmt.Sprintf("llm_gateway_provider_requests_total{provider=\"%s\"} %d\n", name, stats.Requests)
	}

	output += fmt.Sprintf("# HELP llm_gateway_provider_latency_avg_ms Average latency per provider\n")
	output += fmt.Sprintf("# TYPE llm_gateway_provider_latency_avg_ms gauge\n")
	for name, stats := range c.byProvider {
		output += fmt.Sprintf("llm_gateway_provider_latency_avg_ms{provider=\"%s\"} %.2f\n", name, stats.AvgLatencyMs)
	}

	// Per-model metrics
	output += fmt.Sprintf("# HELP llm_gateway_model_requests_total Requests per model\n")
	output += fmt.Sprintf("# TYPE llm_gateway_model_requests_total counter\n")
	for name, stats := range c.byModel {
		output += fmt.Sprintf("llm_gateway_model_requests_total{model=\"%s\"} %d\n", name, stats.Requests)
	}

	output += fmt.Sprintf("# HELP llm_gateway_model_cost_total Cost per model\n")
	output += fmt.Sprintf("# TYPE llm_gateway_model_cost_total counter\n")
	for name, stats := range c.byModel {
		output += fmt.Sprintf("llm_gateway_model_cost_total{model=\"%s\"} %.6f\n", name, stats.Cost)
	}

	return output
}
