# Luma download site

A buildless, responsive download page for Luma. No server-side application,
external CDN, analytics, or frontend dependencies are required.

## Preview

From the repository root:

```sh
python3 -m http.server 5187 --bind 127.0.0.1 --directory website
```

## Release files

Place verified release artifacts in `website/downloads/0.3.0/`:

- `Luma-0.3.0-arm64.pkg`
- `Luma-0.3.0-x64.pkg`
- `Luma-0.3.0-win-x64.exe`
- A matching `<filename>.sha256` text file for each package.
- `SHA256SUMS.txt` containing the three SHA-256 digests and filenames.
- `manifest.json`, with `version`, `coreVersion`, `sourceCommit` and a `files`
  array. Each entry contains `platform` (`mac-arm64`, `mac-x64`, `win-x64`),
  `filename`, `bytes`, and `sha256`.

The download links work without JavaScript. JavaScript adds package sizes from
the manifest, highlights Windows on Windows devices, and opens the installation
FAQ when linked directly. It deliberately does not guess a Mac's CPU architecture.

Deploy only `index.html`, `assets/` and `downloads/` to the static document root.
Publish all packages and verify their checksums before replacing the homepage.
Preserve existing server files and keep backups outside the public document root.
Serve installers over HTTPS with attachment content disposition and byte-range
support. Configure `.sha256` responses as plain text.

The screenshot is from the packaged app using its default local profile and test
traffic; it contains no personal subscription. Mobile downloads are intentionally
not advertised as available.
