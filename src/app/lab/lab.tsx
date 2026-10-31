"use client";

import { useEffect, useRef, useState } from "react";
import { centerCrop, filmAspect, fitWithin } from "@/lib/camera/frame";
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
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-muted/40 px-6 py-8 text-center text-sm text-muted hover:border-accent">
          <span className="text-base text-foreground">Add test photos</span>
          Indoor, outdoor, portraits, groups… they&apos;re cropped to 35mm like
          in the app.
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
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const crop = centerCrop(w, h, filmAspect(w, h));
    const size = fitWithin(crop.sw, crop.sh, PREVIEW_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      img,
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      0,
      0,
      size.width,
      size.height,
    );
    return {
      id: crypto.randomUUID(),
      name: file.name,
      original: canvas,
      seed: randomSeed(),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
