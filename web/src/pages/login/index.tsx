import { useGSAP } from "@gsap/react";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Card, FieldError, Form, InputGroup, Label, Separator, Tabs, TextField } from "@heroui/react";
import { gsap } from "gsap";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ArrowUpRight, Languages } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { changeAppLocale, type AppLocale } from "@/i18n";

import { HyperspeedBackdrop } from "@/components/react-bits/hyperspeed-backdrop";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { usePlatformAuthStore } from "@/stores/use-platform-auth-store";
import { useThemeStore } from "@/stores/use-theme-store";

import { LoginBrandPanel } from "./brand-panel";

type LoginValues = { email: string; password: string };

function GoogleMark({ className }: { className?: string }) {
    return (
        <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
            <path fill="#4285F4" d="M21.35 12.23c0-.71-.06-1.4-.18-2.05H12v3.88h5.24a4.48 4.48 0 0 1-1.94 2.94v2.52h3.15c1.84-1.7 2.9-4.2 2.9-7.29Z" />
            <path fill="#34A853" d="M12 21.75c2.63 0 4.83-.87 6.45-2.35L15.3 17a5.8 5.8 0 0 1-8.63-3.05H3.42v2.6A9.75 9.75 0 0 0 12 21.75Z" />
            <path fill="#FBBC05" d="M6.67 13.95A5.84 5.84 0 0 1 6.35 12c0-.68.12-1.34.32-1.95v-2.6H3.42A9.75 9.75 0 0 0 3.42 16.55l3.25-2.6Z" />
            <path fill="#EA4335" d="M12 6.2c1.53 0 2.9.53 3.98 1.57l2.98-2.98C16.82 2.8 14.63 1.75 12 1.75a9.75 9.75 0 0 0-8.58 5.7l3.25 2.6A5.8 5.8 0 0 1 12 6.2Z" />
        </svg>
    );
}

function AppleMark({ className }: { className?: string }) {
    return (
        <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M16.7 12.6c0-2.1 1.7-3.1 1.8-3.2a3.9 3.9 0 0 0-3.1-1.7c-1.3-.1-2.6.8-3.3.8-.7 0-1.7-.8-2.8-.8-1.4 0-2.8.9-3.5 2.2-1.5 2.6-.4 6.5 1 8.5.7 1 1.5 2.1 2.6 2.1 1.1 0 1.5-.7 2.9-.7 1.3 0 1.7.7 2.9.7 1.2 0 2-1.1 2.7-2.1.8-1.2 1.1-2.3 1.1-2.4-.1 0-2.3-.9-2.3-3.4ZM14.6 6.3c.6-.7 1-1.6.9-2.6-.9 0-1.9.6-2.5 1.3-.6.6-1 1.6-.9 2.5 1 .1 1.9-.5 2.5-1.2Z" />
        </svg>
    );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const THEME_TOGGLER_CLASS =
    "inline-flex size-9 items-center justify-center rounded-xl text-muted transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&_svg]:size-4";

gsap.registerPlugin(useGSAP);

function LoginAmbientBackground() {
    const backgroundRef = useRef<HTMLDivElement>(null);

    useGSAP(
        () => {
            const media = gsap.matchMedia();
            media.add("(prefers-reduced-motion: no-preference)", () => {
                gsap.to(".creation-login-orbit--outer", { rotation: 360, duration: 52, ease: "none", repeat: -1 });
                gsap.to(".creation-login-orbit--inner", { rotation: -360, duration: 38, ease: "none", repeat: -1 });
                gsap.to(".creation-login-beacon--top", { x: 52, y: -28, scale: 1.14, duration: 15, ease: "sine.inOut", repeat: -1, yoyo: true });
                gsap.to(".creation-login-beacon--bottom", { x: -38, y: 34, scale: 1.18, duration: 19, ease: "sine.inOut", repeat: -1, yoyo: true });
                gsap.to(".creation-login-pulse", { scale: 1.45, opacity: 0.14, duration: 3.8, ease: "sine.inOut", repeat: -1, yoyo: true });
            });
            return () => media.revert();
        },
        { scope: backgroundRef },
    );

    return (
        <div ref={backgroundRef} className="creation-login-ambient" aria-hidden="true">
            <span className="creation-login-grid" />
            <span className="creation-login-orbit creation-login-orbit--outer" />
            <span className="creation-login-orbit creation-login-orbit--inner" />
            <span className="creation-login-beacon creation-login-beacon--top" />
            <span className="creation-login-beacon creation-login-beacon--bottom" />
            <span className="creation-login-pulse" />
        </div>
    );
}

export default function LoginPage() {
    const { i18n, t } = useTranslation();
    const navigate = useNavigate();
    const mounted = useRef(false);
    const themeMode = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const check = usePlatformAuthStore((state) => state.check);
    const login = usePlatformAuthStore((state) => state.login);
    const register = usePlatformAuthStore((state) => state.register);
    const checking = usePlatformAuthStore((state) => state.checking);
    const loggingIn = usePlatformAuthStore((state) => state.loggingIn);
    const registering = usePlatformAuthStore((state) => state.registering);
    const loggingOut = usePlatformAuthStore((state) => state.loggingOut);
    const error = usePlatformAuthStore((state) => state.error);
    const busy = loggingIn || registering || loggingOut;
    const pendingLabel = loggingOut ? (checking ? t("login.pending.checkingLogout") : t("login.pending.signingOut")) : loggingIn ? t("login.pending.signingIn") : registering ? t("login.pending.registering") : checking ? t("login.pending.checking") : "";
    const locale = i18n.resolvedLanguage as AppLocale;
    const nextLocale = locale === "zh-CN" ? "en-US" : "zh-CN";
    const languageLabel = t("topNav.switchLanguage", { language: t(nextLocale === "zh-CN" ? "locale.zhCN" : "locale.enUS") });

    const [values, setValues] = useState<LoginValues>({ email: "", password: "" });
    const [activeTab, setActiveTab] = useState<"login" | "register">("login");
    const [showErrors, setShowErrors] = useState(false);
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [hasAttemptedLogin, setHasAttemptedLogin] = useState(false);

    const emailError = !values.email.trim() ? t("login.emailRequired") : !EMAIL_PATTERN.test(values.email.trim()) ? t("login.emailInvalid") : null;
    const passwordError = !values.password ? t("login.passwordRequired") : null;
    const localApiUnavailable = error?.code === "LOCAL_API_UNAVAILABLE" || error?.status === 503;
    // Session probing happens on page entry. Keep its failures out of the credential form
    // until the visitor has made an explicit sign-in or registration attempt.
    const loginError = error && hasAttemptedLogin ? (localApiUnavailable ? t("login.serviceUnavailable") : error.message) : null;

    useEffect(() => {
        mounted.current = true;
        let active = true;
        if (!usePlatformAuthStore.getState().error)
            void check()
                .then((user) => {
                    const current = usePlatformAuthStore.getState();
                    if (active && user && current.user === user && !current.loggingIn && !current.loggingOut && !current.error) navigate("/", { replace: true });
                })
                .catch(() => undefined);
        return () => {
            active = false;
            mounted.current = false;
        };
    }, [check, navigate]);

    const submit = async () => {
        if (busy) return;
        if (emailError || passwordError) {
            setShowErrors(true);
            return;
        }
        setHasAttemptedLogin(true);
        try {
            const user = activeTab === "login" ? await login(values.email.trim(), values.password) : await register(values.email.trim(), values.password);
            const current = usePlatformAuthStore.getState();
            if (mounted.current && user && current.user === user && !current.loggingIn && !current.loggingOut) navigate("/", { replace: true });
        } catch {} // Shared store owns the failure feedback, including logout reconciliation.
    };

    return (
        <main className="creation-login-page relative flex min-h-dvh items-center justify-center overflow-y-auto bg-background p-4 text-foreground sm:p-8">
            <LoginAmbientBackground />
            <HyperspeedBackdrop density="calm" className="creation-hyperspeed creation-hyperspeed--login" />
            <Card variant="default" className="creation-login-shell relative z-10 w-full max-w-[1040px] overflow-hidden !gap-0 !p-0">
                <Card.Content className="grid !gap-0 !p-0 lg:min-h-[580px] lg:grid-cols-2">
                    <LoginBrandPanel />
                    <section aria-labelledby="login-title" className="relative flex items-center justify-center min-w-0 px-6 py-12 sm:px-10 lg:border-l lg:border-border lg:px-12">
                        <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5">
                            <Button isIconOnly variant="tertiary" size="sm" className={THEME_TOGGLER_CLASS} onPress={() => void changeAppLocale(nextLocale)} aria-label={languageLabel}>
                                <Languages className="size-4" aria-hidden="true" />
                            </Button>
                            <AnimatedThemeToggler theme={themeMode} onThemeChange={setTheme} className={THEME_TOGGLER_CLASS} aria-label={t("login.themeToggle")} />
                        </div>

                        <Card className="relative z-10 w-full max-w-[360px] !gap-0 !border-0 !bg-transparent !p-0 !shadow-none">
                            <Card.Content className="!gap-0 !p-0">
                                <h1 id="login-title" className="text-2xl font-semibold leading-8 tracking-tight text-foreground">
                                    {t("login.title")}
                                </h1>
                                <p className="mt-2 mb-6 text-sm leading-6 text-muted">{activeTab === "login" ? t("login.signInDescription") : t("login.registerDescription")}</p>

                                <Tabs
                                    className="w-full"
                                    selectedKey={activeTab}
                                    onSelectionChange={(key) => {
                                        setActiveTab(key as "login" | "register");
                                        setShowErrors(false);
                                        setHasAttemptedLogin(false);
                                    }}
                                >
                                    <Tabs.ListContainer className="w-full border border-border">
                                        <Tabs.List aria-label={t("login.tabs.label")} className="w-full">
                                            <Tabs.Tab className="flex-1" id="login">
                                                {t("login.tabs.signIn")}
                                                <Tabs.Indicator />
                                            </Tabs.Tab>
                                            <Tabs.Tab className="flex-1" id="register">
                                                {t("login.tabs.register")}
                                                <Tabs.Indicator />
                                            </Tabs.Tab>
                                        </Tabs.List>
                                    </Tabs.ListContainer>
                                    <Tabs.Panel className="pt-5" id={activeTab}>
                                        {loginError ? (
                                            <Alert className="mb-5" status="danger">
                                                <Alert.Indicator />
                                                <Alert.Content>
                                                    <Alert.Title>{loginError}</Alert.Title>
                                                    <Button className="mt-2" size="sm" variant="danger-soft" isDisabled={busy || checking} onPress={() => void submit()}>
                                                        {t("login.retry")}
                                                    </Button>
                                                </Alert.Content>
                                            </Alert>
                                        ) : null}

                                        <Form
                                            className="space-y-4"
                                            onSubmit={(event) => {
                                                event.preventDefault();
                                                void submit();
                                            }}
                                        >
                                            <TextField className="flex flex-col gap-2" fullWidth isDisabled={busy} isInvalid={showErrors && Boolean(emailError)}>
                                                <Label className="text-[13px] font-medium text-foreground">{t("login.email")}</Label>
                                                <InputGroup className="creation-login-input" data-invalid={showErrors && Boolean(emailError)} fullWidth>
                                                    <InputGroup.Prefix>
                                                        <Mail className="size-4 text-muted" />
                                                    </InputGroup.Prefix>
                                                    <InputGroup.Input
                                                        type="email"
                                                        autoComplete="email"
                                                        inputMode="email"
                                                        placeholder="name@example.com"
                                                        value={values.email}
                                                        onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))}
                                                    />
                                                </InputGroup>
                                                <FieldError className="text-xs">{emailError ?? ""}</FieldError>
                                            </TextField>

                                            <TextField className="flex flex-col gap-2" fullWidth isDisabled={busy} isInvalid={showErrors && Boolean(passwordError)}>
                                                <Label className="text-[13px] font-medium text-foreground">{t("login.password")}</Label>
                                                <InputGroup className="creation-login-input" data-invalid={showErrors && Boolean(passwordError)} fullWidth>
                                                    <InputGroup.Prefix>
                                                        <LockKeyhole className="size-4 text-muted" />
                                                    </InputGroup.Prefix>
                                                    <InputGroup.Input
                                                        type={passwordVisible ? "text" : "password"}
                                                        autoComplete="current-password"
                                                        placeholder={t("login.passwordPlaceholder")}
                                                        value={values.password}
                                                        onChange={(event) => setValues((current) => ({ ...current, password: event.target.value }))}
                                                    />
                                                    <InputGroup.Suffix>
                                                        <Button
                                                            type="button"
                                                            isIconOnly
                                                            size="sm"
                                                            variant="tertiary"
                                                            aria-label={passwordVisible ? t("login.hidePassword") : t("login.showPassword")}
                                                            className="size-8 min-w-8 text-muted"
                                                            onPress={() => setPasswordVisible((visible) => !visible)}
                                                        >
                                                            {passwordVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                                        </Button>
                                                    </InputGroup.Suffix>
                                                </InputGroup>
                                                <FieldError className="text-xs">{passwordError ?? ""}</FieldError>
                                            </TextField>

                                            <div className="flex justify-end">
                                                <Button isDisabled size="sm" variant="ghost" className="h-auto min-h-0 px-0 text-xs">
                                                    {t("login.forgot")}
                                                </Button>
                                            </div>

                                            <Button type="submit" fullWidth variant="primary" className="h-11 text-sm" isDisabled={busy} isPending={busy}>
                                                {busy ? pendingLabel : activeTab === "login" ? t("login.tabs.signIn") : t("login.tabs.register")}
                                                <ArrowRight className="size-4" />
                                            </Button>
                                        </Form>

                                        {pendingLabel ? (
                                            <p role="status" className="mt-3 text-center text-xs text-muted">
                                                {pendingLabel}…
                                            </p>
                                        ) : null}
                                    </Tabs.Panel>
                                </Tabs>

                                <div className="my-5 flex items-center gap-3" aria-hidden="true">
                                    <Separator className="flex-1" />
                                    <span className="text-xs text-muted">{t("login.divider")}</span>
                                    <Separator className="flex-1" />
                                </div>

                                <div className="grid grid-cols-2 gap-3" aria-label={t("login.thirdParty")}>
                                    <Button fullWidth isDisabled variant="outline" size="md" className="h-10 w-full text-sm" aria-label={`${t("login.google")} · ${t("login.tabs.unavailable")}`}>
                                        <GoogleMark className="size-4" />
                                        {t("login.googleShort")}
                                    </Button>
                                    <Button fullWidth isDisabled variant="outline" size="md" className="h-10 w-full text-sm" aria-label={`${t("login.apple")} · ${t("login.tabs.unavailable")}`}>
                                        <AppleMark className="size-4" />
                                        {t("login.appleShort")}
                                    </Button>
                                </div>

                                {/* Back to Local Canvas Button */}
                                <Button className="mt-5 h-10 w-full text-[13px]" variant="ghost" size="md" onPress={() => navigate("/canvas")}>
                                    {t("login.localCanvas")}
                                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                                </Button>
                            </Card.Content>
                        </Card>
                    </section>
                </Card.Content>
            </Card>
        </main>
    );
}
