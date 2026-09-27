// Path rules for app-owned media files, kept pure so they are testable off the
// device. Every file the app writes is `<MEDIA_DIR><id>.jpg|.mp4` or
// `<MEDIA_DIR><id>-thumb.jpg`; nothing else under (or outside) that folder may
// be read, re-anchored or deleted through a stored path — a restored backup
// is untrusted input, and "…/jovi-media/../mmkv" once pointed a delete at the
// whole key-value store.

const MEDIA_SEGMENT = '/jovi-media/';
export const MEDIA_FILE_NAME = /^[\w-]{1,90}\.(?:jpg|mp4)$/;

// Re-anchors a `file:` path that lives in some `jovi-media/` folder (another
// device, an old iOS container) onto the current one — only when what follows
// the folder is one plain file name. Anything else is returned unchanged, and
// ownMediaPath() then refuses it.
export function rebaseMediaPath(uri, mediaDir) {
  if (typeof uri !== 'string' || !uri.startsWith('file:') || !mediaDir || uri.startsWith(mediaDir)) return uri;
  const at = uri.lastIndexOf(MEDIA_SEGMENT);
  if (at === -1) return uri;
  const name = uri.slice(at + MEDIA_SEGMENT.length);
  return MEDIA_FILE_NAME.test(name) ? `${mediaDir}${name}` : uri;
}

// The path itself when it is exactly one media file directly inside mediaDir,
// otherwise null. Gate every read and delete of a stored path through this.
export function ownMediaPath(uri, mediaDir) {
  if (typeof uri !== 'string' || !mediaDir || !uri.startsWith(mediaDir)) return null;
  return MEDIA_FILE_NAME.test(uri.slice(mediaDir.length)) ? uri : null;
}

// A complete base64 image/video data URI — the check covers the whole string,
// so no path can ride along after a valid-looking prefix.
export function isSafeDataUri(value) {
  return typeof value === 'string' && /^data:(?:image|video)\/[\w.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}
