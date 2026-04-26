# Use a stable Ubuntu base image
FROM ubuntu:22.04

# Prevent interactive prompts during apt installations
ENV DEBIAN_FRONTEND=noninteractive

RUN echo 'alias pip=pip3' >> ~/.bashrc
RUN echo 'alias python=python3' >> ~/.bashrc

# 1. Install standard C++ build dependencies required by DCSS
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    python3 \
    python3-pip \
    python3-venv \
    perl \
    bison \
    flex \
    pkg-config \
    wget \
    curl \
    unzip \
    libpng-dev \
    && rm -rf /var/lib/apt/lists/*

# 2. Set up Emscripten SDK (emsdk)
WORKDIR /opt
RUN git clone https://github.com/emscripten-core/emsdk.git
WORKDIR /opt/emsdk

# Install and activate the latest stable emsdk
# (We pin to a specific recent version to ensure reproducibility)
RUN ./emsdk install 5.0.6 \
    && ./emsdk activate 5.0.6

# 3. Add emsdk to the environment path for all future RUN commands and interactive shells
ENV PATH="/opt/emsdk:/opt/emsdk/upstream/emscripten:${PATH}"
ENV EMSDK="/opt/emsdk"
ENV EM_CONFIG="/opt/emsdk/.emscripten"

# 4. Set up the working directory for the agent
WORKDIR /workspace/dcss

# 2. Create the virtual environment
RUN python3 -m venv /.venv

# 3. Install packages by calling the venv's pip directly
# This avoids the need for "source .venv/bin/activate"
RUN /.venv/bin/pip install pyyaml

# 4. (Optional) Set the PATH so your app uses the venv by default
ENV PATH="/.venv/bin:$PATH"

# 5. Default command drops the agent into a bash shell ready to compile
CMD ["/bin/bash"]
