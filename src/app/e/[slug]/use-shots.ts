"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { countUsedShots } from "@/lib/upload/queue";
import {
  processQueue,
  queuedShots,
  subscribeToQueue,
} from "@/lib/upload/browser-queue";

type ShotsState = {
  // null until the server has answered at least once.
  used: number | null;
  // Shots still on the phone, waiting to finish uploading.
  pending: number;
  // Some of those already failed an attempt (no connection, most likely).
  stalled: boolean;
};

// Shot counter + upload status for the camera screen. Runs the upload queue
// whenever there is something to do: on load, after each shot, when the
// connection comes back, when the app returns to the foreground, and on the
// retry timer.
export function useShots(eventId: string, maxShots: number) {
  const [state, setState] = useState<ShotsState>({
    used: null,
    pending: 0,
    stalled: false,
  });
  const [online, setOnline] = useState(true);
  const [rejection, setRejection] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let serverClientIds: string[] | null = null;

    const kick = () => void processQueue(supabase);

    async function refresh() {
      const [shots, server] = await Promise.all([
        queuedShots(eventId),
        supabase
          .rpc("get_my_shots", { p_event_id: eventId })
          .maybeSingle<{ client_ids: string[] }>(),
      ]);
      // Offline: keep the last known server state.
      if (!server.error && server.data)
        serverClientIds = server.data.client_ids;
      if (cancelled) return;

      setState({
        used:
          serverClientIds === null
            ? null
            : countUsedShots(
                serverClientIds,
                shots.map((shot) => shot.clientId),
              ),
        pending: shots.length,
        stalled: shots.some((shot) => shot.attempts > 0),
      });

      clearTimeout(retryTimer);
      if (shots.length > 0) {
        const next = Math.min(...shots.map((shot) => shot.nextAttemptAt));
        retryTimer = setTimeout(kick, Math.max(1_000, next - Date.now()));
      }
    }

    const unsubscribe = subscribeToQueue((rejectedReason) => {
      if (rejectedReason) setRejection(rejectedReason);
      void refresh();
    });

    const updateOnline = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) kick();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") kick();
    };

    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    document.addEventListener("visibilitychange", onVisible);

    updateOnline();
    void refresh();
    kick();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      unsubscribe();
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [eventId]);

  const { used } = state;

  return {
    // null = unknown yet (e.g. first load while offline); the server still
    // enforces the limit, so the camera stays usable.
    shotsLeft: used === null ? null : Math.max(0, maxShots - used),
    pending: state.pending,
    // iOS doesn't reliably report going offline, so failed upload attempts
    // count as "offline" too.
    offline: !online || state.stalled,
    rejection,
    clearRejection: useCallback(() => setRejection(null), []),
  };
}
