/**
 * Toast helper utilities for consistent notification messages.
 */

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Beklenmedik bir hata oluştu.';
}

export function getSuccessMessage(action: string): string {
  return `${action} başarıyla tamamlandı.`;
}
