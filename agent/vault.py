#!/usr/bin/env python3
# ============================================================================
# vault.py — the AuraOS Vault: encrypted-at-rest, local, stdlib-only storage.
#
# Why this exists (Manifest P11): AI memory belongs to the user and must be
# "encrypted, local, editable, searchable, and deletable." Until now the AI's
# memory and experiential log were plaintext JSON in the state dir. This module
# gives them a real Vault to live in.
#
# TWO INDEPENDENT LAYERS (defence in depth):
#   1. fscrypt (the OS).  On the Pi the Vault directory is an fscrypt volume,
#      unlocked by the user's login credential at boot. When the device is off
#      or the session is locked, the bytes on disk are unreadable. This is the
#      primary at-rest guarantee on real hardware.
#   2. Envelope encryption (this file).  Every value we store is sealed with an
#      authenticated cipher before it ever touches the disk. This means memory
#      is NEVER plaintext on disk — true even in a container/VM where fscrypt is
#      not configured — and on the Pi it is a second, independent lock over the
#      first.
#
# The cipher is built from the standard library only (no third-party crypto):
# a per-message key is derived with scrypt from a random 32-byte master key;
# encryption is a SHA-256 HMAC keystream in counter mode (a PRF-CTR construction)
# and integrity is encrypt-then-MAC with HMAC-SHA256, verified in constant time.
# This is a sound authenticated-encryption scheme; it is not AES only because
# the stdlib ships no AES. On the Pi, fscrypt supplies the AES-XTS layer beneath.
#
# HONEST LIMITS: without a user passphrase, the master key sits in the Vault
# directory at mode 0600. On the Pi that directory is inside the fscrypt volume,
# so the key is itself protected by the device login — an attacker with a cold
# disk image gets neither key nor data. In a bare dev container (no fscrypt) the
# key is on the same disk as the data, so the envelope layer protects against
# leaks that miss the dotfile (backups, a process scoped to Pictures, log
# scrapers) but not against full local disk read. status() reports exactly which
# layers are live so nothing is over-claimed.
# ============================================================================
import hashlib
import hmac
import json
import os
import struct

MAGIC = b"AVLT1"                        # envelope format marker + version
_SCRYPT = dict(n=1 << 14, r=8, p=1)     # ~16 MiB, tuned to be fine on a Pi 5


def default_vault_dir():
    """Where the Vault lives. On the Pi image this path is the fscrypt mount;
    everywhere else it is a plain directory that still gets the envelope layer.
    Overridable for tests / bespoke images via AURA_VAULT_DIR."""
    return os.environ.get(
        "AURA_VAULT_DIR", os.path.expanduser("~/.local/share/aura/vault"))


def _keystream(key, nonce, n):
    """PRF-CTR keystream: HMAC-SHA256(key, nonce||counter) blocks, truncated."""
    out = bytearray()
    ctr = 0
    while len(out) < n:
        out += hmac.new(key, nonce + struct.pack(">Q", ctr), hashlib.sha256).digest()
        ctr += 1
    return bytes(out[:n])


class Vault:
    def __init__(self, root=None):
        self.root = root or default_vault_dir()
        self._keyfile = os.path.join(self.root, ".master.key")
        self._master = None             # loaded lazily so a locked vault degrades

    # ---- availability ------------------------------------------------------
    def available(self):
        """True when the Vault can be written to right now. On the Pi this is
        False when the fscrypt volume is not unlocked (the directory won't be
        writable / present), so callers degrade honestly to 'memory locked'."""
        try:
            os.makedirs(self.root, exist_ok=True)
            os.chmod(self.root, 0o700)
            return os.access(self.root, os.W_OK)
        except Exception:
            return False

    def _key(self):
        """Load or mint the 32-byte master key (0600). Cached in memory."""
        if self._master is not None:
            return self._master
        try:
            with open(self._keyfile, "rb") as fh:
                k = fh.read()
            if len(k) >= 32:
                self._master = k[:32]
                return self._master
        except FileNotFoundError:
            pass
        k = os.urandom(32)
        os.makedirs(self.root, exist_ok=True)
        os.chmod(self.root, 0o700)
        fd = os.open(self._keyfile, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "wb") as fh:
            fh.write(k)
        self._master = k
        return self._master

    # ---- the cipher --------------------------------------------------------
    def _seal(self, name, plaintext):
        salt = os.urandom(16)
        nonce = os.urandom(16)
        master = self._key()
        # bind the derivation to the record name so files aren't interchangeable
        base = hashlib.scrypt(master, salt=salt + name.encode(), dklen=64, **_SCRYPT)
        enc_key, mac_key = base[:32], base[32:]
        ct = bytes(a ^ b for a, b in zip(plaintext, _keystream(enc_key, nonce, len(plaintext))))
        tag = hmac.new(mac_key, MAGIC + salt + nonce + ct, hashlib.sha256).digest()
        return MAGIC + salt + nonce + ct + tag

    def _open(self, name, blob):
        if not blob.startswith(MAGIC):
            raise ValueError("not an Aura vault envelope")
        off = len(MAGIC)
        salt, nonce = blob[off:off + 16], blob[off + 16:off + 32]
        body = blob[off + 32:-32]
        tag = blob[-32:]
        master = self._key()
        base = hashlib.scrypt(master, salt=salt + name.encode(), dklen=64, **_SCRYPT)
        enc_key, mac_key = base[:32], base[32:]
        want = hmac.new(mac_key, MAGIC + salt + nonce + body, hashlib.sha256).digest()
        if not hmac.compare_digest(tag, want):
            raise ValueError("vault integrity check failed")
        return bytes(a ^ b for a, b in zip(body, _keystream(enc_key, nonce, len(body))))

    # ---- JSON records ------------------------------------------------------
    def _path(self, name):
        return os.path.join(self.root, name + ".enc")

    def read_json(self, name, default):
        try:
            with open(self._path(name), "rb") as fh:
                blob = fh.read()
            return json.loads(self._open(name, blob).decode("utf-8"))
        except FileNotFoundError:
            return json.loads(json.dumps(default))     # deep copy of default
        except Exception:
            # tamper / wrong key / corruption — never crash the agent; the
            # user's memory screen will show empty and can be re-seeded.
            return json.loads(json.dumps(default))

    def write_json(self, name, data):
        if not self.available():
            raise OSError("vault unavailable (locked)")
        blob = self._seal(name, json.dumps(data).encode("utf-8"))
        path = self._path(name)
        tmp = path + ".tmp"
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "wb") as fh:
            fh.write(blob)
        os.replace(tmp, path)

    def has(self, name):
        return os.path.exists(self._path(name))

    def status(self):
        """What the shell can truthfully tell the user about their memory's
        protection right now."""
        return {
            "vault": True,
            "available": self.available(),
            "encrypted": True,
            "envelope": "HMAC-SHA256 PRF-CTR · encrypt-then-MAC · scrypt KDF",
            "fscrypt": _fscrypt_active(self.root),
        }


def _fscrypt_active(path):
    """Best-effort: is this path inside an unlocked fscrypt volume? Reported to
    the user so the status reflects reality on the Pi vs. a bare container."""
    try:
        out = os.popen("fscrypt status %s 2>/dev/null" % _shq(path)).read()
        return "Unlocked: Yes" in out or '"UNLOCKED"' in out
    except Exception:
        return False


def _shq(s):
    return "'" + s.replace("'", "'\\''") + "'"
