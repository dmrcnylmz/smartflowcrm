'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Phone, Users, Calendar, AlertCircle, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SearchResult {
    id: string;
    type: 'customer' | 'call' | 'appointment' | 'complaint';
    title: string;
    subtitle: string;
    href: string;
}

interface GlobalSearchProps {
    className?: string;
}

export function GlobalSearch({ className }: GlobalSearchProps) {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Debounced search
    const searchDebounced = useCallback((searchQuery: string) => {
        if (searchQuery.length < 2) {
            setResults([]);
            return;
        }

        setLoading(true);

        // Simulate search - in production this would call an API
        setTimeout(() => {
            const mockResults: SearchResult[] = [];
            const q = searchQuery.toLowerCase();

            // Mock customer results
            if ('müşteri'.includes(q) || 'customer'.includes(q) || q.length >= 2) {
                mockResults.push(
                    { id: '1', type: 'customer', title: 'Müşteri Ara', subtitle: `"${searchQuery}" için müşterilerde ara`, href: `/customers?search=${encodeURIComponent(searchQuery)}` },
                );
            }

            // Mock call results
            if ('çağrı'.includes(q) || 'call'.includes(q) || q.length >= 2) {
                mockResults.push(
                    { id: '2', type: 'call', title: 'Çağrılarda Ara', subtitle: `"${searchQuery}" için çağrılarda ara`, href: `/calls?search=${encodeURIComponent(searchQuery)}` },
                );
            }

            // Mock appointment results
            if ('randevu'.includes(q) || 'appointment'.includes(q) || q.length >= 2) {
                mockResults.push(
                    { id: '3', type: 'appointment', title: 'Randevularda Ara', subtitle: `"${searchQuery}" için randevularda ara`, href: `/appointments?search=${encodeURIComponent(searchQuery)}` },
                );
            }

            // Mock complaint results
            if ('şikayet'.includes(q) || 'complaint'.includes(q) || q.length >= 2) {
                mockResults.push(
                    { id: '4', type: 'complaint', title: 'Şikayetlerde Ara', subtitle: `"${searchQuery}" için şikayetlerde ara`, href: `/complaints?search=${encodeURIComponent(searchQuery)}` },
                );
            }

            setResults(mockResults);
            setLoading(false);
            setSelectedIndex(0);
        }, 150);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            searchDebounced(query);
        }, 300);
        return () => clearTimeout(timer);
    }, [query, searchDebounced]);

    // Click outside to close
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Keyboard navigation
    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && results[selectedIndex]) {
            e.preventDefault();
            handleSelect(results[selectedIndex]);
        } else if (e.key === 'Escape') {
            setIsOpen(false);
            inputRef.current?.blur();
        }
    }

    function handleSelect(result: SearchResult) {
        router.push(result.href);
        setIsOpen(false);
        setQuery('');
    }

    function getIcon(type: SearchResult['type']) {
        switch (type) {
            case 'customer': return <Users className="h-4 w-4" />;
            case 'call': return <Phone className="h-4 w-4" />;
            case 'appointment': return <Calendar className="h-4 w-4" />;
            case 'complaint': return <AlertCircle className="h-4 w-4" />;
        }
    }

    return (
        <div ref={containerRef} className={cn("relative", className)}>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    ref={inputRef}
                    type="text"
                    placeholder="Ara... (müşteri, çağrı, randevu, şikayet)"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    className="pl-10 pr-10 w-full md:w-[400px]"
                />
                {query && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                        onClick={() => {
                            setQuery('');
                            inputRef.current?.focus();
                        }}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>

            {/* Results dropdown */}
            {isOpen && query.length >= 2 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-card border rounded-lg shadow-lg z-50 overflow-hidden">
                    {loading ? (
                        <div className="p-4 text-center text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
                            Aranıyor...
                        </div>
                    ) : results.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground">
                            Sonuç bulunamadı
                        </div>
                    ) : (
                        <div className="py-2">
                            {results.map((result, index) => (
                                <button
                                    key={result.id}
                                    className={cn(
                                        "w-full px-4 py-2 flex items-center gap-3 text-left transition-colors",
                                        index === selectedIndex ? "bg-accent" : "hover:bg-accent/50"
                                    )}
                                    onClick={() => handleSelect(result)}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                >
                                    <div className="text-muted-foreground">
                                        {getIcon(result.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{result.title}</p>
                                        <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
