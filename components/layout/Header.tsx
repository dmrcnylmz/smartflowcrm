'use client';

import { GlobalSearch } from './GlobalSearch';

export function Header() {
    return (
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-40">
            <div className="h-full px-6 flex items-center justify-between">
                <div className="flex-1">
                    <GlobalSearch />
                </div>
            </div>
        </header>
    );
}
