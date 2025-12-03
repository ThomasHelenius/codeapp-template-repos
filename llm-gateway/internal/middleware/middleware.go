package middleware

import (
	"net/http"
	"sync"
	"time"

	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/rs/zerolog"
	"golang.org/x/time/rate"

	"github.com/yourorg/llm-gateway/internal/config"
)

// Logger returns a logging middleware
func Logger(logger zerolog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := chimiddleware.NewWrapResponseWriter(w, r.ProtoMajor)

			defer func() {
				logger.Info().
					Str("method", r.Method).
					Str("path", r.URL.Path).
					Int("status", ww.Status()).
					Dur("duration", time.Since(start)).
					Int("bytes", ww.BytesWritten()).
					Str("remote_addr", r.RemoteAddr).
					Msg("request")
			}()

			next.ServeHTTP(ww, r)
		})
	}
}

// RateLimiter manages rate limits per key
type RateLimiter struct {
	cfg      config.RateLimitConfig
	limiters map[string]*rate.Limiter
	mu       sync.RWMutex
	global   *rate.Limiter
}

func NewRateLimiter(cfg config.RateLimitConfig) *RateLimiter {
	rl := &RateLimiter{
		cfg:      cfg,
		limiters: make(map[string]*rate.Limiter),
	}

	// Setup global limiter
	if cfg.Global.Requests > 0 {
		rl.global = rate.NewLimiter(
			rate.Limit(float64(cfg.Global.Requests)/cfg.Global.Window.Seconds()),
			cfg.Global.Requests,
		)
	}

	return rl
}

func (rl *RateLimiter) getLimiter(key string) *rate.Limiter {
	rl.mu.RLock()
	limiter, ok := rl.limiters[key]
	rl.mu.RUnlock()

	if ok {
		return limiter
	}

	rl.mu.Lock()
	defer rl.mu.Unlock()

	// Double-check after acquiring write lock
	if limiter, ok := rl.limiters[key]; ok {
		return limiter
	}

	limiter = rate.NewLimiter(
		rate.Limit(float64(rl.cfg.PerKey.Requests)/rl.cfg.PerKey.Window.Seconds()),
		rl.cfg.PerKey.Requests,
	)
	rl.limiters[key] = limiter

	return limiter
}

func (rl *RateLimiter) Allow(key string) bool {
	// Check global limit
	if rl.global != nil && !rl.global.Allow() {
		return false
	}

	// Check per-key limit
	limiter := rl.getLimiter(key)
	return limiter.Allow()
}

// RateLimit returns a rate limiting middleware
func RateLimit(cfg config.RateLimitConfig) func(http.Handler) http.Handler {
	rl := NewRateLimiter(cfg)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Use API key or IP as rate limit key
			key := r.Header.Get("Authorization")
			if key == "" {
				key = r.RemoteAddr
			}

			if !rl.Allow(key) {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", "60")
				w.WriteHeader(http.StatusTooManyRequests)
				w.Write([]byte(`{"error":{"message":"Rate limit exceeded","type":"rate_limit_error","code":429}}`))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// Auth returns an authentication middleware
func Auth(apiKeys map[string]bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip auth for health endpoints
			if r.URL.Path == "/health" || r.URL.Path == "/ready" {
				next.ServeHTTP(w, r)
				return
			}

			// If no API keys configured, allow all
			if len(apiKeys) == 0 {
				next.ServeHTTP(w, r)
				return
			}

			auth := r.Header.Get("Authorization")
			if auth == "" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				w.Write([]byte(`{"error":{"message":"Missing API key","type":"auth_error","code":401}}`))
				return
			}

			// Extract Bearer token
			if len(auth) > 7 && auth[:7] == "Bearer " {
				auth = auth[7:]
			}

			if !apiKeys[auth] {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				w.Write([]byte(`{"error":{"message":"Invalid API key","type":"auth_error","code":401}}`))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
