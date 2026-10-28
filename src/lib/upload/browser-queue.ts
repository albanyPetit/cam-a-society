"use client";

import { createStore, del, set, values } from "idb-keyval";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  drainQueue,
  memoryStore,
  MissingFileError,
  PermanentShotError,
  type QueuedShot,
  type ShotApi,
  type ShotStore,
} from "./queue";

// Server errors (raised by the RPCs) that retrying can't fix.
const PERMANENT_ERRORS = new Set([
  "no_shots_left",
  "event_not_active",
  "not_a_participant",
  "client_id_conflict",
]);

// IndexedDB store; falls back to memory if the browser blocks IndexedDB
// (some private modes). Shots then survive network drops, not reloads.
function idbStore(): ShotStore {
  const db = createStore("cam-a-society", "shots");
  const fallback = memoryStore();
  let broken = false;

  async function attempt<T>(
    run: () => Promise<T>,
    otherwise: () => Promise<T>,
  ): Promise<T> {
    if (broken) return otherwise();
    try {
      return await run();
    } catch {
      broken = true;
      return otherwise();
    }
  }

  return {
    all: () =>
      attempt(
        () => values<QueuedShot>(db),
        () => fallback.all(),
      ),
    put: (shot) =>
      attempt(
        () => set(shot.clientId, shot, db),
        () => fallback.put(shot),
      ),
    delete: (clientId) =>
      attempt(
        () => del(clientId, db),
        () => fallback.delete(clientId),
      ),
  };
}

function supabaseApi(supabase: SupabaseClient): ShotApi {
  return {
    async reserve(shot) {
      const { data, error } = await supabase
        .rpc("reserve_shot", {
          p_event_id: shot.eventId,
          p_client_id: shot.clientId,
          p_has_light_leak: shot.hasLightLeak,
        })
        .single<{ photo_id: string; storage_path: string }>();
      if (error) {
        if (PERMANENT_ERRORS.has(error.message)) {
          throw new PermanentShotError(error.message);
        }
        throw error;
      }
      return { photoId: data.photo_id, storagePath: data.storage_path };
    },

    async upload(storagePath, jpeg) {
      const { error } = await supabase.storage
        .from("photos")
        .upload(storagePath, jpeg, {
          contentType: "image/jpeg",
          upsert: false,
        });
      // Already there: an earlier attempt succeeded but the reply was lost.
      if (error && "statusCode" in error && error.statusCode === "409") return;
      if (error) throw error;
    },

    async confirm(photoId) {
      const { error } = await supabase.rpc("confirm_shot", {
        p_photo_id: photoId,
      });
      if (error?.message === "file_missing") throw new MissingFileError();
      if (error) throw error;
    },
  };
}

// --- Shared queue state (one per tab) ---------------------------------------

let store: ShotStore | null = null;
function getStore() {
  store ??= idbStore();
  return store;
}

type Listener = (rejectedReason?: string) => void;
const listeners = new Set<Listener>();

export function subscribeToQueue(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(rejectedReason?: string) {
  for (const listener of listeners) listener(rejectedReason);
}

export async function enqueueShot(
  eventId: string,
  jpeg: Blob,
  hasLightLeak = false,
): Promise<void> {
  await getStore().put({
    clientId: crypto.randomUUID(),
    eventId,
    jpeg: await jpeg.arrayBuffer(),
    hasLightLeak,
    takenAt: Date.now(),
    attempts: 0,
    nextAttemptAt: 0,
  });
  notify();
}

export async function queuedShots(eventId: string): Promise<QueuedShot[]> {
  return (await getStore().all()).filter((shot) => shot.eventId === eventId);
}

// Single-flight: concurrent calls (new shot + "online" event + timer) share
// one run; a call that arrives mid-run triggers one more pass afterwards.
let running = false;
let runAgain = false;

export async function processQueue(supabase: SupabaseClient): Promise<void> {
  if (running) {
    runAgain = true;
    return;
  }
  running = true;
  try {
    const api = supabaseApi(supabase);
    do {
      runAgain = false;
      await drainQueue(getStore(), api, (_shot, result, reason) =>
        notify(result === "rejected" ? reason : undefined),
      );
    } while (runAgain);
  } finally {
    running = false;
    notify();
  }
}
