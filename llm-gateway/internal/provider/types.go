package provider

import (
	"context"
	"io"
	"time"
)

// ChatCompletionRequest represents the OpenAI-compatible request format
type ChatCompletionRequest struct {
	Model            string         `json:"model"`
	Messages         []Message      `json:"messages"`
	Temperature      *float64       `json:"temperature,omitempty"`
	TopP             *float64       `json:"top_p,omitempty"`
	N                *int           `json:"n,omitempty"`
	Stream           bool           `json:"stream,omitempty"`
	Stop             []string       `json:"stop,omitempty"`
	MaxTokens        *int           `json:"max_tokens,omitempty"`
	PresencePenalty  *float64       `json:"presence_penalty,omitempty"`
	FrequencyPenalty *float64       `json:"frequency_penalty,omitempty"`
	User             string         `json:"user,omitempty"`

	// Gateway extensions
	XGateway *GatewayExtensions `json:"x-gateway,omitempty"`
}

type GatewayExtensions struct {
	Cache    *bool             `json:"cache,omitempty"`
	Timeout  *int              `json:"timeout,omitempty"`
	Provider string            `json:"provider,omitempty"`
	Metadata map[string]string `json:"metadata,omitempty"`
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
	Name    string `json:"name,omitempty"`
}

// ChatCompletionResponse represents the OpenAI-compatible response format
type ChatCompletionResponse struct {
	ID                string   `json:"id"`
	Object            string   `json:"object"`
	Created           int64    `json:"created"`
	Model             string   `json:"model"`
	Choices           []Choice `json:"choices"`
	Usage             Usage    `json:"usage"`
	SystemFingerprint string   `json:"system_fingerprint,omitempty"`
}

type Choice struct {
	Index        int      `json:"index"`
	Message      Message  `json:"message"`
	FinishReason string   `json:"finish_reason"`
	Logprobs     *Logprobs `json:"logprobs,omitempty"`
}

type Logprobs struct {
	Content []LogprobContent `json:"content,omitempty"`
}

type LogprobContent struct {
	Token   string  `json:"token"`
	Logprob float64 `json:"logprob"`
}

type Usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// ChatCompletionChunk for streaming responses
type ChatCompletionChunk struct {
	ID                string        `json:"id"`
	Object            string        `json:"object"`
	Created           int64         `json:"created"`
	Model             string        `json:"model"`
	Choices           []ChunkChoice `json:"choices"`
	SystemFingerprint string        `json:"system_fingerprint,omitempty"`
}

type ChunkChoice struct {
	Index        int         `json:"index"`
	Delta        ChunkDelta  `json:"delta"`
	FinishReason *string     `json:"finish_reason"`
}

type ChunkDelta struct {
	Role    string `json:"role,omitempty"`
	Content string `json:"content,omitempty"`
}

// Provider interface that all LLM providers must implement
type Provider interface {
	// Name returns the provider identifier
	Name() string

	// Models returns the list of supported models
	Models() []string

	// SupportsModel checks if a model is supported
	SupportsModel(model string) bool

	// ChatCompletion performs a chat completion request
	ChatCompletion(ctx context.Context, req *ChatCompletionRequest) (*ChatCompletionResponse, error)

	// ChatCompletionStream performs a streaming chat completion
	ChatCompletionStream(ctx context.Context, req *ChatCompletionRequest) (io.ReadCloser, error)

	// HealthCheck verifies the provider is reachable
	HealthCheck(ctx context.Context) error
}

// ProviderMetrics tracks usage for a provider
type ProviderMetrics struct {
	Provider         string
	Model            string
	PromptTokens     int
	CompletionTokens int
	TotalTokens      int
	LatencyMs        int64
	Cost             float64
	Cached           bool
	Success          bool
	Timestamp        time.Time
}

// Error types
type ProviderError struct {
	Provider   string `json:"provider"`
	StatusCode int    `json:"status_code"`
	Message    string `json:"message"`
	Type       string `json:"type"`
}

func (e *ProviderError) Error() string {
	return e.Message
}

// Model pricing (USD per 1K tokens)
var ModelPricing = map[string]struct {
	Input  float64
	Output float64
}{
	"gpt-4":             {0.03, 0.06},
	"gpt-4-32k":         {0.06, 0.12},
	"gpt-4-turbo":       {0.01, 0.03},
	"gpt-4o":            {0.005, 0.015},
	"gpt-4o-mini":       {0.00015, 0.0006},
	"gpt-3.5-turbo":     {0.0005, 0.0015},
	"claude-3-opus":     {0.015, 0.075},
	"claude-3-sonnet":   {0.003, 0.015},
	"claude-3-haiku":    {0.00025, 0.00125},
	"claude-3-5-sonnet": {0.003, 0.015},
}

// CalculateCost calculates the cost for a completion
func CalculateCost(model string, promptTokens, completionTokens int) float64 {
	pricing, ok := ModelPricing[model]
	if !ok {
		return 0
	}

	inputCost := (float64(promptTokens) / 1000) * pricing.Input
	outputCost := (float64(completionTokens) / 1000) * pricing.Output

	return inputCost + outputCost
}
