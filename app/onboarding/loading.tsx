export default function Loading() {
    return (
        <div className="flex items-center justify-center min-h-[80vh] p-6">
            <div className="w-full max-w-lg space-y-6">
                <div className="text-center space-y-2">
                    <div className="h-8 w-48 animate-pulse rounded-lg bg-muted mx-auto" />
                    <div className="h-4 w-64 animate-pulse rounded-lg bg-muted/60 mx-auto" />
                </div>
                <div className="rounded-2xl border bg-card p-8 space-y-6">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-4">
                            <div className="h-8 w-8 animate-pulse rounded-full bg-muted shrink-0" />
                            <div className="flex-1 space-y-2">
                                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                                <div className="h-3 w-1/2 animate-pulse rounded bg-muted/60" />
                            </div>
                        </div>
                    ))}
                    <div className="h-10 w-full animate-pulse rounded-xl bg-muted" />
                </div>
            </div>
        </div>
    );
}
