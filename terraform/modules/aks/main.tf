resource "azurerm_kubernetes_cluster" "main" {
  name                = var.name
  location            = var.location
  resource_group_name = var.resource_group_name
  dns_prefix          = var.dns_prefix
  kubernetes_version  = var.kubernetes_version

  default_node_pool {
    name       = var.default_node_pool.name
    node_count = var.default_node_pool.enable_auto_scaling ? null : var.default_node_pool.node_count
    vm_size    = var.default_node_pool.vm_size
    zones      = var.default_node_pool.availability_zones

    # Auto-scaling configuration
    enable_auto_scaling = var.default_node_pool.enable_auto_scaling
    min_count           = var.default_node_pool.enable_auto_scaling ? var.default_node_pool.min_count : null
    max_count           = var.default_node_pool.enable_auto_scaling ? var.default_node_pool.max_count : null

    # Additional settings
    os_disk_size_gb       = 30
    type                  = "VirtualMachineScaleSets"
    enable_node_public_ip = false
  }

  identity {
    type = "SystemAssigned"
  }

  network_profile {
    network_plugin    = var.network_profile.network_plugin
    load_balancer_sku = var.network_profile.load_balancer_sku
    service_cidr      = var.network_profile.service_cidr
    dns_service_ip    = var.network_profile.dns_service_ip
  }

  tags = var.tags
}
