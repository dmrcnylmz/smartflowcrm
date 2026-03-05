export default function Loading() {
    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <div className="h-8 w-44 animate-pulse rounded-lg bg-muted" />
                    <div className="h-4 w-56 animate-pulse rounded-lg bg-muted/60" />
                </div>
                <div className="h-10 w-36 animate-pulse rounded-xl bg-muted" />
            </div>

            {/* Stats cards - 4 columns */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border bg-card p-5 space-y-3">
                        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                        <div className="h-7 w-12 animate-pulse rounded bg-muted" />
                        <div className="h-3 w-16 animate-pulse rounded bg-muted/50" />
                    </div>
                ))}
            </div>

            {/* Search bar */}
            <div className="h-10 w-full max-w-sm animate-pulse rounded-xl bg-muted" />

            {/* Table rows */}
            <div className="rounded-2xl border bg-card divide-y">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-4">
                        <div className="h-4 w-1/5 animate-pulse rounded bg-muted" />
                        <div className="h-4 w-1/3 animate-pulse rounded bg-muted/70" />
                        <div className="h-6 w-16 animate-pulse rounded-full bg-muted/50" />
                        <div className="h-4 w-20 animate-pulse rounded bg-muted/40 ml-auto" />
                    </div>
                ))}
            </div>
        </div>
    );
}
