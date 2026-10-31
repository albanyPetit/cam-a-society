"use client";

import { useEffect, useRef, useState } from "react";
import { frameToCanvas } from "@/lib/camera/capture";
import type { Facing } from "@/lib/camera/stream";
import { useCameraStream } from "@/lib/camera/use-camera-stream";
import {
  controlGroups,
  getValue,
  setValue,
  type Control,
} from "@/lib/film/controls";
import { randomSeed } from "@/lib/film/params";
import { applyFilm, type LeakMode } from "@/lib/film/pipeline";
import { filmPreset, type FilmPreset } from "@/lib/film/preset";

// Previews are rendered smaller than the real 2048px output to stay fast;
// spatial settings scale with size, so the look matches.
const PREVIEW_EDGE = 1400;
const STORAGE_KEY = "film-lab-preset";

type LabPhoto = {
  id: string;
  name: string;
  original: HTMLCanvasElement; // cropped + downscaled, never modified
  seed: number;
};

export function Lab() {
  const [preset, setPreset] = useState<FilmPreset>(filmPreset);
  const [photos, setPhotos] = useState<LabPhoto[]>([]);
  const [leakMode, setLeakMode] = useState<LeakMode>("auto");
  const [dateStamp, setDateStamp] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  // Restore tweaks from the last session (per browser).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore after mount
      if (saved) setPreset({ ...filmPreset, ...JSON.parse(saved) });
    } catch {
      // ignore: storage blocked or corrupted
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preset));
    } catch {
      // ignore
    }
  }, [preset]);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const loaded = await Promise.all([...files].map(loadPhoto));
    setPhotos((prev) => [...prev, ...loaded]);
  }

  async function copyPreset() {
    const code = `export const filmPreset: FilmPreset = ${JSON.stringify(preset, null, 2)};\n`;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <aside className="border-b border-muted/20 p-5 lg:sticky lg:top-0 lg:h-dvh lg:w-80 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
        <h1 className="text-xl font-semibold">Film lab</h1>
        <p className="mt-1 text-sm text-muted">
          Photos stay in this browser. Tweaks are saved here too — copy the
          preset when you like the look.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={copyPreset} className={buttonClass}>
            {copied ? "Copied!" : "Copy preset"}
          </button>
          <button
            type="button"
            onClick={() => setPreset(filmPreset)}
            className={buttonClass}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() =>
              setPhotos((prev) =>
                prev.map((p) => ({ ...p, seed: randomSeed() })),
              )
            }
            className={buttonClass}
          >
            New grain & leaks
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-3 text-sm">
          <label className="flex items-center justify-between gap-3">
            Light leaks
            <select
              value={leakMode}
              onChange={(e) => setLeakMode(e.target.value as LeakMode)}
              className="rounded-md border border-muted/40 bg-background px-2 py-1"
            >
              <option value="auto">Random (as in the app)</option>
              <option value="on">On every photo</option>
              <option value="off">Off</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-3">
            Date stamp
            <input
              type="checkbox"
              checked={dateStamp}
              onChange={(e) => setDateStamp(e.target.checked)}
              className="size-4 accent-accent"
            />
          </label>
        </div>

        {controlGroups.map((group) => (
          <fieldset key={group.title} className="mt-6">
            <legend className="text-xs tracking-widest text-accent uppercase">
              {group.title}
            </legend>
            <div className="mt-2 flex flex-col gap-3">
              {group.controls.map((control) => (
                <Slider
                  key={control.path}
                  control={control}
                  value={getValue(preset, control.path)}
                  changed={
                    getValue(preset, control.path) !==
                    getValue(filmPreset, control.path)
                  }
                  onChange={(v) =>
                    setPreset((p) => setValue(p, control.path, v))
                  }
                />
              ))}
            </div>
          </fieldset>
        ))}
      </aside>

      <main className="flex-1 p-5">
        {cameraOpen ? (
          <LabCamera
            onCapture={(photo) => setPhotos((prev) => [photo, ...prev])}
            onClose={() => setCameraOpen(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            className="mb-4 w-full rounded-2xl border border-accent/60 px-6 py-5 text-center text-sm text-muted hover:border-accent"
          >
            <span className="block text-base text-foreground">
              Take test photos with the app camera
            </span>
            Same camera, crop and quality as the real app — tune on these.
          </button>
        )}

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-muted/40 px-6 py-8 text-center text-sm text-muted hover:border-accent">
          <span className="text-base text-foreground">
            Or add photos from your gallery
          </span>
          Note: phone camera photos are already processed (HDR, sharpening), so
          they look punchier than what the app captures.
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>

        <div className="mt-6 flex flex-col gap-8">
          {photos.map((photo) => (
            <PhotoCompare
              key={photo.id}
              photo={photo}
              preset={preset}
              leakMode={leakMode}
              dateStamp={dateStamp}
              onRemove={() =>
                setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
              }
            />
          ))}
        </div>
      </main>
    </div>
  );
}

const buttonClass =
  "rounded-full border border-muted/40 px-3 py-1.5 text-sm hover:border-accent";

function Slider({
  control,
  value,
  changed,
  onChange,
}: {
  control: Control;
  value: number;
  changed: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex justify-between">
        <span className={changed ? "text-accent" : undefined}>
          {control.label}
        </span>
        <span className="font-mono text-muted tabular-nums">
          {Number(value.toFixed(4))}
        </span>
      </span>
      <input
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-accent"
      />
    </label>
  );
}

function PhotoCompare({
  photo,
  preset,
  leakMode,
  dateStamp,
  onRemove,
}: {
  photo: LabPhoto;
  preset: FilmPreset;
  leakMode: LeakMode;
  dateStamp: boolean;
  onRemove: () => void;
}) {
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const afterRef = useRef<HTMLCanvasElement>(null);
  const [info, setInfo] = useState("");

  useEffect(() => {
    const before = beforeRef.current;
    if (!before) return;
    before.width = photo.original.width;
    before.height = photo.original.height;
    before.getContext("2d")!.drawImage(photo.original, 0, 0);
  }, [photo.original]);

  // Re-develop on every change, at most once per frame.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const after = afterRef.current;
      if (!after) return;
      after.width = photo.original.width;
      after.height = photo.original.height;
      after.getContext("2d")!.drawImage(photo.original, 0, 0);
      const result = applyFilm(after, {
        preset,
        seed: photo.seed,
        lightLeak: leakMode,
        dateStamp: dateStamp ? new Date() : null,
      });
      setInfo(
        result.applied
          ? `exposure ×${result.gain.toFixed(2)}${result.hasLightLeak ? " · light leak" : ""}`
          : "WebGL unavailable — effect not applied",
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [photo, preset, leakMode, dateStamp]);

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-center justify-between text-sm text-muted">
        <span className="truncate">
          {photo.name} <span className="text-accent">{info}</span>
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="hover:text-foreground"
        >
          Remove
        </button>
      </figcaption>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="relative">
          <canvas ref={beforeRef} className="w-full rounded-lg" />
          <span className={tagClass}>Before</span>
        </div>
        <div className="relative">
          <canvas ref={afterRef} className="w-full rounded-lg" />
          <span className={tagClass}>After</span>
        </div>
      </div>
    </figure>
  );
}

const tagClass =
  "absolute top-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white";

// Decodes a file (EXIF orientation applied) and crops it like the camera.
async function loadPhoto(file: File): Promise<LabPhoto> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return {
      id: crypto.randomUUID(),
      name: file.name,
      original: frameToCanvas(img, img.naturalWidth, img.naturalHeight, {
        maxEdge: PREVIEW_EDGE,
      }),
      seed: randomSeed(),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Same live camera as the event page; captures frames without the effect.
function LabCamera({
  onCapture,
  onClose,
}: {
  onCapture: (photo: LabPhoto) => void;
  onClose: () => void;
}) {
  const [facing, setFacing] = useState<Facing>("environment");
  const { videoRef, status, landscape } = useCameraStream(facing);
  const [count, setCount] = useState(0);

  function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const n = count + 1;
    setCount(n);
    onCapture({
      id: crypto.randomUUID(),
      name: `Camera shot ${n} (${video.videoWidth}×${video.videoHeight})`,
      original: frameToCanvas(video, video.videoWidth, video.videoHeight, {
        mirror: facing === "user",
        maxEdge: PREVIEW_EDGE,
      }),
      seed: randomSeed(),
    });
  }

  return (
    <div className="mb-4 flex flex-col items-center gap-3 rounded-2xl border border-muted/30 p-4">
      <div
        className={`relative w-full max-w-sm overflow-hidden rounded-xl bg-black ${landscape ? "aspect-[3/2]" : "aspect-[2/3]"}`}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`size-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
        />
        {status !== "live" && (
          <p className="absolute inset-0 m-auto h-fit text-center text-sm text-muted">
            {status === "starting" ? "Starting camera…" : "Camera unavailable"}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={capture}
          disabled={status !== "live"}
          className="rounded-full bg-accent px-5 py-2 font-semibold text-background disabled:opacity-40"
        >
          Capture
        </button>
        <button
          type="button"
          onClick={() =>
            setFacing((f) => (f === "environment" ? "user" : "environment"))
          }
          className={buttonClass}
        >
          Flip
        </button>
        <button type="button" onClick={onClose} className={buttonClass}>
          Close
        </button>
      </div>
    </div>
  );
}
