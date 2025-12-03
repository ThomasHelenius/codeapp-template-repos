package server

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/rs/zerolog"

	"github.com/yourorg/kube-dashboard-lite/internal/handlers"
	"github.com/yourorg/kube-dashboard-lite/internal/k8s"
)

//go:embed all:static
var staticFS embed.FS

// Config for the server
type Config struct {
	Port      int
	Host      string
	WriteMode bool
}

// Server represents the dashboard server
type Server struct {
	cfg       Config
	router    chi.Router
	k8sClient *k8s.Client
	logger    zerolog.Logger
	server    *http.Server
}

// New creates a new server
func New(cfg Config, k8sClient *k8s.Client, logger zerolog.Logger) *Server {
	s := &Server{
		cfg:       cfg,
		k8sClient: k8sClient,
		logger:    logger,
	}

	s.setupRouter()

	return s
}

func (s *Server) setupRouter() {
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	// CORS for local development
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Create handler
	h := handlers.New(s.k8sClient, s.cfg.WriteMode, s.logger)

	// API routes
	r.Route("/api", func(r chi.Router) {
		// Cluster
		r.Get("/cluster", h.GetClusterInfo)
		r.Get("/contexts", h.GetContexts)
		r.Post("/contexts/{name}", h.SwitchContext)

		// Namespaces
		r.Get("/namespaces", h.GetNamespaces)

		// Pods
		r.Get("/namespaces/{namespace}/pods", h.GetPods)
		r.Get("/namespaces/{namespace}/pods/{name}", h.GetPod)
		r.Get("/namespaces/{namespace}/pods/{name}/logs", h.GetPodLogs)
		r.Delete("/namespaces/{namespace}/pods/{name}", h.DeletePod)

		// Deployments
		r.Get("/namespaces/{namespace}/deployments", h.GetDeployments)
		r.Post("/namespaces/{namespace}/deployments/{name}/restart", h.RestartDeployment)

		// Services
		r.Get("/namespaces/{namespace}/services", h.GetServices)

		// Events
		r.Get("/namespaces/{namespace}/events", h.GetEvents)
	})

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Serve static files
	staticContent, err := fs.Sub(staticFS, "static")
	if err != nil {
		s.logger.Fatal().Err(err).Msg("Failed to get static files")
	}

	fileServer := http.FileServer(http.FS(staticContent))
	r.Handle("/*", fileServer)

	s.router = r
}

// Start starts the server
func (s *Server) Start() error {
	addr := fmt.Sprintf("%s:%d", s.cfg.Host, s.cfg.Port)

	s.server = &http.Server{
		Addr:         addr,
		Handler:      s.router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 120 * time.Second,
	}

	s.logger.Info().
		Str("addr", addr).
		Str("context", s.k8sClient.CurrentContext()).
		Bool("writeMode", s.cfg.WriteMode).
		Msg("Starting Kube Dashboard Lite")

	fmt.Printf("\n🚀 Kube Dashboard Lite\n")
	fmt.Printf("📍 Context: %s\n", s.k8sClient.CurrentContext())
	fmt.Printf("🌐 Dashboard: http://%s\n\n", addr)

	return s.server.ListenAndServe()
}

// Shutdown gracefully shuts down the server
func (s *Server) Shutdown(ctx context.Context) error {
	return s.server.Shutdown(ctx)
}
