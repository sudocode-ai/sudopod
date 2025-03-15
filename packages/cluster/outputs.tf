output "logs_proxy_ip" {
  value = module.network.logs_proxy_ip
}

output "client_cluster_instance_group_name" {
  value       = module.client_cluster.instance_group_name
  description = "The name of the client cluster instance group"
}
