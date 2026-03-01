export default function Loading() {
    return (
        <div className="flex h-full w-full items-center justify-center p-8">
            <div className="w-full max-w-6xl space-y-6">
                {/* Header skeleton */}
                <div
                    className="flex items-center justify-between animate-fade-in-up opacity-0"
                    style={{ animationDelay: '0ms', animationFillMode: 'forwards' }}
                >
                    <div className="space-y-2">
                        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
                        <div className="h-4 w-72 animate-pulse rounded-lg bg-muted/70" />
                    </div>
                    <div className="h-10 w-32 animate-pulse rounded-xl bg-muted" />
                </div>

                {/* KPI cards skeleton */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div
                            key={i}
                            className="rounded-2xl border bg-card p-6 shadow-sm animate-fade-in-up opacity-0"
                            style={{ animationDelay: `${80 + i * 80}ms`, animationFillMode: 'forwards' }}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                                <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
                            </div>
                            <div className="mb-1.5 h-8 w-16 animate-pulse rounded bg-muted" />
                            <div className="h-3 w-28 animate-pulse rounded bg-muted/60" />
                        </div>
                    ))}
                </div>

                {/* Content area skeleton */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                        <div
                            key={i}
                            className="rounded-2xl border bg-card p-6 shadow-sm animate-fade-in-up opacity-0"
                            style={{ animationDelay: `${400 + i * 100}ms`, animationFillMode: 'forwards' }}
                        >
                            <div className="mb-4 h-5 w-36 animate-pulse rounded bg-muted" />
                            <div className="h-48 w-full animate-pulse rounded-xl bg-muted/50" />
                        </div>
                    ))}
                </div>

                {/* Table skeleton */}
                <div
                    className="rounded-2xl border bg-card p-6 shadow-sm animate-fade-in-up opacity-0"
                    style={{ animationDelay: '600ms', animationFillMode: 'forwards' }}
                >
                    <div className="mb-4 h-5 w-40 animate-pulse rounded bg-muted" />
                    <div className="space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div
                                key={i}
                                className="flex items-center gap-4 animate-fade-in-up opacity-0"
                                style={{ animationDelay: `${700 + i * 60}ms`, animationFillMode: 'forwards' }}
                            >
                                <div className="h-4 w-1/4 animate-pulse rounded bg-muted" />
                                <div className="h-4 w-1/3 animate-pulse rounded bg-muted/70" />
                                <div className="h-4 w-1/6 animate-pulse rounded bg-muted/60" />
                                <div className="h-4 w-1/6 animate-pulse rounded bg-muted/50" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
