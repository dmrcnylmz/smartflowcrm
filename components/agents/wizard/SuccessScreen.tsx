'use client';

/**
 * Success Screen — Shown after agent creation with confetti animation
 */

import { motion } from 'framer-motion';
import { Check, ChevronRight, MessageCircle } from 'lucide-react';
import { successCheckVariants, fadeUpVariants } from './wizard-animations';

interface SuccessScreenProps {
    agentName: string;
    onTestClick: () => void;
    onDoneClick: () => void;
}

const CONFETTI_COLORS = ['#dc2626', '#10b981', '#6366f1', '#f59e0b', '#ec4899'];

export function SuccessScreen({ agentName, onTestClick, onDoneClick }: SuccessScreenProps) {
    return (
        <motion.div
            key="success"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-8"
        >
            {/* Confetti particles */}
            <div className="relative inline-block">
                <div className="absolute -inset-8 pointer-events-none">
                    {[...Array(12)].map((_, i) => (
                        <motion.div
                            key={i}
                            className="absolute w-2 h-2 rounded-full"
                            style={{
                                background: CONFETTI_COLORS[i % 5],
                                left: '50%',
                                top: '50%',
                            }}
                            initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
                            animate={{
                                scale: [0, 1, 0.5],
                                x: Math.cos((i / 12) * Math.PI * 2) * 80,
                                y: Math.sin((i / 12) * Math.PI * 2) * 80,
                                opacity: [0, 1, 0],
                            }}
                            transition={{ duration: 1, delay: 0.2, ease: 'easeOut' }}
                        />
                    ))}
                </div>
                <motion.div
                    variants={successCheckVariants}
                    initial="hidden"
                    animate="visible"
                    className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 mb-6"
                >
                    <Check className="h-10 w-10 text-emerald-400" />
                </motion.div>
            </div>
            <motion.h2
                variants={fadeUpVariants}
                initial="hidden"
                animate="visible"
                custom={0.3}
                className="text-2xl font-bold text-white font-display tracking-wide mb-2"
            >
                Tebrikler!
            </motion.h2>
            <motion.p
                variants={fadeUpVariants}
                initial="hidden"
                animate="visible"
                custom={0.4}
                className="text-white/50 max-w-md mx-auto mb-8"
            >
                <span className="text-white font-medium">{agentName}</span> başarıyla oluşturuldu.
                Şimdi test ederek doğru çalıştığını doğrulayabilirsiniz.
            </motion.p>
            <motion.div
                variants={fadeUpVariants}
                initial="hidden"
                animate="visible"
                custom={0.5}
                className="flex items-center justify-center gap-4"
            >
                <button
                    onClick={onTestClick}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium bg-violet-600 border border-violet-500 text-white shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 hover:bg-violet-500 transition-all font-display tracking-wide"
                >
                    <MessageCircle className="h-4 w-4" />
                    Şimdi Test Et
                </button>
                <button
                    onClick={onDoneClick}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.07] text-white/70 hover:text-white transition-all"
                >
                    Asistanlar Sayfasına Dön
                    <ChevronRight className="h-4 w-4" />
                </button>
            </motion.div>
        </motion.div>
    );
}
