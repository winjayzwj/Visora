import { Alert, Button, Form, Input, Segmented, Typography } from "../../components/ui/heroui-compat";
import { ArrowLeft, KeyRound, Mail, Moon, Sun } from "lucide-react";
import { useState } from "react";
import type { ThemeMode } from "../../lib/theme";
import { errorMessage } from "../../lib/error-message";
import type { Credentials } from "../../services/api/platform";
import { LoginBrandPanel } from "./brand-panel";

export function LoginPage({
    mode,
    onLogin,
    onModeChange,
    pending,
    webOrigin,
}: {
    mode: ThemeMode;
    onLogin: (values: Credentials) => Promise<void>;
    onModeChange: (mode: ThemeMode) => void;
    pending: boolean;
    webOrigin: string | null;
}) {
    const [form] = Form.useForm<Credentials>();
    const [error, setError] = useState<string>();

    return (
        <main className="auth-page">
            <LoginBrandPanel />
            <div className="auth-theme">
                <Segmented
                    aria-label="主题模式"
                    className="theme-switcher"
                    options={[
                        { label: "跟随系统", value: "system" },
                        { label: <Sun size={14} aria-label="浅色" />, value: "light" },
                        { label: <Moon size={14} aria-label="深色" />, value: "dark" },
                    ]}
                    value={mode}
                    onChange={(value) => onModeChange(value as ThemeMode)}
                />
            </div>
            <div className="auth-main">
                <section className="auth-panel" aria-labelledby="login-title">
                    <div className="auth-brand">
                        <span aria-hidden="true" className="shell-brand-mark">
                            V
                        </span>
                        <span>Visora 管理后台</span>
                    </div>
                    <Typography.Title id="login-title" level={1}>
                        登录管理后台
                    </Typography.Title>
                    <Typography.Paragraph className="auth-copy">
                        使用平台账号继续。管理员权限由服务端确认。
                    </Typography.Paragraph>
                    {error ? <Alert className="auth-alert" type="error" showIcon message={error} /> : null}
                    <Form
                        form={form}
                        layout="vertical"
                        requiredMark={false}
                        onFinish={async (values) => {
                            setError(undefined);
                            try {
                                await onLogin(values);
                            } catch (loginError) {
                                setError(errorMessage(loginError, "登录未完成，请重试。"));
                            }
                        }}
                    >
                        <Form.Item
                            label="邮箱"
                            name="email"
                            rules={[
                                { required: true, message: "请输入邮箱。" },
                                { type: "email", message: "请输入有效的邮箱地址。" },
                            ]}
                        >
                            <Input
                                autoComplete="username"
                                autoFocus
                                disabled={pending}
                                prefix={<Mail aria-hidden="true" size={16} />}
                                size="large"
                                type="email"
                            />
                        </Form.Item>
                        <Form.Item label="密码" name="password" rules={[{ required: true, message: "请输入密码。" }]}>
                            <Input.Password
                                autoComplete="current-password"
                                disabled={pending}
                                prefix={<KeyRound aria-hidden="true" size={16} />}
                                size="large"
                            />
                        </Form.Item>
                        <div className="auth-row">
                            <span aria-disabled="true" className="auth-disabled">
                                忘记密码？
                            </span>
                        </div>
                        <Button block htmlType="submit" loading={pending} size="large" type="primary">
                            登录
                        </Button>
                    </Form>
                    <p className="auth-note">后台账号由已有管理员创建，此页不提供注册；忘记密码需联系管理员重置。</p>
                    {webOrigin ? (
                        <Button className="auth-back" type="text" onClick={() => window.location.assign(webOrigin)}>
                            <ArrowLeft aria-hidden="true" size={14} />
                            返回创作台
                        </Button>
                    ) : null}
                </section>
            </div>
        </main>
    );
}
