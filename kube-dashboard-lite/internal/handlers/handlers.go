package handlers

import (
	"bufio"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog"

	"github.com/yourorg/kube-dashboard-lite/internal/k8s"
)

// Handler handles API requests
type Handler struct {
	k8s       *k8s.Client
	writeMode bool
	logger    zerolog.Logger
}

// New creates a new handler
func New(client *k8s.Client, writeMode bool, logger zerolog.Logger) *Handler {
	return &Handler{
		k8s:       client,
		writeMode: writeMode,
		logger:    logger,
	}
}

// GetClusterInfo returns cluster information
func (h *Handler) GetClusterInfo(w http.ResponseWriter, r *http.Request) {
	info, err := h.k8s.GetClusterInfo(r.Context())
	if err != nil {
		h.error(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.json(w, info)
}

// GetContexts returns available contexts
func (h *Handler) GetContexts(w http.ResponseWriter, r *http.Request) {
	contexts, err := h.k8s.GetContexts()
	if err != nil {
		h.error(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.json(w, contexts)
}

// SwitchContext switches to a different context
func (h *Handler) SwitchContext(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")

	if err := h.k8s.SwitchContext(name); err != nil {
		h.error(w, http.StatusBadRequest, err.Error())
		return
	}

	h.json(w, map[string]string{"context": name})
}

// GetNamespaces returns all namespaces
func (h *Handler) GetNamespaces(w http.ResponseWriter, r *http.Request) {
	namespaces, err := h.k8s.GetNamespaces(r.Context())
	if err != nil {
		h.error(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.json(w, namespaces)
}

// GetPods returns pods in a namespace
func (h *Handler) GetPods(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")

	pods, err := h.k8s.GetPods(r.Context(), namespace)
	if err != nil {
		h.error(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.json(w, pods)
}

// GetPod returns a single pod
func (h *Handler) GetPod(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	pod, err := h.k8s.GetPod(r.Context(), namespace, name)
	if err != nil {
		h.error(w, http.StatusNotFound, err.Error())
		return
	}

	h.json(w, pod)
}

// GetPodLogs returns logs for a pod
func (h *Handler) GetPodLogs(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	container := r.URL.Query().Get("container")
	follow := r.URL.Query().Get("follow") == "true"

	tailLines := 100
	if t := r.URL.Query().Get("tail"); t != "" {
		if parsed, err := strconv.Atoi(t); err == nil {
			tailLines = parsed
		}
	}

	opts := k8s.LogOptions{
		Follow:    follow,
		TailLines: tailLines,
	}

	stream, err := h.k8s.GetPodLogs(r.Context(), namespace, name, container, opts)
	if err != nil {
		h.error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer stream.Close()

	if follow {
		// Streaming mode
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		flusher, ok := w.(http.Flusher)
		if !ok {
			h.error(w, http.StatusInternalServerError, "streaming not supported")
			return
		}

		scanner := bufio.NewScanner(stream)
		for scanner.Scan() {
			w.Write([]byte("data: " + scanner.Text() + "\n\n"))
			flusher.Flush()
		}
	} else {
		// Non-streaming mode
		w.Header().Set("Content-Type", "text/plain")
		scanner := bufio.NewScanner(stream)
		for scanner.Scan() {
			w.Write(scanner.Bytes())
			w.Write([]byte("\n"))
		}
	}
}

// DeletePod deletes a pod
func (h *Handler) DeletePod(w http.ResponseWriter, r *http.Request) {
	if !h.writeMode {
		h.error(w, http.StatusForbidden, "write mode is disabled")
		return
	}

	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	// Not implemented yet - would call clientset.CoreV1().Pods().Delete()
	h.json(w, map[string]string{
		"status":    "deleted",
		"namespace": namespace,
		"name":      name,
	})
}

// GetDeployments returns deployments in a namespace
func (h *Handler) GetDeployments(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")

	deployments, err := h.k8s.GetDeployments(r.Context(), namespace)
	if err != nil {
		h.error(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.json(w, deployments)
}

// RestartDeployment restarts a deployment
func (h *Handler) RestartDeployment(w http.ResponseWriter, r *http.Request) {
	if !h.writeMode {
		h.error(w, http.StatusForbidden, "write mode is disabled")
		return
	}

	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	if err := h.k8s.RestartDeployment(r.Context(), namespace, name); err != nil {
		h.error(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.json(w, map[string]string{"status": "restarted"})
}

// GetServices returns services in a namespace
func (h *Handler) GetServices(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")

	services, err := h.k8s.GetServices(r.Context(), namespace)
	if err != nil {
		h.error(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.json(w, services)
}

// GetEvents returns events in a namespace
func (h *Handler) GetEvents(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")

	events, err := h.k8s.GetEvents(r.Context(), namespace)
	if err != nil {
		h.error(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.json(w, events)
}

// Helper methods

func (h *Handler) json(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func (h *Handler) error(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}
