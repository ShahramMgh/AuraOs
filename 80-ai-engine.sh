#!/usr/bin/env bash
# AuraOS — step 8: the Native Intelligence Layer (Phase II)
#
# Installs the local inference runtime (Ollama) and arranges for a light,
# default model to be present, so the Assistant works out of the box — while
# still honoring AI-MANIFEST.md: the AI Engine stays OFF by default (the user
# turns it on), and nothing is uploaded anywhere.
#
#   Runtime : Ollama (systemd service, listens on 127.0.0.1:11434 only)
#   Model   : llama3.2:1b — ~1.3 GB, instruction-tuned, runs on a Pi 5
#             pulled automatically on first boot when a network is available
#
# Override the default model at build time:  AURA_AI_MODEL=qwen2.5:1.5b
# Runs inside the arm64 chroot. Safe to re-run.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

MODEL="${AURA_AI_MODEL:-llama3.2:1b}"
echo "── Native Intelligence Layer — runtime + default model (${MODEL}) ──"

# ─── OLLAMA RUNTIME ──────────────────────────────────────────────────────────
if ! command -v ollama >/dev/null 2>&1; then
  apt-get install -y --no-install-recommends curl ca-certificates
  # Official installer: detects arm64, drops the binary in /usr/local/bin and
  # installs a systemd unit. It may try to start the service; in a chroot that
  # is a no-op we tolerate.
  curl -fsSL https://ollama.com/install.sh | sh || {
    echo "warn: ollama install script failed (no network in chroot?)."
    echo "      It will not be retried here; install on-device with the same script."
  }
fi

# Keep inference strictly local: bind loopback only.
mkdir -p /etc/systemd/system/ollama.service.d
cat > /etc/systemd/system/ollama.service.d/10-aura.conf << 'EOF'
[Service]
Environment=OLLAMA_HOST=127.0.0.1:11434
EOF
systemctl enable ollama.service 2>/dev/null || true

# Tell the AI Engine which model is the shipped default.
mkdir -p /etc/aura
echo "AURA_AI_MODEL=${MODEL}" > /etc/aura/ai.env
# Make the agent service pick it up (drop-in; harmless if agent unit absent).
if [ -f /etc/systemd/system/aura-agent.service ]; then
  mkdir -p /etc/systemd/system/aura-agent.service.d
  cat > /etc/systemd/system/aura-agent.service.d/10-ai.conf << EOF
[Service]
EnvironmentFile=/etc/aura/ai.env
EOF
fi

# ─── FIRST-BOOT MODEL PULL ───────────────────────────────────────────────────
# Baking a 1.3 GB model into the image is wasteful and chroot-pulling is fragile
# (needs a running daemon). Instead, pull once on first boot when online. The
# marker prevents re-pulling; the unit waits for the network and for Ollama.
cat > /usr/local/bin/aura-ai-firstpull.sh << EOF
#!/bin/sh
set -e
MARKER=/var/lib/aura/ai-model.pulled
[ -f "\$MARKER" ] && exit 0
[ -r /etc/aura/ai.env ] && . /etc/aura/ai.env
MODEL="\${AURA_AI_MODEL:-${MODEL}}"
# wait for the ollama daemon to answer (up to ~60s)
i=0
while [ \$i -lt 60 ]; do
  curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && break
  i=\$((i+1)); sleep 1
done
echo "Aura: pulling default model \$MODEL …"
if ollama pull "\$MODEL"; then
  mkdir -p /var/lib/aura
  touch "\$MARKER"
  echo "Aura: model \$MODEL ready."
else
  echo "Aura: model pull failed (offline?). Will retry next boot." >&2
  exit 1
fi
EOF
chmod +x /usr/local/bin/aura-ai-firstpull.sh

cat > /etc/systemd/system/aura-ai-firstpull.service << 'EOF'
[Unit]
Description=Aura — pull the default local AI model (first boot)
Wants=network-online.target ollama.service
After=network-online.target ollama.service
ConditionPathExists=!/var/lib/aura/ai-model.pulled

[Service]
Type=oneshot
ExecStart=/usr/local/bin/aura-ai-firstpull.sh
# retry across boots until the model lands
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
EOF
systemctl enable aura-ai-firstpull.service 2>/dev/null || true

install -d -o aura -g aura /var/lib/aura 2>/dev/null || true

echo
echo "Native Intelligence Layer installed."
echo "  Runtime : ollama (127.0.0.1:11434, loopback only)"
echo "  Model   : ${MODEL}  (auto-pulled on first online boot)"
echo "  Engine  : OFF by default — enable in Settings › Intelligence."
