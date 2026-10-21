const userAgent = navigator.userAgent;
const isMobile = /Android|iPhone|iPad|iPod/i.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (!isMobile && /Windows/i.test(userAgent)) {
  document.querySelector('[data-platform="windows"]')?.classList.add('is-current');
  document.getElementById('device-hint').textContent = '你正在使用 Windows，可选择下方的 Windows 64 位安装包。';
}

// Keep the installation note discoverable when opened from a direct link.
function revealAnchor() {
  if (location.hash === '#install-note') document.getElementById('install-note').open = true;
}
window.addEventListener('hashchange', revealAnchor);
revealAnchor();

// The links work without JavaScript. File metadata is generated from the actual release files.
fetch('downloads/0.2.0/manifest.json')
  .then(response => response.ok ? response.json() : null)
  .then(manifest => {
    if (!Array.isArray(manifest?.files)) return;
    for (const file of manifest.files) {
      const element = document.querySelector(`[data-size="${file.platform}"]`);
      if (element && Number.isFinite(file.bytes)) {
        const type = file.filename.endsWith('.pkg') ? 'PKG' : 'EXE';
        element.textContent = `${type} · ${(file.bytes / 1024 / 1024).toFixed(1)} MB`;
      }
    }
  })
  .catch(() => {});
