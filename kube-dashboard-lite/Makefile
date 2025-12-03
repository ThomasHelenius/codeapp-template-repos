.PHONY: build run test clean docker lint

VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_DATE ?= $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
LDFLAGS := -ldflags="-s -w -X main.version=$(VERSION) -X main.commit=$(COMMIT) -X main.buildDate=$(BUILD_DATE)"

build:
	go build $(LDFLAGS) -o bin/kdl ./cmd/kdl

run: build
	./bin/kdl

run-dev:
	go run ./cmd/kdl

test:
	go test -v ./...

clean:
	rm -rf bin/

lint:
	golangci-lint run

docker:
	docker build \
		--build-arg VERSION=$(VERSION) \
		--build-arg COMMIT=$(COMMIT) \
		--build-arg BUILD_DATE=$(BUILD_DATE) \
		-t kube-dashboard-lite:$(VERSION) .

# Release binaries for multiple platforms
release:
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o bin/kdl-linux-amd64 ./cmd/kdl
	GOOS=linux GOARCH=arm64 go build $(LDFLAGS) -o bin/kdl-linux-arm64 ./cmd/kdl
	GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) -o bin/kdl-darwin-amd64 ./cmd/kdl
	GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o bin/kdl-darwin-arm64 ./cmd/kdl
	GOOS=windows GOARCH=amd64 go build $(LDFLAGS) -o bin/kdl-windows-amd64.exe ./cmd/kdl

# Install to system
install: build
	cp bin/kdl /usr/local/bin/kdl
