variable "name" {
  description = "AKS cluster name"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
}

variable "resource_group_name" {
  description = "Resource group name"
  type        = string
}

variable "dns_prefix" {
  description = "DNS prefix for AKS"
  type        = string
}

variable "kubernetes_version" {
  description = "Kubernetes version"
  type        = string
  default     = "1.28"
}

variable "default_node_pool" {
  description = "Default node pool configuration"
  type = object({
    name                = string
    node_count          = number
    vm_size             = string
    availability_zones  = list(string)
    enable_auto_scaling = bool
    min_count           = number
    max_count           = number
  })
}

variable "network_profile" {
  description = "Network configuration"
  type = object({
    network_plugin    = string
    load_balancer_sku = string
    service_cidr      = string
    dns_service_ip    = string
  })
}

variable "tags" {
  description = "Tags to apply"
  type        = map(string)
  default     = {}
}
