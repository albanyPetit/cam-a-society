export default function EventNotFound() {
  return (
    <div className="m-auto flex max-w-xs flex-col items-center gap-4 text-center">
      <h1 className="text-2xl font-semibold">This event doesn&apos;t exist</h1>
      <p className="text-muted">
        Check that you scanned the right QR code, or ask the organizer for a new
        link.
      </p>
    </div>
  );
}
