'use client';

/**
 * Step 3: Knowledge Base — Optional text/URL knowledge source input
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
    BookOpen, MessageCircle, Globe, Plus,
    Loader2, CheckCircle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';

interface StepKnowledgeBaseProps {
    agentName: string;
    authFetch: (url: string, options?: RequestInit) => Promise<Response>;
    onDocumentAdded?: (documentId: string) => void;
}

export function StepKnowledgeBase({
    agentName,
    authFetch,
    onDocumentAdded,
}: StepKnowledgeBaseProps) {
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
                    type: 'text',
                    content: textContent.trim(),
                }),
            });
            if (!res.ok) throw new Error('Yükleme başarısız');
            const data = await res.json();
            if (data.documentId) onDocumentAdded?.(data.documentId);
            setAddedDocs(prev => [...prev, { title: `Metin: ${textContent.slice(0, 40)}...`, type: 'text' }]);
            setTextContent('');
            toast({ title: 'Eklendi', description: 'Metin bilgisi başarıyla eklendi.' });
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
                    type: 'url',
                    content: urlInput.trim(),
                }),
            });
            if (!res.ok) throw new Error('URL tarama başarısız');
            const data = await res.json();
            if (data.documentId) onDocumentAdded?.(data.documentId);
            setAddedDocs(prev => [...prev, { title: urlInput.trim(), type: 'url' }]);
            setUrlInput('');
            toast({ title: 'Eklendi', description: 'Web kaynağı başarıyla tarandı.' });
        } catch {
            toast({ title: 'Hata', description: 'URL taranırken hata oluştu.', variant: 'error' });
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Info Banner */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-xl bg-inception-teal/5 border border-inception-teal/20"
            >
                <div className="flex items-start gap-3">
                    <BookOpen className="h-5 w-5 text-inception-teal flex-shrink-0 mt-0.5" />
                    <div>
                        <h4 className="text-sm font-semibold text-white/90">Bilgi Bankası (İsteğe Bağlı)</h4>
                        <p className="text-xs text-white/40 mt-1 leading-relaxed">
                            {agentName ? `${agentName} asistanınıza` : 'Asistanınıza'} şirketinize özel bilgi kaynakları ekleyerek daha doğru yanıtlar vermesini sağlayın.
                            SSS, ürün bilgileri veya web sitesi içeriği ekleyebilirsiniz. Bu adımı atlayıp sonra da ekleyebilirsiniz.
                        </p>
                    </div>
                </div>
            </motion.div>

            <div className="grid md:grid-cols-2 gap-6">
                {/* Text Input */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5 space-y-3"
                >
                    <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                            <MessageCircle className="h-4 w-4 text-violet-400" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-white text-sm">Metin Yapıştır</h3>
                            <p className="text-[10px] text-white/30">SSS, ürün bilgisi vb.</p>
                        </div>
                    </div>
                    <Textarea
                        value={textContent}
                        onChange={(e) => setTextContent(e.target.value)}
                        placeholder="Şirketinizin SSS sayfasındaki bilgileri veya ürün açıklamalarını buraya yapıştırın..."
                        rows={6}
                        maxLength={5000}
                        className="rounded-lg resize-none bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-violet-500/50 text-sm"
                    />
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] text-white/20">{textContent.length}/5000</span>
                        <button
                            onClick={handleAddText}
                            disabled={isUploading || textContent.trim().length < 20}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-violet-600/80 hover:bg-violet-600 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                            Ekle
                        </button>
                    </div>
                </motion.div>

                {/* URL Input */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5 space-y-3"
                >
                    <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-inception-teal/10 border border-inception-teal/20 flex items-center justify-center">
                            <Globe className="h-4 w-4 text-inception-teal" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-white text-sm">Web Sitesi Tara</h3>
                            <p className="text-[10px] text-white/30">URL girin, içerik otomatik taranır</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Input
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            placeholder="https://example.com/sss"
                            className="h-10 rounded-lg bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-inception-teal/50 text-sm flex-1"
                        />
                        <button
                            onClick={handleAddUrl}
                            disabled={isUploading || !urlInput.trim()}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-inception-teal/20 hover:bg-inception-teal/30 text-inception-teal border border-inception-teal/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                            {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
                            Tara
                        </button>
                    </div>
                    <p className="text-[10px] text-white/20">Web sitenizin URL&apos;sini girin, içerik otomatik olarak taranır ve bilgi bankasına eklenir</p>
                </motion.div>
            </div>

            {/* Added Documents */}
            {addedDocs.length > 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-emerald-500/5 rounded-xl border border-emerald-500/20 p-4"
                >
                    <div className="flex items-center gap-2 mb-3">
                        <CheckCircle className="h-4 w-4 text-emerald-400" />
                        <span className="text-sm text-emerald-300 font-medium">{addedDocs.length} belge eklendi</span>
                    </div>
                    <div className="space-y-1.5">
                        {addedDocs.map((doc, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-white/50">
                                {doc.type === 'text' ? <MessageCircle className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                                <span className="truncate">{doc.title}</span>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}
        </div>
    );
}
