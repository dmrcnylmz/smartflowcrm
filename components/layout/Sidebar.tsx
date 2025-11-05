'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Phone, 
  Calendar, 
  FileText, 
  AlertCircle, 
  Users, 
  BarChart3,
  Settings 
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/calls', label: 'Çağrılar', icon: Phone },
  { href: '/appointments', label: 'Randevular', icon: Calendar },
  { href: '/tickets', label: 'Biletler', icon: FileText },
  { href: '/complaints', label: 'Şikayetler', icon: AlertCircle },
  { href: '/customers', label: 'Müşteriler', icon: Users },
  { href: '/reports', label: 'Raporlar', icon: BarChart3 },
  { href: '/admin', label: 'Ayarlar', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col">
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-bold text-primary">SmartFlow CRM</h1>
        <p className="text-sm text-muted-foreground">AI Receptionist</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

