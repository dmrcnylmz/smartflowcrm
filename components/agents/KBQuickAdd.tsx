'use client';

/**
 * KBQuickAdd — Quick Knowledge Base content addition panel
 *
 * Used in AgentTestPanel's "Bilgi Bankası" tab.
 * Allows fast text paste or URL scan to add KB documents,
 * then switch to test immediately.
 */

import { useState } from 'react';
import {
    MessageCircle, Globe, Plus, Loader2, CheckCircle,
    BookOpen, ArrowRight, FileText,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
import { useToast } from '@/components/ui/toast';

// =============================================
// Types
// =============================================

interface KBQuickAddProps {
    agentId?: string;
    agentName?: string;
    onDocumentAdded?: () => void;
    onSwitchToChat?: () => void;
}

// =============================================
// Component
// =============================================

export function KBQuickAdd({ agentId, agentName, onDocumentAdded, onSwitchToChat }: KBQuickAddProps) {
    const authFetch = useAuthFetch();
    const { toast } = useToast();
    const [textContent, setTextContent] = useState('');
    const [urlInput, setUrlInput] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [addedDocs, setAddedDocs] = useState<{ title: string; type: string }[]>([]);

    const handleAddText = async () => {
        if (!textContent.trim() || textContent.trim().length < 20) {
            toast({ title: 'Yetersiz içerik', description: 'En az 20 karakter gerekli.', variant: 'error' });
            return;
        }

        setIsUploading(true);
        try {
            const res = await authFetch('/api/knowledge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: agentName ? `${agentName} - Metin` : 'Hızlı Metin Ekleme',
                    sourceType: 'text',
                    content: textContent.trim(),
                    ...(agentId ? { agentId } : {}),
                }),
            });
            if (!res.ok) throw new Error('Yükleme başarısız');

            setAddedDocs(prev => [...prev, { title: textContent.slice(0, 50) + '...', type: 'text' }]);
            setTextContent('');
            toast({ title: 'Eklendi', description: 'Metin bilgisi başarıyla eklendi.' });
            onDocumentAdded?.();
        } catch {
            toast({ title: 'Hata', description: 'Metin eklenirken hata oluştu.', variant: 'error' });
        } finally {
            setIsUploading(false);
        }
    };

    const handleAddUrl = async () => {
        if (!urlInput.trim()) return;
        try {
            new URL(urlInput.trim());
        } catch {
            toast({ title: 'Geçersiz URL', description: 'Lütfen geçerli bir URL girin.', variant: 'error' });
            return;
        }

        setIsUploading(true);
        try {
            const res = await authFetch('/api/knowledge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: agentName ? `${agentName} - Web` : 'Web Kaynağı',
                    sourceType: 'url',
                    source: urlInput.trim(),
                    ...(agentId ? { agentId } : {}),
                }),
            });
            if (!res.ok) throw new Error('URL tarama başarısız');

            setAddedDocs(prev => [...prev, { title: urlInput.trim(), type: 'url' }]);
            setUrlInput('');
            toast({ title: 'Eklendi', description: 'Web kaynağı başarıyla tarandı.' });
            onDocumentAdded?.();
        } catch {
            toast({ title: 'Hata', description: 'URL taranırken hata oluştu.', variant: 'error' });
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Info */}
            <div className="px-4 py-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-inception-teal" />
                    <span className="text-xs text-white/50">Hızlı bilgi ekleyin, sonra test edin</span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Text Input */}
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-violet-400" />
                        <span className="text-xs font-medium text-white/60">Metin Yapıştır</span>
                    </div>
                    <Textarea
                        value={textContent}
                        onChange={(e) => setTextContent(e.target.value)}
                        placeholder="SSS, ürün bilgisi, şirket açıklaması vb. yapıştırın..."
                        rows={4}
                        maxLength={5000}
                        className="rounded-lg resize-none bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-violet-500/50 text-xs"
                    />
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] text-white/20">{textContent.length}/5000</span>
                        <button
                            onClick={handleAddText}
                            disabled={isUploading || textContent.trim().length < 20}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-medium bg-violet-600/80 hover:bg-violet-600 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                            Ekle
                        </button>
                    </div>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-white/[0.06]" />
                    <span className="text-[10px] text-white/20">VEYA</span>
                    <div className="h-px flex-1 bg-white/[0.06]" />
                </div>

                {/* URL Input */}
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Globe className="h-3.5 w-3.5 text-inception-teal" />
                        <span className="text-xs font-medium text-white/60">Web Sitesi Tara</span>
                    </div>
                    <div className="flex gap-2">
                        <Input
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            placeholder="https://example.com/sss"
                            className="h-9 rounded-lg bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-inception-teal/50 text-xs flex-1"
                        />
                        <button
                            onClick={handleAddUrl}
                            disabled={isUploading || !urlInput.trim()}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-medium bg-inception-teal/20 hover:bg-inception-teal/30 text-inception-teal border border-inception-teal/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                            {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
                            Tara
                        </button>
                    </div>
                </div>

                {/* Added Documents Summary */}
                {addedDocs.length > 0 && (
                    <div className="bg-emerald-500/5 rounded-lg border border-emerald-500/20 p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                            <span className="text-xs text-emerald-300 font-medium">{addedDocs.length} belge eklendi</span>
                        </div>
                        <div className="space-y-1">
                            {addedDocs.map((doc, i) => (
                                <div key={i} className="flex items-center gap-1.5 text-[10px] text-white/40">
                                    {doc.type === 'text' ? <MessageCircle className="h-2.5 w-2.5" /> : <Globe className="h-2.5 w-2.5" />}
                                    <span className="truncate">{doc.title}</span>
                                </div>
                            ))}
                        </div>

                        {/* Test Now Button */}
                        {onSwitchToChat && (
                            <button
                                onClick={onSwitchToChat}
                                className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-violet-600/80 hover:bg-violet-600 text-white transition-all"
                            >
                                <MessageCircle className="h-3 w-3" />
                                Şimdi Test Et
                                <ArrowRight className="h-3 w-3" />
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
