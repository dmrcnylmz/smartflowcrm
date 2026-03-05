'use client';

import { GlobalSearch } from './GlobalSearch';

export function Header() {
    return (
        <header className="h-14 border-b border-white/[0.06] bg-background/80 backdrop-blur-md sticky top-0 z-40">
            <div className="h-full px-6 flex items-center justify-between">
                <div className="flex-1">
                    <GlobalSearch />
                </div>
            </div>
        </header>
    );
}
