'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
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
    FileUp,
    File,
    X,
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

export default function KnowledgeBasePage() {
    const { toast } = useToast();
    const authFetch = useAuthFetch();
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

    // Delete state
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // ─────────────────────────────────────────────
    // Data fetching
    // ─────────────────────────────────────────────

    const fetchDocuments = useCallback(async () => {
        try {
            const res = await authFetch('/api/knowledge');
            if (!res.ok) throw new Error('Failed to fetch documents');
            const data = await res.json();
            setDocuments(data.documents || []);
        } catch (err) {
            console.error('KB fetch error:', err);
        }
    }, [authFetch]);

    const fetchStats = useCallback(async () => {
        try {
            const res = await authFetch('/api/knowledge?action=stats');
            if (!res.ok) throw new Error('Failed to fetch stats');
            const data = await res.json();
            setStats(data);
        } catch (err) {
            console.error('KB stats error:', err);
        }
    }, [authFetch]);

    useEffect(() => {
        Promise.all([fetchDocuments(), fetchStats()]).finally(() => setLoading(false));
    }, [fetchDocuments, fetchStats]);

    // ─────────────────────────────────────────────
    // File Handling
    // ─────────────────────────────────────────────

    function handleFileSelect(file: File) {
        if (file.size > MAX_FILE_SIZE) {
            toast({
                title: 'Dosya Çok Büyük',
                description: `Maksimum dosya boyutu ${MAX_FILE_SIZE_MB}MB. Seçilen dosya: ${(file.size / 1024 / 1024).toFixed(1)}MB`,
                variant: 'error',
            });
            return;
        }

        setSelectedFile(file);
        if (!addFilename) {
            setAddFilename(file.name.replace(/\.[^/.]+$/, ''));
        }
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect(files[0]);
        }
    }

    function handleDragOver(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(true);
    }

    function handleDragLeave(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
    }

    // ─────────────────────────────────────────────
    // Actions
    // ─────────────────────────────────────────────

    async function handleIngest() {
        if (addType === 'file') {
            if (!selectedFile) return;
            return handleFileIngest();
        }

        if (!addContent.trim()) return;

        setIngesting(true);
        try {
            const res = await authFetch('/api/knowledge', {
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
                resetAddDialog();
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

    async function handleFileIngest() {
        if (!selectedFile) return;

        setIngesting(true);
        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            if (addFilename) {
                formData.append('filename', addFilename);
            }

            const res = await authFetch('/api/knowledge', {
                method: 'POST',
                body: formData,
            });

            const result = await res.json();

            if (result.status === 'error') {
                toast({
                    title: 'İçe Aktarma Hatası',
                    description: result.error || 'Dosya işlenirken bir hata oluştu',
                    variant: 'error',
                });
            } else {
                toast({
                    title: 'Başarılı!',
                    description: `"${result.title}" başarıyla yüklendi (${result.chunkCount} parça)`,
                    variant: 'success',
                });
                resetAddDialog();
                await Promise.all([fetchDocuments(), fetchStats()]);
            }
        } catch (err) {
            toast({
                title: 'Hata',
                description: 'Dosya yüklenirken bir hata oluştu',
                variant: 'error',
            });
            console.error('File ingest error:', err);
        } finally {
            setIngesting(false);
        }
    }

    function resetAddDialog() {
        setAddDialogOpen(false);
        setAddContent('');
        setAddFilename('');
        setSelectedFile(null);
        setAddType('text');
    }

    async function handleDelete(documentId: string) {
        setDeletingId(documentId);
        try {
            const res = await authFetch('/api/knowledge', {
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
            const res = await authFetch(`/api/knowledge?query=${encodeURIComponent(queryText)}&topK=5`);
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
            case 'file': return <File className="h-4 w-4" />;
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

    function formatFileSize(bytes: number): string {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    const canSubmit = addType === 'file' ? !!selectedFile : addContent.trim().length > 0;

    // ─────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────

    return (
        <div className="p-4 md:p-8">
            {/* Header */}
            <div className="animate-fade-in-down mb-8">
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
                {[
                    { title: 'Belgeler', value: stats?.documentCount ?? 0, sub: 'Toplam kaynak', icon: FileText, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                    { title: 'Parçalar', value: stats?.chunkCount ?? 0, sub: 'Vektörleştirilmiş', icon: Sparkles, color: 'text-purple-500', bg: 'bg-purple-500/10' },
                    { title: 'Token Kullanımı', value: stats?.totalTokens ? (stats.totalTokens / 1000).toFixed(1) + 'K' : '0', sub: 'Embedding token', icon: BarChart3, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                ].map((card, idx) => {
                    const Icon = card.icon;
                    return (
                        <Card key={card.title} className="animate-fade-in-up overflow-hidden" style={{ animationDelay: `${idx * 100}ms` }}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                                <div className={`p-2 rounded-lg ${card.bg}`}>
                                    <Icon className={`h-4 w-4 ${card.color}`} />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{card.value}</div>
                                <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
                            </CardContent>
                        </Card>
                    );
                })}
                <Card className="animate-fade-in-up" style={{ animationDelay: '300ms' }}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Kaynak Türleri</CardTitle>
                        <div className="p-2 rounded-lg bg-indigo-500/10">
                            <Database className="h-4 w-4 text-indigo-500" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="flex gap-2 mt-1 flex-wrap">
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
                        <div className="space-y-3 p-1">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="flex items-center justify-between p-4 rounded-lg border bg-card animate-pulse"
                                    style={{ animationDelay: `${i * 100}ms` }}
                                >
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className="h-10 w-10 rounded-lg bg-muted" />
                                        <div className="space-y-2 flex-1">
                                            <div className="h-4 w-1/3 rounded bg-muted" />
                                            <div className="h-3 w-1/2 rounded bg-muted/60" />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="h-6 w-16 rounded-full bg-muted" />
                                        <div className="h-8 w-8 rounded bg-muted" />
                                    </div>
                                </div>
                            ))}
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
                            {documents.map((doc, idx) => (
                                <div
                                    key={doc.id}
                                    className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-all duration-200 animate-fade-in-up"
                                    style={{ animationDelay: `${idx * 60}ms` }}
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
            <Dialog open={addDialogOpen} onOpenChange={(open) => { if (!open) resetAddDialog(); else setAddDialogOpen(true); }}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Upload className="h-5 w-5 text-indigo-500" />
                            Kaynak Ekle
                        </DialogTitle>
                        <DialogDescription>
                            Bilgi tabanına yeni bir kaynak ekleyin. Metin, URL veya dosya yükleme desteklenir.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 mt-4">
                        {/* Source Type Tabs */}
                        <div className="flex gap-2">
                            <Button
                                variant={addType === 'text' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => { setAddType('text'); setSelectedFile(null); }}
                                className="gap-2"
                            >
                                <BookOpen className="h-4 w-4" />
                                Metin
                            </Button>
                            <Button
                                variant={addType === 'url' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => { setAddType('url'); setSelectedFile(null); }}
                                className="gap-2"
                            >
                                <Globe className="h-4 w-4" />
                                URL
                            </Button>
                            <Button
                                variant={addType === 'file' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => { setAddType('file'); setAddContent(''); }}
                                className="gap-2"
                            >
                                <FileUp className="h-4 w-4" />
                                Dosya Yükle
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

                        {/* Content Area */}
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
                                    {addContent.length} karakter &bull; ~{Math.ceil(addContent.length / 4)} token
                                </p>
                            </div>
                        ) : addType === 'url' ? (
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
                        ) : (
                            /* File Upload Zone */
                            <div>
                                <Label>Dosya</Label>
                                <div
                                    className={`mt-1 relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer
                                        ${dragActive
                                            ? 'border-indigo-500 bg-indigo-500/10'
                                            : selectedFile
                                                ? 'border-emerald-500/50 bg-emerald-500/5'
                                                : 'border-muted-foreground/20 hover:border-indigo-500/50 hover:bg-indigo-500/5'
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
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handleFileSelect(file);
                                        }}
                                    />

                                    {selectedFile ? (
                                        <div className="space-y-3">
                                            <div className="h-12 w-12 rounded-xl bg-emerald-500/20 flex items-center justify-center mx-auto">
                                                <CheckCircle className="h-6 w-6 text-emerald-500" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-sm">{selectedFile.name}</p>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {formatFileSize(selectedFile.size)} &bull; {selectedFile.type || 'Bilinmeyen tür'}
                                                </p>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-red-400 hover:text-red-500"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedFile(null);
                                                    if (fileInputRef.current) fileInputRef.current.value = '';
                                                }}
                                            >
                                                <X className="h-4 w-4 mr-1" />
                                                Dosyayı Kaldır
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="h-12 w-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mx-auto">
                                                <FileUp className="h-6 w-6 text-indigo-500" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">
                                                    {dragActive ? 'Dosyayı buraya bırakın' : 'Dosya sürükleyin veya tıklayın'}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    PDF, TXT, MD, CSV desteklenir &bull; Maks. {MAX_FILE_SIZE_MB}MB
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Submit */}
                        <div className="flex justify-end gap-3">
                            <Button
                                variant="outline"
                                onClick={resetAddDialog}
                            >
                                İptal
                            </Button>
                            <Button
                                onClick={handleIngest}
                                disabled={ingesting || !canSubmit}
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
                                        {addType === 'file' ? 'Yükle ve İşle' : 'Ekle ve İşle'}
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
