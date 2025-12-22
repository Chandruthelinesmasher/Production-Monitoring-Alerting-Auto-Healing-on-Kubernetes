# ACR Role Assignment for AKS
# This grants the AKS cluster permission to pull images from ACR
# This replaces the commented-out role assignment in main.tf

resource "azurerm_role_assignment" "aks_acr_pull" {
  principal_id                     = module.aks.kubelet_identity_object_id
  role_definition_name             = "AcrPull"
  scope                            = module.acr.id
  skip_service_principal_aad_check = true

  depends_on = [module.aks, module.acr]
}

# Output for verification
output "acr_role_assignment_id" {
  value       = azurerm_role_assignment.aks_acr_pull.id
  description = "The ID of the ACR role assignment"
}