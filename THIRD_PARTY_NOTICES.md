# Third-party notices

Luma is an independent desktop client. It is not an official Clash Verge or MetaCubeX product. No Clash Verge application source, branding or artwork is included.

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

Electron (MIT and Chromium third-party notices), React (MIT), React DOM (MIT), YAML (ISC), Lucide (ISC). Dependency licenses are retained with the installed production packages. Electron's distribution includes its own `LICENSE` and `LICENSES.chromium.html`. Development and packaging tools are listed in `package.json` and pinned in `package-lock.json`.
