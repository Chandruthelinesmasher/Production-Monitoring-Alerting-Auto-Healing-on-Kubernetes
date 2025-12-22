# terraform/main.tf
# Simplified Root Module - Without Kubernetes Provider

# Resource Group Module
module "resource_group" {
  source = "./modules/resource-group"

  name     = var.resource_group_name
  location = var.location
  tags     = var.tags
}

# Azure Container Registry Module
module "acr" {
  source = "./modules/acr"

  name                = var.acr_name
  resource_group_name = module.resource_group.name
  location            = module.resource_group.location
  sku                 = var.acr_sku
  admin_enabled       = false
  tags                = var.tags

  depends_on = [module.resource_group]
}

# Azure Kubernetes Service Module
module "aks" {
  source = "./modules/aks"

  name                = var.aks_cluster_name
  resource_group_name = module.resource_group.name
  location            = module.resource_group.location
  dns_prefix          = var.aks_dns_prefix
  # kubernetes_version removed - Azure will auto-select latest stable version

  default_node_pool = var.default_node_pool

  network_profile = {
    network_plugin    = var.network_plugin
    load_balancer_sku = var.load_balancer_sku
    service_cidr      = var.service_cidr
    dns_service_ip    = var.dns_service_ip
  }

  tags = var.tags

  depends_on = [module.resource_group]
}

# Attach ACR to AKS
# Note: Role assignment is handled by the CI/CD pipeline using Azure CLI
# This is commented out to avoid authorization errors during Terraform execution
# The pipeline step "Configure ACR Pull Permission for AKS" handles this instead

# resource "azurerm_role_assignment" "aks_acr_pull" {
#   principal_id                     = module.aks.kubelet_identity_object_id
#   role_definition_name             = "AcrPull"
#   scope                            = module.acr.id
#   skip_service_principal_aad_check = true
#
#   depends_on = [module.aks, module.acr]
# }

# Note: Namespaces will be created via kubectl after AKS is provisioned
# Run: kubectl create namespace app
#      kubectl create namespace monitoring
#      kubectl create namespace ingress