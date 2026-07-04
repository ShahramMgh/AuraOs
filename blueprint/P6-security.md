# Phase 6 — Security

Threat model (`ARCHITECTURE.md` §1): passive vendor collection, device theft,
silent sensor access. Not nation-state hardware attacks. Stay honest about the
Pi 5's limits.

## 6.1 Boot integrity [P2]
- [ ] **6.1.1 Secure/verified boot — honest ceiling** — Pi 5 has no fused
      secure-boot for our use; document that boot integrity is *not* defended,
      and what an attacker with the SD card can do (evil-maid).
      > **Prompt:** Document the honest boot-integrity ceiling on the Pi 5: no
      > usable fused secure boot, so an attacker with the SD card can tamper
      > pre-decryption. Spell out the evil-maid risk and what it does/doesn't
      > threaten given LUKS. No overclaiming in any user-facing text.
- [ ] **6.1.2 Measured-boot lite** — sign the rootfs image; on boot, verify
      kernel/initramfs hashes against a signed manifest and surface "boot
      integrity: verified/unknown" in Settings › About.
      > **Prompt:** Implement a lightweight integrity check: sign the image, and
      > at boot verify kernel+initramfs hashes against the signed manifest,
      > surfacing "boot integrity: verified/unknown" in Settings › About. Verify
      > a tampered initramfs shows "unknown".

## 6.2 Storage encryption [P1]
- [ ] **6.2.1 LUKS2 full-disk in the shipped image** — `50-image-builder.sh`
      must produce an encrypted root with first-boot passphrase enrollment;
      verify at M2 (today it's in the pipeline design, unverified — 0.3.3).
      > **Prompt:** Confirm `50-image-builder.sh` produces a LUKS2-encrypted root
      > and that first boot enrolls the user passphrase. If it doesn't yet,
      > implement it. Verify on real hardware that the disk is unreadable without
      > the passphrase.
- [ ] **6.2.2 Vault (fscrypt)** — wire the shell's Vault screen to real fscrypt
      status/lock; verify a pulled SD card can't read Vault contents.
      > **Prompt:** Wire the Vault screen to real fscrypt status and lock/unlock
      > via the agent. Verify that with the device locked (or the SD card pulled)
      > Vault contents are unreadable, and that unlock restores them.
- [ ] **6.2.3 Key management** — document key hierarchy (LUKS passphrase, fscrypt
      keys, sync device keypair, AI memory key); no key ever leaves the device.
      > **Prompt:** Document the full key hierarchy: LUKS passphrase → fscrypt
      > keys → sync device keypair → AI-memory key, where each lives, and how
      > they're derived/protected. Confirm from code that no key is ever
      > transmitted off-device.

## 6.3 App containment [P1]
- [ ] **6.3.1 Sandboxed launches** — bubblewrap around every external app with
      permission-store-driven holes (the core gap — 2.1.3, 4.5.2).
      > **Prompt:** Implement/verify the sandboxed launch path (4.5.2): every
      > external app in bubblewrap with only permission-store holes. Red-team it:
      > try to read another app's data or a sensor without a grant and confirm
      > denial.
- [ ] **6.3.2 Application signing** — curated repo entries pinned by hash;
      Flatpak GPG verification on; no sideload without an explicit scary-honest
      consent.
      > **Prompt:** Pin curated repo entries by hash, ensure Flatpak GPG
      > verification is on, and gate any sideload behind an explicit, honest
      > "this app is unverified" consent. Verify an unsigned/altered package is
      > refused by default.
- [ ] **6.3.3 Trusted execution** — no TEE on Pi 5; state it, and keep secrets
      in kernel keyring + fscrypt rather than pretending.
      > **Prompt:** State plainly that the Pi 5 offers no TEE. Keep runtime
      > secrets in the kernel keyring + fscrypt and document why that's the best
      > available. Ensure no code claims hardware-backed key protection.

## 6.4 Hardening [P2]
- [ ] **6.4.1 Kernel hardening** — apply a KSPP-informed sysctl/config set;
      lockdown mode if it doesn't break V3D.
      > **Prompt:** Apply a KSPP-informed sysctl + kernel-cmdline hardening set;
      > test kernel lockdown mode and keep it only if V3D/GPU still works.
      > Document each toggle and its cost. Verify the shell is unaffected.
- [ ] **6.4.2 Exploit mitigations / memory protections** — verify Ubuntu
      defaults (ASLR, NX, stack protector) are intact in our image; enable
      `hardened_malloc` for agent/engine if overhead allows.
      > **Prompt:** Verify ASLR/NX/stack-protector are intact in our built image
      > (`checksec` on key binaries). Trial `hardened_malloc` for the agent and
      > engine and keep it if the overhead is acceptable on the Pi 5.
- [ ] **6.4.3 AppArmor everywhere** — profiles for `aura-agent.py`,
      `ai_engine.py`, cog, and each launched app (4.5.4).
      > **Prompt:** Ensure enforcing AppArmor profiles exist for the agent,
      > engine, cog, and launched apps (4.5.4). Confirm `aa-status` shows no
      > unconfined Aura process and that complain-mode logs are clean.

## 6.5 Privacy protections [P1]
- [ ] **6.5.1 Sensor truth end-to-end** — portal/PipeWire/libcamera mediation
      (4.5.3, 4.11, 4.12) so the ribbon can't be bypassed; red-team it: try to
      grab the mic without lighting the indicator.
      > **Prompt:** With portal + PipeWire + libcamera mediation in place, red-
      > team the sensor indicator: attempt to capture mic/camera/location without
      > lighting the ribbon. Every path must either light it or be blocked.
      > Document the attempts and results.
- [ ] **6.5.2 Network enforcement** — per-app block rules actually enforced in
      the firewall (4.10.1), and the network log made tamper-evident.
      > **Prompt:** Verify per-app network blocks are enforced in nftables
      > (4.10.1), not just logged, and make the network log append-only/tamper-
      > evident. Test that a blocked app cannot exfiltrate over any route.

## 6.6 The agent itself [P1]
- [x] **6.6.1 Authenticate the local API** — per-boot bearer token injected
      into the shell session; `/api/exec` and `/api/files/*` additionally
      gated; today any local process has root-of-session power (1.4.1).
      > **Prompt:** Add per-boot bearer-token auth to every `/api/*` route,
      > injected into the shell at load; refuse unauthenticated callers. Add an
      > extra gate on `/api/exec` and `/api/files/*`. Verify a rogue local
      > process is blocked while the shell works. Implements roadmap 3.3.1.
      >
      > **DONE (this session)** — see 3.3.1 for the implementation + verification.
      > Every `/api/*` route (incl. `/api/exec` and `/api/files/*`) now refuses an
      > unauthenticated caller with 401; `tests/test_auth.py` is the regression.
      > Remaining hardening still open here: least-privilege split (6.6.2) so the
      > agent isn't broadly privileged, and per-app tokens once apps are sandboxed
      > (6.3.1) to defend against a same-user process, not just an anonymous one.
- [ ] **6.6.2 Least-privilege split** — separate the privileged operations
      (systemctl, timedatectl) behind polkit rules instead of running the whole
      agent with broad rights.
      > **Prompt:** Identify every privileged operation the agent performs
      > (systemctl, timedatectl, rfkill, brightness) and move them behind narrow
      > polkit rules or a tiny privileged helper, so the main agent runs
      > unprivileged. Verify each action still works and nothing else escalates.

## 6.7 Secure updates [P2] (deps: 4.9.1)
- [ ] **6.7.1 Signed, rollback-safe OTA** — updates verified against a project
      key before apply; failed boot auto-rolls back; update log user-visible.
      > **Prompt:** Implement signed OTA (verify against the project key before
      > apply) with auto-rollback on failed boot and a user-visible update log.
      > Verify a tampered update is refused and a bad-but-signed update rolls
      > back. Implements roadmap 3.6.1.

## 6.8 External audit [P2] (deps: most of P6)
- [ ] **6.8.1 Independent security review** — the standing commitment
      (`ARCHITECTURE.md` roadmap 6): unaudited privacy claims are liabilities;
      schedule it before v2.0 and publish the report.
      > **Prompt:** Prepare for and commission the independent security review:
      > assemble a scope doc (threat model, architecture, the `/api/*` surface,
      > sandbox model), fix findings to zero criticals, and publish the report.
      > Gates the v2.0 tag (roadmap 3.6.2).
