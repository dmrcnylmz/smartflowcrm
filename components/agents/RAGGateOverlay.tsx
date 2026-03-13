'use client';

/**
 * RAGGateOverlay — Blocks agent testing/activation when no KB documents exist.
 *
 * Renders a full-area overlay prompting the user to add knowledge base content
 * before they can test or activate an agent.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Loader2, AlertTriangle } from 'lucide-react';

interface RAGGateOverlayProps {
    /** Agent name for display */
    agentName: string;
    /** Whether agent has KB (null = loading, false = no KB, true = has KB) */
    hasKB: boolean | null;
    /** Whether the check is in progress */
    isChecking: boolean;
    /** Callback when user clicks "Add Knowledge Base" */
    onAddKB: () => void;
}

export function RAGGateOverlay({
    agentName,
    hasKB,
    isChecking,
    onAddKB,
}: RAGGateOverlayProps) {
    // Don't render anything if KB exists
    if (hasKB === true) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-0 z-10 flex items-center justify-center bg-[#080810]/95 backdrop-blur-sm rounded-xl"
            >
                {isChecking || hasKB === null ? (
                    /* Loading state */
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
                        <p className="text-sm text-white/40">Bilgi Bankası kontrol ediliyor...</p>
                    </div>
                ) : (
                    /* No KB state */
                    <div className="flex flex-col items-center gap-5 max-w-sm px-6 text-center">
                        {/* Icon */}
                        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                            <AlertTriangle className="h-8 w-8 text-amber-400" />
                        </div>

                        {/* Text */}
                        <div className="space-y-2">
                            <h3 className="text-base font-semibold text-white">
                                Bilgi Bankası Gerekli
                            </h3>
                            <p className="text-sm text-white/50 leading-relaxed">
                                <span className="text-white/70 font-medium">{agentName}</span> asistanını
                                test etmek için Bilgi Bankası eklemelisiniz. Bilgi bankası olmadan
                                asistanınız doğru yanıt veremez.
                            </p>
                        </div>

                        {/* CTA */}
                        <button
                            onClick={onAddKB}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
                        >
                            <BookOpen className="h-4 w-4" />
                            Bilgi Ekle
                        </button>

                        {/* Hint */}
                        <p className="text-[11px] text-white/25">
                            SSS, ürün bilgisi, web sitesi içeriği veya döküman yükleyebilirsiniz
                        </p>
                    </div>
                )}
            </motion.div>
        </AnimatePresence>
    );
}
