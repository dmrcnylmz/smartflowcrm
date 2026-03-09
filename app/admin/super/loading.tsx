export default function Loading() {
    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="space-y-2">
                <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
                <div className="h-4 w-64 animate-pulse rounded-lg bg-muted/60" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border bg-card p-5 space-y-3">
                        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                        <div className="h-7 w-14 animate-pulse rounded bg-muted" />
                    </div>
                ))}
            </div>
            <div className="rounded-2xl border bg-card divide-y">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-4">
                        <div className="h-4 w-1/4 animate-pulse rounded bg-muted" />
                        <div className="h-4 w-1/3 animate-pulse rounded bg-muted/70" />
                        <div className="h-6 w-16 animate-pulse rounded-full bg-muted/40 ml-auto" />
                    </div>
                ))}
            </div>
        </div>
    );
}
