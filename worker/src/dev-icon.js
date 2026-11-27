const MAX_ICON_BASE64 = 2_000_000;
const PNG = /^[A-Za-z0-9+/=]+$/;

export function normalizeDevIcon(input = {}) {
  const a = String(input.icon180Base64 || "").replace(/^data:image\/png;base64,/, "");
  const b = String(input.icon512Base64 || "").replace(/^data:image\/png;base64,/, "");
  if (!a || !b || a.length > MAX_ICON_BASE64 || b.length > MAX_ICON_BASE64 || !PNG.test(a) || !PNG.test(b)) {
    throw new Error("invalid_icon");
  }
  return { icon180Base64: a, icon512Base64: b };
}

export function iconChanges(icon) {
  return [
    { path: "docs/dolary/dolary-card-logo-180.png", content: icon.icon180Base64, encoding: "base64" },
    { path: "docs/dolary/pwa-icon-512.png", content: icon.icon512Base64, encoding: "base64" }
  ];
}
