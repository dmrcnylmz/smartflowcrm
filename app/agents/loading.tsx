export default function Loading() {
    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
                    <div className="h-4 w-64 animate-pulse rounded-lg bg-muted/60" />
                </div>
                <div className="h-10 w-36 animate-pulse rounded-xl bg-muted" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border bg-card p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
                            <div className="space-y-2 flex-1">
                                <div className="h-5 w-32 animate-pulse rounded bg-muted" />
                                <div className="h-3 w-48 animate-pulse rounded bg-muted/60" />
                            </div>
                            <div className="h-6 w-16 animate-pulse rounded-full bg-muted/40" />
                        </div>
                        <div className="h-4 w-full animate-pulse rounded bg-muted/30" />
                    </div>
                ))}
            </div>
        </div>
    );
}
