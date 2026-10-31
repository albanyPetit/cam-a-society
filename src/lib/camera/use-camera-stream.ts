"use client";

import { useEffect, useRef, useState } from "react";
import { filmAspect } from "./frame";
import { openCamera, type Facing } from "./stream";

export type StreamStatus = "starting" | "live" | "blocked";

// Live camera preview for a <video> element. Shared by the event camera and
// /lab, so both capture exactly the same frames.
export function useCameraStream(facing: Facing) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<StreamStatus>("starting");
  // Follows the stream's real orientation, so the viewfinder shows exactly
  // the frame that gets saved (2:3 portrait or 3:2 landscape).
  const [landscape, setLandscape] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const onResize = () => {
      if (video && video.videoWidth > 0) {
        setLandscape(filmAspect(video.videoWidth, video.videoHeight) > 1);
      }
    };
    video?.addEventListener("resize", onResize);
    video?.addEventListener("loadedmetadata", onResize);
    return () => {
      video?.removeEventListener("resize", onResize);
      video?.removeEventListener("loadedmetadata", onResize);
    };
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("blocked");
        return;
      }
      try {
        stream = await openCamera(facing);
        if (cancelled) return stop();
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        setStatus("live");
      } catch {
        if (!cancelled) setStatus("blocked");
      }
    }

    function stop() {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    }

    // Release the camera when the app goes to the background (and the
    // green "camera in use" indicator with it); restart when it's back.
    function onVisibility() {
      if (document.visibilityState === "hidden") stop();
      else if (!stream) void start();
    }

    // Rotating the phone: reopen the camera in the new orientation.
    const orientation = window.matchMedia("(orientation: portrait)");
    function onRotate() {
      stop();
      void start();
    }

    void start();
    document.addEventListener("visibilitychange", onVisibility);
    orientation.addEventListener("change", onRotate);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      orientation.removeEventListener("change", onRotate);
      stop();
    };
  }, [facing]);

  return { videoRef, status, landscape };
}
