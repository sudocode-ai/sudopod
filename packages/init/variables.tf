variable "prefix" {
  type = string
}

variable "labels" {
  description = "The labels to attach to resources created by this module"
  type        = map(string)
}

variable "gcp_project_id" {
  type        = string
  description = "The GCP project ID"
}

