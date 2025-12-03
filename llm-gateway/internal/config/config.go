package config

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	Server    ServerConfig    `mapstructure:"server"`
	Providers []ProviderConfig `mapstructure:"providers"`
	Routing   RoutingConfig   `mapstructure:"routing"`
	Cache     CacheConfig     `mapstructure:"cache"`
	RateLimit RateLimitConfig `mapstructure:"rateLimit"`
	Metrics   MetricsConfig   `mapstructure:"metrics"`
	Logging   LoggingConfig   `mapstructure:"logging"`
}

type ServerConfig struct {
	Port         int           `mapstructure:"port"`
	Host         string        `mapstructure:"host"`
	ReadTimeout  time.Duration `mapstructure:"readTimeout"`
	WriteTimeout time.Duration `mapstructure:"writeTimeout"`
	CORS         CORSConfig    `mapstructure:"cors"`
}

type CORSConfig struct {
	Enabled        bool     `mapstructure:"enabled"`
	AllowedOrigins []string `mapstructure:"allowedOrigins"`
	AllowedMethods []string `mapstructure:"allowedMethods"`
	AllowedHeaders []string `mapstructure:"allowedHeaders"`
}

type ProviderConfig struct {
	Name       string        `mapstructure:"name"`
	APIKey     string        `mapstructure:"apiKey"`
	BaseURL    string        `mapstructure:"baseUrl"`
	Models     []string      `mapstructure:"models"`
	Priority   int           `mapstructure:"priority"`
	Timeout    time.Duration `mapstructure:"timeout"`
	MaxRetries int           `mapstructure:"maxRetries"`
}

type RoutingConfig struct {
	DefaultProvider string                  `mapstructure:"defaultProvider"`
	ModelMappings   map[string]ModelMapping `mapstructure:"modelMappings"`
	FallbackChain   []string                `mapstructure:"fallbackChain"`
}

type ModelMapping struct {
	Provider string `mapstructure:"provider"`
	Model    string `mapstructure:"model"`
}

type CacheConfig struct {
	Enabled  bool          `mapstructure:"enabled"`
	Backend  string        `mapstructure:"backend"` // "memory" or "redis"
	TTL      time.Duration `mapstructure:"ttl"`
	MaxSize  int           `mapstructure:"maxSize"` // MB for memory
	RedisURL string        `mapstructure:"redisUrl"`
}

type RateLimitConfig struct {
	Enabled bool              `mapstructure:"enabled"`
	Global  RateLimit         `mapstructure:"global"`
	PerKey  RateLimit         `mapstructure:"perKey"`
	PerModel map[string]RateLimit `mapstructure:"perModel"`
	Queuing QueuingConfig     `mapstructure:"queuing"`
}

type RateLimit struct {
	Requests int           `mapstructure:"requests"`
	Window   time.Duration `mapstructure:"window"`
	Tokens   int           `mapstructure:"tokens"`
}

type QueuingConfig struct {
	Enabled      bool          `mapstructure:"enabled"`
	MaxQueueSize int           `mapstructure:"maxQueueSize"`
	MaxWaitTime  time.Duration `mapstructure:"maxWaitTime"`
}

type MetricsConfig struct {
	Enabled   bool   `mapstructure:"enabled"`
	Endpoint  string `mapstructure:"endpoint"`
	Backend   string `mapstructure:"backend"` // "memory" or "postgres"
	Retention string `mapstructure:"retention"`
}

type LoggingConfig struct {
	Level       string `mapstructure:"level"`
	Format      string `mapstructure:"format"` // "json" or "console"
	RequestBody bool   `mapstructure:"requestBody"`
}

func Load(configPath string) (*Config, error) {
	v := viper.New()

	// Set defaults
	setDefaults(v)

	// Load config file if provided
	if configPath != "" {
		v.SetConfigFile(configPath)
	} else {
		v.SetConfigName("gateway")
		v.SetConfigType("yaml")
		v.AddConfigPath(".")
		v.AddConfigPath("/etc/llm-gateway")
		v.AddConfigPath("$HOME/.llm-gateway")
	}

	// Read config file
	if err := v.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, fmt.Errorf("error reading config: %w", err)
		}
		// Config file not found, use defaults
	}

	// Override with environment variables
	v.SetEnvPrefix("LLM_GATEWAY")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	// Unmarshal config
	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("error unmarshaling config: %w", err)
	}

	// Expand environment variables in API keys
	for i := range cfg.Providers {
		cfg.Providers[i].APIKey = expandEnv(cfg.Providers[i].APIKey)
	}

	return &cfg, nil
}

func setDefaults(v *viper.Viper) {
	// Server defaults
	v.SetDefault("server.port", 8080)
	v.SetDefault("server.host", "0.0.0.0")
	v.SetDefault("server.readTimeout", "30s")
	v.SetDefault("server.writeTimeout", "120s")
	v.SetDefault("server.cors.enabled", true)
	v.SetDefault("server.cors.allowedOrigins", []string{"*"})
	v.SetDefault("server.cors.allowedMethods", []string{"GET", "POST", "OPTIONS"})
	v.SetDefault("server.cors.allowedHeaders", []string{"*"})

	// Cache defaults
	v.SetDefault("cache.enabled", true)
	v.SetDefault("cache.backend", "memory")
	v.SetDefault("cache.ttl", "1h")
	v.SetDefault("cache.maxSize", 512)

	// Rate limit defaults
	v.SetDefault("rateLimit.enabled", false)
	v.SetDefault("rateLimit.global.requests", 10000)
	v.SetDefault("rateLimit.global.window", "1m")
	v.SetDefault("rateLimit.perKey.requests", 1000)
	v.SetDefault("rateLimit.perKey.window", "1m")

	// Metrics defaults
	v.SetDefault("metrics.enabled", true)
	v.SetDefault("metrics.endpoint", "/metrics")
	v.SetDefault("metrics.backend", "memory")

	// Logging defaults
	v.SetDefault("logging.level", "info")
	v.SetDefault("logging.format", "json")
	v.SetDefault("logging.requestBody", false)
}

func expandEnv(s string) string {
	if strings.HasPrefix(s, "${") && strings.HasSuffix(s, "}") {
		envVar := s[2 : len(s)-1]
		return os.Getenv(envVar)
	}
	return s
}

func DefaultConfig() *Config {
	return &Config{
		Server: ServerConfig{
			Port:         8080,
			Host:         "0.0.0.0",
			ReadTimeout:  30 * time.Second,
			WriteTimeout: 120 * time.Second,
			CORS: CORSConfig{
				Enabled:        true,
				AllowedOrigins: []string{"*"},
				AllowedMethods: []string{"GET", "POST", "OPTIONS"},
				AllowedHeaders: []string{"*"},
			},
		},
		Cache: CacheConfig{
			Enabled: true,
			Backend: "memory",
			TTL:     time.Hour,
			MaxSize: 512,
		},
		RateLimit: RateLimitConfig{
			Enabled: false,
		},
		Metrics: MetricsConfig{
			Enabled:  true,
			Endpoint: "/metrics",
			Backend:  "memory",
		},
		Logging: LoggingConfig{
			Level:  "info",
			Format: "json",
		},
	}
}
