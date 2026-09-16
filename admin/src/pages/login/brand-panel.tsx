import { KeyRound, ShieldCheck, Users } from "lucide-react";
import { InkArtwork } from "../../components/ink-artwork";
import { InkMask } from "../../components/ink-mask";
import { BlurText } from "../../components/react-bits/blur-text";
import { TextType } from "../../components/react-bits/text-type";

const FEATURES = [
    { icon: Users, title: "用户管理", desc: "创建、精确搜索、停用与恢复" },
    { icon: ShieldCheck, title: "服务端鉴权", desc: "管理员动作在服务端确认" },
    { icon: KeyRound, title: "会话失效", desc: "停用后旧会话立即不可用" },
];

export function LoginBrandPanel() {
    return (
        <aside className="auth-aside">
            <div className="auth-aside-brand">
                <span aria-hidden="true" className="shell-brand-mark">
                    V
                </span>
                <div>
                    <div className="auth-aside-name">Visora</div>
                    <div className="auth-aside-sub">管理后台</div>
                </div>
            </div>

            <p className="auth-aside-eyebrow">账号 · 权限 · 审计</p>
            <h2 className="auth-aside-title">
                <TextType delay={220} text="一个后台，管住平台入口。" />
            </h2>
            <p className="auth-aside-copy">
                <BlurText text="创建与停用账号、维护用户状态、核对身份与权限。管理员动作全部由服务端鉴权，不依赖隐藏菜单。" />
            </p>

            <InkMask className="auth-aside-art">
                <InkArtwork />
                <span className="auth-aside-hint">移动光标擦开纸面</span>
            </InkMask>

            <div className="auth-aside-features">
                {FEATURES.map(({ icon: Icon, title, desc }) => (
                    <div className="auth-feature" key={title}>
                        <Icon aria-hidden="true" size={16} />
                        <div className="auth-feature-title">{title}</div>
                        <div className="auth-feature-desc">{desc}</div>
                    </div>
                ))}
            </div>
        </aside>
    );
}
