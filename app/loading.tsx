export default function Loading() {
    return (
        <div className="flex h-full w-full items-center justify-center p-8">
            <div className="w-full max-w-6xl space-y-6">
                {/* Header skeleton */}
                <div className="flex items-center justify-between">
                    <div className="space-y-2">
                        <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
                        <div className="h-4 w-72 animate-pulse rounded-md bg-muted" />
                    </div>
                    <div className="h-10 w-32 animate-pulse rounded-md bg-muted" />
                </div>

                {/* KPI cards skeleton */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div
                            key={i}
                            className="rounded-lg border bg-card p-6 shadow-sm"
                        >
                            <div className="mb-2 h-4 w-24 animate-pulse rounded bg-muted" />
                            <div className="mb-1 h-8 w-16 animate-pulse rounded bg-muted" />
                            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                        </div>
                    ))}
                </div>

                {/* Content area skeleton */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                        <div
                            key={i}
                            className="rounded-lg border bg-card p-6 shadow-sm"
                        >
                            <div className="mb-4 h-5 w-36 animate-pulse rounded bg-muted" />
                            <div className="h-48 w-full animate-pulse rounded bg-muted" />
                        </div>
                    ))}
                </div>

                {/* Table skeleton */}
                <div className="rounded-lg border bg-card p-6 shadow-sm">
                    <div className="mb-4 h-5 w-40 animate-pulse rounded bg-muted" />
                    <div className="space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-4">
                                <div className="h-4 w-1/4 animate-pulse rounded bg-muted" />
                                <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                                <div className="h-4 w-1/6 animate-pulse rounded bg-muted" />
                                <div className="h-4 w-1/6 animate-pulse rounded bg-muted" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
