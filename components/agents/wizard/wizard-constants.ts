/**
 * Wizard step definitions, icon map, and shared constants
 */

import {
    Sparkles, Bot, Wand2, Eye, BookOpen,
    HeartPulse, ShoppingBag, Briefcase, Headphones, GraduationCap,
    Utensils, Home as HomeIcon, Car, Scale, Shield,
} from 'lucide-react';

// ── Icon Map (template icon string → component) ──

export const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    HeartPulse, ShoppingBag, Briefcase, Headphones, GraduationCap,
    Utensils, Home: HomeIcon, Car, Scale, Shield,
};

export function getIcon(iconName: string) {
    return ICON_MAP[iconName] || Bot;
}

// ── Wizard Steps ──

export const WIZARD_STEPS = [
    { id: 'template', label: 'Şablon Seçimi', icon: Sparkles, description: 'Sektörünüze uygun şablonu seçin' },
    { id: 'identity', label: 'Kimlik', icon: Bot, description: 'Asistanın adı, rolü ve dili' },
    { id: 'customize', label: 'Özelleştir', icon: Wand2, description: 'Değişkenleri doldurun ve prompt\'u önizleyin' },
    { id: 'knowledge', label: 'Bilgi Bankası', icon: BookOpen, description: 'Asistanınıza bilgi kaynakları ekleyin' },
    { id: 'review', label: 'İnceleme', icon: Eye, description: 'Son kontrol ve oluşturma' },
];

// ── Roles ──

export const ROLES = [
    { value: 'receptionist', label: 'Resepsiyonist' },
    { value: 'support', label: 'Müşteri Destek' },
    { value: 'consultant', label: 'Danışman' },
    { value: 'sales', label: 'Satış Temsilcisi' },
    { value: 'assistant', label: 'Genel Asistan' },
];

export const ROLES_MAP: Record<string, string> = Object.fromEntries(
    ROLES.map(r => [r.value, r.label])
);
