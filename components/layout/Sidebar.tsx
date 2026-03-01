'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
  Database,
  Bot,
  Settings,
  LogOut,
  User,
  CreditCard,
  ChevronsLeft,
  ChevronsRight,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/firebase/auth-context';
import { Button } from '@/components/ui/button';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';

interface NavSection {
  title: string;
  items: { href: string; label: string; icon: typeof LayoutDashboard }[];
}

const navSections: NavSection[] = [
  {
    title: 'Ana Menü',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/calls', label: 'Çağrılar', icon: Phone },
      { href: '/customers', label: 'Müşteriler', icon: Users },
    ],
  },
  {
    title: 'Operasyonlar',
    items: [
      { href: '/appointments', label: 'Randevular', icon: Calendar },
      { href: '/tickets', label: 'Biletler', icon: FileText },
      { href: '/complaints', label: 'Şikayetler', icon: AlertCircle },
    ],
  },
  {
    title: 'AI & Analiz',
    items: [
      { href: '/knowledge', label: 'Bilgi Tabanı', icon: Database },
      { href: '/agents', label: 'Asistanlar', icon: Bot },
      { href: '/reports', label: 'Raporlar', icon: BarChart3 },
    ],
  },
  {
    title: 'Yönetim',
    items: [
      { href: '/billing', label: 'Faturalandırma', icon: CreditCard },
      { href: '/admin', label: 'Ayarlar', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileDrawerRef = useRef<HTMLElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Close on Escape key + focus trap for mobile drawer
  useEffect(() => {
    if (!mobileOpen) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMobileOpen(false);
        // Return focus to hamburger button
        hamburgerRef.current?.focus();
        return;
      }

      // Focus trap: Tab cycles within drawer
      if (e.key === 'Tab' && mobileDrawerRef.current) {
        const focusable = mobileDrawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener('keydown', handleKey);

    // Focus first focusable element when drawer opens
    requestAnimationFrame(() => {
      const firstLink = mobileDrawerRef.current?.querySelector<HTMLElement>('a[href]');
      firstLink?.focus();
    });

    return () => window.removeEventListener('keydown', handleKey);
  }, [mobileOpen]);

  async function handleLogout() {
    try {
      await signOut();
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  const sidebarContent = (
    <>
      {/* Header */}
      <div className={cn(
        "border-b border-border/50 flex items-center transition-all duration-300",
        collapsed ? "px-3 py-4 justify-center" : "px-5 py-5 justify-between"
      )}>
        {!collapsed && (
          <div className="animate-fade-in">
            <h1 className="text-lg font-bold text-gradient">SmartFlow CRM</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">AI Receptionist</p>
          </div>
        )}
        <div className="flex items-center gap-1">
          {!collapsed && <NotificationCenter />}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label={collapsed ? 'Sidebar genişlet' : 'Sidebar daralt'}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav role="navigation" aria-label="Ana men\u00fc" className={cn("flex-1 py-2 overflow-y-auto", collapsed ? "px-2" : "px-3")}>
        {navSections.map((section, sectionIdx) => {
          let itemIndex = 0;
          for (let s = 0; s < sectionIdx; s++) itemIndex += navSections[s].items.length;
          return (
            <div key={section.title} className={cn(sectionIdx > 0 ? "mt-4" : "")}>
              {!collapsed && (
                <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {section.title}
                </p>
              )}
              {collapsed && sectionIdx > 0 && (
                <div className="mx-2 mb-2 border-t border-border/40" />
              )}
              <div className="space-y-0.5">
                {section.items.map((item, idx) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  const animIdx = itemIndex + idx;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-xl transition-all duration-200",
                        collapsed ? "justify-center p-2.5" : "px-3 py-2",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        "animate-fade-in-up"
                      )}
                      style={{ animationDelay: `${animIdx * 30}ms` }}
                    >
                      <Icon className={cn("shrink-0 transition-transform duration-200 group-hover:scale-110", collapsed ? "h-5 w-5" : "h-[18px] w-[18px]")} />
                      {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary-foreground rounded-r-full" />
                      )}
                      {collapsed && (
                        <span className="absolute left-full ml-2 px-2.5 py-1 rounded-lg bg-foreground text-background text-xs font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                          {item.label}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User Profile & Logout */}
      {user && (
        <div className={cn("border-t border-border/50 transition-all duration-300", collapsed ? "p-2" : "p-3")}>
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-2 ring-primary/10">
                <User className="h-4 w-4 text-primary" />
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Çıkış Yap"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 px-2 py-2 mb-1.5 rounded-xl bg-accent/50">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-2 ring-primary/10 shrink-0">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {user.displayName || 'Kullanıcı'}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {user.email}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                Çıkış Yap
              </Button>
            </>
          )}
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        ref={hamburgerRef}
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2.5 rounded-xl bg-card border border-border shadow-lg text-foreground hover:bg-accent transition-colors"
        aria-label="Menüyü aç"
        aria-expanded={mobileOpen}
        aria-controls="mobile-sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        ref={mobileDrawerRef}
        id="mobile-sidebar"
        role="dialog"
        aria-modal={mobileOpen}
        aria-label="Mobil navigasyon menüsü"
        className={cn(
          "lg:hidden fixed top-0 left-0 z-50 h-full w-72 bg-card border-r border-border flex flex-col shadow-2xl transition-transform duration-300 ease-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors z-10"
        >
          <X className="h-5 w-5" />
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col bg-card border-r border-border sidebar-transition shrink-0",
          collapsed ? "w-[68px]" : "w-64"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
