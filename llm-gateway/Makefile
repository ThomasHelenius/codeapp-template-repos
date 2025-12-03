.PHONY: build run test clean docker docker-run lint

VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_DATE ?= $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
LDFLAGS := -ldflags="-s -w -X main.version=$(VERSION) -X main.commit=$(COMMIT) -X main.buildDate=$(BUILD_DATE)"

build:
	go build $(LDFLAGS) -o bin/llm-gateway ./cmd/gateway

run: build
	./bin/llm-gateway

run-dev:
	LOG_FORMAT=console LOG_LEVEL=debug go run ./cmd/gateway

test:
	go test -v ./...

test-coverage:
	go test -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html

clean:
	rm -rf bin/
	rm -f coverage.out coverage.html

lint:
	golangci-lint run

docker:
	docker build \
		--build-arg VERSION=$(VERSION) \
		--build-arg COMMIT=$(COMMIT) \
		--build-arg BUILD_DATE=$(BUILD_DATE) \
		-t llm-gateway:$(VERSION) .

docker-run:
	docker run -p 8080:8080 \
		-v $(PWD)/gateway.yaml:/app/gateway.yaml \
		-e OPENAI_API_KEY \
		-e ANTHROPIC_API_KEY \
		llm-gateway:$(VERSION)

docker-compose-up:
	docker-compose up --build

docker-compose-down:
	docker-compose down

# Release binaries for multiple platforms
release:
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o bin/llm-gateway-linux-amd64 ./cmd/gateway
	GOOS=linux GOARCH=arm64 go build $(LDFLAGS) -o bin/llm-gateway-linux-arm64 ./cmd/gateway
	GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) -o bin/llm-gateway-darwin-amd64 ./cmd/gateway
	GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o bin/llm-gateway-darwin-arm64 ./cmd/gateway
	GOOS=windows GOARCH=amd64 go build $(LDFLAGS) -o bin/llm-gateway-windows-amd64.exe ./cmd/gateway
