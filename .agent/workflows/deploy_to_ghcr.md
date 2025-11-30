---
description: How to deploy the Docker container to GitHub Container Registry (GHCR)
---

# Deploying to GitHub Container Registry (GHCR)

This project uses GitHub Actions to automatically build and publish Docker images to GHCR.

## Automated Deployment

The workflow is defined in `.github/workflows/docker-publish.yml`.

### Triggers
The deployment runs automatically when:
1.  Code is pushed to the `main` branch.
2.  A new tag starting with `v` (e.g., `v1.0.0`) is pushed.
3.  Manually triggered via the "Run workflow" button in the GitHub Actions tab.

### What it does
1.  **Builds two versions**:
    *   **Online**: Standard version using CDNs.
    *   **Offline**: Self-contained version with bundled assets.
2.  **Cache Busting**:
    *   Injects the commit SHA into `index.html` and JS imports during the build to ensure clients receive the latest files.
3.  **Tags**:
    *   `latest` / `latest-offline`
    *   `<commit-sha>` / `<commit-sha>-offline`
    *   `v1.0.0` / `v1.0.0-offline` (for release tags)
4.  **Publishes**: Pushes these images to `ghcr.io/<username>/virgin-voyages-planner`.

## Manual / Local Build

If you need to build the images locally (e.g., for testing), use the helper script:

```bash
./build_docker.sh
```

This script mimics the CI process, building both online and offline versions and tagging them with your current local git commit SHA.

## Prerequisites for GHCR

Ensure your GitHub repository settings allow the Action to write packages:
1.  Go to **Settings** > **Actions** > **General**.
2.  Under **Workflow permissions**, select **Read and write permissions**.
3.  Click **Save**.
