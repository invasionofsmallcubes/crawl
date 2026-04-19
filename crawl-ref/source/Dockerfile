# Use a stable Ubuntu base image
FROM ubuntu:22.04

# Prevent interactive prompts during apt installations
ENV DEBIAN_FRONTEND=noninteractive

# 1. Install standard C++ build dependencies required by DCSS
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    python3 \
    python3-pip \
    perl \
    bison \
    flex \
    pkg-config \
    wget \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# 2. Set up Emscripten SDK (emsdk)
WORKDIR /opt
RUN git clone https://github.com/emscripten-core/emsdk.git
WORKDIR /opt/emsdk

# Install and activate the latest stable emsdk
# (We pin to a specific recent version to ensure reproducibility)
RUN ./emsdk install 3.1.55 \
    && ./emsdk activate 3.1.55

# 3. Add emsdk to the environment path for all future RUN commands and interactive shells
ENV PATH="/opt/emsdk:/opt/emsdk/upstream/emscripten:${PATH}"
ENV EMSDK="/opt/emsdk"
ENV EM_CONFIG="/opt/emsdk/.emscripten"

# 4. Set up the working directory for the agent
WORKDIR /workspace/dcss

# 5. Default command drops the agent into a bash shell ready to compile
CMD ["/bin/bash"]