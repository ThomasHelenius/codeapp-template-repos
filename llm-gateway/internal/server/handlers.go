package server

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/yourorg/llm-gateway/internal/provider"
)

func (s *Server) handleChatCompletion(w http.ResponseWriter, r *http.Request) {
	startTime := time.Now()

	// Parse request
	var req provider.ChatCompletionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid request body", err.Error())
		return
	}

	// Get provider for model
	prov, err := s.registry.GetForModel(req.Model)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, "model not found", err.Error())
		return
	}

	// Check cache (only for non-streaming)
	if !req.Stream && s.cache != nil && (req.XGateway == nil || req.XGateway.Cache == nil || *req.XGateway.Cache) {
		cacheKey := s.generateCacheKey(&req)
		if cached, ok := s.cache.Get(cacheKey); ok {
			s.metrics.RecordCacheHit()
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("X-Cache", "HIT")
			w.Write(cached)
			return
		}
		s.metrics.RecordCacheMiss()
	}

	// Handle streaming
	if req.Stream {
		s.handleStreamingCompletion(w, r, prov, &req)
		return
	}

	// Make request
	resp, err := prov.ChatCompletion(r.Context(), &req)
	if err != nil {
		if provErr, ok := err.(*provider.ProviderError); ok {
			s.writeError(w, provErr.StatusCode, provErr.Type, provErr.Message)
		} else {
			s.writeError(w, http.StatusInternalServerError, "provider_error", err.Error())
		}
		return
	}

	// Calculate metrics
	latency := time.Since(startTime).Milliseconds()
	cost := provider.CalculateCost(req.Model, resp.Usage.PromptTokens, resp.Usage.CompletionTokens)

	s.metrics.RecordRequest(provider.ProviderMetrics{
		Provider:         prov.Name(),
		Model:            req.Model,
		PromptTokens:     resp.Usage.PromptTokens,
		CompletionTokens: resp.Usage.CompletionTokens,
		TotalTokens:      resp.Usage.TotalTokens,
		LatencyMs:        latency,
		Cost:             cost,
		Cached:           false,
		Success:          true,
		Timestamp:        time.Now(),
	})

	// Write response
	respBytes, err := json.Marshal(resp)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "marshal_error", err.Error())
		return
	}

	// Cache response
	if s.cache != nil && (req.XGateway == nil || req.XGateway.Cache == nil || *req.XGateway.Cache) {
		cacheKey := s.generateCacheKey(&req)
		s.cache.Set(cacheKey, respBytes)
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Cache", "MISS")
	w.Header().Set("X-Latency-Ms", fmt.Sprintf("%d", latency))
	w.Header().Set("X-Cost-USD", fmt.Sprintf("%.6f", cost))
	w.Write(respBytes)
}

func (s *Server) handleStreamingCompletion(w http.ResponseWriter, r *http.Request, prov provider.Provider, req *provider.ChatCompletionRequest) {
	stream, err := prov.ChatCompletionStream(r.Context(), req)
	if err != nil {
		if provErr, ok := err.(*provider.ProviderError); ok {
			s.writeError(w, provErr.StatusCode, provErr.Type, provErr.Message)
		} else {
			s.writeError(w, http.StatusInternalServerError, "provider_error", err.Error())
		}
		return
	}
	defer stream.Close()

	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		s.writeError(w, http.StatusInternalServerError, "streaming_not_supported", "streaming not supported")
		return
	}

	// Copy stream to response
	scanner := bufio.NewScanner(stream)
	for scanner.Scan() {
		line := scanner.Text()
		if line != "" {
			fmt.Fprintf(w, "%s\n", line)
			flusher.Flush()
		}
	}

	// Record metrics (approximate for streaming)
	s.metrics.RecordRequest(provider.ProviderMetrics{
		Provider:  prov.Name(),
		Model:     req.Model,
		Success:   true,
		Timestamp: time.Now(),
	})
}

func (s *Server) handleListModels(w http.ResponseWriter, r *http.Request) {
	providers := s.registry.List()

	type modelData struct {
		ID      string `json:"id"`
		Object  string `json:"object"`
		Created int64  `json:"created"`
		OwnedBy string `json:"owned_by"`
	}

	var models []modelData
	for _, p := range providers {
		for _, model := range p.Models() {
			models = append(models, modelData{
				ID:      model,
				Object:  "model",
				Created: time.Now().Unix(),
				OwnedBy: p.Name(),
			})
		}
	}

	response := struct {
		Object string      `json:"object"`
		Data   []modelData `json:"data"`
	}{
		Object: "list",
		Data:   models,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) writeError(w http.ResponseWriter, status int, errType, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	response := struct {
		Error struct {
			Message string `json:"message"`
			Type    string `json:"type"`
			Code    int    `json:"code"`
		} `json:"error"`
	}{}

	response.Error.Message = message
	response.Error.Type = errType
	response.Error.Code = status

	json.NewEncoder(w).Encode(response)
}

func (s *Server) generateCacheKey(req *provider.ChatCompletionRequest) string {
	// Create a hash from the request
	data, _ := json.Marshal(struct {
		Model       string
		Messages    []provider.Message
		Temperature *float64
		MaxTokens   *int
	}{
		Model:       req.Model,
		Messages:    req.Messages,
		Temperature: req.Temperature,
		MaxTokens:   req.MaxTokens,
	})

	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}
