import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getEventBySlug } from "@/lib/events";
import { JoinFlow } from "./join-flow";

// The slug is only known at request time, so the event is loaded inside a
// Suspense boundary (required with Cache Components). The page shell around
// it is prerendered and shows instantly.
export default function EventPage({ params }: PageProps<"/e/[slug]">) {
  return (
    <main className="flex flex-1 flex-col px-6 py-10">
      <Suspense fallback={<Loading />}>
        {params.then(({ slug }) => (
          <EventScreen slug={slug} />
        ))}
      </Suspense>
    </main>
  );
}

async function EventScreen({ slug }: { slug: string }) {
  const event = await getEventBySlug(slug);
  if (!event) notFound();

  return <JoinFlow slug={slug} event={event} />;
}

function Loading() {
  return (
    <p className="m-auto animate-pulse text-muted" role="status">
      Loading your camera…
    </p>
  );
}
