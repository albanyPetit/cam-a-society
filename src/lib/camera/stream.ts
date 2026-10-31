export type Facing = "environment" | "user";

// Opens the camera with a frame that matches how the phone is held.
//
// Asking for an ambiguous size (e.g. 1920×1920) made iOS Safari pick a
// landscape stream even with the phone upright, so the viewfinder and the
// photos came out wide. We ask for the right shape explicitly, then check
// what we got: some browsers read width/height in the sensor's orientation,
// so if the result is the wrong way round we retry with them swapped.
export async function openCamera(facing: Facing): Promise<MediaStream> {
  const portrait = window.matchMedia("(orientation: portrait)").matches;
  const long = 1920;
  const short = 1440;

  const open = (width: number, height: number) =>
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: facing },
        width: { ideal: width },
        height: { ideal: height },
      },
    });

  let stream = await open(portrait ? short : long, portrait ? long : short);

  if (!matchesOrientation(stream, portrait)) {
    stream.getTracks().forEach((track) => track.stop());
    stream = await open(portrait ? long : short, portrait ? short : long);
  }
  return stream;
}

function matchesOrientation(stream: MediaStream, portrait: boolean): boolean {
  const { width, height } = stream.getVideoTracks()[0]?.getSettings() ?? {};
  if (!width || !height || width === height) return true; // can't tell
  return height > width === portrait;
}
