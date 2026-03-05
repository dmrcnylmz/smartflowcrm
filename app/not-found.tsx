import Link from 'next/link';

export default function NotFound() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
            <div className="mx-auto max-w-md text-center">
                {/* 404 Display */}
                <div className="mb-6">
                    <span className="text-8xl font-extrabold tracking-tighter text-primary/10">
                        404
                    </span>
                </div>

                <h1 className="mb-2 text-2xl font-bold text-foreground">
                    Sayfa Bulunamadı
                </h1>
                <p className="mb-8 text-muted-foreground">
                    Aradığınız sayfa mevcut değil veya taşınmış olabilir.
                </p>

                <div className="flex items-center justify-center gap-3">
                    <Link
                        href="/"
                        className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <svg
                            className="mr-2 h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
                            />
                        </svg>
                        Ana Sayfa
                    </Link>
                </div>
            </div>
        </div>
    );
}
