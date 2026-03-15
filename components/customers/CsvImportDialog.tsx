'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';

interface ImportResult {
    success: boolean;
    total: number;
    imported: number;
    skipped: number;
    errors: number;
}

interface CsvImportDialogProps {
    open: boolean;
    onClose: () => void;
    onComplete: () => void;
}

export function CsvImportDialog({ open, onClose, onComplete }: CsvImportDialogProps) {
    const t = useTranslations('customers');
    const authFetch = useAuthFetch();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    if (!open) return null;

    async function handleImport() {
        if (!file) return;

        setImporting(true);
        setError(null);
        setResult(null);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await authFetch('/api/customers/import', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (response.ok) {
                setResult(data);
                if (data.imported > 0) {
                    onComplete();
                }
            } else {
                setError(data.error || t('importFailed'));
            }
        } catch {
            setError(t('importFailed'));
        } finally {
            setImporting(false);
        }
    }

    function handleClose() {
        setFile(null);
        setResult(null);
        setError(null);
        onClose();
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-background border border-white/[0.08] rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Upload className="h-5 w-5 text-indigo-400" />
                        {t('importCSV')}
                    </h2>
                    <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Result State */}
                {result ? (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                            <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                            <div>
                                <p className="font-semibold text-emerald-400">{t('importComplete')}</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    {t('importSummary', {
                                        total: result.total,
                                        imported: result.imported,
                                        skipped: result.skipped,
                                    })}
                                </p>
                            </div>
                        </div>
                        <Button onClick={handleClose} className="w-full">{t('close')}</Button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* File Drop Zone */}
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-white/[0.1] hover:border-indigo-500/30 rounded-xl p-8 text-center cursor-pointer transition-colors"
                        >
                            {file ? (
                                <div className="flex items-center justify-center gap-3">
                                    <FileText className="h-8 w-8 text-indigo-400" />
                                    <div className="text-left">
                                        <p className="font-medium text-sm">{file.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {(file.size / 1024).toFixed(1)} KB
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                                    <p className="text-sm font-medium">{t('selectCSVFile')}</p>
                                    <p className="text-xs text-muted-foreground mt-1">{t('csvFormatHint')}</p>
                                </>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv,text/csv"
                                className="hidden"
                                onChange={(e) => {
                                    setFile(e.target.files?.[0] || null);
                                    setError(null);
                                }}
                            />
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                {error}
                            </div>
                        )}

                        {/* CSV Format Help */}
                        <div className="text-xs text-muted-foreground p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                            <p className="font-medium mb-1">{t('csvColumns')}:</p>
                            <code className="text-indigo-400">name, phone, email, company, notes</code>
                            <p className="mt-1">{t('csvMaxRows', { max: '1000' })}</p>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3">
                            <Button variant="outline" onClick={handleClose} className="flex-1">
                                {t('cancel')}
                            </Button>
                            <Button
                                onClick={handleImport}
                                disabled={!file || importing}
                                className="flex-1 gap-2"
                            >
                                {importing ? (
                                    <><Loader2 className="h-4 w-4 animate-spin" />{t('importing')}</>
                                ) : (
                                    <><Upload className="h-4 w-4" />{t('startImport')}</>
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
