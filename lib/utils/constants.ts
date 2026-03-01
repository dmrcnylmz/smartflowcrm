export const APP_NAME = 'SmartFlow CRM';
export const APP_VERSION = '1.0.0';

export const ITEMS_PER_PAGE = 20;

export const STATUS_LABELS: Record<string, string> = {
  active: 'Aktif',
  inactive: 'Pasif',
  open: 'Açık',
  'in-progress': 'İşlemde',
  resolved: 'Çözüldü',
  closed: 'Kapalı',
  scheduled: 'Planlandı',
  completed: 'Tamamlandı',
  cancelled: 'İptal Edildi',
  'no-show': 'Gelmedi',
  pending: 'Bekliyor',
  answered: 'Yanıtlandı',
  missed: 'Cevapsız',
  ongoing: 'Devam Ediyor',
  failed: 'Başarısız',
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: 'Düşük',
  medium: 'Orta',
  high: 'Yüksek',
  urgent: 'Acil',
};

export const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-blue-100 text-blue-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800',
};
