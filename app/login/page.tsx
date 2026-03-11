'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/lib/firebase/auth-context';
import { useTrackEvent } from '@/lib/hooks/useActivityTracker';
import { Mail, Lock, User, AlertCircle, Loader2, Phone } from 'lucide-react';

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
    if (!password) return { score: 0, label: '', color: '' };
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 1) return { score: 20, label: 'Çok Zayıf', color: 'bg-red-500' };
    if (score === 2) return { score: 40, label: 'Zayıf', color: 'bg-orange-500' };
    if (score === 3) return { score: 60, label: 'Orta', color: 'bg-yellow-500' };
    if (score === 4) return { score: 80, label: 'Güçlü', color: 'bg-emerald-500' };
    return { score: 100, label: 'Çok Güçlü', color: 'bg-emerald-600' };
}

/* SVG circuit board pattern — drawn inline for Inception aesthetic */
function CircuitPattern() {
    return (
        <svg className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <pattern id="circuit" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
                    <path d="M10 10h30v0M40 10v30M40 40h30M70 40v30M70 70h-30M40 70v-20" stroke="#dc2626" strokeWidth="0.5" fill="none" />
                    <circle cx="10" cy="10" r="2" fill="#dc2626" />
                    <circle cx="40" cy="40" r="2" fill="#dc2626" />
                    <circle cx="70" cy="70" r="2" fill="#dc2626" />
                    <path d="M80 20h10v60h-10" stroke="#0d9488" strokeWidth="0.3" fill="none" />
                    <circle cx="80" cy="20" r="1.5" fill="#0d9488" />
                </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#circuit)" />
        </svg>
    );
}

/* Sound wave decoration */
function SoundWave({ className }: { className?: string }) {
    return (
        <div className={`flex items-center gap-[2px] ${className}`}>
            {[...Array(24)].map((_, i) => {
                const h = Math.sin(i * 0.5) * 16 + 20 + Math.random() * 8;
                return (
                    <div
                        key={i}
                        className="w-[2px] rounded-full bg-gradient-to-t from-inception-red/40 to-inception-red/10"
                        style={{
                            height: `${h}px`,
                            animationDelay: `${i * 80}ms`,
                            opacity: 0.3 + Math.sin(i * 0.3) * 0.3,
                        }}
                    />
                );
            })}
        </div>
    );
}

export default function LoginPage() {
    const router = useRouter();
    const { signIn, signInWithGoogle, signUp, resetPassword, loading, error, clearError } = useAuth();
    const trackEvent = useTrackEvent();
    const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
    const [showResetPassword, setShowResetPassword] = useState(false);
    const [resetEmailSent, setResetEmailSent] = useState(false);

    const [loginData, setLoginData] = useState({ email: '', password: '' });
    const [registerData, setRegisterData] = useState({ name: '', email: '', password: '', confirmPassword: '' });
    const [resetEmail, setResetEmail] = useState('');
    const [formError, setFormError] = useState<string | null>(null);
    const [rememberMe, setRememberMe] = useState(false);

    useEffect(() => {
        const savedEmail = localStorage.getItem('callception_remembered_email');
        if (savedEmail) {
            setLoginData(prev => ({ ...prev, email: savedEmail }));
            setRememberMe(true);
        }
    }, []);

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        setFormError(null);
        clearError();
        if (!loginData.email || !loginData.password) {
            setFormError('Lütfen tüm alanları doldurun.');
            return;
        }
        try {
            if (rememberMe) {
                localStorage.setItem('callception_remembered_email', loginData.email);
            } else {
                localStorage.removeItem('callception_remembered_email');
            }
            await signIn(loginData.email, loginData.password);
            trackEvent('login', { method: 'email' });
            router.push('/');
        } catch { /* handled in context */ }
    }

    async function handleGoogleLogin() {
        setFormError(null);
        clearError();
        try {
            await signInWithGoogle();
            trackEvent('login', { method: 'google' });
            router.push('/');
        } catch { /* handled in context */ }
    }

    async function handleRegister(e: React.FormEvent) {
        e.preventDefault();
        setFormError(null);
        clearError();
        if (!registerData.name || !registerData.email || !registerData.password) {
            setFormError('Lütfen tüm alanları doldurun.');
            return;
        }
        if (registerData.password !== registerData.confirmPassword) {
            setFormError('Şifreler eşleşmiyor.');
            return;
        }
        if (registerData.password.length < 6) {
            setFormError('Şifre en az 6 karakter olmalıdır.');
            return;
        }
        try {
            await signUp(registerData.email, registerData.password, registerData.name);
            router.push('/');
        } catch { /* handled in context */ }
    }

    async function handleResetPassword(e: React.FormEvent) {
        e.preventDefault();
        setFormError(null);
        clearError();
        if (!resetEmail) {
            setFormError('Lütfen e-posta adresinizi girin.');
            return;
        }
        try {
            await resetPassword(resetEmail);
            setResetEmailSent(true);
        } catch { /* handled in context */ }
    }

    /* ── Background Layer ── */
    const backgroundLayer = (
        <>
            {/* Deep dark gradient base */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#050510] via-[#0a0a18] to-[#0d1117]" />

            {/* Circuit board pattern */}
            <CircuitPattern />

            {/* Atmospheric glows */}
            <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-inception-red/[0.04] blur-[120px]" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full bg-inception-teal/[0.03] blur-[100px]" />
            <div className="absolute top-1/2 left-1/3 w-[300px] h-[300px] rounded-full bg-inception-red/[0.02] blur-[80px] animate-pulse-soft" />

            {/* Subtle scan line */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none scan-line" />

            {/* Vignette */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.6)_100%)]" />
        </>
    );

    /* ── Reset Password View ── */
    if (showResetPassword) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
                {backgroundLayer}

                <Card className="w-full max-w-md relative z-10 glass-card animate-scale-in border-white/[0.06]">
                    <CardHeader className="text-center">
                        <CardTitle className="text-2xl font-display text-gradient">Şifre Sıfırlama</CardTitle>
                        <CardDescription className="text-muted-foreground">
                            {resetEmailSent
                                ? 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.'
                                : 'E-posta adresinizi girin, size şifre sıfırlama bağlantısı gönderelim.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {resetEmailSent ? (
                            <div className="space-y-4">
                                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-center">
                                    <p className="text-emerald-400 text-sm">
                                        E-posta gönderildi! Spam klasörünü kontrol etmeyi unutmayın.
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    className="w-full border-white/10 hover:bg-white/5"
                                    onClick={() => { setShowResetPassword(false); setResetEmailSent(false); }}
                                >
                                    Giriş Sayfasına Dön
                                </Button>
                            </div>
                        ) : (
                            <form onSubmit={handleResetPassword} className="space-y-4">
                                {(error || formError) && (
                                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400 text-sm">
                                        <AlertCircle className="h-4 w-4" />
                                        <span>{error || formError}</span>
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <Label htmlFor="reset-email" className="text-sm text-muted-foreground">E-posta</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="reset-email"
                                            name="email"
                                            type="email"
                                            autoComplete="email"
                                            placeholder="ornek@email.com"
                                            value={resetEmail}
                                            onChange={(e) => setResetEmail(e.target.value)}
                                            className="pl-10 bg-white/[0.03] border-white/10 focus:border-inception-red/50 focus:ring-inception-red/20"
                                        />
                                    </div>
                                </div>
                                <Button type="submit" className="w-full bg-inception-red hover:bg-inception-red-light text-white" disabled={loading}>
                                    {loading ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Gönderiliyor...</>
                                    ) : 'Şifre Sıfırlama Linki Gönder'}
                                </Button>
                                <Button type="button" variant="ghost" className="w-full text-muted-foreground hover:text-foreground" onClick={() => setShowResetPassword(false)}>
                                    Geri Dön
                                </Button>
                            </form>
                        )}
                    </CardContent>
                </Card>
            </div>
        );
    }

    /* ── Main Login View ── */
    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            {backgroundLayer}

            <div className="w-full max-w-md relative z-10 space-y-6 animate-text-reveal">
                {/* Brand Header */}
                <div className="text-center space-y-3">
                    <div className="mx-auto mb-2 h-16 w-16 rounded-2xl bg-gradient-to-br from-inception-red to-inception-red-dark flex items-center justify-center shadow-lg glow-red animate-float">
                        <Phone className="h-7 w-7 text-white" />
                    </div>
                    <h1 className="text-3xl font-display font-bold tracking-wider text-gradient">
                        CALLCEPTION
                    </h1>
                    <p className="text-sm text-muted-foreground tracking-wide">
                        AI Destekli Çağrı Yönetimi Platformu
                    </p>
                    <SoundWave className="justify-center mt-2" />
                </div>

                {/* Login Card */}
                <Card className="glass-card border-white/[0.06] animate-scale-in" style={{ animationDelay: '200ms' }}>
                    <CardContent className="pt-6">
                        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'login' | 'register')}>
                            <TabsList className="grid w-full grid-cols-2 mb-6 bg-white/[0.03] border border-white/[0.06]">
                                <TabsTrigger value="login" className="data-[state=active]:bg-inception-red data-[state=active]:text-white data-[state=active]:shadow-lg text-muted-foreground font-medium">
                                    Giriş Yap
                                </TabsTrigger>
                                <TabsTrigger value="register" className="data-[state=active]:bg-inception-red data-[state=active]:text-white data-[state=active]:shadow-lg text-muted-foreground font-medium">
                                    Kayıt Ol
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="login">
                                <form onSubmit={handleLogin} className="space-y-4" autoComplete="on">
                                    {(error || formError) && (
                                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400 text-sm">
                                            <AlertCircle className="h-4 w-4 shrink-0" />
                                            <span>{error || formError}</span>
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <Label htmlFor="login-email" className="text-sm text-muted-foreground">E-posta</Label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                id="login-email"
                                                name="email"
                                                type="email"
                                                autoComplete="email"
                                                placeholder="ornek@email.com"
                                                value={loginData.email}
                                                onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                                                className="pl-10 bg-white/[0.03] border-white/10 focus:border-inception-red/50 focus:ring-inception-red/20 placeholder:text-white/20"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="login-password" className="text-sm text-muted-foreground">Şifre</Label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                id="login-password"
                                                name="password"
                                                type="password"
                                                autoComplete="current-password"
                                                placeholder="••••••••"
                                                value={loginData.password}
                                                onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                                                className="pl-10 bg-white/[0.03] border-white/10 focus:border-inception-red/50 focus:ring-inception-red/20 placeholder:text-white/20"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            id="remember-me"
                                            checked={rememberMe}
                                            onCheckedChange={(checked) => setRememberMe(checked === true)}
                                            className="border-white/20 data-[state=checked]:bg-inception-red data-[state=checked]:border-inception-red"
                                        />
                                        <Label htmlFor="remember-me" className="text-sm font-normal text-muted-foreground cursor-pointer">
                                            Beni Hatırla
                                        </Label>
                                    </div>

                                    <Button type="submit" className="w-full bg-inception-red hover:bg-inception-red-light text-white font-semibold shadow-lg shadow-inception-red/20 transition-all hover:shadow-inception-red/30" disabled={loading}>
                                        {loading ? (
                                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Giriş yapılıyor...</>
                                        ) : 'Giriş Yap'}
                                    </Button>

                                    <div className="relative my-4 flex items-center">
                                        <div className="flex-grow border-t border-white/10"></div>
                                        <span className="flex-shrink-0 mx-4 text-muted-foreground text-xs uppercase tracking-wider">veya</span>
                                        <div className="flex-grow border-t border-white/10"></div>
                                    </div>

                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full flex items-center justify-center gap-2 border-white/10 bg-white/[0.02] hover:bg-white/[0.05] text-foreground"
                                        disabled={loading}
                                        onClick={handleGoogleLogin}
                                    >
                                        <svg className="h-5 w-5" viewBox="0 0 24 24">
                                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                        </svg>
                                        Google ile Giriş Yap
                                    </Button>

                                    <div className="text-center mt-4">
                                        <button
                                            type="button"
                                            className="text-sm text-muted-foreground hover:text-inception-red transition-colors"
                                            onClick={() => setShowResetPassword(true)}
                                        >
                                            Şifremi unuttum
                                        </button>
                                    </div>
                                </form>
                            </TabsContent>

                            <TabsContent value="register">
                                <form onSubmit={handleRegister} className="space-y-4" autoComplete="on">
                                    {(error || formError) && (
                                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400 text-sm">
                                            <AlertCircle className="h-4 w-4 shrink-0" />
                                            <span>{error || formError}</span>
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <Label htmlFor="register-name" className="text-sm text-muted-foreground">Ad Soyad</Label>
                                        <div className="relative">
                                            <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                id="register-name"
                                                name="name"
                                                type="text"
                                                autoComplete="name"
                                                placeholder="Ad Soyad"
                                                value={registerData.name}
                                                onChange={(e) => setRegisterData({ ...registerData, name: e.target.value })}
                                                className="pl-10 bg-white/[0.03] border-white/10 focus:border-inception-red/50 focus:ring-inception-red/20 placeholder:text-white/20"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="register-email" className="text-sm text-muted-foreground">E-posta</Label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                id="register-email"
                                                name="email"
                                                type="email"
                                                autoComplete="email"
                                                placeholder="ornek@email.com"
                                                value={registerData.email}
                                                onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                                                className="pl-10 bg-white/[0.03] border-white/10 focus:border-inception-red/50 focus:ring-inception-red/20 placeholder:text-white/20"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="register-password" className="text-sm text-muted-foreground">Şifre</Label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                id="register-password"
                                                name="new-password"
                                                type="password"
                                                autoComplete="new-password"
                                                placeholder="••••••••"
                                                value={registerData.password}
                                                onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                                                className="pl-10 bg-white/[0.03] border-white/10 focus:border-inception-red/50 focus:ring-inception-red/20 placeholder:text-white/20"
                                            />
                                        </div>
                                        {registerData.password && (
                                            <div className="space-y-1.5 mt-2">
                                                <div className="flex gap-1">
                                                    {[1, 2, 3, 4, 5].map((segment) => (
                                                        <div
                                                            key={segment}
                                                            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                                                                getPasswordStrength(registerData.password).score >= segment * 20
                                                                    ? getPasswordStrength(registerData.password).color
                                                                    : 'bg-white/10'
                                                            }`}
                                                        />
                                                    ))}
                                                </div>
                                                <p className={`text-xs font-medium transition-colors ${
                                                    getPasswordStrength(registerData.password).score <= 40 ? 'text-red-400' :
                                                    getPasswordStrength(registerData.password).score <= 60 ? 'text-yellow-400' :
                                                    'text-emerald-400'
                                                }`}>
                                                    {getPasswordStrength(registerData.password).label}
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="register-confirm-password" className="text-sm text-muted-foreground">Şifre Tekrar</Label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                id="register-confirm-password"
                                                name="confirm-password"
                                                type="password"
                                                autoComplete="new-password"
                                                placeholder="••••••••"
                                                value={registerData.confirmPassword}
                                                onChange={(e) => setRegisterData({ ...registerData, confirmPassword: e.target.value })}
                                                className="pl-10 bg-white/[0.03] border-white/10 focus:border-inception-red/50 focus:ring-inception-red/20 placeholder:text-white/20"
                                            />
                                        </div>
                                    </div>

                                    <Button type="submit" className="w-full bg-inception-red hover:bg-inception-red-light text-white font-semibold shadow-lg shadow-inception-red/20" disabled={loading}>
                                        {loading ? (
                                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Kayıt yapılıyor...</>
                                        ) : 'Kayıt Ol'}
                                    </Button>
                                </form>
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>

                {/* Footer */}
                <p className="text-center text-xs text-muted-foreground/50 tracking-wider font-display">
                    CALL CENTER SOFTWARE SOLUTIONS
                </p>
            </div>
        </div>
    );
}
