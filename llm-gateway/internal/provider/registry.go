package provider

import (
	"context"
	"fmt"
	"sync"

	"github.com/yourorg/llm-gateway/internal/config"
)

// Registry manages all configured providers
type Registry struct {
	providers     map[string]Provider
	modelMapping  map[string]string // model -> provider name
	fallbackChain []string
	defaultProvider string
	mu            sync.RWMutex
}

func NewRegistry(cfg *config.Config) (*Registry, error) {
	r := &Registry{
		providers:       make(map[string]Provider),
		modelMapping:    make(map[string]string),
		defaultProvider: cfg.Routing.DefaultProvider,
		fallbackChain:   cfg.Routing.FallbackChain,
	}

	// Initialize providers
	for _, provCfg := range cfg.Providers {
		provider, err := r.createProvider(provCfg)
		if err != nil {
			return nil, fmt.Errorf("failed to create provider %s: %w", provCfg.Name, err)
		}
		r.providers[provCfg.Name] = provider

		// Map models to provider
		for _, model := range provCfg.Models {
			r.modelMapping[model] = provCfg.Name
		}
	}

	// Add model mappings from config
	for alias, mapping := range cfg.Routing.ModelMappings {
		r.modelMapping[alias] = mapping.Provider
	}

	return r, nil
}

func (r *Registry) createProvider(cfg config.ProviderConfig) (Provider, error) {
	switch cfg.Name {
	case "openai":
		return NewOpenAIProvider(OpenAIConfig{
			Name:       cfg.Name,
			APIKey:     cfg.APIKey,
			BaseURL:    cfg.BaseURL,
			Models:     cfg.Models,
			Timeout:    cfg.Timeout,
			MaxRetries: cfg.MaxRetries,
		}), nil

	case "anthropic":
		return NewAnthropicProvider(AnthropicConfig{
			Name:       cfg.Name,
			APIKey:     cfg.APIKey,
			BaseURL:    cfg.BaseURL,
			Models:     cfg.Models,
			Timeout:    cfg.Timeout,
			MaxRetries: cfg.MaxRetries,
		}), nil

	case "azure":
		return NewOpenAIProvider(OpenAIConfig{
			Name:       cfg.Name,
			APIKey:     cfg.APIKey,
			BaseURL:    cfg.BaseURL,
			Models:     cfg.Models,
			Timeout:    cfg.Timeout,
			MaxRetries: cfg.MaxRetries,
		}), nil

	default:
		// Default to OpenAI-compatible
		return NewOpenAIProvider(OpenAIConfig{
			Name:       cfg.Name,
			APIKey:     cfg.APIKey,
			BaseURL:    cfg.BaseURL,
			Models:     cfg.Models,
			Timeout:    cfg.Timeout,
			MaxRetries: cfg.MaxRetries,
		}), nil
	}
}

// Get returns a provider by name
func (r *Registry) Get(name string) (Provider, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	p, ok := r.providers[name]
	return p, ok
}

// GetForModel returns the provider for a given model
func (r *Registry) GetForModel(model string) (Provider, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	// Check model mapping first
	if providerName, ok := r.modelMapping[model]; ok {
		if provider, ok := r.providers[providerName]; ok {
			return provider, nil
		}
	}

	// Check if any provider supports this model
	for _, provider := range r.providers {
		if provider.SupportsModel(model) {
			return provider, nil
		}
	}

	// Fall back to default provider
	if r.defaultProvider != "" {
		if provider, ok := r.providers[r.defaultProvider]; ok {
			return provider, nil
		}
	}

	return nil, fmt.Errorf("no provider found for model: %s", model)
}

// GetWithFallback attempts providers in fallback order
func (r *Registry) GetWithFallback(model string) []Provider {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var providers []Provider

	// First try the mapped provider
	if providerName, ok := r.modelMapping[model]; ok {
		if provider, ok := r.providers[providerName]; ok {
			providers = append(providers, provider)
		}
	}

	// Then add fallback chain
	for _, name := range r.fallbackChain {
		if provider, ok := r.providers[name]; ok {
			// Avoid duplicates
			duplicate := false
			for _, p := range providers {
				if p.Name() == provider.Name() {
					duplicate = true
					break
				}
			}
			if !duplicate {
				providers = append(providers, provider)
			}
		}
	}

	return providers
}

// List returns all registered providers
func (r *Registry) List() []Provider {
	r.mu.RLock()
	defer r.mu.RUnlock()

	providers := make([]Provider, 0, len(r.providers))
	for _, p := range r.providers {
		providers = append(providers, p)
	}
	return providers
}

// HealthCheckAll checks all providers
func (r *Registry) HealthCheckAll(ctx context.Context) map[string]error {
	r.mu.RLock()
	defer r.mu.RUnlock()

	results := make(map[string]error)
	var wg sync.WaitGroup

	for name, provider := range r.providers {
		wg.Add(1)
		go func(name string, p Provider) {
			defer wg.Done()
			results[name] = p.HealthCheck(ctx)
		}(name, provider)
	}

	wg.Wait()
	return results
}

// ResolveModel resolves model aliases to actual model names
func (r *Registry) ResolveModel(model string, cfg *config.Config) (string, string) {
	if mapping, ok := cfg.Routing.ModelMappings[model]; ok {
		return mapping.Provider, mapping.Model
	}

	if providerName, ok := r.modelMapping[model]; ok {
		return providerName, model
	}

	return r.defaultProvider, model
}
