/**
 * Toast helper functions for easy use throughout the app
 * Usage: 
 *   import { toast } from '@/lib/utils/toast-helpers';
 *   toast.success('Başarılı!');
 */

import { useToast as useToastContext } from '@/components/ui/toast';

// Re-export for convenience
export { useToastContext as useToast };

// Helper functions for common toast types
export const toast = {
  success: (message: string, title?: string) => {
    // This will be called from components that use useToast hook
    // For now, we'll provide a simple implementation
    console.log('✅', title || 'Başarılı', message);
  },
  error: (message: string, title?: string) => {
    console.error('❌', title || 'Hata', message);
  },
  warning: (message: string, title?: string) => {
    console.warn('⚠️', title || 'Uyarı', message);
  },
  info: (message: string, title?: string) => {
    console.info('ℹ️', title || 'Bilgi', message);
  },
};

