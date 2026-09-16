import { Alert, Button, Form, Input, Modal, Typography, type TableColumnsType } from "../../components/ui/heroui-compat";
import { Coins, Plus, Search, X } from "lucide-react";
import { useCallback, useState } from "react";
import { CopyButton } from "../../components/copy-button";
import { DataConsole } from "../../components/data-console";
import { PageHeading } from "../../components/page-heading";
import { PointsDialog } from "../../components/points-dialog";
import { SealBadge } from "../../components/seal-badge";
import { useCursorList } from "../../hooks/use-cursor-list";
import { errorMessage } from "../../lib/error-message";
import { formatDateTime, formatPoints } from "../../lib/format";
import { api, ApiError, type Credentials, type User, type UserStatus } from "../../services/api/platform";

type Notice = { type: "success" | "error"; message: string };
type StatusTarget = Pick<User, "email" | "id" | "status">;

export function UsersPage({
    onForbidden,
    onUnauthorized,
    sessionToken,
}: {
    onForbidden: () => void;
    onUnauthorized: () => void;
    sessionToken: number;
}) {
    const [query, setQuery] = useState("");
    const [appliedQuery, setAppliedQuery] = useState("");
    const [notice, setNotice] = useState<Notice>();
    const [createOpen, setCreateOpen] = useState(false);
    const [createSubmitting, setCreateSubmitting] = useState(false);
    const [createError, setCreateError] = useState<string>();
    const [statusTarget, setStatusTarget] = useState<StatusTarget>();
    const [statusSubmitting, setStatusSubmitting] = useState(false);
    const [statusError, setStatusError] = useState<string>();
    const [pointsTarget, setPointsTarget] = useState<Pick<User, "email" | "id">>();
    const [createForm] = Form.useForm<Credentials>();

    const load = useCallback(
        (cursor: string | null, signal: AbortSignal) =>
            api.listUsers({ cursor, email: appliedQuery || undefined }, signal),
        [appliedQuery],
    );

    const list = useCursorList<User>({ load, onForbidden, onUnauthorized, resetKey: sessionToken });
    const { reload, setItems } = list;

    const handleCreate = async (values: Credentials) => {
        setCreateSubmitting(true);
        setCreateError(undefined);

        try {
            const result = await api.createUser(values);
            createForm.resetFields();
            setCreateOpen(false);
            setNotice({ type: "success", message: `已创建普通用户：${result.user.email}` });
            reload();
        } catch (thrown) {
            if (thrown instanceof ApiError && thrown.status === 401) {
                onUnauthorized();
                return;
            }
            if (thrown instanceof ApiError && thrown.status === 403) {
                onForbidden();
                return;
            }
            setCreateError(errorMessage(thrown, "创建未完成，请检查输入后重试。"));
        } finally {
            setCreateSubmitting(false);
        }
    };

    const confirmStatus = async () => {
        if (!statusTarget) {
            return;
        }

        const target = statusTarget;
        const nextStatus: UserStatus = target.status === "active" ? "disabled" : "active";
        setStatusSubmitting(true);
        setStatusError(undefined);

        try {
            const result = await api.updateUserStatus(target.id, nextStatus);
            setItems((current) => current.map((item) => (item.id === result.user.id ? result.user : item)));
            setStatusTarget(undefined);
            setNotice({ type: "success", message: nextStatus === "disabled" ? "用户已停用。" : "用户已恢复。" });
        } catch (thrown) {
            if (thrown instanceof ApiError && thrown.status === 401) {
                onUnauthorized();
                return;
            }
            if (thrown instanceof ApiError && thrown.status === 403) {
                onForbidden();
                return;
            }
            setStatusError(errorMessage(thrown, "状态更新未完成，请重试。"));
        } finally {
            setStatusSubmitting(false);
        }
    };

    const columns: TableColumnsType<User> = [
        {
            title: "用户",
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
                        <CopyButton label="复制用户 ID" value={row.id} />
                    </small>
                </div>
            ),
        },
        {
            title: "角色",
            dataIndex: "role",
            key: "role",
            width: 140,
            render: (role: User["role"]) => (
                <span className={role === "admin" ? "role-protected" : "role-user"}>
                    {role === "admin" ? "管理员 · 受保护" : "普通用户"}
                </span>
            ),
        },
        {
            title: "状态",
            dataIndex: "status",
            key: "status",
            width: 110,
            render: (status: UserStatus) => (
                <SealBadge status={status}>{status === "active" ? "正常" : "已停用"}</SealBadge>
            ),
        },
        {
            title: "积分",
            dataIndex: "points",
            key: "points",
            width: 130,
            align: "right",
            render: (points: number) => <span className="num">{formatPoints(points)}</span>,
        },
        {
            title: "创建时间",
            dataIndex: "createdAt",
            key: "createdAt",
            width: 180,
            render: (createdAt: string) => <time dateTime={createdAt}>{formatDateTime(createdAt)}</time>,
        },
        {
            title: "操作",
            key: "actions",
            width: 190,
            align: "right",
            render: (_, row) => (
                <div className="cell-actions cell-actions-end">
                    <Button
                        icon={<Coins aria-hidden="true" size={15} />}
                        size="small"
                        type="text"
                        onClick={() => setPointsTarget({ email: row.email, id: row.id })}
                    >
                        积分
                    </Button>
                    {row.role === "admin" ? (
                        <span className="protected-action" title="管理员账号受保护，不能变更状态">
                            受保护
                        </span>
                    ) : (
                        <Button
                            danger={row.status === "active"}
                            disabled={statusSubmitting}
                            size="small"
                            type="text"
                            onClick={() => {
                                setStatusError(undefined);
                                setStatusTarget({ email: row.email, id: row.id, status: row.status });
                            }}
                        >
                            {row.status === "active" ? "停用" : "恢复"}
                        </Button>
                    )}
                </div>
            ),
        },
    ];

    return (
        <>
            <PageHeading
                action={
                    <Button
                        icon={<Plus aria-hidden="true" size={16} />}
                        type="primary"
                        onClick={() => {
                            setCreateError(undefined);
                            setCreateOpen(true);
                        }}
                    >
                        创建普通用户
                    </Button>
                }
                copy="创建账号、按邮箱精确查询、调整积分、停用或恢复用户状态。"
                title="用户管理"
            />

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
                columns={columns}
                emptyText={appliedQuery ? "没有匹配的用户" : "尚无用户"}
                label="用户列表"
                list={list}
                rowKey="id"
                scrollX={980}
                toolbar={
                    <div className="console-query">
                        <label htmlFor="email-query">按邮箱精确查询</label>
                        <div className="console-query-row">
                            <Input
                                id="email-query"
                                placeholder="name@example.com"
                                type="email"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                onPressEnter={() => setAppliedQuery(query)}
                            />
                            <Button
                                icon={<Search aria-hidden="true" size={16} />}
                                onClick={() => setAppliedQuery(query)}
                            >
                                查询
                            </Button>
                            {query || appliedQuery ? (
                                <Button
                                    aria-label="清除邮箱查询"
                                    icon={<X aria-hidden="true" size={16} />}
                                    type="text"
                                    onClick={() => {
                                        setQuery("");
                                        setAppliedQuery("");
                                    }}
                                >
                                    清除
                                </Button>
                            ) : null}
                        </div>
                    </div>
                }
            />

            <Modal
                cancelButtonProps={{ disabled: createSubmitting }}
                confirmLoading={createSubmitting}
                okText="创建用户"
                open={createOpen}
                title="创建普通用户"
                onCancel={() => setCreateOpen(false)}
                onOk={() => createForm.submit()}
            >
                <Typography.Paragraph className="modal-intro">新账号会以普通用户、正常状态创建。</Typography.Paragraph>
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

            <Modal
                cancelButtonProps={{ disabled: statusSubmitting }}
                confirmLoading={statusSubmitting}
                okButtonProps={{ danger: statusTarget?.status === "active" }}
                okText={statusTarget?.status === "active" ? "确认停用" : "确认恢复"}
                open={Boolean(statusTarget)}
                title={statusTarget?.status === "active" ? "停用用户" : "恢复用户"}
                onCancel={() => {
                    if (!statusSubmitting) {
                        setStatusTarget(undefined);
                        setStatusError(undefined);
                    }
                }}
                onOk={() => void confirmStatus()}
            >
                <Typography.Paragraph>
                    {statusTarget?.status === "active"
                        ? `确认停用 ${statusTarget.email}？该用户现有会话会立即失效。`
                        : `确认恢复 ${statusTarget?.email ?? "该用户"}？恢复不会复活已吊销的旧会话。`}
                </Typography.Paragraph>
                {statusError ? <Alert showIcon type="error" message={statusError} /> : null}
            </Modal>

            {pointsTarget ? (
                <PointsDialog
                    target={pointsTarget}
                    onClose={() => setPointsTarget(undefined)}
                    onDone={(entry) => {
                        setPointsTarget(undefined);
                        setNotice({
                            type: "success",
                            message: `${pointsTarget.email} 积分已更新为 ${formatPoints(entry.balanceAfter)}。`,
                        });
                        reload();
                    }}
                    onForbidden={onForbidden}
                    onUnauthorized={onUnauthorized}
                />
            ) : null}
        </>
    );
}
