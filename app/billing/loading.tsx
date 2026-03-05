export default function Loading() {
    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <div className="h-8 w-52 animate-pulse rounded-lg bg-muted" />
                    <div className="h-4 w-72 animate-pulse rounded-lg bg-muted/60" />
                </div>
            </div>

            {/* Plan cards - 3 columns */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border bg-card p-6 space-y-5">
                        <div className="space-y-2">
                            <div className="h-5 w-24 animate-pulse rounded bg-muted" />
                            <div className="h-8 w-32 animate-pulse rounded bg-muted/80" />
                        </div>
                        <div className="space-y-2">
                            <div className="h-3 w-full animate-pulse rounded bg-muted/40" />
                            <div className="h-3 w-5/6 animate-pulse rounded bg-muted/40" />
                            <div className="h-3 w-4/6 animate-pulse rounded bg-muted/40" />
                        </div>
                        <div className="h-10 w-full animate-pulse rounded-xl bg-muted/60" />
                    </div>
                ))}
            </div>

            {/* Usage section header */}
            <div className="h-6 w-36 animate-pulse rounded bg-muted" />

            {/* Usage items */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border bg-card p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                            <div className="h-4 w-16 animate-pulse rounded bg-muted/60" />
                        </div>
                        <div className="h-2 w-full animate-pulse rounded-full bg-muted/40" />
                        <div className="h-3 w-32 animate-pulse rounded bg-muted/30" />
                    </div>
                ))}
            </div>
        </div>
    );
}
