// Landing page. Participants normally arrive via an event QR (/e/[slug]),
// so this only tells people who land here directly what to do.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimization needed */}
      <img
        src="/icons/icon.svg"
        alt=""
        width={96}
        height={96}
        className="rounded-3xl"
      />
      <h1 className="text-3xl font-semibold tracking-tight">A Society Cam</h1>
      <p className="max-w-xs text-muted">
        Scan the QR code at your event to pick up your disposable camera.
      </p>
    </main>
  );
}
