#!/bin/bash
# PF Dashboard Undeployment Script
# Remove all resources from central-ctx cluster

set -e

# Configuration
CONTEXT="central-ctx"
NAMESPACE="pf-dashboard"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${RED}========================================${NC}"
echo -e "${RED}  PF Dashboard Undeployment${NC}"
echo -e "${RED}========================================${NC}"
echo ""

# Check context
echo -e "${YELLOW}[1/5] Switching to Kubernetes context...${NC}"
kubectl config use-context ${CONTEXT}
echo -e "${GREEN}✅ Using context: ${CONTEXT}${NC}"
echo ""

# Delete Ingress
echo -e "${YELLOW}[2/5] Deleting Ingress...${NC}"
kubectl -n ${NAMESPACE} delete ingress pf-dashboard --ignore-not-found=true
echo -e "${GREEN}✅ Ingress deleted${NC}"
echo ""

# Delete Deployments and Services
echo -e "${YELLOW}[3/5] Deleting Deployments and Services...${NC}"
kubectl -n ${NAMESPACE} delete deployment pf-dashboard-api pf-dashboard-ui --ignore-not-found=true
kubectl -n ${NAMESPACE} delete svc pf-dashboard-api pf-dashboard-ui pf-dashboard-api-nodeport pf-dashboard-ui-nodeport --ignore-not-found=true
echo -e "${GREEN}✅ Deployments and Services deleted${NC}"
echo ""

# Delete ConfigMaps and Secrets
echo -e "${YELLOW}[4/5] Deleting ConfigMaps and Secrets...${NC}"
kubectl -n ${NAMESPACE} delete configmap pf-dashboard-api-config --ignore-not-found=true
kubectl -n ${NAMESPACE} delete secret pf-dashboard-api-secret kubeconfig-secret --ignore-not-found=true
echo -e "${GREEN}✅ ConfigMaps and Secrets deleted${NC}"
echo ""

# Delete RBAC
echo -e "${YELLOW}[5/5] Deleting RBAC and Namespace...${NC}"
kubectl delete clusterrolebinding pf-dashboard-api --ignore-not-found=true
kubectl delete clusterrole pf-dashboard-api --ignore-not-found=true
kubectl delete namespace ${NAMESPACE} --ignore-not-found=true
echo -e "${GREEN}✅ RBAC and Namespace deleted${NC}"
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Undeployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
