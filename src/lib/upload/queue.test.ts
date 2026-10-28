import { describe, expect, it } from "vitest";
import {
  drainQueue,
  memoryStore,
  MissingFileError,
  PermanentShotError,
  processShot,
  retryDelayMs,
  type QueuedShot,
  type ShotApi,
} from "./queue";

function makeShot(overrides: Partial<QueuedShot> = {}): QueuedShot {
  return {
    clientId: "c1",
    eventId: "e1",
    jpeg: new ArrayBuffer(8),
    hasLightLeak: false,
    takenAt: 1,
    attempts: 0,
    nextAttemptAt: 0,
    ...overrides,
  };
}

// Fake server that records calls and can fail specific steps once.
function fakeApi(failOnce: Partial<Record<keyof ShotApi, Error>> = {}) {
  const calls: string[] = [];
  const api: ShotApi = {
    async reserve(shot) {
      calls.push("reserve");
      if (failOnce.reserve) throw failOnce.reserve;
      return {
        photoId: `p-${shot.clientId}`,
        storagePath: `path/${shot.clientId}`,
      };
    },
    async upload() {
      calls.push("upload");
      const error = failOnce.upload;
      delete failOnce.upload;
      if (error) throw error;
    },
    async confirm() {
      calls.push("confirm");
      const error = failOnce.confirm;
      delete failOnce.confirm;
      if (error) throw error;
    },
  };
  return { api, calls };
}

describe("retryDelayMs", () => {
  it("backs off exponentially up to one minute", () => {
    expect([1, 2, 3, 4].map(retryDelayMs)).toEqual([2000, 4000, 8000, 16000]);
    expect(retryDelayMs(20)).toBe(60_000);
  });
});

describe("processShot", () => {
  it("reserves, uploads, confirms and removes the shot", async () => {
    const store = memoryStore();
    const shot = makeShot();
    await store.put(shot);
    const { api, calls } = fakeApi();

    expect((await processShot(shot, store, api)).result).toBe("done");
    expect(calls).toEqual(["reserve", "upload", "confirm"]);
    expect(await store.all()).toEqual([]);
  });

  it("resumes after a failed upload without reserving again", async () => {
    const store = memoryStore();
    const shot = makeShot();
    await store.put(shot);
    const { api, calls } = fakeApi({ upload: new Error("network") });

    const first = await processShot(shot, store, api, () => 1000);
    expect(first.result).toBe("retry");
    const [saved] = await store.all();
    expect(saved.storagePath).toBe("path/c1");
    expect(saved.nextAttemptAt).toBe(1000 + retryDelayMs(1));

    expect((await processShot(saved, store, api)).result).toBe("done");
    expect(calls).toEqual(["reserve", "upload", "upload", "confirm"]);
  });

  it("re-uploads when confirm reports the file missing", async () => {
    const store = memoryStore();
    const shot = makeShot();
    const { api, calls } = fakeApi({ confirm: new MissingFileError() });

    await processShot(shot, store, api);
    await processShot((await store.all())[0], store, api);
    expect(calls).toEqual([
      "reserve",
      "upload",
      "confirm",
      "upload",
      "confirm",
    ]);
  });

  it("drops shots the server permanently rejects", async () => {
    const store = memoryStore();
    const shot = makeShot();
    await store.put(shot);
    const { api } = fakeApi({
      reserve: new PermanentShotError("no_shots_left"),
    });

    expect(await processShot(shot, store, api)).toEqual({
      result: "rejected",
      reason: "no_shots_left",
    });
    expect(await store.all()).toEqual([]);
  });
});

describe("drainQueue", () => {
  it("only processes shots that are due, oldest first", async () => {
    const store = memoryStore();
    await store.put(makeShot({ clientId: "late", takenAt: 2 }));
    await store.put(makeShot({ clientId: "early", takenAt: 1 }));
    await store.put(makeShot({ clientId: "later", nextAttemptAt: 5000 }));
    const done: string[] = [];

    await drainQueue(
      store,
      fakeApi().api,
      (s) => done.push(s.clientId),
      () => 1000,
    );

    expect(done).toEqual(["early", "late"]);
    expect((await store.all()).map((s) => s.clientId)).toEqual(["later"]);
  });
});
