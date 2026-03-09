'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useToast } from '@/components/ui/toast';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
import { Button } from '@/components/ui/button';
import {
    BookOpen, Upload, Globe, FileText, Trash2, Search, Database,
    Loader2, CheckCircle, XCircle, Clock, Plus, BarChart3, Sparkles,
    MessageSquare, ChevronRight, FileUp, File, X, RefreshCw,
    AlertTriangle, Rocket, Brain, Zap,
} from 'lucide-react';

// =============================================
// Types
// =============================================

interface KBDocument {
    id: string;
    title: string;
    sourceType: 'text' | 'url' | 'pdf' | 'file';
    source: string;
    chunkCount: number;
    totalTokens: number;
    status: 'processing' | 'ready' | 'error';
    error?: string;
    createdAt: { _seconds: number } | string;
}

interface KBStats {
    documentCount: number;
    chunkCount: number;
    totalTokens: number;
    sourceTypes: Record<string, number>;
}

interface QueryResult {
    chunkId: string;
    documentId: string;
    content: string;
    score: number;
}

// =============================================
// Constants
// =============================================

const ACCEPTED_FILE_TYPES = '.pdf,.txt,.md,.csv,.json,.log';
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

// =============================================
// Component
// =============================================

function KnowledgePageContent() {
    const { toast } = useToast();
    const authFetch = useAuthFetch();
    const searchParams = useSearchParams();
    const isSetup = searchParams.get('setup') === 'true';

    const [documents, setDocuments] = useState<KBDocument[]>([]);
    const [stats, setStats] = useState<KBStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [queryDialogOpen, setQueryDialogOpen] = useState(false);

    // Add source state
    const [addType, setAddType] = useState<'text' | 'url' | 'file'>('text');
    const [addContent, setAddContent] = useState('');
    const [addFilename, setAddFilename] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [ingesting, setIngesting] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Query state
    const [queryText, setQueryText] = useState('');
    const [queryResults, setQueryResults] = useState<QueryResult[]>([]);
    const [querying, setQuerying] = useState(false);

    // Search / filter state
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 300);

    // Error state
    const [error, setError] = useState<string | null>(null);

    // Delete state
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // ─── Data fetching ───────────────────────────────────────

    const fetchDocuments = useCallback(async (bustCache = false) => {
        try {
            setError(null);
            // Cache-busting: append timestamp after successful ingest to skip stale cache
            const url = bustCache ? `/api/knowledge?_t=${Date.now()}` : '/api/knowledge';
            const res = await authFetch(url);
            if (!res.ok) throw new Error('Belgeler yüklenemedi');
            const data = await res.json();
            setDocuments(data.documents || []);
        } catch {
            setError('Bilgi bankası verileri şu anda yüklenemiyor. Lütfen daha sonra tekrar deneyin.');
        }
    }, [authFetch]);

    const fetchStats = useCallback(async () => {
        try {
            const res = await authFetch('/api/knowledge?action=stats');
            if (!res.ok) return;
            const data = await res.json();
            setStats(data);
        } catch { /* silently fail */ }
    }, [authFetch]);

    useEffect(() => {
        Promise.all([fetchDocuments(), fetchStats()]).finally(() => setLoading(false));
    }, [fetchDocuments, fetchStats]);

    // ─── File Handling ───────────────────────────────────────

    function handleFileSelect(file: File) {
        if (file.size > MAX_FILE_SIZE) {
            toast({
                title: 'Dosya Çok Büyük',
                description: `Maksimum ${MAX_FILE_SIZE_MB}MB. Seçilen: ${(file.size / 1024 / 1024).toFixed(1)}MB`,
                variant: 'error',
            });
            return;
        }
        setSelectedFile(file);
        if (!addFilename) setAddFilename(file.name.replace(/\.[^/.]+$/, ''));
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault(); e.stopPropagation(); setDragActive(false);
        const files = e.dataTransfer.files;
        if (files.length > 0) handleFileSelect(files[0]);
    }

    function handleDragOver(e: React.DragEvent) { e.preventDefault(); e.stopPropagation(); setDragActive(true); }
    function handleDragLeave(e: React.DragEvent) { e.preventDefault(); e.stopPropagation(); setDragActive(false); }

    // ─── Actions ─────────────────────────────────────────────

    async function handleIngest() {
        if (addType === 'file') { if (!selectedFile) return; return handleFileIngest(); }
        if (!addContent.trim()) return;

        setIngesting(true);
        try {
            const res = await authFetch('/api/knowledge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: addType, content: addContent, filename: addFilename || undefined }),
            });
            const result = await res.json();
            if (result.status === 'error') {
                toast({ title: 'Hata', description: result.error || 'Belge işlenirken hata oluştu', variant: 'error' });
            } else {
                toast({ title: 'Başarılı!', description: `"${result.title}" eklendi (${result.chunkCount} parça)`, variant: 'success' });
                resetAddDialog();
                await Promise.all([fetchDocuments(true), fetchStats()]);
            }
        } catch {
            toast({ title: 'Hata', description: 'Belge eklenirken bir hata oluştu', variant: 'error' });
        } finally { setIngesting(false); }
    }

    async function handleFileIngest() {
        if (!selectedFile) return;
        setIngesting(true);
        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            if (addFilename) formData.append('filename', addFilename);
            const res = await authFetch('/api/knowledge', { method: 'POST', body: formData });
            const result = await res.json();
            if (result.status === 'error') {
                toast({ title: 'Hata', description: result.error || 'Dosya işlenirken hata oluştu', variant: 'error' });
            } else {
                toast({ title: 'Başarılı!', description: `"${result.title}" yüklendi (${result.chunkCount} parça)`, variant: 'success' });
                resetAddDialog();
                await Promise.all([fetchDocuments(true), fetchStats()]);
            }
        } catch {
            toast({ title: 'Hata', description: 'Dosya yüklenirken bir hata oluştu', variant: 'error' });
        } finally { setIngesting(false); }
    }

    function resetAddDialog() {
        setAddDialogOpen(false); setAddContent(''); setAddFilename('');
        setSelectedFile(null); setAddType('text');
    }

    async function handleDelete(documentId: string) {
        setDeletingId(documentId);
        try {
            const res = await authFetch('/api/knowledge', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ documentId }),
            });
            if (!res.ok) throw new Error('Silinemedi');
            toast({ title: 'Silindi', description: 'Belge başarıyla silindi', variant: 'success' });
            await Promise.all([fetchDocuments(true), fetchStats()]);
        } catch {
            toast({ title: 'Hata', description: 'Belge silinirken bir hata oluştu', variant: 'error' });
        } finally { setDeletingId(null); }
    }

    async function handleQuery() {
        if (!queryText.trim()) return;
        setQuerying(true);
        try {
            const res = await authFetch(`/api/knowledge?query=${encodeURIComponent(queryText)}&topK=5`);
            if (!res.ok) throw new Error('Sorgu çalıştırılamadı');
            const data = await res.json();
            setQueryResults(data.results || []);
        } catch {
            toast({ title: 'Hata', description: 'Sorgulama sırasında bir hata oluştu', variant: 'error' });
        } finally { setQuerying(false); }
    }

    // ─── Helpers ─────────────────────────────────────────────

    function getSourceIcon(type: string) {
        switch (type) {
            case 'url': return <Globe className="h-4 w-4" />;
            case 'pdf': return <FileText className="h-4 w-4" />;
            case 'file': return <File className="h-4 w-4" />;
            default: return <BookOpen className="h-4 w-4" />;
        }
    }

    function formatDate(date: { _seconds: number } | string): string {
        if (typeof date === 'string') return new Date(date).toLocaleDateString('tr-TR');
        if (date && '_seconds' in date) return new Date(date._seconds * 1000).toLocaleDateString('tr-TR');
        return '-';
    }

    function formatFileSize(bytes: number): string {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    const canSubmit = addType === 'file' ? !!selectedFile : addContent.trim().length > 0;

    const filteredDocuments = debouncedSearchTerm
        ? documents.filter((doc) => {
            const term = debouncedSearchTerm.toLowerCase();
            return doc.title?.toLowerCase().includes(term) || doc.sourceType?.toLowerCase().includes(term) || doc.source?.toLowerCase().includes(term);
        })
        : documents;

    const handleRetry = useCallback(() => {
        setLoading(true); setError(null);
        Promise.all([fetchDocuments(), fetchStats()]).finally(() => setLoading(false));
    }, [fetchDocuments, fetchStats]);

    // ─── Render ──────────────────────────────────────────────

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">

            {/* Setup Welcome Banner */}
            {isSetup && (
                <div className="animate-fade-in-down relative overflow-hidden rounded-2xl border border-inception-red/25 bg-inception-red/5 p-6">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-inception-red/10 rounded-full blur-3xl" />
                    </div>
                    <div className="relative flex items-start gap-4">
                        <div className="h-12 w-12 rounded-xl bg-inception-red/10 border border-inception-red/30 flex items-center justify-center flex-shrink-0">
                            <Rocket className="h-6 w-6 text-inception-red" />
                        </div>
                        <div className="flex-1">
                            <h2 className="text-lg font-bold text-white font-display tracking-wide">ŞİRKETİNİZ OLUŞTURULDU!</h2>
                            <p className="text-white/50 text-sm mt-1 leading-relaxed">
                                Harika! AI asistanınız hazır. Şimdi bilgi tabanına şirketinizle ilgili belgeler, SSS veya ürün katalogları ekleyin —
                                asistanınız bu bilgileri kullanarak müşterilerinize daha doğru yanıtlar verecek.
                            </p>
                        </div>
                        <button
                            onClick={() => { const url = new URL(window.location.href); url.searchParams.delete('setup'); window.history.replaceState({}, '', url.toString()); }}
                            className="text-white/20 hover:text-white/50 transition-colors flex-shrink-0"
                            aria-label="Kapat"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    {/* Steps */}
                    <div className="relative mt-5 grid grid-cols-3 gap-3">
                        {[
                            { step: '01', icon: Brain, label: 'Belge Ekle', desc: 'PDF, metin veya URL yükle', active: true },
                            { step: '02', icon: Zap, label: 'AI Öğrenir', desc: 'Otomatik vektörleştirme', active: false },
                            { step: '03', icon: MessageSquare, label: 'Hazır', desc: 'Asistan cevaplar', active: false },
                        ].map(({ step, icon: Icon, label, desc, active }) => (
                            <div key={step} className={`rounded-xl border p-4 ${active ? 'border-inception-red/30 bg-inception-red/5' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={`font-display text-xs ${active ? 'text-inception-red' : 'text-white/20'}`}>{step}</span>
                                    <Icon className={`h-4 w-4 ${active ? 'text-inception-red' : 'text-white/20'}`} />
                                </div>
                                <p className={`font-semibold text-sm ${active ? 'text-white' : 'text-white/30'}`}>{label}</p>
                                <p className={`text-xs mt-0.5 ${active ? 'text-white/40' : 'text-white/15'}`}>{desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="animate-fade-in-down flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-3 font-display tracking-wide">
                        <div className="h-9 w-9 rounded-xl bg-inception-red/10 border border-inception-red/25 flex items-center justify-center">
                            <Database className="h-5 w-5 text-inception-red" />
                        </div>
                        Bilgi Tabanı
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        AI asistanınızın öğreneceği kaynakları yönetin
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setQueryDialogOpen(true)}
                        disabled={!stats?.documentCount}
                    >
                        <Search className="h-4 w-4" />
                        Sorgula
                    </Button>
                    <Button
                        onClick={() => setAddDialogOpen(true)}
                        className="font-display tracking-wide"
                    >
                        <Plus className="h-4 w-4" />
                        Kaynak Ekle
                    </Button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { title: 'Toplam Belge', value: stats?.documentCount ?? 0, sub: 'Yüklenen kaynak', icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/15' },
                    { title: 'Parça Sayısı', value: stats?.chunkCount ?? 0, sub: 'Vektörleştirilmiş', icon: Sparkles, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/15' },
                    { title: 'Token Kullanımı', value: stats?.totalTokens ? (stats.totalTokens / 1000).toFixed(1) + 'K' : '0', sub: 'Embedding token', icon: BarChart3, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/15' },
                    { title: 'Kaynak Türleri', value: stats?.sourceTypes ? Object.keys(stats.sourceTypes).length : 0, sub: Object.entries(stats?.sourceTypes || {}).map(([k, v]) => `${k}:${v}`).join(', ') || 'Henüz yok', icon: Database, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/15' },
                ].map((card, idx) => {
                    const Icon = card.icon;
                    return (
                        <div
                            key={card.title}
                            className={`animate-fade-in-up rounded-2xl border ${card.border} bg-white/[0.02] p-4 backdrop-blur-sm`}
                            style={{ animationDelay: `${idx * 80}ms` }}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs text-white/40 font-medium">{card.title}</span>
                                <div className={`h-8 w-8 rounded-lg ${card.bg} flex items-center justify-center`}>
                                    <Icon className={`h-4 w-4 ${card.color}`} />
                                </div>
                            </div>
                            <p className="text-2xl font-bold text-white">{loading ? '—' : card.value}</p>
                            <p className="text-xs text-white/30 mt-1 truncate">{card.sub}</p>
                        </div>
                    );
                })}
            </div>

            {/* Document List */}
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden">
                {/* Card Header */}
                <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between gap-4">
                    <h2 className="font-semibold text-white flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-white/40" />
                        Kaynaklar
                        {filteredDocuments.length > 0 && (
                            <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-white/[0.06] text-white/40">
                                {filteredDocuments.length}
                            </span>
                        )}
                    </h2>
                    <div className="flex items-center gap-2">
                        {documents.length > 0 && (
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
                                <input
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Kaynak ara..."
                                    className="pl-9 pr-4 py-2 text-sm rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/20 focus:outline-none focus:border-inception-red/40 w-52 transition-colors"
                                />
                            </div>
                        )}
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={handleRetry}
                            title="Yenile"
                            aria-label="Yenile"
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>

                {/* Card Body */}
                <div className="p-4">
                    {error ? (
                        <div className="text-center py-14">
                            <AlertTriangle className="h-12 w-12 text-amber-500/30 mx-auto mb-4" />
                            <p className="text-white/50 text-sm mb-4">Bilgi bankası verileri yüklenemedi.</p>
                            <Button variant="outline" onClick={handleRetry} className="mx-auto">
                                <RefreshCw className="h-3.5 w-3.5" />
                                Tekrar Dene
                            </Button>
                        </div>
                    ) : loading ? (
                        <div className="space-y-2">
                            {[0, 1, 2, 3].map((i) => (
                                <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-white/[0.04] animate-pulse" style={{ animationDelay: `${i * 80}ms` }}>
                                    <div className="h-10 w-10 rounded-xl bg-white/[0.06] flex-shrink-0" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-3.5 w-1/3 rounded bg-white/[0.06]" />
                                        <div className="h-3 w-1/2 rounded bg-white/[0.04]" />
                                    </div>
                                    <div className="h-6 w-16 rounded-full bg-white/[0.06]" />
                                </div>
                            ))}
                        </div>
                    ) : documents.length === 0 ? (
                        <div className="text-center py-16">
                            <div className="h-16 w-16 rounded-2xl bg-inception-red/10 border border-inception-red/20 flex items-center justify-center mx-auto mb-5">
                                <Database className="h-8 w-8 text-inception-red/50" />
                            </div>
                            <h3 className="text-base font-semibold text-white/70 mb-1">Henüz kaynak eklenmemiş</h3>
                            <p className="text-sm text-white/30 mb-6 max-w-sm mx-auto">
                                Metin, URL veya PDF kaynakları ekleyerek AI asistanınızı şirketiniz hakkında eğitin.
                            </p>
                            <Button
                                onClick={() => setAddDialogOpen(true)}
                                className="mx-auto font-display tracking-wide"
                            >
                                <Plus className="h-4 w-4" />
                                İlk Kaynağı Ekle
                            </Button>
                        </div>
                    ) : filteredDocuments.length === 0 ? (
                        <div className="text-center py-12">
                            <Search className="h-10 w-10 text-white/10 mx-auto mb-3" />
                            <p className="text-sm text-white/30">
                                &ldquo;{debouncedSearchTerm}&rdquo; ile eşleşen kaynak yok.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredDocuments.map((doc, idx) => (
                                <div
                                    key={doc.id}
                                    className="flex items-center justify-between p-4 rounded-xl border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.08] transition-all duration-200 animate-fade-in-up group"
                                    style={{ animationDelay: `${idx * 50}ms` }}
                                >
                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                        <div className="h-10 w-10 rounded-xl bg-inception-red/10 border border-inception-red/15 flex items-center justify-center text-inception-red/70 flex-shrink-0">
                                            {getSourceIcon(doc.sourceType)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h4 className="font-medium text-white/80 truncate text-sm">{doc.title || 'Adsız Belge'}</h4>
                                            <div className="flex items-center gap-3 text-xs text-white/25 mt-1">
                                                <span className="uppercase">{doc.sourceType}</span>
                                                {doc.chunkCount > 0 && <span>{doc.chunkCount} parça</span>}
                                                {doc.totalTokens > 0 && <span>{doc.totalTokens} token</span>}
                                                <span>{formatDate(doc.createdAt)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                                        {/* Status Badge */}
                                        {doc.status === 'ready' && (
                                            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                <CheckCircle className="h-3 w-3" /> Hazır
                                            </span>
                                        )}
                                        {doc.status === 'processing' && (
                                            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                <Clock className="h-3 w-3" /> İşleniyor
                                            </span>
                                        )}
                                        {doc.status === 'error' && (
                                            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                                                <XCircle className="h-3 w-3" /> Hata
                                            </span>
                                        )}
                                        <button
                                            onClick={() => handleDelete(doc.id)}
                                            disabled={deletingId === doc.id}
                                            className="h-8 w-8 rounded-lg border border-white/[0.06] bg-white/[0.03] hover:border-red-500/30 hover:bg-red-500/10 flex items-center justify-center text-white/25 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
                                            aria-label="Sil"
                                        >
                                            {deletingId === doc.id ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <Trash2 className="h-3.5 w-3.5" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ─── Add Source Dialog (custom dark modal) ─── */}
            {addDialogOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={resetAddDialog} />
                    <div className="relative w-full max-w-2xl bg-[#0e0e1e] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up">
                        {/* Modal Header */}
                        <div className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-lg bg-inception-red/10 border border-inception-red/25 flex items-center justify-center">
                                    <Upload className="h-4 w-4 text-inception-red" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-white font-display tracking-wide">KAYNAK EKLE</h3>
                                    <p className="text-xs text-white/30">Metin, URL veya dosya yükleme desteklenir</p>
                                </div>
                            </div>
                            <Button variant="outline" size="icon" onClick={resetAddDialog} aria-label="Kapat">
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
                            {/* Source Type Tabs */}
                            <div className="flex gap-2 p-1 bg-white/[0.03] rounded-xl border border-white/[0.06]">
                                {[
                                    { id: 'text' as const, icon: BookOpen, label: 'Metin' },
                                    { id: 'url' as const, icon: Globe, label: 'URL' },
                                    { id: 'file' as const, icon: FileUp, label: 'Dosya' },
                                ].map(({ id, icon: Icon, label }) => (
                                    <button
                                        key={id}
                                        onClick={() => { setAddType(id); if (id !== 'file') setSelectedFile(null); else setAddContent(''); }}
                                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all
                                            ${addType === id
                                                ? 'bg-inception-red/10 text-inception-red border border-inception-red/30'
                                                : 'text-white/40 hover:text-white/60 border border-transparent'
                                            }`}
                                    >
                                        <Icon className="h-3.5 w-3.5" />
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {/* Source Name */}
                            <div>
                                <label className="block text-xs text-white/50 mb-2 uppercase tracking-wider">Kaynak Adı <span className="text-white/25 lowercase tracking-normal">(opsiyonel)</span></label>
                                <input
                                    value={addFilename}
                                    onChange={(e) => setAddFilename(e.target.value)}
                                    placeholder="Örn: Şirket Politikası, SSS, Ürün Kataloğu..."
                                    className="w-full h-11 px-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/20 focus:outline-none focus:border-inception-red/40 text-sm transition-colors"
                                />
                            </div>

                            {/* Content Area */}
                            {addType === 'text' ? (
                                <div>
                                    <label className="block text-xs text-white/50 mb-2 uppercase tracking-wider">İçerik</label>
                                    <textarea
                                        value={addContent}
                                        onChange={(e) => setAddContent(e.target.value)}
                                        placeholder="Bilgi tabanına eklemek istediğiniz metni buraya yapıştırın..."
                                        rows={10}
                                        className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/20 focus:outline-none focus:border-inception-red/40 text-sm font-mono resize-none transition-colors"
                                    />
                                    <p className="text-xs text-white/20 mt-1.5">
                                        {addContent.length} karakter · ~{Math.ceil(addContent.length / 4)} token
                                    </p>
                                </div>
                            ) : addType === 'url' ? (
                                <div>
                                    <label className="block text-xs text-white/50 mb-2 uppercase tracking-wider">Web Sayfası URL</label>
                                    <input
                                        type="url"
                                        value={addContent}
                                        onChange={(e) => setAddContent(e.target.value)}
                                        placeholder="https://www.ornek.com/bilgi-sayfasi"
                                        className="w-full h-11 px-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/20 focus:outline-none focus:border-inception-red/40 text-sm transition-colors"
                                    />
                                    <p className="text-xs text-white/25 mt-1.5">Sayfa içeriği otomatik olarak çekilip işlenecektir.</p>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-xs text-white/50 mb-2 uppercase tracking-wider">Dosya</label>
                                    <div
                                        className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                                            ${dragActive
                                                ? 'border-inception-red bg-inception-red/10'
                                                : selectedFile
                                                    ? 'border-emerald-500/40 bg-emerald-500/5'
                                                    : 'border-white/[0.10] hover:border-inception-red/40 hover:bg-inception-red/5'
                                            }`}
                                        onDrop={handleDrop}
                                        onDragOver={handleDragOver}
                                        onDragLeave={handleDragLeave}
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept={ACCEPTED_FILE_TYPES}
                                            className="hidden"
                                            onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileSelect(file); }}
                                        />
                                        {selectedFile ? (
                                            <div className="space-y-3">
                                                <div className="h-12 w-12 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto">
                                                    <CheckCircle className="h-6 w-6 text-emerald-400" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-white/80 text-sm">{selectedFile.name}</p>
                                                    <p className="text-xs text-white/30 mt-1">{formatFileSize(selectedFile.size)}</p>
                                                </div>
                                                <button
                                                    className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 mx-auto"
                                                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                                                >
                                                    <X className="h-3 w-3" />
                                                    Kaldır
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                <div className="h-12 w-12 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto">
                                                    <FileUp className="h-6 w-6 text-white/30" />
                                                </div>
                                                <div>
                                                    <p className="text-sm text-white/50">
                                                        {dragActive ? 'Dosyayı bırakın' : 'Sürükleyin veya tıklayın'}
                                                    </p>
                                                    <p className="text-xs text-white/20 mt-1">PDF, TXT, MD, CSV · Maks. {MAX_FILE_SIZE_MB}MB</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Submit */}
                            <div className="flex justify-end gap-3 pt-1">
                                <Button variant="outline" onClick={resetAddDialog}>
                                    İptal
                                </Button>
                                <Button
                                    onClick={handleIngest}
                                    disabled={ingesting || !canSubmit}
                                    className="font-display tracking-wide"
                                >
                                    {ingesting ? (
                                        <><Loader2 className="h-4 w-4 animate-spin" /> İşleniyor...</>
                                    ) : (
                                        <><Upload className="h-4 w-4" /> {addType === 'file' ? 'Yükle ve İşle' : 'Ekle ve İşle'}</>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Query Dialog ─── */}
            {queryDialogOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setQueryDialogOpen(false)} />
                    <div className="relative w-full max-w-2xl bg-[#0e0e1e] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up flex flex-col max-h-[80vh]">
                        {/* Modal Header */}
                        <div className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-lg bg-purple-500/10 border border-purple-500/25 flex items-center justify-center">
                                    <MessageSquare className="h-4 w-4 text-purple-400" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-white font-display tracking-wide">BİLGİ TABANI SORGUSU</h3>
                                    <p className="text-xs text-white/30">Bilgi tabanından en ilgili sonuçları alın</p>
                                </div>
                            </div>
                            <Button variant="outline" size="icon" onClick={() => setQueryDialogOpen(false)} aria-label="Kapat">
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="p-6 flex flex-col gap-4 overflow-hidden flex-1">
                            {/* Search input */}
                            <div className="flex gap-2 flex-shrink-0">
                                <input
                                    value={queryText}
                                    onChange={(e) => setQueryText(e.target.value)}
                                    placeholder="Sormak istediğiniz soruyu yazın..."
                                    onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
                                    className="flex-1 h-11 px-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500/40 text-sm transition-colors"
                                />
                                <Button
                                    onClick={handleQuery}
                                    disabled={querying || !queryText.trim()}
                                    className="flex-shrink-0"
                                >
                                    {querying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                    Ara
                                </Button>
                            </div>

                            {/* Results */}
                            <div className="flex-1 overflow-y-auto space-y-3">
                                {queryResults.length > 0 ? (
                                    queryResults.map((result, i) => (
                                        <div key={result.chunkId} className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-xs text-white/30 flex items-center gap-1">
                                                    <ChevronRight className="h-3 w-3" /> Sonuç {i + 1}
                                                </span>
                                                <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium
                                                    ${result.score > 0.7
                                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                        : result.score > 0.5
                                                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                            : 'bg-white/[0.04] text-white/30 border-white/[0.08]'
                                                    }`}>
                                                    {(result.score * 100).toFixed(0)}% eşleşme
                                                </span>
                                            </div>
                                            <p className="text-sm text-white/50 leading-relaxed">
                                                {result.content.length > 500 ? result.content.slice(0, 500) + '...' : result.content}
                                            </p>
                                        </div>
                                    ))
                                ) : queryText && !querying ? (
                                    <div className="text-center py-10">
                                        <Search className="h-8 w-8 text-white/10 mx-auto mb-2" />
                                        <p className="text-sm text-white/30">Sonuç bulunamadı. Farklı bir soru deneyin.</p>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// =============================================
// Skeleton fallback for Suspense
// =============================================

function KnowledgePageSkeleton() {
    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto animate-pulse space-y-6">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <div className="h-8 w-52 rounded-xl bg-white/[0.05]" />
                    <div className="h-4 w-72 rounded-lg bg-white/[0.03]" />
                </div>
                <div className="flex gap-2">
                    <div className="h-10 w-28 rounded-xl bg-white/[0.05]" />
                    <div className="h-10 w-32 rounded-xl bg-white/[0.05]" />
                </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[0, 1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl bg-white/[0.03]" />)}
            </div>
            <div className="h-80 rounded-2xl bg-white/[0.02]" />
        </div>
    );
}

// =============================================
// Page (default export with Suspense)
// =============================================

export default function KnowledgePage() {
    return (
        <Suspense fallback={<KnowledgePageSkeleton />}>
            <KnowledgePageContent />
        </Suspense>
    );
}
