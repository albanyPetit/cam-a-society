"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  processQueue,
  queuedShots,
  subscribeToQueue,
} from "@/lib/upload/browser-queue";

type ShotsState = {
  // Shots the server has recorded (null until the first successful fetch).
  serverUsed: number | null;
  // Shots still on the phone, and how many of those the server hasn't seen.
  pending: number;
  unreserved: number;
};

// Shot counter + upload status for the camera screen. Runs the upload queue
// whenever there is something to do: on load, after each shot, when the
// connection comes back, when the app returns to the foreground, and on the
// retry timer.
export function useShots(eventId: string, maxShots: number) {
  const [state, setState] = useState<ShotsState>({
    serverUsed: null,
    pending: 0,
    unreserved: 0,
  });
  const [online, setOnline] = useState(true);
  const [rejection, setRejection] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let lastServerUsed: number | null = null;

    const kick = () => void processQueue(supabase);

    async function refresh() {
      const [shots, server] = await Promise.all([
        queuedShots(eventId),
        supabase
          .rpc("get_my_shots", { p_event_id: eventId })
          .maybeSingle<{ used: number }>(),
      ]);
      if (!server.error && server.data) lastServerUsed = server.data.used;
      if (cancelled) return;

      setState({
        serverUsed: lastServerUsed,
        pending: shots.length,
        unreserved: shots.filter((shot) => !shot.storagePath).length,
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

  const used =
    state.serverUsed === null ? null : state.serverUsed + state.unreserved;

  return {
    // null = unknown yet (e.g. first load while offline); the server still
    // enforces the limit, so the camera stays usable.
    shotsLeft: used === null ? null : Math.max(0, maxShots - used),
    pending: state.pending,
    online,
    rejection,
    clearRejection: useCallback(() => setRejection(null), []),
  };
}
