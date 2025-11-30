#!/bin/bash

# Configuration
IMAGE_NAME="virgin-planner"

# Get the current Git commit SHA (short version)
if git rev-parse --git-dir > /dev/null 2>&1; then
    GIT_SHA=$(git rev-parse --short HEAD)
else
    GIT_SHA="unknown"
    echo "Warning: Not a git repository. Using version 'unknown'."
fi

echo "=========================================="
echo "Building Docker Images for $IMAGE_NAME"
echo "Version: $GIT_SHA"
echo "=========================================="

# 1. Build Standard (Online) Version
echo ""
echo "--- Building Standard (Online) Version ---"
docker build \
    --build-arg APP_VERSION="$GIT_SHA" \
    -t "$IMAGE_NAME:latest" \
    -t "$IMAGE_NAME:$GIT_SHA" \
    .

if [ $? -eq 0 ]; then
    echo "✅ Standard build success!"
    echo "   Tags: $IMAGE_NAME:latest, $IMAGE_NAME:$GIT_SHA"
else
    echo "❌ Standard build failed!"
    exit 1
fi

# 2. Build Offline Version
echo ""
echo "--- Building Offline Version ---"
docker build \
    --build-arg OFFLINE_MODE=true \
    --build-arg APP_VERSION="$GIT_SHA" \
    -t "$IMAGE_NAME:offline" \
    -t "$IMAGE_NAME:latest-offline" \
    -t "$IMAGE_NAME:$GIT_SHA-offline" \
    .

if [ $? -eq 0 ]; then
    echo "✅ Offline build success!"
    echo "   Tags: $IMAGE_NAME:offline, $IMAGE_NAME:latest-offline, $IMAGE_NAME:$GIT_SHA-offline"
else
    echo "❌ Offline build failed!"
    exit 1
fi

echo ""
echo "=========================================="
echo "Build Complete!"
echo "Run online:  docker run -p 8000:8000 $IMAGE_NAME:latest"
echo "Run offline: docker run -p 8000:8000 $IMAGE_NAME:offline"
echo "=========================================="
