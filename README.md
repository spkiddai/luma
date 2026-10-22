# Luma · 流光

Luma 0.3 is a desktop proxy client **based directly on [Clash Verge Rev 2.5.8](https://github.com/clash-verge-rev/clash-verge-rev/tree/v2.5.8)** (commit `4337bd85758d54d7b9044b2da3c9ac1176eae1f3`). The original authors retain their copyright. Luma modifications and the upstream code are distributed under GPL-3.0-only.

This version replaces the previous Electron implementation with the upstream Tauri/Rust app, React interface, configuration pipeline, core lifecycle and proxy group management. Traffic is forwarded directly by the bundled Mihomo process, not through JavaScript or the webview. Upstream architecture alone cannot fix overloaded nodes or poor external routes; sustained-transfer measurements are required before making performance claims.

## Desktop behavior

- Native menu bar/tray, expandable proxy groups, subscriptions, connections, rules, logs and settings from upstream.
- Core starts with the app. Stable Mihomo 1.19.32, geodata, licenses and core source are included; no first-start core download.
- Desktop TUN and application-specific proxy controls are absent. The core runs without a privileged system service.
- System proxy is off on first start and on migration. Enable it yourself or configure a browser to use the displayed HTTP/SOCKS port.
- Separate `io.github.spkiddai.luma` data directory and `luma-mihomo` IPC/process namespace. The fork does not manage Clash Verge's service or updater.
- First start copies profiles from the former `Luma` or `Mihomo Desk` data directory. It preserves the originals, selection, mixed port, rule mode and LAN preference. User data is never included in builds.
- Mac PKG installs into `/Applications/Luma.app`; Windows uses a standard per-user NSIS installer with the offline WebView2 runtime.
- Updates are obtained from the [Luma download site](https://proxy.spkiddai.top/). Upstream automatic updates are disabled.

## Builds

GitHub Actions builds Apple Silicon, Intel Mac and Windows x64. No local SDK installation is necessary. The workflow prepares verified bundled resources, runs frontend and Rust tests, and creates installers. Source dependencies are pinned in `pnpm-lock.yaml` and `Cargo.lock`.

For an existing development environment: Node 24, pnpm from `packageManager`, Rust from `rust-toolchain.toml`, and Tauri's platform prerequisites. Run `pnpm install --frozen-lockfile`, `node build/luma/prepare.mjs`, then `pnpm exec tauri build`. macOS packaging: `node build/luma/build-mac-installer.mjs target/release/bundle/macos/Luma.app`.

Android and iOS are not implemented or advertised as downloadable builds. Desktop releases must pass validation before the live download page is updated.

## Source and license

Luma source: https://github.com/spkiddai/luma

Upstream source: https://github.com/clash-verge-rev/clash-verge-rev

Mihomo source: https://github.com/MetaCubeX/mihomo/tree/v1.19.32

See [LICENSE](LICENSE), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [vendored IPC changes](third_party/clash-verge-service-ipc/LUMA-PATCH.md).
