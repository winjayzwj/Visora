import {
    Boxes,
    Coins,
    LayoutDashboard,
    ReceiptText,
    ShieldCheck,
    Users,
    UsersRound,
    type LucideIcon,
} from "lucide-react";

export type AdminRoute = {
    path: string;
    title: string;
    section: string;
    icon: LucideIcon;
};

// 导航按后台原型的分组还原：概览 / 用户体系 / AI 资源 / 系统。
// 只有真的能打开的页面才登记在这里；尚未接入的能力在看板的接入状态里说明。
export const ADMIN_ROUTES: AdminRoute[] = [
    { path: "/dashboard", title: "数据看板", section: "概览", icon: LayoutDashboard },
    { path: "/users", title: "用户管理", section: "用户体系", icon: Users },
    { path: "/teams", title: "团队管理", section: "用户体系", icon: UsersRound },
    { path: "/membership", title: "会员管理", section: "用户体系", icon: ShieldCheck },
    { path: "/models", title: "AI 模型管理", section: "AI 资源", icon: Boxes },
    { path: "/points", title: "积分管理", section: "AI 资源", icon: Coins },
    { path: "/system", title: "账号管理", section: "系统", icon: ReceiptText },
];

export const ADMIN_SECTIONS = ["概览", "用户体系", "AI 资源", "系统"] as const;

export function findRoute(pathname: string) {
    return ADMIN_ROUTES.find((route) => pathname === route.path || pathname.startsWith(`${route.path}/`));
}

export type PlatformModule = {
    name: string;
    state: "ready" | "planned";
    note: string;
    iteration: string;
};

// 看板展示的平台接入状态。state 只反映服务端是否真的有对应接口，
// 不用占位数字冒充已实现。
export const PLATFORM_MODULES: PlatformModule[] = [
    { name: "账号与会话", state: "ready", note: "登录、退出、停用后的会话失效由服务端执行", iteration: "P1" },
    { name: "用户管理", state: "ready", note: "创建、精确邮箱查询、游标分页、停用与恢复", iteration: "P1" },
    { name: "积分账务", state: "ready", note: "用户余额、团队池与成员分配三套独立余额，均写流水", iteration: "本轮" },
    { name: "AI 模型目录", state: "ready", note: "模型名称、类型、按次积分报价与启停", iteration: "本轮" },
    { name: "团队管理", state: "ready", note: "成员关系、积分池充入与分配到成员", iteration: "本轮" },
    { name: "会员管理", state: "ready", note: "申请审批、开通赠送与套餐配置", iteration: "本轮" },
    { name: "后台账号与授权", state: "ready", note: "账号启停与服务端授权矩阵（只读）", iteration: "本轮" },
    { name: "项目与素材", state: "planned", note: "云项目快照、图片上传与素材库", iteration: "I01–I03" },
    { name: "生成任务与结算", state: "planned", note: "任务受理、冻结、结算与失败释放", iteration: "I04–I05" },
    { name: "运营指标", state: "planned", note: "受理量、成功槽位与消耗口径", iteration: "I19" },
];
