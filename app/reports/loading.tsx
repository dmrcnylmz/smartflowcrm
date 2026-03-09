export default function Loading() {
    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
                    <div className="h-4 w-56 animate-pulse rounded-lg bg-muted/60" />
                </div>
                <div className="flex gap-2">
                    <div className="h-10 w-32 animate-pulse rounded-xl bg-muted" />
                    <div className="h-10 w-28 animate-pulse rounded-xl bg-muted" />
                </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border bg-card p-5 space-y-3">
                        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                        <div className="h-8 w-16 animate-pulse rounded bg-muted" />
                    </div>
                ))}
            </div>
            <div className="rounded-2xl border bg-card p-6">
                <div className="h-4 w-32 animate-pulse rounded bg-muted mb-4" />
                <div className="h-64 w-full animate-pulse rounded-xl bg-muted/30" />
            </div>
        </div>
    );
}
