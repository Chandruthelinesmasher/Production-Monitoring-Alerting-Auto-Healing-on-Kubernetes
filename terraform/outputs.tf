# terraform/outputs.tf

# ========================================
# Resource Group Outputs
# ========================================

output "resource_group_name" {
  description = "Name of the resource group"
  value       = module.resource_group.name
}

output "resource_group_location" {
  description = "Location of the resource group"
  value       = module.resource_group.location
}

output "resource_group_id" {
  description = "ID of the resource group"
  value       = module.resource_group.id
}

# ========================================
# ACR Outputs
# ========================================

output "acr_id" {
  description = "ID of the Azure Container Registry"
  value       = module.acr.id
}

output "acr_login_server" {
  description = "Login server URL for ACR"
  value       = module.acr.login_server
}

output "acr_name" {
  description = "Name of the ACR"
  value       = module.acr.name
}

# ========================================
# AKS Outputs
# ========================================

output "aks_cluster_id" {
  description = "ID of the AKS cluster"
  value       = module.aks.id
}

output "aks_cluster_name" {
  description = "Name of the AKS cluster"
  value       = module.aks.name
}

output "aks_fqdn" {
  description = "FQDN of the AKS cluster"
  value       = module.aks.fqdn
}

output "aks_node_resource_group" {
  description = "Resource group name for AKS nodes"
  value       = module.aks.node_resource_group
}

output "aks_kubelet_identity" {
  description = "Kubelet identity object ID"
  value       = module.aks.kubelet_identity_object_id
  sensitive   = true
}

output "aks_principal_id" {
  description = "AKS system-assigned identity principal ID"
  value       = module.aks.principal_id
  sensitive   = true
}

# ========================================
# Connection Commands
# ========================================

output "kube_config_raw" {
  description = "Raw kubeconfig for AKS cluster"
  value       = module.aks.kube_config_raw
  sensitive   = true
}

output "get_credentials_command" {
  description = "Command to get AKS credentials"
  value       = "az aks get-credentials --resource-group ${module.resource_group.name} --name ${module.aks.name} --overwrite-existing"
}

output "acr_login_command" {
  description = "Command to login to ACR"
  value       = "az acr login --name ${module.acr.name}"
}

# ========================================
# Deployment Information
# ========================================

output "deployment_info" {
  description = "Deployment information summary"
  value = {
    resource_group = module.resource_group.name
    location       = module.resource_group.location
    aks_cluster    = module.aks.name
    aks_fqdn       = module.aks.fqdn
    acr_registry   = module.acr.login_server
    environment    = var.environment
    namespaces     = var.k8s_namespaces
  }
}

# ========================================
# URLs for Services
# ========================================

output "next_steps" {
  description = "Next steps after deployment"
  value       = <<-EOT
  
  ✅ Infrastructure deployed successfully!
  
  📋 Next Steps:
  1. Get AKS credentials:
     ${format("az aks get-credentials --resource-group %s --name %s --overwrite-existing", module.resource_group.name, module.aks.name)}
  
  2. Login to ACR:
     ${format("az acr login --name %s", module.acr.name)}
  
  3. Verify cluster:
     kubectl get nodes
     kubectl get namespaces
  
  4. Build and push your image:
     docker build -t ${module.acr.login_server}/k8s-sre-monitoring-app:latest ./app
     docker push ${module.acr.login_server}/k8s-sre-monitoring-app:latest
  
  5. Deploy application:
     kubectl apply -f k8s/app/ -n app
  
  6. Install monitoring:
     helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
     helm upgrade --install monitoring prometheus-community/kube-prometheus-stack -n monitoring --create-namespace
  
  EOT
}