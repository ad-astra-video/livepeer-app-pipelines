# Multi-stage build for C2PA video signing and verification container
FROM rust:1.80-bullseye AS rust-builder

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    pkg-config \
    libssl-dev \
    libclang-dev \
    cmake \
    && rm -rf /var/lib/apt/lists/*

# Install nightly toolchain for edition2024 support
RUN rustup toolchain install nightly
RUN rustup default nightly

# Clone and build c2pa-rs with secp256k1 support
WORKDIR /build
RUN git clone https://github.com/streamplace/c2pa-rs.git
WORKDIR /build/c2pa-rs

RUN git checkout 544825abfaf9e588813e18dba70c8d5afd039d46

RUN rm -f Cargo.lock
# Build with nightly toolchain
RUN cargo build --release --bin c2patool

# Go builder stage for secp256k1-certgen
FROM golang:1.23-bullseye AS go-builder

# Set GOTOOLCHAIN to auto to allow Go to download newer versions
ENV GOTOOLCHAIN=auto

WORKDIR /build
RUN git clone https://github.com/iameli/secp256k1-certgen.git
RUN git -C secp256k1-certgen checkout 7555d69836c3d6409b92e595ff252274e2f0cfa2
WORKDIR /build/secp256k1-certgen
RUN go mod tidy && go build -o certgen certgen.go

# Final runtime stage
FROM python:3.11-slim-bullseye

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libssl1.1 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy built binaries
COPY --from=rust-builder /build/c2pa-rs/target/release/c2patool /usr/local/bin/
COPY --from=go-builder /build/secp256k1-certgen/certgen /usr/local/bin/

# Set up Python environment
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p /app/uploads /app/outputs /app/certs /app/temp

# Set permissions
RUN chmod +x /usr/local/bin/c2patool /usr/local/bin/certgen

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Start the application
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
