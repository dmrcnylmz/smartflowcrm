'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import {
    BookOpen,
    Upload,
    Globe,
    FileText,
    Trash2,
    Search,
    Database,
    Loader2,
    CheckCircle,
    XCircle,
    Clock,
    Plus,
    BarChart3,
    Sparkles,
    MessageSquare,
    ChevronRight,
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
// Component
// =============================================

export default function KnowledgeBasePage() {
    const { toast } = useToast();
    const [documents, setDocuments] = useState<KBDocument[]>([]);
    const [stats, setStats] = useState<KBStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [queryDialogOpen, setQueryDialogOpen] = useState(false);

    // Add source state
    const [addType, setAddType] = useState<'text' | 'url'>('text');
    const [addContent, setAddContent] = useState('');
    const [addFilename, setAddFilename] = useState('');
    const [ingesting, setIngesting] = useState(false);

    // Query state
    const [queryText, setQueryText] = useState('');
    const [queryResults, setQueryResults] = useState<QueryResult[]>([]);
    const [querying, setQuerying] = useState(false);

    // Delete state
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // ─────────────────────────────────────────────
    // Data fetching
    // ─────────────────────────────────────────────

    const fetchDocuments = useCallback(async () => {
        try {
            const res = await fetch('/api/knowledge');
            if (!res.ok) throw new Error('Failed to fetch documents');
            const data = await res.json();
            setDocuments(data.documents || []);
        } catch (err) {
            console.error('KB fetch error:', err);
        }
    }, []);

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch('/api/knowledge?action=stats');
            if (!res.ok) throw new Error('Failed to fetch stats');
            const data = await res.json();
            setStats(data);
        } catch (err) {
            console.error('KB stats error:', err);
        }
    }, []);

    useEffect(() => {
        Promise.all([fetchDocuments(), fetchStats()]).finally(() => setLoading(false));
    }, [fetchDocuments, fetchStats]);

    // ─────────────────────────────────────────────
    // Actions
    // ─────────────────────────────────────────────

    async function handleIngest() {
        if (!addContent.trim()) return;

        setIngesting(true);
        try {
            const res = await fetch('/api/knowledge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: addType,
                    content: addContent,
                    filename: addFilename || undefined,
                }),
            });

            const result = await res.json();

            if (result.status === 'error') {
                toast({
                    title: 'İçe Aktarma Hatası',
                    description: result.error || 'Belge işlenirken bir hata oluştu',
                    variant: 'error',
                });
            } else {
                toast({
                    title: 'Başarılı!',
                    description: `"${result.title}" başarıyla eklendi (${result.chunkCount} parça)`,
                    variant: 'success',
                });
                setAddDialogOpen(false);
                setAddContent('');
                setAddFilename('');
                await Promise.all([fetchDocuments(), fetchStats()]);
            }
        } catch (err) {
            toast({
                title: 'Hata',
                description: 'Belge eklenirken bir hata oluştu',
                variant: 'error',
            });
            console.error('Ingest error:', err);
        } finally {
            setIngesting(false);
        }
    }

    async function handleDelete(documentId: string) {
        setDeletingId(documentId);
        try {
            const res = await fetch('/api/knowledge', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ documentId }),
            });

            if (!res.ok) throw new Error('Delete failed');

            toast({
                title: 'Silindi',
                description: 'Belge başarıyla silindi',
                variant: 'success',
            });

            await Promise.all([fetchDocuments(), fetchStats()]);
        } catch (err) {
            toast({
                title: 'Hata',
                description: 'Belge silinirken bir hata oluştu',
                variant: 'error',
            });
            console.error('Delete error:', err);
        } finally {
            setDeletingId(null);
        }
    }

    async function handleQuery() {
        if (!queryText.trim()) return;

        setQuerying(true);
        try {
            const res = await fetch(`/api/knowledge?query=${encodeURIComponent(queryText)}&topK=5`);
            if (!res.ok) throw new Error('Query failed');
            const data = await res.json();
            setQueryResults(data.results || []);
        } catch (err) {
            toast({
                title: 'Hata',
                description: 'Sorgulama sırasında bir hata oluştu',
                variant: 'error',
            });
            console.error('Query error:', err);
        } finally {
            setQuerying(false);
        }
    }

    // ─────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────

    function getSourceIcon(type: string) {
        switch (type) {
            case 'url': return <Globe className="h-4 w-4" />;
            case 'pdf': return <FileText className="h-4 w-4" />;
            default: return <BookOpen className="h-4 w-4" />;
        }
    }

    function getStatusBadge(status: string) {
        switch (status) {
            case 'ready':
                return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"><CheckCircle className="h-3 w-3 mr-1" /> Hazır</Badge>;
            case 'processing':
                return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30"><Clock className="h-3 w-3 mr-1" /> İşleniyor</Badge>;
            case 'error':
                return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="h-3 w-3 mr-1" /> Hata</Badge>;
            default:
                return <Badge variant="secondary">{status}</Badge>;
        }
    }

    function formatDate(date: { _seconds: number } | string): string {
        if (typeof date === 'string') return new Date(date).toLocaleDateString('tr-TR');
        if (date && '_seconds' in date) return new Date(date._seconds * 1000).toLocaleDateString('tr-TR');
        return '-';
    }

    // ─────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────

    return (
        <div className="p-8">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-3">
                            <Database className="h-8 w-8 text-indigo-500" />
                            Bilgi Tabanı
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            Sesli asistanınızın bilgi kaynaklarını yönetin
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            onClick={() => setQueryDialogOpen(true)}
                            className="gap-2"
                            disabled={!stats?.documentCount}
                        >
                            <Search className="h-4 w-4" />
                            Sorgula
                        </Button>
                        <Button
                            onClick={() => setAddDialogOpen(true)}
                            className="gap-2 bg-indigo-600 hover:bg-indigo-700"
                        >
                            <Plus className="h-4 w-4" />
                            Kaynak Ekle
                        </Button>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Belgeler</CardTitle>
                        <FileText className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.documentCount ?? 0}</div>
                        <p className="text-xs text-muted-foreground mt-1">Toplam kaynak</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Parçalar</CardTitle>
                        <Sparkles className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.chunkCount ?? 0}</div>
                        <p className="text-xs text-muted-foreground mt-1">Vektörleştirilmiş</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Token Kullanımı</CardTitle>
                        <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {stats?.totalTokens ? (stats.totalTokens / 1000).toFixed(1) + 'K' : '0'}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Embedding token</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Kaynak Türleri</CardTitle>
                        <Database className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="flex gap-2 mt-1">
                            {stats?.sourceTypes && Object.entries(stats.sourceTypes).map(([type, count]) => (
                                <Badge key={type} variant="secondary" className="text-xs">
                                    {type}: {count}
                                </Badge>
                            ))}
                            {(!stats?.sourceTypes || Object.keys(stats.sourceTypes).length === 0) && (
                                <span className="text-sm text-muted-foreground">-</span>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Document List */}
            <Card>
                <CardHeader>
                    <CardTitle>Kaynaklar</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" />
                            Yükleniyor...
                        </div>
                    ) : documents.length === 0 ? (
                        <div className="text-center py-16">
                            <Database className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold mb-2">Henüz kaynak eklenmemiş</h3>
                            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                                Sesli asistanınızın cevaplarını zenginleştirmek için metin, URL veya PDF kaynakları ekleyin.
                            </p>
                            <Button
                                onClick={() => setAddDialogOpen(true)}
                                className="gap-2 bg-indigo-600 hover:bg-indigo-700"
                            >
                                <Plus className="h-4 w-4" />
                                İlk Kaynağı Ekle
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {documents.map((doc) => (
                                <div
                                    key={doc.id}
                                    className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                                >
                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                        <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500 shrink-0">
                                            {getSourceIcon(doc.sourceType)}
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="font-medium truncate">{doc.title || 'Adsız Belge'}</h4>
                                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                                <span className="flex items-center gap-1">
                                                    {getSourceIcon(doc.sourceType)}
                                                    {doc.sourceType.toUpperCase()}
                                                </span>
                                                {doc.chunkCount > 0 && (
                                                    <span>{doc.chunkCount} parça</span>
                                                )}
                                                {doc.totalTokens > 0 && (
                                                    <span>{doc.totalTokens} token</span>
                                                )}
                                                <span>{formatDate(doc.createdAt)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 ml-4">
                                        {getStatusBadge(doc.status)}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-red-400 hover:text-red-500 hover:bg-red-500/10"
                                            onClick={() => handleDelete(doc.id)}
                                            disabled={deletingId === doc.id}
                                        >
                                            {deletingId === doc.id ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Trash2 className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ─── Add Source Dialog ─── */}
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Upload className="h-5 w-5 text-indigo-500" />
                            Kaynak Ekle
                        </DialogTitle>
                        <DialogDescription>
                            Bilgi tabanına yeni bir kaynak ekleyin. Metin, URL veya PDF desteklenir.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 mt-4">
                        {/* Source Type Tabs */}
                        <div className="flex gap-2">
                            <Button
                                variant={addType === 'text' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setAddType('text')}
                                className="gap-2"
                            >
                                <BookOpen className="h-4 w-4" />
                                Metin
                            </Button>
                            <Button
                                variant={addType === 'url' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setAddType('url')}
                                className="gap-2"
                            >
                                <Globe className="h-4 w-4" />
                                URL
                            </Button>
                        </div>

                        {/* Name */}
                        <div>
                            <Label htmlFor="kb-filename">Kaynak Adı (opsiyonel)</Label>
                            <Input
                                id="kb-filename"
                                value={addFilename}
                                onChange={(e) => setAddFilename(e.target.value)}
                                placeholder="Örn: Şirket Politikası, SSS, Ürün Kataloğu..."
                                className="mt-1"
                            />
                        </div>

                        {/* Content */}
                        {addType === 'text' ? (
                            <div>
                                <Label htmlFor="kb-content">İçerik</Label>
                                <Textarea
                                    id="kb-content"
                                    value={addContent}
                                    onChange={(e) => setAddContent(e.target.value)}
                                    placeholder="Bilgi tabanına eklemek istediğiniz metni buraya yapıştırın..."
                                    rows={12}
                                    className="mt-1 font-mono text-sm"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    {addContent.length} karakter • ~{Math.ceil(addContent.length / 4)} token
                                </p>
                            </div>
                        ) : (
                            <div>
                                <Label htmlFor="kb-url">Web Sayfası URL</Label>
                                <Input
                                    id="kb-url"
                                    type="url"
                                    value={addContent}
                                    onChange={(e) => setAddContent(e.target.value)}
                                    placeholder="https://www.ornek.com/bilgi-sayfasi"
                                    className="mt-1"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Sayfa içeriği otomatik olarak çekilecek ve işlenecektir.
                                </p>
                            </div>
                        )}

                        {/* Submit */}
                        <div className="flex justify-end gap-3">
                            <Button
                                variant="outline"
                                onClick={() => setAddDialogOpen(false)}
                            >
                                İptal
                            </Button>
                            <Button
                                onClick={handleIngest}
                                disabled={ingesting || !addContent.trim()}
                                className="gap-2 bg-indigo-600 hover:bg-indigo-700"
                            >
                                {ingesting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        İşleniyor...
                                    </>
                                ) : (
                                    <>
                                        <Upload className="h-4 w-4" />
                                        Ekle ve İşle
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ─── Query Dialog ─── */}
            <Dialog open={queryDialogOpen} onOpenChange={setQueryDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <MessageSquare className="h-5 w-5 text-indigo-500" />
                            Bilgi Tabanı Sorgulama
                        </DialogTitle>
                        <DialogDescription>
                            Bir soru yazın ve bilgi tabanından en ilgili sonuçları alın.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 mt-4 flex-1 overflow-hidden flex flex-col">
                        <div className="flex gap-2">
                            <Input
                                value={queryText}
                                onChange={(e) => setQueryText(e.target.value)}
                                placeholder="Sormak istediğiniz soruyu yazın..."
                                onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
                            />
                            <Button
                                onClick={handleQuery}
                                disabled={querying || !queryText.trim()}
                                className="gap-2 shrink-0"
                            >
                                {querying ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Search className="h-4 w-4" />
                                )}
                                Ara
                            </Button>
                        </div>

                        {/* Results */}
                        <div className="flex-1 overflow-y-auto space-y-3">
                            {queryResults.length > 0 ? (
                                queryResults.map((result, i) => (
                                    <div
                                        key={result.chunkId}
                                        className="p-4 rounded-lg border bg-card"
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <Badge variant="secondary" className="text-xs">
                                                <ChevronRight className="h-3 w-3 mr-1" />
                                                Sonuç {i + 1}
                                            </Badge>
                                            <Badge
                                                className={`text-xs ${result.score > 0.7
                                                        ? 'bg-emerald-500/20 text-emerald-400'
                                                        : result.score > 0.5
                                                            ? 'bg-amber-500/20 text-amber-400'
                                                            : 'bg-gray-500/20 text-gray-400'
                                                    }`}
                                            >
                                                {(result.score * 100).toFixed(0)}% eşleşme
                                            </Badge>
                                        </div>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            {result.content.length > 500
                                                ? result.content.slice(0, 500) + '...'
                                                : result.content}
                                        </p>
                                    </div>
                                ))
                            ) : queryText && !querying ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                    <p>Sonuç bulunamadı. Farklı bir soru deneyin.</p>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
