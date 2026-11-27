const MAX_GENERATED_BASE64 = 2_000_000;
const MAX_RAW_BASE64 = 16_000_000;
const B64 = /^[A-Za-z0-9+/=]+$/;
const MIME = new Set(["image/png","image/jpeg","image/webp"]);
const EXT = {"image/png":"png","image/jpeg":"jpg","image/webp":"webp"};

export function normalizeDevIcon(input = {}) {
  const a = String(input.icon180Base64 || "").replace(/^data:image\/png;base64,/, "");
  const b = String(input.icon512Base64 || "").replace(/^data:image\/png;base64,/, "");
  if (a && b && a.length <= MAX_GENERATED_BASE64 && b.length <= MAX_GENERATED_BASE64 && B64.test(a) && B64.test(b)) {
    return { kind: "generated", icon180Base64: a, icon512Base64: b };
  }
  const raw = String(input.rawBase64 || "").replace(/^data:image\/(png|jpeg|webp);base64,/i, "");
  const mime = String(input.rawMime || "").toLowerCase();
  if (!raw || raw.length > MAX_RAW_BASE64 || !B64.test(raw) || !MIME.has(mime)) throw new Error("invalid_icon");
  return { kind: "raw", rawBase64: raw, mime, path: "docs/dolary/pwa-icon-uploaded." + EXT[mime] };
}

export function iconChanges(icon) {
  if (icon?.kind === "raw") {
    return [{ path: icon.path, content: icon.rawBase64, encoding: "base64" }];
  }
  return [
    { path: "docs/dolary/dolary-card-logo-180.png", content: icon.icon180Base64, encoding: "base64" },
    { path: "docs/dolary/pwa-icon-512.png", content: icon.icon512Base64, encoding: "base64" }
  ];
}

export function iconManifest(icon) {
  if (icon?.kind === "raw") {
    return [
      { src: "./" + icon.path.split("/").pop() + "?v=1", sizes: "any", type: icon.mime, purpose: "any maskable" }
    ];
  }
  return [
    { src: "./dolary-card-logo-180.png?v=3", sizes: "180x180", type: "image/png", purpose: "any" },
    { src: "./pwa-icon-512.png?v=1", sizes: "512x512", type: "image/png", purpose: "any maskable" }
  ];
}

export function iconDescriptor(icon) {
  return icon?.kind === "raw"
    ? { kind: "raw", path: icon.path, mime: icon.mime }
    : { kind: "generated", path180: "docs/dolary/dolary-card-logo-180.png", path512: "docs/dolary/pwa-icon-512.png" };
}

export function iconPreviewAsset(icon) {
  const base64 = icon?.kind === "raw" ? icon.rawBase64 : icon?.icon512Base64;
  const mime = icon?.kind === "raw" ? icon.mime : "image/png";
  if (!base64 || !MIME.has(mime) || base64.length > MAX_RAW_BASE64 || !B64.test(base64)) {
    throw new Error("invalid_icon");
  }
  let binary;
  try { binary = atob(base64); } catch (_) { throw new Error("invalid_icon"); }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime };
}
