'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/lib/firebase/auth-context';
import { Mail, Lock, User, AlertCircle, Loader2 } from 'lucide-react';

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

export default function LoginPage() {
    const router = useRouter();
    const { signIn, signInWithGoogle, signUp, resetPassword, loading, error, clearError } = useAuth();
    const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
    const [showResetPassword, setShowResetPassword] = useState(false);
    const [resetEmailSent, setResetEmailSent] = useState(false);

    const [loginData, setLoginData] = useState({ email: '', password: '' });
    const [registerData, setRegisterData] = useState({ name: '', email: '', password: '', confirmPassword: '' });
    const [resetEmail, setResetEmail] = useState('');
    const [formError, setFormError] = useState<string | null>(null);
    const [rememberMe, setRememberMe] = useState(false);

    // Load saved email from localStorage on mount
    useEffect(() => {
        const savedEmail = localStorage.getItem('smartflow_remembered_email');
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
            // Save or clear remembered email
            if (rememberMe) {
                localStorage.setItem('smartflow_remembered_email', loginData.email);
            } else {
                localStorage.removeItem('smartflow_remembered_email');
            }
            await signIn(loginData.email, loginData.password);
            router.push('/');
        } catch {
            // Error is handled in context
        }
    }

    async function handleGoogleLogin() {
        setFormError(null);
        clearError();

        try {
            await signInWithGoogle();
            router.push('/');
        } catch {
            // Error is handled in context
        }
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
        } catch {
            // Error is handled in context
        }
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
        } catch {
            // Error is handled in context
        }
    }

    if (showResetPassword) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-950 dark:via-gray-900 dark:to-indigo-950 p-4 relative overflow-hidden">
                <div className="absolute top-1/4 -left-32 w-64 h-64 rounded-full bg-blue-400/20 blur-3xl animate-float" />
                <div className="absolute bottom-1/4 -right-32 w-80 h-80 rounded-full bg-indigo-400/15 blur-3xl animate-float" style={{ animationDelay: '1.5s' }} />
                <Card className="w-full max-w-md relative z-10 shadow-2xl border-white/20 dark:border-white/10 backdrop-blur-sm animate-scale-in">
                    <CardHeader className="text-center">
                        <CardTitle className="text-2xl">Şifre Sıfırlama</CardTitle>
                        <CardDescription>
                            {resetEmailSent
                                ? 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.'
                                : 'E-posta adresinizi girin, size şifre sıfırlama bağlantısı gönderelim.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {resetEmailSent ? (
                            <div className="space-y-4">
                                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                                    <p className="text-green-700 dark:text-green-300">
                                        ✅ E-posta gönderildi! Spam klasörünü kontrol etmeyi unutmayın.
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => {
                                        setShowResetPassword(false);
                                        setResetEmailSent(false);
                                    }}
                                >
                                    Giriş Sayfasına Dön
                                </Button>
                            </div>
                        ) : (
                            <form onSubmit={handleResetPassword} className="space-y-4">
                                {(error || formError) && (
                                    <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive text-sm">
                                        <AlertCircle className="h-4 w-4" />
                                        <span>{error || formError}</span>
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <Label htmlFor="reset-email">E-posta</Label>
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
                                            className="pl-10"
                                        />
                                    </div>
                                </div>
                                <Button type="submit" className="w-full" disabled={loading}>
                                    {loading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Gönderiliyor...
                                        </>
                                    ) : (
                                        'Şifre Sıfırlama Linki Gönder'
                                    )}
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="w-full"
                                    onClick={() => setShowResetPassword(false)}
                                >
                                    Geri Dön
                                </Button>
                            </form>
                        )}
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-950 dark:via-gray-900 dark:to-indigo-950 p-4 relative overflow-hidden">
            {/* Animated background orbs */}
            <div className="absolute top-1/4 -left-32 w-64 h-64 rounded-full bg-blue-400/20 blur-3xl animate-float" />
            <div className="absolute bottom-1/4 -right-32 w-80 h-80 rounded-full bg-indigo-400/15 blur-3xl animate-float" style={{ animationDelay: '1.5s' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-purple-400/10 blur-3xl animate-pulse-soft" />

            <Card className="w-full max-w-md relative z-10 shadow-2xl border-white/20 dark:border-white/10 backdrop-blur-sm animate-scale-in">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 animate-float">
                        <span className="text-2xl text-white font-bold">SF</span>
                    </div>
                    <CardTitle className="text-2xl text-gradient">SmartFlow CRM</CardTitle>
                    <CardDescription>
                        AI destekli çağrı yönetimi ve müşteri hizmetleri platformu
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'login' | 'register')}>
                        <TabsList className="grid w-full grid-cols-2 mb-6">
                            <TabsTrigger value="login">Giriş Yap</TabsTrigger>
                            <TabsTrigger value="register">Kayıt Ol</TabsTrigger>
                        </TabsList>

                        <TabsContent value="login">
                            <form onSubmit={handleLogin} className="space-y-4" autoComplete="on">
                                {(error || formError) && (
                                    <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive text-sm">
                                        <AlertCircle className="h-4 w-4" />
                                        <span>{error || formError}</span>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="login-email">E-posta</Label>
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
                                            className="pl-10"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="login-password">Şifre</Label>
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
                                            className="pl-10"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="remember-me"
                                        checked={rememberMe}
                                        onCheckedChange={(checked) => setRememberMe(checked === true)}
                                    />
                                    <Label htmlFor="remember-me" className="text-sm font-normal text-muted-foreground cursor-pointer">
                                        Beni Hatırla
                                    </Label>
                                </div>

                                <Button type="submit" className="w-full" disabled={loading}>
                                    {loading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Giriş yapılıyor...
                                        </>
                                    ) : (
                                        'Giriş Yap'
                                    )}
                                </Button>

                                <div className="relative my-4 flex items-center">
                                    <div className="flex-grow border-t border-muted"></div>
                                    <span className="flex-shrink-0 mx-4 text-muted-foreground text-sm">veya</span>
                                    <div className="flex-grow border-t border-muted"></div>
                                </div>

                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full flex items-center justify-center gap-2"
                                    disabled={loading}
                                    onClick={handleGoogleLogin}
                                >
                                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                                        <path
                                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                            fill="#4285F4"
                                        />
                                        <path
                                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                            fill="#34A853"
                                        />
                                        <path
                                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                            fill="#FBBC05"
                                        />
                                        <path
                                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                            fill="#EA4335"
                                        />
                                    </svg>
                                    Google ile Giriş Yap
                                </Button>

                                <div className="text-center mt-4">
                                    <button
                                        type="button"
                                        className="text-sm text-muted-foreground hover:text-primary underline"
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
                                    <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive text-sm">
                                        <AlertCircle className="h-4 w-4" />
                                        <span>{error || formError}</span>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="register-name">Ad Soyad</Label>
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
                                            className="pl-10"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="register-email">E-posta</Label>
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
                                            className="pl-10"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="register-password">Şifre</Label>
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
                                            className="pl-10"
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
                                                                : 'bg-muted'
                                                        }`}
                                                    />
                                                ))}
                                            </div>
                                            <p className={`text-xs font-medium transition-colors ${
                                                getPasswordStrength(registerData.password).score <= 40 ? 'text-red-500' :
                                                getPasswordStrength(registerData.password).score <= 60 ? 'text-yellow-600' :
                                                'text-emerald-600'
                                            }`}>
                                                {getPasswordStrength(registerData.password).label}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="register-confirm-password">Şifre Tekrar</Label>
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
                                            className="pl-10"
                                        />
                                    </div>
                                </div>

                                <Button type="submit" className="w-full" disabled={loading}>
                                    {loading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Kayıt yapılıyor...
                                        </>
                                    ) : (
                                        'Kayıt Ol'
                                    )}
                                </Button>
                            </form>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
}
