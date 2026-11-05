// The published release URLs are configured separately from the site. The
// local preview supplies exact loopback download paths without publishing files.
function allowedUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, document.baseURI);
    if (url.username || url.password) return null;
    if (url.protocol === 'https:') return url.href;
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
    if (loopback && url.origin === location.origin && url.pathname.startsWith('/downloads/')) return url.href;
  } catch { /* Invalid release links remain unavailable. */ }
  return null;
}

try {
  const response = await fetch(new URL('desktop-releases.json', document.baseURI), { cache: 'no-store' });
  if (response.ok) {
    const releases = await response.json();
    for (const platform of ['windows', 'linux']) {
      const url = allowedUrl(releases?.[platform]);
      if (!url) continue;
      const link = document.getElementById(`download-${platform}`);
      link.href = url;
      link.hidden = false;
      document.getElementById(`unavailable-${platform}`).hidden = true;
    }
    const source = allowedUrl(releases?.source);
    if (source) {
      const link = document.getElementById('download-complete-source');
      link.href = source;
      link.hidden = false;
      document.getElementById('game-source-fallback').hidden = true;
    }
  }
} catch { /* The site remains useful while release links are unavailable. */ }
