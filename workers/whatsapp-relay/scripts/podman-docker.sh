#!/usr/bin/env bash
# Wrangler requests a local Docker image with provenance disabled. Podman already
# writes into its local image store and does not implement these BuildKit flags.
set -euo pipefail
# Podman retains the local uncompressed manifest digest after a compressed push.
# Wrangler needs the registry's digest for Cloudflare image preparation.
if [[ "$#" == 5 && "$1" == "image" && "$2" == "inspect" && "$3" == registry.cloudflare.com/* && "$5" == *RepoDigests* ]]; then
    digest=$(skopeo inspect --no-tags --format '{{.Digest}}' "docker://$3")
    [[ "$digest" =~ ^sha256:[a-f0-9]{64}$ ]]
    repository=${3%@*}
    if [[ "$3" != *@* ]]; then repository=${3%:*}; fi
    printf '["%s@%s"]\n' "$repository" "$digest"
    exit 0
fi
if [[ "$#" == 4 && "$1" == "manifest" && "$2" == "inspect" && "$3" == "-v" && "$4" == registry.cloudflare.com/* ]]; then
    digest=$(skopeo inspect --no-tags --format '{{.Digest}}' "docker://$4")
    [[ "$digest" =~ ^sha256:[a-f0-9]{64}$ ]]
    printf '{"Descriptor":{"digest":"%s"}}\n' "$digest"
    exit 0
fi
args=()
dockerfile=""
previous=""
for arg in "$@"; do
    if [[ "$1" == "build" && "$previous" == "-f" && "$arg" == "-" ]]; then
        # Podman opens /dev/stdin by pathname; Wrangler supplies a pipe instead.
        dockerfile=$(mktemp /tmp/whatsover-dockerfile.XXXXXX)
        trap 'rm -f "$dockerfile"' EXIT
        cat > "$dockerfile"
        args+=("$dockerfile")
        previous="$arg"
        continue
    fi
    case "$arg" in
        --load|--provenance=false) ;;
        *) args+=("$arg") ;;
    esac
    previous="$arg"
done
if [[ -n "$dockerfile" ]]; then
    # Match Docker's v2 image format instead of Podman's default OCI manifest.
    podman "${args[@]}" --format docker
else
    exec podman "${args[@]}"
fi
