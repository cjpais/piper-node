#!/bin/bash
docker buildx build --platform linux/amd64,linux/arm64 -t cjpais/piper-http --push .
# docker buildx build --platform linux/amd64,linux/arm64 -t cjpais/piper-dev .