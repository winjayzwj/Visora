import { Alert, Button, Card, FieldError, InputGroup, Label, TextField } from "@heroui/react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, Moon, Sun } from "lucide-react";
import { useState } from "react";
import type { ThemeMode } from "../../lib/theme";
import { errorMessage } from "../../lib/error-message";
import type { Credentials } from "../../services/api/platform";

export function LoginPage({
    mode,
    onLogin,
    onModeChange,
    pending,
}: {
    mode: ThemeMode;
    onLogin: (values: Credentials) => Promise<void>;
    onModeChange: (mode: ThemeMode) => void;
    pending: boolean;
}) {
    const [error, setError] = useState<string>();
    const [values, setValues] = useState<Credentials>({ email: "", password: "" });
    const [showErrors, setShowErrors] = useState(false);
    const [passwordVisible, setPasswordVisible] = useState(false);
    const emailError = !values.email.trim() ? "请输入邮箱。" : !/^\S+@\S+\.\S+$/.test(values.email.trim()) ? "请输入有效的邮箱地址。" : null;
    const passwordError = values.password ? null : "请输入密码。";
    const nextMode: ThemeMode = mode === "system" ? "light" : mode === "light" ? "dark" : "system";
    const themeLabel = mode === "system" ? "切换为浅色模式" : mode === "light" ? "切换为深色模式" : "切换为跟随系统";

    const submit = async () => {
        if (pending) return;
        if (emailError || passwordError) {
            setShowErrors(true);
            return;
        }
        setError(undefined);
        try {
            await onLogin({ email: values.email.trim(), password: values.password });
        } catch (loginError) {
            setError(errorMessage(loginError, "登录未完成，请重试。"));
        }
    };

    return (
        <main className="auth-page">
            <div className="auth-ambient" aria-hidden="true">
                <span className="auth-grid" />
                <span className="auth-orbit auth-orbit--outer" />
                <span className="auth-orbit auth-orbit--inner" />
                <span className="auth-beacon auth-beacon--top" />
                <span className="auth-beacon auth-beacon--bottom" />
                <span className="auth-pulse" />
            </div>
            <Card className="auth-shell" variant="default">
                <Card.Content className="auth-shell-content">
                    <aside className="auth-aside" aria-label="Visora 管理后台">
                        <div className="auth-aside-header">
                            <span>映序</span>
                            <span aria-hidden="true" />
                            <span>VISORA ADMIN</span>
                        </div>
                        <div className="auth-aside-copy">
                            <h2><span>让每一次创作</span><span>都有序运转。</span></h2>
                            <p>统一管理账号、模型与运营配置，为创作体验保持清晰、可靠的秩序。</p>
                        </div>
                        <p className="auth-aside-footer">账号 · 模型 · 运营</p>
                    </aside>
                    <section className="auth-main" aria-labelledby="login-title">
                        <div className="auth-theme">
                            <Button isIconOnly aria-label={themeLabel} type="button" variant="tertiary" onPress={() => onModeChange(nextMode)}>
                                {mode === "dark" ? <Moon aria-hidden="true" size={16} /> : <Sun aria-hidden="true" size={16} />}
                            </Button>
                        </div>
                        <Card className="auth-panel" variant="default">
                            <Card.Content className="auth-panel-content">
                                <h1 id="login-title">登录管理后台</h1>
                                <p className="auth-copy">使用管理员账号登录。</p>
                                <div className="auth-login-tab" aria-label="当前登录方式">账号登录</div>
                                {error ? <Alert className="auth-alert" role="alert" status="danger"><Alert.Indicator /><Alert.Content><Alert.Title>{error}</Alert.Title></Alert.Content></Alert> : null}
                                <form
                                    className="auth-form"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        void submit();
                                    }}
                                >
                                    <TextField className="auth-field" fullWidth isDisabled={pending} isInvalid={showErrors && Boolean(emailError)}>
                                        <Label>邮箱 / Email</Label>
                                        <InputGroup className="auth-login-input" fullWidth>
                                            <InputGroup.Prefix><Mail aria-hidden="true" size={16} /></InputGroup.Prefix>
                                            <InputGroup.Input autoComplete="username" autoFocus inputMode="email" name="email" placeholder="name@example.com" type="email" value={values.email} onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))} />
                                        </InputGroup>
                                        <FieldError>{emailError ?? ""}</FieldError>
                                    </TextField>
                                    <TextField className="auth-field" fullWidth isDisabled={pending} isInvalid={showErrors && Boolean(passwordError)}>
                                        <Label>密码 / Password</Label>
                                        <InputGroup className="auth-login-input" fullWidth>
                                            <InputGroup.Prefix><LockKeyhole aria-hidden="true" size={16} /></InputGroup.Prefix>
                                            <InputGroup.Input autoComplete="current-password" name="password" placeholder="输入账户密码" type={passwordVisible ? "text" : "password"} value={values.password} onChange={(event) => setValues((current) => ({ ...current, password: event.target.value }))} />
                                            <InputGroup.Suffix>
                                                <Button isIconOnly aria-label={passwordVisible ? "隐藏密码" : "显示密码"} size="sm" type="button" variant="tertiary" onPress={() => setPasswordVisible((visible) => !visible)}>
                                                    {passwordVisible ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}
                                                </Button>
                                            </InputGroup.Suffix>
                                        </InputGroup>
                                        <FieldError>{passwordError ?? ""}</FieldError>
                                    </TextField>
                                    <div className="auth-row"><span aria-disabled="true" className="auth-disabled">忘记密码？</span></div>
                                    <Button fullWidth isDisabled={pending} isPending={pending} variant="primary" onPress={() => void submit()}>
                                        {pending ? "正在登录" : "登录"}
                                        <ArrowRight aria-hidden="true" size={16} />
                                    </Button>
                                </form>
                                <p className="auth-note">后台账号由已有管理员创建；忘记密码请联系管理员重置。</p>
                            </Card.Content>
                        </Card>
                    </section>
                </Card.Content>
            </Card>
        </main>
    );
}
