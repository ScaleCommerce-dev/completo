#!/bin/sh
set -e

REPO="scalecommerce-dev/completo"
BINARY_NAME="completo"
INSTALL_DIR="/usr/local/bin"

# Detect OS
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
case "$OS" in
  darwin) OS="darwin" ;;
  linux) OS="linux" ;;
  mingw*|msys*|cygwin*) OS="windows" ;;
  *) echo "Unsupported OS: $OS"; exit 1 ;;
esac

# Detect architecture
ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) ARCH="amd64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

SUFFIX="${OS}-${ARCH}"
if [ "$OS" = "windows" ]; then
  SUFFIX="${SUFFIX}.exe"
  BINARY_NAME="${BINARY_NAME}.exe"
fi

echo "Detecting platform: ${OS}/${ARCH}"

# Get latest release download URL
ASSET_NAME="completo-${SUFFIX}"
DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${ASSET_NAME}"

echo "Downloading ${ASSET_NAME}..."
TMP=$(mktemp)
if ! curl -fsSL -o "$TMP" "$DOWNLOAD_URL"; then
  echo "Error: failed to download from ${DOWNLOAD_URL}"
  echo "Check https://github.com/${REPO}/releases for available binaries."
  rm -f "$TMP"
  exit 1
fi

chmod +x "$TMP"

# Remove macOS quarantine attribute if present
if [ "$OS" = "darwin" ] && command -v xattr >/dev/null 2>&1; then
  xattr -d com.apple.quarantine "$TMP" 2>/dev/null || true
fi

# Install
if [ -w "$INSTALL_DIR" ]; then
  mv "$TMP" "${INSTALL_DIR}/${BINARY_NAME}"
else
  echo "Installing to ${INSTALL_DIR} (requires sudo)..."
  sudo mv "$TMP" "${INSTALL_DIR}/${BINARY_NAME}"
fi

echo "Installed $(${INSTALL_DIR}/${BINARY_NAME} version)"
echo ""
echo "Run 'completo config' to set up your credentials."
