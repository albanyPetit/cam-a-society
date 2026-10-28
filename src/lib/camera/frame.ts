// Pure geometry for framing captured photos. No DOM, so it's unit-tested.

export type CropRect = { sx: number; sy: number; sw: number; sh: number };

// 35mm film frame: 3:2 landscape, 2:3 portrait.
export function filmAspect(width: number, height: number): number {
  return width >= height ? 3 / 2 : 2 / 3;
}

// Largest centered rectangle of the given aspect ratio (width / height).
export function centerCrop(
  width: number,
  height: number,
  aspect: number,
): CropRect {
  if (width / height > aspect) {
    const sw = Math.round(height * aspect);
    return { sx: Math.round((width - sw) / 2), sy: 0, sw, sh: height };
  }
  const sh = Math.round(width / aspect);
  return { sx: 0, sy: Math.round((height - sh) / 2), sw: width, sh };
}

// Scales down (never up) so the longest edge is at most `maxEdge`.
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}
