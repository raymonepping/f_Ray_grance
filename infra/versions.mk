# F-Ray-grance pinned runtime images (arm64 digests observed in Phase 00/01).
# Make pulls these with --platform linux/arm64; Terraform only reads local images.
PG_IMAGE     := docker.io/pgvector/pgvector:0.8.7-pg18-trixie@sha256:14d8a514128e8a98150fa391e522e05a8bf70e17bf1a69448fdb7a436c2187c6
VAULT_IMAGE  := docker.io/hashicorp/vault:2.1.2@sha256:7d8aca849b113b416a5b90b73659c46190c3720463f0b53da22440c2ada3b36e
OLLAMA_IMAGE := docker.io/ollama/ollama:0.40.2@sha256:fd3acc213049eb340e64996e49145e1e8dd5d054a29ebcee12a6eff215f4b117
CADDY_IMAGE  := docker.io/library/caddy:2.11.6-alpine@sha256:ed9acd2f75ce6cd125d05a1c9f625fdc47bc979d10a1da1ba9363d0d2c9f9f2c
NODE_IMAGE   := docker.io/library/node:24.21.0-trixie-slim@sha256:f78037e2794cbe13ccef68c8a3cdca5c263c27ff6d747617cb87206daf4d12a0
EMBED_MODEL  := nomic-embed-text:v1.5
