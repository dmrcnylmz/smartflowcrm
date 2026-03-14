'use client';

/**
 * Step 3: Knowledge Base — Text, URL, and file upload knowledge source input
 */

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import {
    BookOpen, MessageCircle, Globe, Plus, Upload,
    Loader2, CheckCircle, AlertTriangle, FileText, X,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useTranslations } from 'next-intl';

const ALLOWED_EXTENSIONS = ['.pdf', '.txt', '.md', '.csv', '.json', '.docx'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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
    const t = useTranslations('knowledge');
    const tCommon = useTranslations('common');
    const [textContent, setTextContent] = useState('');
    const [urlInput, setUrlInput] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [addedDocs, setAddedDocs] = useState<{ title: string; type: string }[]>([]);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    const handleAddText = async () => {
        if (!textContent.trim() || textContent.trim().length < 20) {
            toast({ title: tCommon('error'), description: t('minCharsRequired'), variant: 'error' });
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
            if (!res.ok) throw new Error('Upload failed');
            const data = await res.json();
            if (data.documentId) onDocumentAdded?.(data.documentId);
            setAddedDocs(prev => [...prev, { title: `${t('text')}: ${textContent.slice(0, 40)}...`, type: 'text' }]);
            setTextContent('');
            toast({ title: tCommon('success'), description: t('textAdded') });
        } catch {
            toast({ title: tCommon('error'), description: t('textAddError'), variant: 'error' });
        } finally {
            setIsUploading(false);
        }
    };

    const handleAddUrl = async () => {
        if (!urlInput.trim()) return;
        try {
            new URL(urlInput.trim());
        } catch {
            toast({ title: tCommon('error'), description: t('invalidUrl'), variant: 'error' });
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
            if (!res.ok) throw new Error('URL scan failed');
            const data = await res.json();
            if (data.documentId) onDocumentAdded?.(data.documentId);
            setAddedDocs(prev => [...prev, { title: urlInput.trim(), type: 'url' }]);
            setUrlInput('');
            toast({ title: tCommon('success'), description: t('urlAdded') });
        } catch {
            toast({ title: tCommon('error'), description: t('urlAddError'), variant: 'error' });
        } finally {
            setIsUploading(false);
        }
    };

    const validateFile = (file: File): string | null => {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            return t('unsupportedFileType', { types: ALLOWED_EXTENSIONS.join(', ') });
        }
        if (file.size > MAX_FILE_SIZE) {
            return t('fileTooLarge', { maxSize: '10MB' });
        }
        return null;
    };

    const handleFileUpload = async () => {
        if (!selectedFile) return;

        const error = validateFile(selectedFile);
        if (error) {
            toast({ title: tCommon('error'), description: error, variant: 'error' });
            return;
        }

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('filename', selectedFile.name);

            const res = await authFetch('/api/knowledge', {
                method: 'POST',
                body: formData,
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || 'Upload failed');
            }
            const data = await res.json();
            if (data.documentId) onDocumentAdded?.(data.documentId);
            setAddedDocs(prev => [...prev, { title: selectedFile.name, type: 'file' }]);
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
            toast({ title: tCommon('success'), description: t('fileAdded') });
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('fileAddError');
            toast({ title: tCommon('error'), description: msg, variant: 'error' });
        } finally {
            setIsUploading(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) {
            const error = validateFile(file);
            if (error) {
                toast({ title: tCommon('error'), description: error, variant: 'error' });
                return;
            }
            setSelectedFile(file);
        }
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
                        <h4 className="text-sm font-semibold text-white/90">{t('title')}</h4>
                        <p className="text-xs text-white/40 mt-1 leading-relaxed">
                            {t('description', { agentName: agentName || t('defaultAgent') })}
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
                            <h3 className="font-semibold text-white text-sm">{t('pasteText')}</h3>
                            <p className="text-[10px] text-white/30">{t('pasteTextHint')}</p>
                        </div>
                    </div>
                    <Textarea
                        value={textContent}
                        onChange={(e) => setTextContent(e.target.value)}
                        placeholder={t('pasteTextPlaceholder')}
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
                            {tCommon('create')}
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
                            <h3 className="font-semibold text-white text-sm">{t('scanUrl')}</h3>
                            <p className="text-[10px] text-white/30">{t('scanUrlHint')}</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Input
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            placeholder="https://example.com/faq"
                            className="h-10 rounded-lg bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:border-inception-teal/50 text-sm flex-1"
                        />
                        <button
                            onClick={handleAddUrl}
                            disabled={isUploading || !urlInput.trim()}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-inception-teal/20 hover:bg-inception-teal/30 text-inception-teal border border-inception-teal/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                            {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
                            {t('scan')}
                        </button>
                    </div>
                    <p className="text-[10px] text-white/20">{t('scanUrlDescription')}</p>
                </motion.div>
            </div>

            {/* File Upload */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5 space-y-3"
            >
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                        <Upload className="h-4 w-4 text-blue-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white text-sm">{t('uploadFile')}</h3>
                        <p className="text-[10px] text-white/30">{t('uploadFileHint')}</p>
                    </div>
                </div>

                {/* Drop zone */}
                <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`
                        relative flex flex-col items-center justify-center gap-2 py-8 px-4 rounded-lg border-2 border-dashed cursor-pointer transition-all
                        ${isDragOver
                            ? 'border-blue-400/60 bg-blue-500/10'
                            : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.04]'
                        }
                    `}
                >
                    <Upload className={`h-8 w-8 ${isDragOver ? 'text-blue-400' : 'text-white/20'}`} />
                    <p className="text-sm text-white/40">{t('dropOrClick')}</p>
                    <p className="text-[10px] text-white/20">
                        {ALLOWED_EXTENSIONS.join(', ')} — {t('maxSize', { size: '10MB' })}
                    </p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={ALLOWED_EXTENSIONS.join(',')}
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setSelectedFile(file);
                        }}
                        className="hidden"
                    />
                </div>

                {/* Selected file preview */}
                {selectedFile && (
                    <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                        <div className="flex items-center gap-2 min-w-0">
                            <FileText className="h-4 w-4 text-blue-400 shrink-0" />
                            <div className="min-w-0">
                                <p className="text-sm text-white/80 truncate">{selectedFile.name}</p>
                                <p className="text-[10px] text-white/30">{formatFileSize(selectedFile.size)}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                                className="p-1 rounded text-white/30 hover:text-white/60 transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                            <button
                                onClick={handleFileUpload}
                                disabled={isUploading}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-blue-600/80 hover:bg-blue-600 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                                {t('upload')}
                            </button>
                        </div>
                    </div>
                )}
            </motion.div>

            {/* Added Documents */}
            {addedDocs.length > 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-emerald-500/5 rounded-xl border border-emerald-500/20 p-4"
                >
                    <div className="flex items-center gap-2 mb-3">
                        <CheckCircle className="h-4 w-4 text-emerald-400" />
                        <span className="text-sm text-emerald-300 font-medium">
                            {t('docsAdded', { count: addedDocs.length })}
                        </span>
                    </div>
                    <div className="space-y-1.5">
                        {addedDocs.map((doc, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-white/50">
                                {doc.type === 'text' ? <MessageCircle className="h-3 w-3" /> :
                                 doc.type === 'url' ? <Globe className="h-3 w-3" /> :
                                 <FileText className="h-3 w-3" />}
                                <span className="truncate">{doc.title}</span>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* Nudge when no documents added */}
            {addedDocs.length === 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-500/5 border border-amber-500/15"
                >
                    <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-300/80 leading-relaxed">
                        {t('noDocsNudge')}
                    </p>
                </motion.div>
            )}
        </div>
    );
}
