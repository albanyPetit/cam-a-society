"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicEvent } from "@/lib/events";
import { captureFile, captureVideoFrame } from "@/lib/camera/capture";
import { filmAspect } from "@/lib/camera/frame";
import { formatWhen } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { enqueueShot, processQueue } from "@/lib/upload/browser-queue";
import { useShots } from "./use-shots";

type Facing = "environment" | "user";
type StreamStatus = "starting" | "live" | "blocked";

const REJECTION_MESSAGES: Record<string, string> = {
  no_shots_left: "Your roll is full — that last photo couldn't be saved.",
  event_not_active: "The event is closed, so that photo couldn't be saved.",
};

// Client clock is fine here: it only decides what to *show*. The server
// decides what is accepted (reserve_shot checks the event window).
function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function CameraScreen({
  event,
  displayName,
}: {
  event: PublicEvent;
  displayName: string;
}) {
  const now = useNow();
  const { shotsLeft, pending, offline, rejection, clearRejection } = useShots(
    event.id,
    event.max_shots,
  );

  const notStarted = now < Date.parse(event.starts_at);
  const ended = now >= Date.parse(event.ends_at);
  const rollFull = shotsLeft === 0;

  let body: React.ReactNode;
  if (notStarted) {
    body = (
      <Notice title={`See you soon, ${displayName}!`}>
        Your camera unlocks {formatWhen(event.starts_at)}.
      </Notice>
    );
  } else if (ended || rollFull) {
    body = (
      <Notice title={ended ? "That's a wrap!" : "Roll finished!"}>
        Your photos develop {formatWhen(event.reveal_at)}. Come back then to see
        everyone&apos;s shots.
      </Notice>
    );
  } else {
    body = (
      <>
        <p className="text-center text-sm text-muted">
          Hi {displayName}! Photos develop {formatWhen(event.reveal_at)}.
        </p>
        <Viewfinder eventId={event.id} shotsLeft={shotsLeft} />
      </>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {body}
      {rejection && (
        <p
          role="alert"
          className="rounded-xl bg-red-950/60 px-4 py-3 text-sm text-red-200"
          onClick={clearRejection}
        >
          {REJECTION_MESSAGES[rejection] ?? "A photo couldn't be saved."}
        </p>
      )}
      <UploadStatus pending={pending} offline={offline} />
    </section>
  );
}

function Notice({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="text-muted">{children}</p>
    </div>
  );
}

function UploadStatus({
  pending,
  offline,
}: {
  pending: number;
  offline: boolean;
}) {
  if (pending === 0) return null;
  const photos = pending === 1 ? "1 photo" : `${pending} photos`;
  return (
    <p className="text-center text-sm text-muted" role="status">
      {offline
        ? `No connection right now. ${photos} will upload automatically when you're back online.`
        : `Saving ${photos}…`}
    </p>
  );
}

function useCameraStream(facing: Facing) {
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
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1920 },
            height: { ideal: 1920 },
          },
        });
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

    void start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [facing]);

  return { videoRef, status, landscape };
}

function Viewfinder({
  eventId,
  shotsLeft,
}: {
  eventId: string;
  shotsLeft: number | null;
}) {
  const [facing, setFacing] = useState<Facing>("environment");
  const { videoRef, status, landscape } = useCameraStream(facing);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);

  async function saveShot(capture: () => Promise<Blob>) {
    setBusy(true);
    setFlash(true);
    navigator.vibrate?.(30);
    setTimeout(() => setFlash(false), 180);
    try {
      const jpeg = await capture();
      await enqueueShot(eventId, jpeg);
      void processQueue(createClient());
    } finally {
      setBusy(false);
    }
  }

  function handleShutter() {
    if (busy) return;
    const video = videoRef.current;
    if (status === "live" && video && video.videoWidth > 0) {
      void saveShot(() =>
        captureVideoFrame(video, { mirror: facing === "user" }),
      );
    } else {
      // No live preview (permission denied / unsupported): use the phone's
      // own camera app instead.
      fileInputRef.current?.click();
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void saveShot(() => captureFile(file));
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div
        className={`relative w-full overflow-hidden ${landscape ? "aspect-[3/2]" : "aspect-[2/3]"} rounded-2xl bg-black shadow-[0_0_0_6px_#2a211a]`}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`size-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
        />
        {status === "starting" && (
          <p className="absolute inset-0 m-auto h-fit text-center text-sm text-muted">
            Starting camera…
          </p>
        )}
        {status === "blocked" && (
          <p className="absolute inset-0 m-auto h-fit px-8 text-center text-sm text-muted">
            We can&apos;t show a live preview. Tap the button below to take a
            photo with your phone&apos;s camera.
          </p>
        )}
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 bg-white transition-opacity duration-150 ${flash ? "opacity-90" : "opacity-0"}`}
        />
      </div>

      <div className="grid w-full grid-cols-3 items-center">
        <ShotCounter shotsLeft={shotsLeft} />
        <button
          type="button"
          onClick={handleShutter}
          disabled={busy}
          aria-label="Take photo"
          className="mx-auto size-20 rounded-full border-4 border-foreground bg-accent shadow-lg transition active:scale-90 disabled:opacity-60"
        />
        {status === "live" && (
          <button
            type="button"
            onClick={() =>
              setFacing((f) => (f === "environment" ? "user" : "environment"))
            }
            className="ml-auto rounded-full border border-muted/40 px-4 py-2 text-sm text-muted"
          >
            Flip
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}

// Exposure counter, like the little window on a disposable camera.
function ShotCounter({ shotsLeft }: { shotsLeft: number | null }) {
  return (
    <div className="flex flex-col items-start">
      <span className="rounded-md bg-black/50 px-2 py-1 font-mono text-2xl text-accent tabular-nums">
        {shotsLeft === null ? "--" : String(shotsLeft).padStart(2, "0")}
      </span>
      <span className="mt-1 text-xs tracking-widest text-muted uppercase">
        left
      </span>
    </div>
  );
}
