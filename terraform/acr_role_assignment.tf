# Get AKS kubelet identity
data "azurerm_user_assigned_identity" "aks_kubelet" {
  name                = "${azurerm_kubernetes_cluster.aks.name}-agentpool"
  resource_group_name = azurerm_kubernetes_cluster.aks.node_resource_group
}

# Grant AcrPull role to AKS kubelet identity
resource "azurerm_role_assignment" "acr_pull" {
  scope                = azurerm_container_registry.acr.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_kubernetes_cluster.aks.kubelet_identity[0].object_id

  # Wait for AKS to be fully provisioned
  depends_on = [
    azurerm_kubernetes_cluster.aks,
    azurerm_container_registry.acr
  ]
}

# Output for verification
output "acr_role_assignment_id" {
  value       = azurerm_role_assignment.acr_pull.id
  description = "The ID of the ACR role assignment"
}