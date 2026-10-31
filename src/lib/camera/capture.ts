import { applyFilm } from "@/lib/film/pipeline";
import { randomSeed } from "@/lib/film/params";
import { centerCrop, filmAspect, fitWithin } from "./frame";

// Output size/quality: ~300–700 KB per photo, sharp enough to print small.
// 2048px also keeps canvases within iOS Safari's memory limits.
export const CAPTURE = {
  maxEdge: 2048,
  jpegQuality: 0.85,
} as const;

export type CaptureOptions = {
  mirror?: boolean;
  // Burn the date into the corner (per-event setting).
  dateStamp?: boolean;
};

export type CapturedShot = { jpeg: Blob; hasLightLeak: boolean };

// Crops to a 35mm frame, scales down, develops the film look and encodes
// as JPEG. Only this final image ever leaves the phone.
async function encodeFrame(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  { mirror = false, dateStamp = false }: CaptureOptions,
): Promise<CapturedShot> {
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
  if (mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
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
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const { hasLightLeak } = applyFilm(canvas, {
    seed: randomSeed(),
    dateStamp: dateStamp ? new Date() : null,
  });

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", CAPTURE.jpegQuality),
  );
  // Release the bitmap right away: iOS Safari is strict about canvas memory.
  canvas.width = 0;
  canvas.height = 0;

  if (!blob) throw new Error("encode_failed");
  return { jpeg: blob, hasLightLeak };
}

// Selfies (mirror: true) are saved exactly as the mirrored preview shows them.
export function captureVideoFrame(
  video: HTMLVideoElement,
  options: CaptureOptions = {},
): Promise<CapturedShot> {
  return encodeFrame(video, video.videoWidth, video.videoHeight, options);
}

// Fallback path (photo from the phone's own camera app). Decoding through an
// <img> applies the EXIF orientation, so rotated photos come out upright.
export async function captureFile(
  file: File,
  options: CaptureOptions = {},
): Promise<CapturedShot> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return await encodeFrame(img, img.naturalWidth, img.naturalHeight, options);
  } finally {
    URL.revokeObjectURL(url);
  }
}
