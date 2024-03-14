# Use multi-stage builds to keep the final image as small as possible
FROM oven/bun:slim as base
WORKDIR /usr/src/app

# Bundle install steps to reduce layers, using a single RUN command where possible
FROM base AS dependencies
COPY package.json bun.lockb ./
# Install both dev and prod dependencies in one step, then remove devDependencies later
RUN mkdir -p /temp/dev /temp/prod && \
    cp package.json bun.lockb /temp/dev/ && \
    cp package.json bun.lockb /temp/prod/ && \
    cd /temp/dev && bun install --frozen-lockfile && \
    cd /temp/prod && bun install --frozen-lockfile --production

# Install piper and models in a single layer to reduce image size
FROM base AS piper_installer
RUN apt update && apt install -y curl tar && \
    curl -L https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz -o piper.tar.gz && \
    tar -xvf piper.tar.gz -C /usr/local/bin && \
    rm piper.tar.gz && \
    mkdir /models && \
    curl -L "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx?download=true" -o /models/ryan-medium.onnx && \
    curl -L "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx.json?download=true" -o /models/ryan-medium.onnx.json && \
    curl -L "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/semaine/medium/en_GB-semaine-medium.onnx?download=true" -o /models/semaine-medium.onnx && \
    curl -L "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/semaine/medium/en_GB-semaine-medium.onnx.json?download=true" -o /models/semaine-medium.onnx.json

# Final image: copy only the necessary files
FROM base AS release
# Combine apt update and install commands, and clean up in the same layer to reduce size
RUN apt update && apt install -y ffmpeg && apt clean && rm -rf /var/lib/apt/lists/*
COPY --from=dependencies /temp/prod/node_modules /usr/src/app/node_modules
COPY --from=piper_installer /usr/local/bin/piper /usr/local/bin/
COPY --from=piper_installer /models /models

COPY src/ ./src/
COPY index.ts package.json ./

USER bun
EXPOSE 3000/tcp
ENV PORT=3000
ENV MODEL_PATH=/models
ENTRYPOINT ["bun", "run", "index.ts"]
