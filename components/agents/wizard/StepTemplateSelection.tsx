'use client';

/**
 * Step 0: Template Selection — Industry template grid with stagger animation
 */

import { motion } from 'framer-motion';
import { Check, Code2, CheckCircle } from 'lucide-react';
import { AGENT_TEMPLATES } from '@/lib/agents/templates';
import { getIcon } from './wizard-constants';
import { staggerContainerVariants, staggerCardVariants } from './wizard-animations';

interface StepTemplateSelectionProps {
    selectedId: string | null;
    onSelect: (id: string | null) => void;
}

export function StepTemplateSelection({ selectedId, onSelect }: StepTemplateSelectionProps) {
    return (
        <div className="space-y-4">
            {/* From Scratch Option */}
            <button
                onClick={() => onSelect('scratch')}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all duration-300 text-left hover:-translate-y-0.5
                    ${selectedId === 'scratch'
                        ? 'border-white/20 bg-white/[0.06] shadow-lg shadow-white/5'
                        : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.10] hover:bg-white/[0.04]'
                    }`}
            >
                {selectedId === 'scratch' && (
                    <div className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-inception-red rounded-full flex items-center justify-center shadow-md shadow-inception-red/30">
                        <Check className="h-3 w-3 text-white" />
                    </div>
                )}
                <div className="h-12 w-12 rounded-xl bg-white/[0.06] border border-white/[0.10] flex items-center justify-center">
                    <Code2 className="h-6 w-6 text-white/50" />
                </div>
                <div className="flex-1">
                    <h3 className="font-semibold text-sm text-white/80">Sıfırdan Oluştur</h3>
                    <p className="text-xs text-white/30 mt-0.5">Boş bir sayfa ile başlayıp kendi prompt&apos;unuzu yazın</p>
                </div>
                {selectedId === 'scratch' && <CheckCircle className="h-5 w-5 text-inception-red flex-shrink-0" />}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-white/[0.06]" />
                <span className="text-xs text-white/30 font-display tracking-widest">VEYA ŞABLON SEÇİN</span>
                <div className="h-px flex-1 bg-white/[0.06]" />
            </div>

            {/* Template Grid — Staggered Animation */}
            <motion.div
                className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
                variants={staggerContainerVariants}
                initial="hidden"
                animate="visible"
            >
                {AGENT_TEMPLATES.map((template) => {
                    const Icon = getIcon(template.icon);
                    const isSelected = selectedId === template.id;
                    return (
                        <motion.button
                            key={template.id}
                            variants={staggerCardVariants}
                            onClick={() => onSelect(template.id)}
                            whileHover={{ y: -2, transition: { duration: 0.2 } }}
                            whileTap={{ scale: 0.98 }}
                            className={`relative group p-4 rounded-xl border text-left transition-colors duration-300
                                ${isSelected
                                    ? `${template.borderColor} bg-white/[0.04] shadow-lg ${template.glowColor}`
                                    : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.10] hover:bg-white/[0.04]'
                                }`}
                        >
                            {isSelected && (
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-inception-red rounded-full flex items-center justify-center shadow-md shadow-inception-red/30"
                                >
                                    <Check className="h-3 w-3 text-white" />
                                </motion.div>
                            )}
                            <div className={`h-10 w-10 rounded-lg bg-gradient-to-r ${template.color} flex items-center justify-center mb-3 shadow-sm`}>
                                <Icon className="h-5 w-5 text-white" />
                            </div>
                            <h3 className={`font-semibold text-sm mb-1 ${isSelected ? 'text-white' : 'text-white/70'}`}>{template.name}</h3>
                            <p className="text-xs text-white/30 line-clamp-2 leading-relaxed">{template.description}</p>
                            {/* Features */}
                            <div className="mt-2 flex flex-wrap gap-1">
                                {template.features.slice(0, 2).map(f => (
                                    <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-white/30">{f}</span>
                                ))}
                            </div>
                        </motion.button>
                    );
                })}
            </motion.div>
        </div>
    );
}
