export default function TripWorkspacePlaceholder({
  params,
}: {
  params: { tripId: string };
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Trip ready to ingest
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The three-surface workspace (group chat, private AI, map) lands in
          M4; ingestion lands in M5.
        </p>
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          trip_id: {params.tripId}
        </p>
      </div>
    </main>
  );
}
