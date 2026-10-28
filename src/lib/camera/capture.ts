import { centerCrop, filmAspect, fitWithin } from "./frame";

// Output size/quality: ~300–700 KB per photo, sharp enough to print small.
// 2048px also keeps canvases within iOS Safari's memory limits.
export const CAPTURE = {
  maxEdge: 2048,
  jpegQuality: 0.85,
} as const;

// Crops to a 35mm frame, scales down and encodes as JPEG.
// Phase 3 hooks the film effect in between drawing and encoding.
async function encodeFrame(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): Promise<Blob> {
  const crop = centerCrop(
    sourceWidth,
    sourceHeight,
    filmAspect(sourceWidth, sourceHeight),
  );
  const { width, height } = fitWithin(crop.sw, crop.sh, CAPTURE.maxEdge);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    source,
    crop.sx,
    crop.sy,
    crop.sw,
    crop.sh,
    0,
    0,
    width,
    height,
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", CAPTURE.jpegQuality),
  );
  // Release the bitmap right away: iOS Safari is strict about canvas memory.
  canvas.width = 0;
  canvas.height = 0;

  if (!blob) throw new Error("encode_failed");
  return blob;
}

export function captureVideoFrame(video: HTMLVideoElement): Promise<Blob> {
  return encodeFrame(video, video.videoWidth, video.videoHeight);
}

// Fallback path (photo from the phone's own camera app). Decoding through an
// <img> applies the EXIF orientation, so rotated photos come out upright.
export async function captureFile(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return await encodeFrame(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}
