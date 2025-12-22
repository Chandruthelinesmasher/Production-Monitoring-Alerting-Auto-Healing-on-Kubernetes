# terraform/environments/dev/terraform.tfvars
# Development Environment Configuration

# General Settings
location    = "eastus"
environment = "dev"

tags = {
  Environment = "Development"
  Project     = "SRE-Monitoring"
  ManagedBy   = "Terraform"
  Owner       = "SRE-Team"
  CostCenter  = "Engineering"
}

# Resource Group
resource_group_name = "rg-sre-monitoring-dev"

# Azure Container Registry
acr_name = "acrsremonitoringdev"
acr_sku  = "Basic"

# AKS Cluster
aks_cluster_name   = "aks-sre-monitoring-dev"
aks_dns_prefix     = "aks-sre-dev"
kubernetes_version = "1.27.9"

# Default Node Pool Configuration
default_node_pool = {
  name                = "system"
  node_count          = 2
  vm_size             = "Standard_D2s_v3"
  availability_zones  = ["1", "2"]
  enable_auto_scaling = true
  min_count           = 2
  max_count           = 5
}

# Network Configuration
network_plugin    = "azure"
load_balancer_sku = "standard"
service_cidr      = "10.0.0.0/16"
dns_service_ip    = "10.0.0.10"

# Kubernetes Namespaces
k8s_namespaces = ["app", "monitoring", "ingress"]

