import { useEffect, useState } from "react";
import { Avatar, Button, Drawer, Form, InputGroup, Label, Skeleton, TextField } from "@heroui/react";
import { Check, CircleDollarSign, Link2, LogOut, Mail, PencilLine, Sparkles, UserRound, X } from "lucide-react";

import { usePlatformAuthStore } from "@/stores/use-platform-auth-store";

export function PlatformAccountDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
    const user = usePlatformAuthStore((state) => state.user);
    const checking = usePlatformAuthStore((state) => state.checking);
    const loggingOut = usePlatformAuthStore((state) => state.loggingOut);
    const updatingProfile = usePlatformAuthStore((state) => state.updatingProfile);
    const error = usePlatformAuthStore((state) => state.error);
    const check = usePlatformAuthStore((state) => state.check);
    const logout = usePlatformAuthStore((state) => state.logout);
    const updateProfile = usePlatformAuthStore((state) => state.updateProfile);
    const [loading, setLoading] = useState(false);
    const [profile, setProfile] = useState({ name: "", avatarUrl: "" });

    useEffect(() => {
        if (user) setProfile({ name: user.name, avatarUrl: user.avatarUrl });
    }, [user]);

    useEffect(() => {
        if (!open || !user) return;
        let active = true;
        setLoading(true);
        void check()
            .catch(() => undefined)
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [check, open, user?.id]);

    if (!user) return null;

    const saving = updatingProfile || loggingOut;
    const name = profile.name.trim() || user.email.split("@")[0] || "映序用户";
    const save = async () => {
        try {
            await updateProfile({ name: profile.name.trim(), avatarUrl: profile.avatarUrl.trim() });
        } catch {}
    };
    const signOut = async () => {
        try {
            await logout();
            onClose();
        } catch {}
    };

    return (
        <Drawer.Backdrop isOpen={open} onOpenChange={(next) => !next && onClose()}>
            <Drawer.Content placement="right">
                <Drawer.Dialog className="w-[min(100vw,440px)] max-w-full">
                    <Drawer.Header className="!flex-row items-center justify-between gap-4">
                        <div>
                            <Drawer.Heading>账户</Drawer.Heading>
                            <p className="mt-1 text-xs text-muted">管理你的映序创作身份</p>
                        </div>
                        <Button slot="close" isIconOnly variant="tertiary" aria-label="关闭账户抽屉" className="size-8 min-w-8 !rounded-lg !p-0">
                            <X className="size-4" strokeWidth={1.75} />
                        </Button>
                    </Drawer.Header>
                    <Drawer.Body className="min-h-0 overflow-y-auto">
                        {loading || checking ? <AccountSkeleton /> : <AccountProfile name={name} profile={profile} setProfile={setProfile} user={user} saving={saving} error={error?.message} onSave={() => void save()} />}
                    </Drawer.Body>
                    <Drawer.Footer className="border-t border-border">
                        <Button fullWidth variant="danger-soft" isDisabled={saving} isPending={loggingOut} onPress={() => void signOut()}>
                            <LogOut className="size-4" />
                            退出登录
                        </Button>
                    </Drawer.Footer>
                </Drawer.Dialog>
            </Drawer.Content>
        </Drawer.Backdrop>
    );
}

function AccountProfile({
    name,
    profile,
    setProfile,
    user,
    saving,
    error,
    onSave,
}: {
    name: string;
    profile: { name: string; avatarUrl: string };
    setProfile: (profile: { name: string; avatarUrl: string }) => void;
    user: NonNullable<ReturnType<typeof usePlatformAuthStore.getState>["user"]>;
    saving: boolean;
    error?: string;
    onSave: () => void;
}) {
    return (
        <div className="space-y-7 pb-2">
            <section className="flex items-center gap-4 rounded-xl bg-surface-secondary p-4">
                <Avatar size="lg">
                    {profile.avatarUrl ? <Avatar.Image src={profile.avatarUrl} alt="账户头像" /> : null}
                    <Avatar.Fallback>{name.slice(0, 1).toUpperCase()}</Avatar.Fallback>
                </Avatar>
                <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-foreground">{name}</h2>
                    <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted">
                        <Mail className="size-3.5 shrink-0" />
                        {user.email}
                    </p>
                </div>
            </section>

            <Form
                className="space-y-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    onSave();
                }}
            >
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <PencilLine className="size-4" />
                    基本资料
                </div>
                <TextField className="flex flex-col gap-2" fullWidth isDisabled={saving}>
                    <Label className="text-[13px] font-medium text-foreground">显示名称</Label>
                    <InputGroup fullWidth>
                        <InputGroup.Prefix>
                            <UserRound className="size-4 text-muted" />
                        </InputGroup.Prefix>
                        <InputGroup.Input value={profile.name} placeholder="为创作署名" autoComplete="name" onChange={(event) => setProfile({ ...profile, name: event.target.value })} />
                    </InputGroup>
                </TextField>
                <TextField className="flex flex-col gap-2" fullWidth isDisabled={saving}>
                    <Label className="text-[13px] font-medium text-foreground">头像链接</Label>
                    <InputGroup fullWidth>
                        <InputGroup.Prefix>
                            <Link2 className="size-4 text-muted" />
                        </InputGroup.Prefix>
                        <InputGroup.Input type="url" inputMode="url" placeholder="https://…" value={profile.avatarUrl} onChange={(event) => setProfile({ ...profile, avatarUrl: event.target.value })} />
                    </InputGroup>
                </TextField>
                {error ? (
                    <p role="alert" className="text-sm leading-6 text-danger">
                        {error}
                    </p>
                ) : null}
                <Button type="submit" fullWidth variant="primary" isDisabled={saving} isPending={saving}>
                    {!saving && <Check className="size-4" />}
                    保存资料
                </Button>
            </Form>

            <section aria-label="账户权益" className="grid grid-cols-2 gap-3">
                <AccountStat icon={CircleDollarSign} label="可用积分" value={new Intl.NumberFormat("zh-CN").format(user.points)} />
                <AccountStat icon={Sparkles} label="账户角色" value={user.role === "admin" ? "管理员" : "创作者"} />
            </section>

            <section aria-labelledby="account-connections" className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 id="account-connections" className="text-sm font-semibold text-foreground">
                        第三方绑定
                    </h2>
                    <span className="text-xs text-muted">暂未接入</span>
                </div>
                <div className="divide-y divide-border rounded-xl border border-border">
                    {["Google", "Apple"].map((provider) => (
                        <div key={provider} className="flex items-center justify-between gap-3 px-4 py-3">
                            <span className="text-sm font-medium text-foreground">{provider}</span>
                            <span className="text-xs text-muted">未绑定</span>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}

function AccountStat({ icon: Icon, label, value }: { icon: typeof CircleDollarSign; label: string; value: string }) {
    return (
        <div className="rounded-xl border border-border p-3">
            <Icon className="size-4 text-muted" />
            <p className="mt-4 text-xs text-muted">{label}</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
        </div>
    );
}

function AccountSkeleton() {
    return (
        <div className="space-y-7" aria-label="正在加载账户资料">
            <div className="flex items-center gap-4 rounded-xl bg-surface-secondary p-4">
                <Skeleton className="size-14 rounded-full" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-28 rounded-md" />
                    <Skeleton className="h-3 w-48 rounded-md" />
                </div>
            </div>
            <div className="space-y-4">
                <Skeleton className="h-4 w-20 rounded-md" />
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
            </div>
            <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
            </div>
            <div className="space-y-3">
                <Skeleton className="h-4 w-24 rounded-md" />
                <Skeleton className="h-24 rounded-xl" />
            </div>
        </div>
    );
}
