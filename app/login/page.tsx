'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/firebase/auth-context';
import { Mail, Lock, User, AlertCircle, Loader2 } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const { signIn, signUp, resetPassword, loading, error, clearError } = useAuth();
    const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
    const [showResetPassword, setShowResetPassword] = useState(false);
    const [resetEmailSent, setResetEmailSent] = useState(false);

    const [loginData, setLoginData] = useState({ email: '', password: '' });
    const [registerData, setRegisterData] = useState({ name: '', email: '', password: '', confirmPassword: '' });
    const [resetEmail, setResetEmail] = useState('');
    const [formError, setFormError] = useState<string | null>(null);

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        setFormError(null);
        clearError();

        if (!loginData.email || !loginData.password) {
            setFormError('Lütfen tüm alanları doldurun.');
            return;
        }

        try {
            await signIn(loginData.email, loginData.password);
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
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
                <Card className="w-full max-w-md">
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
                                            type="email"
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
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-center">
                        <span className="text-2xl text-white font-bold">SF</span>
                    </div>
                    <CardTitle className="text-2xl">SmartFlow CRM</CardTitle>
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
                            <form onSubmit={handleLogin} className="space-y-4">
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
                                            type="email"
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
                                            type="password"
                                            placeholder="••••••••"
                                            value={loginData.password}
                                            onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                                            className="pl-10"
                                        />
                                    </div>
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

                                <div className="text-center">
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
                            <form onSubmit={handleRegister} className="space-y-4">
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
                                            type="text"
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
                                            type="email"
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
                                            type="password"
                                            placeholder="••••••••"
                                            value={registerData.password}
                                            onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                                            className="pl-10"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="register-confirm-password">Şifre Tekrar</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="register-confirm-password"
                                            type="password"
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
