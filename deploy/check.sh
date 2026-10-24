#!/usr/bin/env bash
# Validates the deployment files without deploying anything (CI's checks job runs it; it also runs locally):
#  - the Kubernetes overlay builds with kustomize and every resource, and the one-off create-admin Job, is valid for
#    Kubernetes 1.33 (kubeconform, strict, with the External Secrets CRD schema from the community catalogue);
#  - the Compose stack is valid on its own, with the EC2 proxy, and with the proxy and RDS (docker compose config).
# Tools run from their images, pinned by digest. Needs Docker and network access for the images and schemas.
set -euo pipefail
cd "$(dirname "$0")/.."
kustomize=registry.k8s.io/kustomize/kustomize:v5.7.1@sha256:937e7832dc0b09288b1398399dadb97382a27bbc35bee8fdcac47c7de4fff14d
kubeconform=ghcr.io/yannh/kubeconform:v0.7.0@sha256:85dbef6b4b312b99133decc9c6fc9495e9fc5f92293d4ff3b7e1b30f5611823c
work=$(mktemp -d "${RUNNER_TEMP:-$PWD}/deploy-check.XXXXXX")
trap 'rm -rf "$work"' EXIT

docker run --rm -v "$PWD/deploy/k8s:/k8s:ro" "$kustomize" build /k8s/overlays/pilot > "$work/pilot.yaml"
docker run --rm -v "$work:/m:ro" "$kubeconform" -strict -summary -kubernetes-version 1.33.0 \
  -schema-location default \
  -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json' \
  /m/pilot.yaml
sed 's#image: IMAGE#image: demandai-app:check#' deploy/k8s/jobs/create-admin.yaml > "$work/create-admin.yaml"
docker run --rm -v "$work:/m:ro" "$kubeconform" -strict -summary -kubernetes-version 1.33.0 /m/create-admin.yaml

# Placeholder values only: what Compose needs to resolve every variable.
cat > "$work/check.env" <<'EOF'
APP_BASE_URL=https://demandai.example.com
POSTGRES_USER=postgres
POSTGRES_PASSWORD=placeholder
POSTGRES_DB=demandai
DEMANDAI_OWNER_PASSWORD=placeholder
DEMANDAI_APP_PASSWORD=placeholder
DEMANDAI_OPS_PASSWORD=placeholder
SESSION_SECRET=placeholder-placeholder-placeholder-placeholder
DEMANDAI_IMAGE=demandai-app:check
DEMANDAI_HOST=demandai.example.com
ACME_EMAIL=ops@example.com
RDS_HOST=demandai.example.rds.amazonaws.com
EOF
for files in "compose.yaml" "compose.yaml deploy/ec2/compose.proxy.yaml" "compose.yaml deploy/ec2/compose.proxy.yaml deploy/ec2/compose.rds.yaml"; do
  args=()
  for f in $files; do args+=(-f "$f"); done
  docker compose "${args[@]}" --env-file "$work/check.env" config -q
  echo "compose config valid: $files"
done
