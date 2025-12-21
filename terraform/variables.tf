# terraform/variables.tf

# ========================================
# General Variables
# ========================================

variable "location" {
  description = "Azure region for resources"
  type        = string
  default     = "eastus2"

  validation {
    condition     = can(regex("^[a-z0-9]+$", var.location))
    error_message = "Location must be a valid Azure region name."
  }
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "tags" {
  description = "Common tags for all resources"
  type        = map(string)
  default = {
    Project   = "SRE-Monitoring"
    ManagedBy = "Terraform"
    Owner     = "SRE-Team"
  }
}

# ========================================
# Resource Group Variables
# ========================================

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
  default     = "rg-sre-monitoring-dev"
}

# ========================================
# ACR Variables
# ========================================

variable "acr_name" {
  description = "Name of the Azure Container Registry (must be globally unique, alphanumeric only)"
  type        = string
  default     = "acrsremonitoring"

  validation {
    condition     = can(regex("^[a-zA-Z0-9]+$", var.acr_name))
    error_message = "ACR name must be alphanumeric only (no hyphens or special characters)."
  }
}

variable "acr_sku" {
  description = "SKU for Azure Container Registry"
  type        = string
  default     = "Basic"

  validation {
    condition     = contains(["Basic", "Standard", "Premium"], var.acr_sku)
    error_message = "ACR SKU must be Basic, Standard, or Premium."
  }
}

# ========================================
# AKS Variables
# ========================================

variable "aks_cluster_name" {
  description = "Name of the AKS cluster"
  type        = string
  default     = "aks-sre-monitoring-dev"
}

variable "aks_dns_prefix" {
  description = "DNS prefix for AKS cluster"
  type        = string
  default     = "aks-sre"
}

variable "kubernetes_version" {
  description = "Kubernetes version"
  type        = string
  default     = "1.28"
}

# ========================================
# Node Pool Configuration
# ========================================

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
  default = {
    name                = "system"
    node_count          = 2
    vm_size             = "Standard_D2s_v3"
    availability_zones  = ["1", "2"]
    enable_auto_scaling = true
    min_count           = 2
    max_count           = 5
  }
}

# ========================================
# Network Configuration
# ========================================

variable "network_plugin" {
  description = "Network plugin for AKS (azure or kubenet)"
  type        = string
  default     = "azure"

  validation {
    condition     = contains(["azure", "kubenet"], var.network_plugin)
    error_message = "Network plugin must be either 'azure' or 'kubenet'."
  }
}

variable "load_balancer_sku" {
  description = "Load balancer SKU (basic or standard)"
  type        = string
  default     = "standard"

  validation {
    condition     = contains(["basic", "standard"], var.load_balancer_sku)
    error_message = "Load balancer SKU must be either 'basic' or 'standard'."
  }
}

variable "service_cidr" {
  description = "CIDR for Kubernetes services"
  type        = string
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.service_cidr, 0))
    error_message = "Service CIDR must be a valid CIDR block."
  }
}

variable "dns_service_ip" {
  description = "IP address for Kubernetes DNS service (must be within service_cidr)"
  type        = string
  default     = "10.0.0.10"

  validation {
    condition     = can(regex("^([0-9]{1,3}\\.){3}[0-9]{1,3}$", var.dns_service_ip))
    error_message = "DNS service IP must be a valid IP address."
  }
}

# ========================================
# Kubernetes Namespaces
# ========================================

variable "k8s_namespaces" {
  description = "List of Kubernetes namespaces to create"
  type        = list(string)
  default     = ["app", "monitoring", "ingress"]

  validation {
    condition     = length(var.k8s_namespaces) > 0
    error_message = "At least one namespace must be specified."
  }
}