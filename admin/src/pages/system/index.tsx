import { Alert, Button, Form, Input, Modal, Skeleton, Tabs, Typography, type TableColumnsType } from "../../components/ui/heroui-compat";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CopyButton } from "../../components/copy-button";
import { DataConsole } from "../../components/data-console";
import { PageHeading } from "../../components/page-heading";
import { SealBadge } from "../../components/seal-badge";
import { useCursorList } from "../../hooks/use-cursor-list";
import { errorMessage } from "../../lib/error-message";
import { formatDateTime } from "../../lib/format";
import { createRequestGate } from "../../lib/request-gate";
import { ADMIN_ROUTES, PLATFORM_MODULES } from "../../routes";
import { api, ApiError, type Credentials, type PermissionRule, type User } from "../../services/api/platform";

type Notice = { type: "success" | "error"; message: string };

export function SystemPage({
    onForbidden,
    onUnauthorized,
    sessionToken,
}: {
    onForbidden: () => void;
    onUnauthorized: () => void;
    sessionToken: number;
}) {
    const [notice, setNotice] = useState<Notice>();
    const [createOpen, setCreateOpen] = useState(false);
    const [createPending, setCreatePending] = useState(false);
    const [createError, setCreateError] = useState<string>();
    const [createForm] = Form.useForm<Credentials>();

    const [rules, setRules] = useState<PermissionRule[]>([]);
    const [rulesLoading, setRulesLoading] = useState(true);
    const [rulesError, setRulesError] = useState<string>();

    const rulesGate = useRef(createRequestGate());

    const report = useCallback(
        (thrown: unknown, set: (message: string) => void, fallback: string) => {
            if (thrown instanceof ApiError && thrown.status === 401) {
                onUnauthorized();
                return;
            }
            if (thrown instanceof ApiError && thrown.status === 403) {
                onForbidden();
                return;
            }
            set(errorMessage(thrown, fallback));
        },
        [onForbidden, onUnauthorized],
    );

    const loadRules = useCallback(async () => {
        const ticket = rulesGate.current.issue();
        setRulesLoading(true);
        setRulesError(undefined);

        try {
            const result = await api.listPermissions();
            if (rulesGate.current.isCurrent(ticket)) {
                setRules(result.items);
            }
        } catch (thrown) {
            if (rulesGate.current.isCurrent(ticket)) {
                report(thrown, setRulesError, "授权矩阵加载失败，请重试。");
            }
        } finally {
            if (rulesGate.current.isCurrent(ticket)) {
                setRulesLoading(false);
            }
        }
    }, [report]);

    useEffect(() => {
        void loadRules();
        return () => rulesGate.current.invalidate();
    }, [loadRules, sessionToken]);

    const load = useCallback((cursor: string | null, signal: AbortSignal) => api.listAdmins({ cursor }, signal), []);

    const list = useCursorList<User>({ load, onForbidden, onUnauthorized, resetKey: sessionToken });
    const { reload, setItems } = list;

    const handleCreate = async (values: Credentials) => {
        setCreatePending(true);
        setCreateError(undefined);

        try {
            const result = await api.createAdminAccount(values);
            createForm.resetFields();
            setCreateOpen(false);
            setNotice({ type: "success", message: `已创建后台账号：${result.user.email}` });
            reload();
        } catch (thrown) {
            report(thrown, setCreateError, "创建未完成，请检查输入后重试。");
        } finally {
            setCreatePending(false);
        }
    };

    const toggleStatus = async (target: User) => {
        const next = target.status === "active" ? "disabled" : "active";
        setNotice(undefined);

        try {
            const result = await api.updateAdminStatus(target.id, next);
            setItems((current) => current.map((item) => (item.id === result.user.id ? result.user : item)));
            setNotice({ type: "success", message: next === "disabled" ? "账号已停用。" : "账号已恢复。" });
        } catch (thrown) {
            // 这三类是服务端的账号保护规则，属于预期内拒绝，按业务提示展示即可。
            if (
                thrown instanceof ApiError &&
                (thrown.code === "LAST_ADMIN" || thrown.code === "SELF_ACTION" || thrown.code === "USER_PROTECTED")
            ) {
                setNotice({ type: "error", message: errorMessage(thrown) });
                return;
            }
            report(thrown, (message) => setNotice({ type: "error", message }), "状态更新未完成，请重试。");
        }
    };

    const accountColumns: TableColumnsType<User> = [
        {
            title: "账号",
            dataIndex: "email",
            key: "email",
            render: (email: string, row) => (
                <div className="user-cell">
                    <span className="user-cell-mail">
                        {email}
                        <CopyButton label="复制邮箱" value={email} />
                    </span>
                    <small>
                        {row.id}
                        <CopyButton label="复制账号 ID" value={row.id} />
                    </small>
                </div>
            ),
        },
        {
            title: "状态",
            dataIndex: "status",
            key: "status",
            width: 118,
            render: (status: User["status"]) => (
                <SealBadge status={status}>{status === "active" ? "正常" : "已停用"}</SealBadge>
            ),
        },
        {
            title: "创建时间",
            dataIndex: "createdAt",
            key: "createdAt",
            width: 186,
            render: (createdAt: string) => <time dateTime={createdAt}>{formatDateTime(createdAt)}</time>,
        },
        {
            title: "操作",
            key: "actions",
            width: 110,
            align: "right",
            render: (_, row) => (
                <Button danger={row.status === "active"} size="small" type="text" onClick={() => void toggleStatus(row)}>
                    {row.status === "active" ? "停用" : "恢复"}
                </Button>
            ),
        },
    ];

    const accountsTab = (
        <>
            {notice ? (
                <Alert
                    className="page-alert"
                    closable
                    message={notice.message}
                    showIcon
                    type={notice.type}
                    onClose={() => setNotice(undefined)}
                />
            ) : null}
            <DataConsole<User>
                actions={
                    <Button
                        icon={<Plus aria-hidden="true" size={16} />}
                        type="primary"
                        onClick={() => {
                            setCreateError(undefined);
                            setCreateOpen(true);
                        }}
                    >
                        新建后台账号
                    </Button>
                }
                columns={accountColumns}
                emptyText="没有后台账号"
                label="后台账号列表"
                list={list}
                rowKey="id"
                scrollX={860}
            />
        </>
    );

    const menuTab = (
        <section className="panel" aria-labelledby="menu-title">
            <div className="panel-head">
                <h2 id="menu-title">菜单功能</h2>
                <span className="hint">导航 {ADMIN_ROUTES.length} 项</span>
            </div>
            <table className="module-table">
                <thead>
                    <tr>
                        <th scope="col">分组</th>
                        <th scope="col">菜单</th>
                        <th scope="col">路由</th>
                        <th scope="col">状态</th>
                    </tr>
                </thead>
                <tbody>
                    {ADMIN_ROUTES.map((route) => (
                        <tr key={route.path}>
                            <td>{route.section}</td>
                            <th scope="row">{route.title}</th>
                            <td className="module-iteration">{route.path}</td>
                            <td>
                                <SealBadge status="active">已开通</SealBadge>
                            </td>
                        </tr>
                    ))}
                    {PLATFORM_MODULES.filter((module) => module.state === "planned").map((module) => (
                        <tr key={module.name}>
                            <td>规划中</td>
                            <th scope="row">{module.name}</th>
                            <td className="module-iteration">{module.iteration}</td>
                            <td>
                                <SealBadge status="disabled">未接入</SealBadge>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="panel-note">
                未接入的模块只登记迭代编号，不给出可点击入口，避免打开空白页。
            </p>
        </section>
    );

    const rulesTab = rulesError ? (
        <Alert
            action={
                <Button size="small" onClick={() => void loadRules()}>
                    重试
                </Button>
            }
            message={rulesError}
            showIcon
            type="error"
        />
    ) : rulesLoading ? (
        <div className="panel">
            <Skeleton active paragraph={{ rows: 5 }} />
        </div>
    ) : (
        <section className="panel" aria-labelledby="rules-title">
            <div className="panel-head">
                <h2 id="rules-title">角色权限</h2>
                <span className="hint">只读 · 由服务端定义</span>
            </div>
            <table className="module-table">
                <thead>
                    <tr>
                        <th scope="col">分组</th>
                        <th scope="col">能力</th>
                        <th scope="col">接口</th>
                        <th scope="col">普通用户</th>
                        <th scope="col">说明</th>
                    </tr>
                </thead>
                <tbody>
                    {rules.map((rule) => (
                        <tr key={`${rule.group}-${rule.action}`}>
                            <td>{rule.group}</td>
                            <th scope="row">{rule.action}</th>
                            <td className="module-iteration">{rule.endpoint}</td>
                            <td>
                                <SealBadge status={rule.userAllowed ? "active" : "disabled"}>
                                    {rule.userAllowed ? "可用" : "不可用"}
                                </SealBadge>
                            </td>
                            <td className="module-note">{rule.note}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="panel-note">
                这张表是服务端真实校验的结果，不是菜单显示规则：隐藏菜单不等于拦住请求，权限判断始终在接口侧执行。
            </p>
        </section>
    );

    return (
        <>
            <PageHeading copy="后台账号启停、菜单功能登记与服务端授权矩阵。" title="账号管理" />

            <Tabs
                className="page-tabs"
                items={[
                    { children: accountsTab, key: "accounts", label: "后台账号" },
                    { children: menuTab, key: "menus", label: "菜单功能" },
                    { children: rulesTab, key: "rules", label: "角色权限" },
                ]}
            />

            <Modal
                cancelButtonProps={{ disabled: createPending }}
                confirmLoading={createPending}
                okText="创建账号"
                open={createOpen}
                title="新建后台账号"
                onCancel={() => {
                    if (!createPending) {
                        setCreateOpen(false);
                        setCreateError(undefined);
                    }
                }}
                onOk={() => createForm.submit()}
            >
                <Typography.Paragraph className="modal-intro">
                    新账号会以管理员、正常状态创建。后台不能停用自己，也不能停用最后一个在用的管理员。
                </Typography.Paragraph>
                {createError ? <Alert showIcon type="error" message={createError} /> : null}
                <Form<Credentials> form={createForm} layout="vertical" requiredMark={false} onFinish={handleCreate}>
                    <Form.Item label="邮箱" name="email" rules={[{ required: true, message: "请输入邮箱。" }]}>
                        <Input autoComplete="username" type="email" />
                    </Form.Item>
                    <Form.Item label="初始密码" name="password" rules={[{ required: true, message: "请输入初始密码。" }]}>
                        <Input.Password autoComplete="new-password" />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
}
