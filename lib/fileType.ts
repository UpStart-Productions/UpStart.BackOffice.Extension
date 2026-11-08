const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const RASTER_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);

export function fileExtension(name: string | null | undefined): string {
  const base = (name ?? '').split('?')[0] ?? '';
  return base.includes('.') ? base.split('.').pop()!.toLowerCase() : '';
}

export function isRasterImage(name: string | null | undefined, mime: string | null | undefined): boolean {
  const m = mime ?? '';
  if (m === 'image/svg+xml') return false;
  if (m && IMAGE_MIME_TYPES.has(m)) return true;
  return RASTER_EXTENSIONS.has(fileExtension(name));
}

export function isPdfFile(name: string | null | undefined, mime: string | null | undefined): boolean {
  return mime === 'application/pdf' || fileExtension(name) === 'pdf';
}

export type FileIconKind = 'image' | 'pdf' | 'file';

export function fileIconKind(name: string, mime: string | null | undefined): FileIconKind {
  if (isRasterImage(name, mime)) return 'image';
  if (isPdfFile(name, mime)) return 'pdf';
  return 'file';
}

export function validateFile(file: File, accept: string, maxBytes: number): string | null {
  const trimmed = accept.trim();
  if (trimmed && trimmed !== '*/*') {
    const allowed = trimmed.split(',').map((s) => s.trim().toLowerCase());
    const type = file.type.toLowerCase();
    const name = file.name.toLowerCase();
    const ok =
      allowed.some((a) => a === type) ||
      allowed.some((a) => a.startsWith('.') && name.endsWith(a)) ||
      allowed.some((a) => a.endsWith('/*') && type.startsWith(a.slice(0, -1)));
    if (!ok) return 'That file type is not allowed.';
  }
  if (file.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    return `File must be less than ${mb} MB.`;
  }
  return null;
}
