#!/bin/bash
# PF Dashboard Deployment Script
# Deploy to central-ctx cluster

set -e

# Configuration
CONTEXT="central-ctx"
NAMESPACE="pf-dashboard"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="${SCRIPT_DIR}/k8s"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  PF Dashboard Deployment${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check context
echo -e "${YELLOW}[1/8] Checking Kubernetes context...${NC}"
kubectl config use-context ${CONTEXT}
echo -e "${GREEN}✅ Using context: ${CONTEXT}${NC}"
echo ""

# Create namespace
echo -e "${YELLOW}[2/8] Creating namespace...${NC}"
kubectl apply -f ${K8S_DIR}/namespace.yaml
echo -e "${GREEN}✅ Namespace created${NC}"
echo ""

# Apply RBAC
echo -e "${YELLOW}[3/8] Applying RBAC...${NC}"
kubectl apply -f ${K8S_DIR}/rbac.yaml
echo -e "${GREEN}✅ RBAC applied${NC}"
echo ""

# Apply ConfigMap and Secret
echo -e "${YELLOW}[4/8] Applying ConfigMap and Secret...${NC}"
kubectl apply -f ${K8S_DIR}/configmap.yaml
kubectl apply -f ${K8S_DIR}/secret.yaml
echo -e "${GREEN}✅ ConfigMap and Secret applied${NC}"
echo ""

# Deploy API
echo -e "${YELLOW}[5/8] Deploying API server...${NC}"
kubectl apply -f ${K8S_DIR}/api-deployment.yaml
echo -e "${GREEN}✅ API server deployed${NC}"
echo ""

# Deploy UI
echo -e "${YELLOW}[6/8] Deploying UI...${NC}"
kubectl apply -f ${K8S_DIR}/ui-deployment.yaml
echo -e "${GREEN}✅ UI deployed${NC}"
echo ""

# Generate and apply kubeconfig secret from current contexts
echo -e "${YELLOW}[7/8] Generating kubeconfig secret from current contexts...${NC}"
TEMP_DIR=$(mktemp -d)
kubectl config view --raw --minify --flatten --context=karmada-member1-ctx > ${TEMP_DIR}/member1.yaml
kubectl config view --raw --minify --flatten --context=karmada-member2-ctx > ${TEMP_DIR}/member2.yaml
kubectl config view --raw --minify --flatten --context=central-ctx > ${TEMP_DIR}/central.yaml
KUBECONFIG=${TEMP_DIR}/member1.yaml:${TEMP_DIR}/member2.yaml:${TEMP_DIR}/central.yaml kubectl config view --flatten --raw > ${TEMP_DIR}/merged.yaml
kubectl -n ${NAMESPACE} create secret generic kubeconfig-secret --from-file=config=${TEMP_DIR}/merged.yaml --dry-run=client -o yaml | kubectl apply -f -
rm -rf ${TEMP_DIR}
echo -e "${GREEN}✅ Kubeconfig secret generated and applied${NC}"
echo ""

# Expose NodePort services
echo -e "${YELLOW}[8/8] Exposing NodePort services...${NC}"
kubectl apply -f ${K8S_DIR}/nodeport-services.yaml
echo -e "${GREEN}✅ NodePort services exposed (UI: 30080, API: 30088)${NC}"
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Wait for pods
echo -e "${YELLOW}Waiting for pods to be ready...${NC}"
kubectl -n ${NAMESPACE} rollout status deployment/pf-dashboard-api --timeout=120s || true
kubectl -n ${NAMESPACE} rollout status deployment/pf-dashboard-ui --timeout=120s || true

echo ""
echo -e "${GREEN}Pod Status:${NC}"
kubectl -n ${NAMESPACE} get pods

echo ""
echo -e "${GREEN}Service Status:${NC}"
kubectl -n ${NAMESPACE} get svc

echo ""
echo -e "${YELLOW}To access the dashboard:${NC}"
echo "  NodePort UI:  http://<NODE_IP>:30080"
echo "  NodePort API: http://<NODE_IP>:30088"
echo ""
echo "Or use port-forward:"
echo "  kubectl -n ${NAMESPACE} port-forward svc/pf-dashboard-ui 8081:80"
echo "  kubectl -n ${NAMESPACE} port-forward svc/pf-dashboard-api 8080:8080"
echo ""
echo "Then open: http://localhost:8081"
