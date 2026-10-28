// Offline-tolerant upload queue.
//
// Every shot is saved on the phone first (IndexedDB), then pushed through
// reserve → upload → confirm. Each step is idempotent on the server, and the
// queue records how far each shot got, so a retry (after a dropped
// connection, a closed tab or a reload) just continues where it stopped.

export type QueuedShot = {
  clientId: string;
  eventId: string;
  // Stored as ArrayBuffer rather than Blob: more reliable in IndexedDB on
  // older iOS versions.
  jpeg: ArrayBuffer;
  hasLightLeak: boolean;
  takenAt: number;
  photoId?: string;
  storagePath?: string;
  uploaded?: boolean;
  attempts: number;
  nextAttemptAt: number;
};

export interface ShotStore {
  all(): Promise<QueuedShot[]>;
  put(shot: QueuedShot): Promise<void>;
  delete(clientId: string): Promise<void>;
}

// Server calls, abstracted so the queue logic can be unit-tested.
export interface ShotApi {
  reserve(shot: QueuedShot): Promise<{ photoId: string; storagePath: string }>;
  upload(storagePath: string, jpeg: Blob): Promise<void>;
  confirm(photoId: string): Promise<void>;
}

// Thrown by ShotApi for errors that retrying can't fix.
export class PermanentShotError extends Error {}
// Thrown by ShotApi.confirm when the file never reached storage.
export class MissingFileError extends Error {}

// Shots used = everything the server has, plus queued shots it hasn't seen
// yet. Matching by client_id counts each shot exactly once, even while a
// reserve is in flight.
export function countUsedShots(
  serverClientIds: readonly string[],
  queuedClientIds: readonly string[],
): number {
  const known = new Set(serverClientIds);
  return known.size + queuedClientIds.filter((id) => !known.has(id)).length;
}

// 2s, 4s, 8s … capped at 1 minute.
export function retryDelayMs(attempts: number): number {
  return Math.min(60_000, 2_000 * 2 ** Math.max(0, attempts - 1));
}

export type ShotResult = "done" | "retry" | "rejected";

export async function processShot(
  shot: QueuedShot,
  store: ShotStore,
  api: ShotApi,
  now: () => number = Date.now,
): Promise<{ result: ShotResult; reason?: string }> {
  try {
    if (!shot.photoId || !shot.storagePath) {
      const reserved = await api.reserve(shot);
      shot.photoId = reserved.photoId;
      shot.storagePath = reserved.storagePath;
      await store.put(shot);
    }

    if (!shot.uploaded) {
      await api.upload(
        shot.storagePath,
        new Blob([shot.jpeg], { type: "image/jpeg" }),
      );
      shot.uploaded = true;
      await store.put(shot);
    }

    try {
      await api.confirm(shot.photoId);
    } catch (error) {
      // The server has no file for this shot: upload it again next time.
      if (error instanceof MissingFileError) shot.uploaded = false;
      throw error;
    }

    await store.delete(shot.clientId);
    return { result: "done" };
  } catch (error) {
    if (error instanceof PermanentShotError) {
      await store.delete(shot.clientId);
      return { result: "rejected", reason: error.message };
    }
    shot.attempts += 1;
    shot.nextAttemptAt = now() + retryDelayMs(shot.attempts);
    await store.put(shot);
    return { result: "retry" };
  }
}

// Processes every shot that is due, oldest first. Shots that fail are
// rescheduled with backoff and left for a later run.
export async function drainQueue(
  store: ShotStore,
  api: ShotApi,
  onResult?: (shot: QueuedShot, result: ShotResult, reason?: string) => void,
  now: () => number = Date.now,
): Promise<void> {
  const due = (await store.all())
    .filter((shot) => shot.nextAttemptAt <= now())
    .sort((a, b) => a.takenAt - b.takenAt);

  for (const shot of due) {
    const { result, reason } = await processShot(shot, store, api, now);
    onResult?.(shot, result, reason);
  }
}

export function memoryStore(): ShotStore {
  const shots = new Map<string, QueuedShot>();
  return {
    async all() {
      return [...shots.values()];
    },
    async put(shot) {
      shots.set(shot.clientId, shot);
    },
    async delete(clientId) {
      shots.delete(clientId);
    },
  };
}
