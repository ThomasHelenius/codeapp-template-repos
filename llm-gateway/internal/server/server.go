package server

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/rs/zerolog"

	"github.com/yourorg/llm-gateway/internal/cache"
	"github.com/yourorg/llm-gateway/internal/config"
	"github.com/yourorg/llm-gateway/internal/metrics"
	"github.com/yourorg/llm-gateway/internal/middleware"
	"github.com/yourorg/llm-gateway/internal/provider"
)

type Server struct {
	cfg      *config.Config
	router   chi.Router
	registry *provider.Registry
	cache    cache.Cache
	metrics  *metrics.Collector
	logger   zerolog.Logger
	server   *http.Server
}

func New(cfg *config.Config, logger zerolog.Logger) (*Server, error) {
	// Initialize provider registry
	registry, err := provider.NewRegistry(cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create provider registry: %w", err)
	}

	// Initialize cache
	var c cache.Cache
	if cfg.Cache.Enabled {
		c = cache.NewMemoryCache(cfg.Cache.MaxSize, cfg.Cache.TTL)
	}

	// Initialize metrics
	mc := metrics.NewCollector()

	s := &Server{
		cfg:      cfg,
		registry: registry,
		cache:    c,
		metrics:  mc,
		logger:   logger,
	}

	s.setupRouter()

	return s, nil
}

func (s *Server) setupRouter() {
	r := chi.NewRouter()

	// Base middleware
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(middleware.Logger(s.logger))
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Timeout(s.cfg.Server.WriteTimeout))

	// CORS
	if s.cfg.Server.CORS.Enabled {
		r.Use(cors.Handler(cors.Options{
			AllowedOrigins:   s.cfg.Server.CORS.AllowedOrigins,
			AllowedMethods:   s.cfg.Server.CORS.AllowedMethods,
			AllowedHeaders:   s.cfg.Server.CORS.AllowedHeaders,
			AllowCredentials: true,
			MaxAge:           300,
		}))
	}

	// Rate limiting
	if s.cfg.RateLimit.Enabled {
		r.Use(middleware.RateLimit(s.cfg.RateLimit))
	}

	// Health endpoints
	r.Get("/health", s.handleHealth)
	r.Get("/ready", s.handleReady)

	// Metrics endpoint
	if s.cfg.Metrics.Enabled {
		r.Get(s.cfg.Metrics.Endpoint, s.handleMetrics)
	}

	// API routes
	r.Route("/v1", func(r chi.Router) {
		// OpenAI-compatible endpoints
		r.Post("/chat/completions", s.handleChatCompletion)
		r.Get("/models", s.handleListModels)
	})

	// Gateway-specific API
	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/usage", s.handleUsage)
		r.Get("/providers/status", s.handleProvidersStatus)
		r.Post("/cache/clear", s.handleCacheClear)
	})

	s.router = r
}

func (s *Server) Start() error {
	addr := fmt.Sprintf("%s:%d", s.cfg.Server.Host, s.cfg.Server.Port)

	s.server = &http.Server{
		Addr:         addr,
		Handler:      s.router,
		ReadTimeout:  s.cfg.Server.ReadTimeout,
		WriteTimeout: s.cfg.Server.WriteTimeout,
	}

	s.logger.Info().
		Str("addr", addr).
		Msg("Starting LLM Gateway")

	return s.server.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	return s.server.Shutdown(ctx)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}

func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	results := s.registry.HealthCheckAll(ctx)

	healthy := true
	for _, err := range results {
		if err != nil {
			healthy = false
			break
		}
	}

	w.Header().Set("Content-Type", "application/json")
	if healthy {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ready"}`))
	} else {
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(`{"status":"not ready"}`))
	}
}

func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	w.Write([]byte(s.metrics.Prometheus()))
}

func (s *Server) handleProvidersStatus(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	results := s.registry.HealthCheckAll(ctx)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	response := "{"
	first := true
	for name, err := range results {
		if !first {
			response += ","
		}
		status := "healthy"
		if err != nil {
			status = "unhealthy"
		}
		response += fmt.Sprintf(`"%s":{"status":"%s"}`, name, status)
		first = false
	}
	response += "}"

	w.Write([]byte(response))
}

func (s *Server) handleCacheClear(w http.ResponseWriter, r *http.Request) {
	if s.cache != nil {
		s.cache.Clear()
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"cleared"}`))
}

func (s *Server) handleUsage(w http.ResponseWriter, r *http.Request) {
	stats := s.metrics.GetStats()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	response := fmt.Sprintf(`{
		"total_requests": %d,
		"total_tokens": %d,
		"total_cost": %.4f,
		"cache_hits": %d,
		"cache_misses": %d
	}`, stats.TotalRequests, stats.TotalTokens, stats.TotalCost, stats.CacheHits, stats.CacheMisses)

	w.Write([]byte(response))
}
