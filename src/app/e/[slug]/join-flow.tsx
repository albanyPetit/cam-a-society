"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PublicEvent } from "@/lib/events";
import { privacy } from "@/lib/privacy";

type Step =
  | { name: "checking" }
  | { name: "privacy" }
  | { name: "nickname" }
  | { name: "joined"; displayName: string };

// Join flow: privacy notice → nickname → joined.
// Returning visitors (same browser) skip straight to "joined": their
// anonymous session lives in a cookie, and RLS only lets them read their own
// participant row.
export function JoinFlow({
  slug,
  event,
}: {
  slug: string;
  event: PublicEvent;
}) {
  const [step, setStep] = useState<Step>({ name: "checking" });

  useEffect(() => {
    let cancelled = false;

    async function checkExistingParticipant() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      let displayName: string | undefined;
      if (session) {
        const { data } = await supabase
          .from("participants")
          .select("display_name")
          .eq("event_id", event.id)
          .maybeSingle();
        displayName = data?.display_name;
      }

      if (cancelled) return;
      setStep(
        displayName ? { name: "joined", displayName } : { name: "privacy" },
      );
    }

    checkExistingParticipant();
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-8">
      <header className="text-center">
        <p className="text-sm tracking-widest text-accent uppercase">
          Disposable camera
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {event.name}
        </h1>
      </header>

      {step.name === "checking" && (
        <p className="m-auto animate-pulse text-muted" role="status">
          Loading your camera…
        </p>
      )}
      {step.name === "privacy" && (
        <PrivacyNotice onAccept={() => setStep({ name: "nickname" })} />
      )}
      {step.name === "nickname" && (
        <NicknameForm
          slug={slug}
          onJoined={(displayName) => setStep({ name: "joined", displayName })}
        />
      )}
      {step.name === "joined" && (
        <Joined displayName={step.displayName} event={event} />
      )}
    </div>
  );
}

function PrivacyNotice({ onAccept }: { onAccept: () => void }) {
  const [accepted, setAccepted] = useState(false);

  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-xl font-semibold">Before you start</h2>
      <ul className="flex list-disc flex-col gap-3 pl-5 text-sm leading-relaxed text-foreground/90">
        <li>
          No account or email needed. We only store the{" "}
          <strong>nickname</strong> you choose and the{" "}
          <strong>photos you take</strong>.
        </li>
        <li>
          Photos stay hidden until the reveal time. Then everyone who joined
          this event can see and download them.
        </li>
        <li>Only take photos of people who are happy to be photographed.</li>
        <li>
          Everything is deleted automatically {privacy.retentionDays} days after
          the event. Data is stored in {privacy.storageLocation}.
        </li>
        <li>
          Want a photo removed? Contact {privacy.controller} at{" "}
          <span className="text-accent">{privacy.contactEmail}</span>.
        </li>
      </ul>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 size-5 accent-accent"
        />
        <span>I&apos;ve read this and agree.</span>
      </label>

      <button
        type="button"
        disabled={!accepted}
        onClick={onAccept}
        className="rounded-full bg-accent px-6 py-3 font-semibold text-background transition disabled:opacity-40"
      >
        Continue
      </button>
    </section>
  );
}

const JOIN_ERRORS: Record<string, string> = {
  invalid_display_name: "Your nickname must be 1–30 characters.",
  event_not_found: "This event no longer exists.",
};

function NicknameForm({
  slug,
  onJoined,
}: {
  slug: string;
  onJoined: (displayName: string) => void;
}) {
  const [nickname, setNickname] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      const { error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError) {
        setError("We couldn't start your camera. Please try again.");
        setSubmitting(false);
        return;
      }
    }

    const { data, error: joinError } = await supabase.rpc("join_event", {
      p_slug: slug,
      p_display_name: nickname,
    });

    if (joinError) {
      setError(
        JOIN_ERRORS[joinError.message] ??
          "Something went wrong. Please try again.",
      );
      setSubmitting(false);
      return;
    }

    onJoined(data.display_name);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-2">
        <span className="text-xl font-semibold">What should we call you?</span>
        <span className="text-sm text-muted">
          Your nickname appears next to your photos.
        </span>
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={30}
          required
          autoFocus
          autoComplete="nickname"
          enterKeyHint="go"
          placeholder="e.g. Sunny"
          className="mt-2 rounded-xl border border-muted/40 bg-transparent px-4 py-3 text-lg outline-none focus:border-accent"
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || nickname.trim() === ""}
        className="rounded-full bg-accent px-6 py-3 font-semibold text-background transition disabled:opacity-40"
      >
        {submitting ? "Joining…" : "Get my camera"}
      </button>
    </form>
  );
}

function Joined({
  displayName,
  event,
}: {
  displayName: string;
  event: PublicEvent;
}) {
  // English UI → en-GB (24-hour clock), in the viewer's own time zone.
  const reveal = new Date(event.reveal_at).toLocaleString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section className="flex flex-col items-center gap-4 text-center">
      <h2 className="text-2xl font-semibold">You&apos;re in, {displayName}!</h2>
      <p className="text-muted">
        You have <strong className="text-foreground">{event.max_shots}</strong>{" "}
        shots. Your photos develop on{" "}
        <strong className="text-foreground">{reveal}</strong>.
      </p>
      {/* Phase 2: the camera goes here. */}
      <p className="mt-6 rounded-xl border border-dashed border-muted/40 px-4 py-6 text-sm text-muted">
        The camera is coming soon.
      </p>
    </section>
  );
}
