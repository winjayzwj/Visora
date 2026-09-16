import { Alert, Button, Skeleton } from "../../components/ui/heroui-compat";
import { useCallback, useEffect, useRef, useState } from "react";
import { CopyButton } from "../../components/copy-button";
import { PageHeading } from "../../components/page-heading";
import { TextType } from "../../components/react-bits/text-type";
import { SealBadge } from "../../components/seal-badge";
import { StatCard } from "../../components/stat-card";
import { errorMessage } from "../../lib/error-message";
import { formatPoints } from "../../lib/format";
import { createRequestGate } from "../../lib/request-gate";
import { ADMIN_ROUTES, PLATFORM_MODULES } from "../../routes";
import { api, ApiError, isAbortError, type OverviewStats, type User } from "../../services/api/platform";
import { SignupChart } from "./signup-chart";

export function DashboardPage({
    onForbidden,
    onUnauthorized,
    sessionToken,
    user,
}: {
    onForbidden: () => void;
    onUnauthorized: () => void;
    sessionToken: number;
    user: User;
}) {
    const gate = useRef(createRequestGate());
    const controller = useRef<AbortController>();

    const [stats, setStats] = useState<OverviewStats>();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>();

    const load = useCallback(async () => {
        controller.current?.abort();
        const next = new AbortController();
        const ticket = gate.current.issue();
        controller.current = next;
        setLoading(true);
        setError(undefined);

        try {
            const result = await api.overview(next.signal);

            if (gate.current.isCurrent(ticket)) {
                setStats(result.stats);
            }
        } catch (thrown) {
            if (isAbortError(thrown) || !gate.current.isCurrent(ticket)) {
                return;
            }
            if (thrown instanceof ApiError && thrown.status === 401) {
                onUnauthorized();
                return;
            }
            if (thrown instanceof ApiError && thrown.status === 403) {
                onForbidden();
                return;
            }

            setError(errorMessage(thrown));
        } finally {
            if (gate.current.isCurrent(ticket)) {
                setLoading(false);
            }
        }
    }, [onForbidden, onUnauthorized]);

    useEffect(() => {
        void load();

        return () => {
            gate.current.invalidate();
            controller.current?.abort();
        };
    }, [load, sessionToken]);

    const ready = PLATFORM_MODULES.filter((module) => module.state === "ready").length;

    return (
        <>
            <PageHeading
                copy="所有数字都来自服务端真实聚合，没有数据来源的指标不在这里出现。"
                title="数据看板"
            />

            {error ? (
                <Alert
                    action={
                        <Button size="small" onClick={() => void load()}>
                            重试
                        </Button>
                    }
                    className="page-alert"
                    message={error}
                    showIcon
                    type="error"
                />
            ) : null}

            {loading && !stats ? (
                <div className="stat-grid">
                    {Array.from({ length: 8 }, (_, index) => (
                        <div className="stat-card" key={index}>
                            <Skeleton active paragraph={false} title={{ width: "62%" }} />
                        </div>
                    ))}
                </div>
            ) : stats ? (
                <div className="stat-grid">
                    <StatCard
                        hint={`活跃 ${formatPoints(stats.activeUsers)} · 停用 ${formatPoints(stats.disabledUsers)}`}
                        label="用户总数"
                        value={stats.totalUsers}
                    />
                    <StatCard hint="按创建时间统计" label="本月新增用户" value={stats.newUsersThisMonth} />
                    <StatCard
                        hint={`活跃 ${formatPoints(stats.activeTeams)} / 共 ${formatPoints(stats.totalTeams)}`}
                        label="团队"
                        value={stats.totalTeams}
                    />
                    <StatCard
                        hint={`上架 ${formatPoints(stats.activeModels)} / 共 ${formatPoints(stats.totalModels)}`}
                        label="AI 模型"
                        value={stats.totalModels}
                    />
                    <StatCard hint="等待审批的会员申请" label="待审申请" value={stats.pendingApplications} />
                    <StatCard hint="仍在有效期内的会员" label="有效会员" value={stats.activeMemberships} />
                    <StatCard hint="累计发放给账号的积分" label="已发放积分" value={stats.issuedPoints} />
                    <StatCard
                        hint={`其中团队池 ${formatPoints(stats.teamPoolPoints)}`}
                        label="账号持有积分"
                        value={stats.outstandingPoints}
                    />
                </div>
            ) : null}

            <div className="panel-split">
                <section className="panel" aria-labelledby="signup-title">
                    <div className="panel-head">
                        <h2 id="signup-title">近 7 日注册</h2>
                        <span className="hint">按 UTC 日期归集</span>
                    </div>
                    {stats ? <SignupChart data={stats.signups} /> : <Skeleton active paragraph={{ rows: 3 }} />}
                </section>

                <section className="panel" aria-labelledby="points-title">
                    <h2 id="points-title">积分概览</h2>
                    {stats ? (
                        <dl className="session-list">
                            <div>
                                <dt>累计发放</dt>
                                <dd className="amount-in">{formatPoints(stats.issuedPoints)}</dd>
                            </div>
                            <div>
                                <dt>累计撤销</dt>
                                <dd className="amount-out">{formatPoints(stats.revokedPoints)}</dd>
                            </div>
                            <div>
                                <dt>账号持有</dt>
                                <dd>{formatPoints(stats.outstandingPoints)}</dd>
                            </div>
                            <div>
                                <dt>团队池</dt>
                                <dd>{formatPoints(stats.teamPoolPoints)}</dd>
                            </div>
                        </dl>
                    ) : (
                        <Skeleton active paragraph={{ rows: 4 }} />
                    )}
                    <p className="panel-note">
                        <TextType delay={420} text="账号积分、团队池、成员已分配是三套独立余额，互不自动兜底。" />
                    </p>
                </section>
            </div>

            <section className="panel" aria-labelledby="modules-title">
                <div className="panel-head">
                    <h2 id="modules-title">平台接入状态</h2>
                    <span className="hint">
                        已接入 {ready} / {PLATFORM_MODULES.length}
                    </span>
                </div>
                <table className="module-table">
                    <thead>
                        <tr>
                            <th scope="col">模块</th>
                            <th scope="col">状态</th>
                            <th scope="col">说明</th>
                            <th scope="col">迭代</th>
                        </tr>
                    </thead>
                    <tbody>
                        {PLATFORM_MODULES.map((module) => (
                            <tr key={module.name}>
                                <th scope="row">{module.name}</th>
                                <td>
                                    <SealBadge status={module.state === "ready" ? "active" : "disabled"}>
                                        {module.state === "ready" ? "已接入" : "未接入"}
                                    </SealBadge>
                                </td>
                                <td className="module-note">{module.note}</td>
                                <td className="module-iteration">{module.iteration}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            <section className="panel" aria-labelledby="session-title">
                <h2 id="session-title">当前会话</h2>
                <dl className="session-list">
                    <div>
                        <dt>登录账号</dt>
                        <dd>
                            {user.email}
                            <CopyButton label="复制登录账号" value={user.email} />
                        </dd>
                    </div>
                    <div>
                        <dt>权限</dt>
                        <dd>{user.role === "admin" ? "管理员" : "普通用户"}</dd>
                    </div>
                    <div>
                        <dt>账号状态</dt>
                        <dd>
                            <SealBadge status={user.status}>{user.status === "active" ? "正常" : "已停用"}</SealBadge>
                        </dd>
                    </div>
                    <div>
                        <dt>可用积分</dt>
                        <dd>{formatPoints(user.points)}</dd>
                    </div>
                </dl>
                <p className="panel-note">
                    停用账号会立即吊销该用户现有会话；管理员账号受保护，不能在后台停用。导航共 {ADMIN_ROUTES.length} 个页面。
                </p>
            </section>
        </>
    );
}
