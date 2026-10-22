# Third-party notices

Luma is an independent fork of Clash Verge Rev, powered by Mihomo. It is not an official Clash Verge or MetaCubeX product. Upstream source and notices are retained; the application uses Luma's own name and icons.

## mihomo

- Source: https://github.com/MetaCubeX/mihomo
- Release: `v1.19.32`
- Commit: `88dcbf7f1614a67c3b36b848ee3592dfa92ada36`
- License: GNU General Public License v3.0, included as `resources/licenses/mihomo-LICENSE`.
- Unmodified source snapshot: `resources/licenses/mihomo-source-v1.19.32.tar.gz`, also bundled in the application's `Resources/licenses` directory.
- The downloaded kernel is an unmodified upstream release asset. `version.json` beside the binary records its archive SHA-256 and source revision.
- Building the kernel from source: follow the upstream README and Makefile in the included source snapshot. Use a Go version compatible with its dependencies; the release workflow in `.github/workflows` records upstream build targets and flags. The desktop application invokes the kernel as a separate process through its authenticated local controller API.

## Geographic databases

MMDB (`geoip.metadb`), GeoIP (`geoip.dat`), GeoSite (`geosite.dat`) and ASN (`ASN.mmdb`, upstream `GeoLite2-ASN.mmdb`) are generated and distributed by [MetaCubeX/meta-rules-dat](https://github.com/MetaCubeX/meta-rules-dat). Its GPL-3.0 license is included as `resources/licenses/meta-rules-dat-LICENSE`. Upstream source, generation workflows and source-data attributions are available in that repository. `resources/geodata/manifest.json` records the upstream release timestamp, exact source asset URLs, sizes and SHA-256 digests for this application build. Files are copied without changing database contents.

## Application dependencies

The desktop application uses Tauri (MIT OR Apache-2.0), React and React DOM (MIT), Material UI (MIT), and the other dependencies pinned in `pnpm-lock.yaml` and `Cargo.lock`. Their upstream license notices remain in their source distributions. The application and its derivative source are distributed under GPL-3.0-only; `LICENSE` is also bundled as `Resources/licenses/Luma-LICENSE`. The former Electron implementation is no longer shipped in Luma 0.3.


## Clash Verge Rev

Luma 0.3 incorporates Clash Verge Rev v2.5.8, commit 4337bd85758d54d7b9044b2da3c9ac1176eae1f3, licensed GPL-3.0-only. Copyright remains with zzzgydi, Tunglies, wonfen, MystiPanda and the upstream contributors. Source: https://github.com/clash-verge-rev/clash-verge-rev/tree/v2.5.8 . Luma changes product identity, navigation, theme, overview layout, display terminology, desktop capabilities, migration, packaging and update destinations.

The vendored clash-verge-service-ipc v2.7.6 library (GPL-3.0, Tunglies) retains upstream execution ownership and shutdown guards with a distinct Luma namespace. Its privileged service is not shipped. Source and modification notes are in third_party/clash-verge-service-ipc/.
