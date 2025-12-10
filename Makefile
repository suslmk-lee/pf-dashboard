# PF Dashboard Makefile
# Container Image Build and Push

# Registry Configuration
REGISTRY := registry.k-paas.org
PROJECT := plugfest
REGISTRY_USER := suslmk1

# Image Names
API_IMAGE := $(REGISTRY)/$(PROJECT)/pf-dashboard-api
UI_IMAGE := $(REGISTRY)/$(PROJECT)/pf-dashboard-ui

# Version (can be overridden: make build VERSION=v1.0.1)
VERSION ?= v1.0.0

# Build Platforms
PLATFORM ?= linux/amd64

.PHONY: help build build-api build-ui push push-api push-ui login clean all

help: ## Show this help
	@echo "PF Dashboard Build System"
	@echo ""
	@echo "Usage: make [target] [VERSION=v1.0.0]"
	@echo ""
	@echo "Targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'
	@echo ""
	@echo "Examples:"
	@echo "  make build                    # Build all images with default version (v1.0.0)"
	@echo "  make build VERSION=v1.0.1     # Build all images with custom version"
	@echo "  make push                     # Push all images (requires login first)"
	@echo "  make all VERSION=v1.0.1       # Build and push all images"

## Build Targets

build: build-api build-ui ## Build all container images

build-api: ## Build API server image
	@echo "Building API image: $(API_IMAGE):$(VERSION)"
	docker build -t $(API_IMAGE):$(VERSION) \
		--platform $(PLATFORM) \
		./pf-dashboard-api
	@echo "✅ API image built: $(API_IMAGE):$(VERSION)"

build-ui: ## Build UI image
	@echo "Building UI image: $(UI_IMAGE):$(VERSION)"
	docker build -t $(UI_IMAGE):$(VERSION) \
		--platform $(PLATFORM) \
		./pf-dashboard-ui
	@echo "✅ UI image built: $(UI_IMAGE):$(VERSION)"

## Push Targets

push: push-api push-ui ## Push all container images

push-api: ## Push API server image
	@echo "Pushing API image: $(API_IMAGE):$(VERSION)"
	docker push $(API_IMAGE):$(VERSION)
	@echo "✅ API image pushed: $(API_IMAGE):$(VERSION)"

push-ui: ## Push UI image
	@echo "Pushing UI image: $(UI_IMAGE):$(VERSION)"
	docker push $(UI_IMAGE):$(VERSION)
	@echo "✅ UI image pushed: $(UI_IMAGE):$(VERSION)"

## Registry Login

login: ## Login to container registry
	@echo "Logging in to $(REGISTRY) as $(REGISTRY_USER)"
	@echo "Enter password when prompted:"
	docker login $(REGISTRY) -u $(REGISTRY_USER)
	@echo "✅ Logged in to $(REGISTRY)"

## Combined Targets

all: build push ## Build and push all images

## Utility Targets

clean: ## Remove local images
	@echo "Removing local images..."
	-docker rmi $(API_IMAGE):$(VERSION) 2>/dev/null || true
	-docker rmi $(UI_IMAGE):$(VERSION) 2>/dev/null || true
	@echo "✅ Local images removed"

tag-latest: ## Tag current version as latest
	docker tag $(API_IMAGE):$(VERSION) $(API_IMAGE):latest
	docker tag $(UI_IMAGE):$(VERSION) $(UI_IMAGE):latest
	@echo "✅ Tagged $(VERSION) as latest"

push-latest: tag-latest ## Push latest tags
	docker push $(API_IMAGE):latest
	docker push $(UI_IMAGE):latest
	@echo "✅ Latest tags pushed"

## Info

info: ## Show current configuration
	@echo "Registry:     $(REGISTRY)"
	@echo "Project:      $(PROJECT)"
	@echo "User:         $(REGISTRY_USER)"
	@echo "API Image:    $(API_IMAGE):$(VERSION)"
	@echo "UI Image:     $(UI_IMAGE):$(VERSION)"
	@echo "Platform:     $(PLATFORM)"
