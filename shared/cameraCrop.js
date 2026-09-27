// Aspect-ratio crop for captured photos. A "4:3" or "16:9" ratio names the
// shape, not the orientation: it is applied in the photo's own orientation,
// so a portrait shot (the default hold for a phone app locked to portrait)
// gets a portrait 3:4 / 9:16 crop — the same shape the preview frame shows.
function parseRatio(ratio) {
  const [a, b] = String(ratio).split(':').map(Number);
  return a > 0 && b > 0 ? Math.max(a, b) / Math.min(a, b) : 1;
}

export function getAspectCrop(width, height, ratio) {
  const long = parseRatio(ratio);
  const desiredRatio = width >= height ? long : 1 / long; // width / height
  const sourceRatio = width / height;
  const cropWidth = sourceRatio > desiredRatio ? height * desiredRatio : width;
  const cropHeight = sourceRatio > desiredRatio ? height : width / desiredRatio;
  // Clamped because expo-image-manipulator rejects the whole render when the
  // rectangle pokes even one pixel outside the source ("Invalid crop options").
  const w = Math.min(width, Math.max(1, Math.round(cropWidth)));
  const h = Math.min(height, Math.max(1, Math.round(cropHeight)));
  return {
    originX: Math.max(0, Math.min(width - w, Math.round((width - w) / 2))),
    originY: Math.max(0, Math.min(height - h, Math.round((height - h) / 2))),
    width: w,
    height: h,
  };
}

// width / height of the on-screen framing guide for a portrait-locked app.
export function framingAspect(ratio) {
  return 1 / parseRatio(ratio);
}
