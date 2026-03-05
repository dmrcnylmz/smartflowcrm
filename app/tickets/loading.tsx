export default function Loading() {
    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
                    <div className="h-4 w-56 animate-pulse rounded-lg bg-muted/60" />
                </div>
                <div className="h-10 w-32 animate-pulse rounded-xl bg-muted" />
            </div>

            {/* Filter bar */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="h-10 w-full max-w-sm animate-pulse rounded-xl bg-muted" />
                <div className="h-10 w-28 animate-pulse rounded-xl bg-muted/70" />
                <div className="h-10 w-28 animate-pulse rounded-xl bg-muted/70" />
                <div className="h-10 w-24 animate-pulse rounded-xl bg-muted/60" />
            </div>

            {/* Card grid - 2 columns, 6 cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border bg-card p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="h-5 w-32 animate-pulse rounded bg-muted" />
                            <div className="h-6 w-20 animate-pulse rounded-full bg-muted/60" />
                        </div>
                        <div className="space-y-2">
                            <div className="h-4 w-full animate-pulse rounded bg-muted/50" />
                            <div className="h-4 w-3/4 animate-pulse rounded bg-muted/40" />
                        </div>
                        <div className="flex items-center gap-3 pt-2">
                            <div className="h-6 w-6 animate-pulse rounded-full bg-muted/50" />
                            <div className="h-3 w-24 animate-pulse rounded bg-muted/40" />
                            <div className="h-3 w-20 animate-pulse rounded bg-muted/30 ml-auto" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
