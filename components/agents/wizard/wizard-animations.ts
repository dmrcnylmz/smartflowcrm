/**
 * Framer Motion animation variants for AgentCreationWizard
 */

import type { Variants } from 'framer-motion';

export const stepTransitionVariants: Variants = {
    enter: (direction: number) => ({
        x: direction > 0 ? 60 : -60,
        opacity: 0,
    }),
    center: {
        x: 0,
        opacity: 1,
    },
    exit: (direction: number) => ({
        x: direction > 0 ? -60 : 60,
        opacity: 0,
    }),
};

export const staggerContainerVariants: Variants = {
    hidden: { opacity: 1 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.06 },
    },
};

export const staggerCardVariants: Variants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: 0.3, ease: 'easeOut' },
    },
};

export const successCheckVariants: Variants = {
    hidden: { scale: 0, opacity: 0 },
    visible: {
        scale: 1,
        opacity: 1,
        transition: { type: 'spring', stiffness: 200, damping: 12, delay: 0.1 },
    },
};

export const fadeUpVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: (delay: number) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.4, ease: 'easeOut', delay },
    }),
};
