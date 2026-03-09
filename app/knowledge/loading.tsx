export default function Loading() {
    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
                    <div className="h-4 w-64 animate-pulse rounded-lg bg-muted/60" />
                </div>
                <div className="h-10 w-40 animate-pulse rounded-xl bg-muted" />
            </div>
            <div className="h-10 w-full max-w-sm animate-pulse rounded-xl bg-muted" />
            <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 rounded-2xl border bg-card p-4">
                        <div className="h-10 w-10 animate-pulse rounded-lg bg-muted shrink-0" />
                        <div className="flex-1 space-y-2">
                            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                            <div className="h-3 w-1/2 animate-pulse rounded bg-muted/60" />
                        </div>
                        <div className="h-6 w-20 animate-pulse rounded-full bg-muted/40" />
                    </div>
                ))}
            </div>
        </div>
    );
}
