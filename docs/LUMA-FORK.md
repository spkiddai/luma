# Luma desktop fork

## Source boundary

The desktop implementation is derived from Clash Verge Rev **v2.5.8**, commit
`4337bd85758d54d7b9044b2da3c9ac1176eae1f3`. Its React UI, Tauri/Rust command and
configuration layers, bounded lifecycle locks, readiness checks, transactional
profile updates, connection handling and shutdown guards are retained.

Mihomo **v1.19.32** performs HTTP, HTTPS CONNECT and SOCKS forwarding directly in
its own process. Luma does not introduce a JavaScript forwarding layer or change
Mihomo's transport implementation. Replacing the wrapper is a reliability change;
it does not establish an external network speed improvement.

## Luma-specific changes

- Product name, icons, bundle ID, deep link and update destination.
- Separate data, IPC, process and execution-lock names. The vendored IPC library
  preserves upstream execution guards under the Luma namespace. Privileged service
  installation is disabled, and only the stable unprivileged core is bundled.
- Desktop TUN is unavailable at the UI and configuration boundaries. System proxy
  remains an explicit user setting, disabled initially and after legacy import.
  The upstream macOS network-service monitor remains intact.
  TUN-only system DNS mutation and restoration are disabled at their entry points.
- Copy-only import of old Electron profiles and selected profile, port, rule mode,
  LAN preference and an unchanged core cache. Existing destination data wins.
- Upstream app updates cannot replace this fork. Install Luma's own packages to update.
- Platform-specific, verified core and geodata are prepared in GitHub Actions.
  Corresponding core source and license notices accompany the binaries.

## Validation

Luma 0.3.0 binaries were built from `8680cbd2e0f80c1cc79986553730bd6614fa9161`.
[The release workflow](https://github.com/spkiddai/luma/actions/runs/39719008538)
passed for Apple Silicon, Intel Mac and Windows x64. Each ran 45 frontend tests;
macOS ran 380 Rust tests and Windows ran 359. Both macOS bundles passed integrity
verification and the packaged-app lifecycle regression described below.

The desktop workflow is the authoritative build result for each commit. It runs:

1. Upstream frontend type checks and tests.
2. Upstream Rust library tests plus legacy migration regressions.
3. A hermetic core test covering HTTP, CONNECT, SOCKS5, concurrent payload integrity,
   repeated reloads with active connections, process exit and port reuse.
4. On macOS, the actual packaged application with a synthetic legacy profile:
   automatic core startup, host resolution, repeated node selection and runtime
   reload, original profile preservation, exactly one core, clean exit and restart.
   System proxy must stay disabled. This test refuses to run outside GitHub Actions
   and refuses existing data directories.

Tests do not contain or upload a real subscription. Loopback throughput is diagnostic
only. Live browser behavior, real network changes and hardware sleep/wake need separate
validation; passing simulated transfers is not evidence that all intermittent failures
have been eliminated.

Android and iOS are not implemented by this desktop fork.
