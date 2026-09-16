import { Alert, Button, Drawer, Empty, Form, Input, InputNumber, Modal, Radio, Spin, Typography, type TableColumnsType } from "../../components/ui/heroui-compat";
import { Coins, Plus, UserMinus, UserPlus, UsersRound } from "lucide-react";
import { useCallback, useState } from "react";
import { CopyButton } from "../../components/copy-button";
import { DataConsole } from "../../components/data-console";
import { PageHeading } from "../../components/page-heading";
import { SealBadge } from "../../components/seal-badge";
import { useCursorList } from "../../hooks/use-cursor-list";
import { errorMessage } from "../../lib/error-message";
import { formatDateTime, formatPoints } from "../../lib/format";
import { api, ApiError, type Team, type TeamMember } from "../../services/api/platform";

type Notice = { type: "success" | "error"; message: string };
type CreateValues = { adminUserId: string; name: string };
type TopUpValues = { amount: number; note?: string };
type AllocationValues = { amount: number; note?: string };

// 团队积分有三个去处：充进池子、分配给成员、从成员回收。三者都记流水，
// 池子不足或成员余额不足时服务端直接失败，不做截断。
export function TeamsPage({
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
    const [createForm] = Form.useForm<CreateValues>();

    const [topUpTarget, setTopUpTarget] = useState<Team>();
    const [topUpPending, setTopUpPending] = useState(false);
    const [topUpError, setTopUpError] = useState<string>();
    const [topUpForm] = Form.useForm<TopUpValues>();

    const [dissolveTarget, setDissolveTarget] = useState<Team>();
    const [dissolvePending, setDissolvePending] = useState(false);
    const [dissolveError, setDissolveError] = useState<string>();

    const [membersTeam, setMembersTeam] = useState<Team>();
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [membersLoading, setMembersLoading] = useState(false);
    const [membersError, setMembersError] = useState<string>();
    const [addPending, setAddPending] = useState(false);
    const [addError, setAddError] = useState<string>();
    const [addForm] = Form.useForm<{ userId: string }>();

    const [allocationTarget, setAllocationTarget] = useState<TeamMember>();
    const [allocationMode, setAllocationMode] = useState<"allocate" | "revoke">("allocate");
    const [allocationPending, setAllocationPending] = useState(false);
    const [allocationError, setAllocationError] = useState<string>();
    const [allocationForm] = Form.useForm<AllocationValues>();

    const load = useCallback(
        (cursor: string | null, signal: AbortSignal) => api.listTeams({ cursor }, signal),
        [],
    );

    const list = useCursorList<Team>({ load, onForbidden, onUnauthorized, resetKey: sessionToken });
    const { reload, setItems } = list;

    // 把 401/403 之外的服务端错误统一转成可读文案，写操作共用。
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

    const loadMembers = useCallback(
        async (team: Team) => {
            setMembersLoading(true);
            setMembersError(undefined);

            try {
                const result = await api.listTeamMembers(team.id);
                setMembers(result.items);
            } catch (thrown) {
                if (thrown instanceof ApiError && thrown.status === 401) {
                    onUnauthorized();
                    return;
                }
                if (thrown instanceof ApiError && thrown.status === 403) {
                    onForbidden();
                    return;
                }
                setMembersError(errorMessage(thrown));
            } finally {
                setMembersLoading(false);
            }
        },
        [onForbidden, onUnauthorized],
    );

    const openMembers = (team: Team) => {
        setMembersTeam(team);
        setMembers([]);
        setAddError(undefined);
        void loadMembers(team);
    };

    const handleCreate = async (values: CreateValues) => {
        setCreatePending(true);
        setCreateError(undefined);

        try {
            const result = await api.createTeam({ adminUserId: values.adminUserId.trim(), name: values.name.trim() });
            createForm.resetFields();
            setCreateOpen(false);
            setNotice({ type: "success", message: `已创建团队：${result.team.name}` });
            reload();
        } catch (thrown) {
            report(thrown, setCreateError, "创建未完成，请检查输入后重试。");
        } finally {
            setCreatePending(false);
        }
    };

    const handleTopUp = async (values: TopUpValues) => {
        if (!topUpTarget) {
            return;
        }

        setTopUpPending(true);
        setTopUpError(undefined);

        try {
            const result = await api.topUpTeam(topUpTarget.id, { amount: values.amount, note: values.note });
            setItems((current) => current.map((item) => (item.id === result.team.id ? result.team : item)));
            setTopUpTarget(undefined);
            topUpForm.resetFields();
            setNotice({ type: "success", message: `${result.team.name} 团队池已更新为 ${formatPoints(result.team.pointsPool)}。` });
        } catch (thrown) {
            report(thrown, setTopUpError, "充入未完成，请重试。");
        } finally {
            setTopUpPending(false);
        }
    };

    const confirmDissolve = async () => {
        if (!dissolveTarget) {
            return;
        }

        setDissolvePending(true);
        setDissolveError(undefined);

        try {
            const result = await api.dissolveTeam(dissolveTarget.id);
            setItems((current) => current.map((item) => (item.id === result.team.id ? result.team : item)));
            setDissolveTarget(undefined);
            setNotice({ type: "success", message: `${result.team.name} 已解散，积分池与成员关系按需求保留。` });
        } catch (thrown) {
            report(thrown, setDissolveError, "解散未完成，请重试。");
        } finally {
            setDissolvePending(false);
        }
    };

    const handleAddMember = async (values: { userId: string }) => {
        if (!membersTeam) {
            return;
        }

        setAddPending(true);
        setAddError(undefined);

        try {
            await api.addTeamMember(membersTeam.id, values.userId.trim());
            addForm.resetFields();
            await loadMembers(membersTeam);
            reload();
        } catch (thrown) {
            report(thrown, setAddError, "添加成员未完成，请重试。");
        } finally {
            setAddPending(false);
        }
    };

    const handleRemoveMember = async (member: TeamMember) => {
        if (!membersTeam) {
            return;
        }

        setMembersError(undefined);

        try {
            await api.removeTeamMember(membersTeam.id, member.userId);
            await loadMembers(membersTeam);
            reload();
        } catch (thrown) {
            report(thrown, setMembersError, "移出成员未完成，请重试。");
        }
    };

    const handleAllocation = async (values: AllocationValues) => {
        if (!membersTeam || !allocationTarget) {
            return;
        }

        setAllocationPending(true);
        setAllocationError(undefined);

        try {
            const payload = { amount: values.amount, note: values.note, userId: allocationTarget.userId };
            await (allocationMode === "allocate"
                ? api.allocateTeamPoints(membersTeam.id, payload)
                : api.revokeTeamAllocation(membersTeam.id, payload));
            setAllocationTarget(undefined);
            allocationForm.resetFields();
            await loadMembers(membersTeam);
            reload();
        } catch (thrown) {
            report(thrown, setAllocationError, "积分操作未完成，请重试。");
        } finally {
            setAllocationPending(false);
        }
    };

    const columns: TableColumnsType<Team> = [
        {
            title: "团队",
            dataIndex: "name",
            key: "name",
            render: (name: string, row) => (
                <div className="user-cell">
                    <span className="user-cell-mail">
                        {name}
                        <CopyButton label="复制团队 ID" value={row.id} />
                    </span>
                    <small>{row.id}</small>
                </div>
            ),
        },
        {
            title: "管理员",
            dataIndex: "adminEmail",
            key: "adminEmail",
            width: 200,
            render: (email: string, row) => (
                <span className="user-cell-mail">
                    {email}
                    <CopyButton label="复制管理员 ID" value={row.adminUserId} />
                </span>
            ),
        },
        {
            title: "成员",
            dataIndex: "memberCount",
            key: "memberCount",
            width: 84,
            align: "right",
            render: (count: number) => <span className="num">{count}</span>,
        },
        {
            title: "积分池",
            dataIndex: "pointsPool",
            key: "pointsPool",
            width: 130,
            align: "right",
            render: (pool: number) => <span className="num">{formatPoints(pool)}</span>,
        },
        {
            title: "已分配",
            dataIndex: "allocatedTotal",
            key: "allocatedTotal",
            width: 130,
            align: "right",
            render: (total: number, row) => (
                <span className="num" title={`本月已分配 ${formatPoints(row.allocatedThisMonth)}`}>
                    {formatPoints(total)}
                </span>
            ),
        },
        {
            title: "状态",
            dataIndex: "status",
            key: "status",
            width: 104,
            render: (status: Team["status"]) => (
                <SealBadge status={status}>{status === "active" ? "正常" : "已解散"}</SealBadge>
            ),
        },
        {
            title: "创建时间",
            dataIndex: "createdAt",
            key: "createdAt",
            width: 176,
            render: (createdAt: string) => <time dateTime={createdAt}>{formatDateTime(createdAt)}</time>,
        },
        {
            title: "操作",
            key: "actions",
            width: 236,
            align: "right",
            render: (_, row) => (
                <div className="cell-actions cell-actions-end">
                    <Button
                        icon={<UsersRound aria-hidden="true" size={15} />}
                        size="small"
                        type="text"
                        onClick={() => openMembers(row)}
                    >
                        成员
                    </Button>
                    <Button
                        disabled={row.status !== "active"}
                        icon={<Coins aria-hidden="true" size={15} />}
                        size="small"
                        type="text"
                        onClick={() => {
                            setTopUpError(undefined);
                            setTopUpTarget(row);
                        }}
                    >
                        充值
                    </Button>
                    <Button
                        danger
                        disabled={row.status !== "active"}
                        size="small"
                        type="text"
                        onClick={() => {
                            setDissolveError(undefined);
                            setDissolveTarget(row);
                        }}
                    >
                        解散
                    </Button>
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
                        创建团队
                    </Button>
                }
                copy="团队积分分池子与成员分配两层，各自独立记流水，互不自动兜底。"
                title="团队管理"
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

            <DataConsole<Team>
                columns={columns}
                emptyText="尚无团队"
                label="团队列表"
                list={list}
                rowKey="id"
                scrollX={1240}
            />

            <Modal
                cancelButtonProps={{ disabled: createPending }}
                confirmLoading={createPending}
                okText="创建团队"
                open={createOpen}
                title="创建团队"
                onCancel={() => setCreateOpen(false)}
                onOk={() => createForm.submit()}
            >
                <Typography.Paragraph className="modal-intro">
                    创建后该账号成为团队管理员，团队池初始为 0，需要单独充入。
                </Typography.Paragraph>
                {createError ? <Alert showIcon type="error" message={createError} /> : null}
                <Form<CreateValues> form={createForm} layout="vertical" requiredMark={false} onFinish={handleCreate}>
                    <Form.Item label="团队名称" name="name" rules={[{ required: true, message: "请输入团队名称。" }]}>
                        <Input placeholder="例如：内容生产组" />
                    </Form.Item>
                    <Form.Item label="管理员用户 ID" name="adminUserId" rules={[{ required: true, message: "请输入用户 ID。" }]}>
                        <Input placeholder="用户 ID" />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                cancelButtonProps={{ disabled: topUpPending }}
                confirmLoading={topUpPending}
                okText="确认充入"
                open={Boolean(topUpTarget)}
                title="充入团队池"
                onCancel={() => {
                    if (!topUpPending) {
                        setTopUpTarget(undefined);
                        setTopUpError(undefined);
                    }
                }}
                onOk={() => topUpForm.submit()}
            >
                <Typography.Paragraph className="modal-intro">
                    {topUpTarget ? `${topUpTarget.name} 当前团队池 ${formatPoints(topUpTarget.pointsPool)}。` : null}
                </Typography.Paragraph>
                {topUpError ? <Alert showIcon type="error" message={topUpError} /> : null}
                <Form<TopUpValues>
                    form={topUpForm}
                    initialValues={{ amount: 1000 }}
                    layout="vertical"
                    requiredMark={false}
                    onFinish={handleTopUp}
                >
                    <Form.Item
                        label="充入积分"
                        name="amount"
                        rules={[{ required: true, message: "请输入积分。" }, { type: "number", min: 1, message: "至少 1。" }]}
                    >
                        <InputNumber max={100_000_000} min={1} precision={0} style={{ width: "100%" }} />
                    </Form.Item>
                    <Form.Item label="备注" name="note">
                        <Input placeholder="可选，写入流水便于对账" />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                cancelButtonProps={{ disabled: dissolvePending }}
                confirmLoading={dissolvePending}
                okButtonProps={{ danger: true }}
                okText="确认解散"
                open={Boolean(dissolveTarget)}
                title="解散团队"
                onCancel={() => {
                    if (!dissolvePending) {
                        setDissolveTarget(undefined);
                        setDissolveError(undefined);
                    }
                }}
                onOk={() => void confirmDissolve()}
            >
                <Typography.Paragraph>
                    {dissolveTarget
                        ? `确认解散 ${dissolveTarget.name}？当前团队池 ${formatPoints(dissolveTarget.pointsPool)}、已分配 ${formatPoints(dissolveTarget.allocatedTotal)}。`
                        : null}
                </Typography.Paragraph>
                <Alert
                    className="modal-alert"
                    message="解散只冻结团队状态，积分池与成员关系按需求对照 C07 保留，不会自动清空。"
                    showIcon
                    type="warning"
                />
                {dissolveError ? <Alert showIcon type="error" message={dissolveError} /> : null}
            </Modal>

            <Drawer
                open={Boolean(membersTeam)}
                title={membersTeam ? `${membersTeam.name} · 成员` : "成员"}
                width="min(92vw, 620px)"
                onClose={() => setMembersTeam(undefined)}
            >
                {membersTeam ? (
                    <>
                        <div className="drawer-metrics">
                            <div>
                                <span>团队池</span>
                                <strong className="num">{formatPoints(membersTeam.pointsPool)}</strong>
                            </div>
                            <div>
                                <span>已分配</span>
                                <strong className="num">{formatPoints(membersTeam.allocatedTotal)}</strong>
                            </div>
                            <div>
                                <span>本月已分配</span>
                                <strong className="num">{formatPoints(membersTeam.allocatedThisMonth)}</strong>
                            </div>
                        </div>

                        {membersError ? (
                            <Alert
                                action={
                                    <Button size="small" onClick={() => void loadMembers(membersTeam)}>
                                        重试
                                    </Button>
                                }
                                className="modal-alert"
                                message={membersError}
                                showIcon
                                type="error"
                            />
                        ) : null}

                        <Form<{ userId: string }>
                            className="drawer-add"
                            form={addForm}
                            layout="inline"
                            onFinish={handleAddMember}
                        >
                            <Form.Item
                                name="userId"
                                rules={[{ required: true, message: "请输入用户 ID。" }]}
                                style={{ flex: 1, marginInlineEnd: 8 }}
                            >
                                <Input placeholder="按用户 ID 添加成员" />
                            </Form.Item>
                            <Form.Item style={{ marginInlineEnd: 0 }}>
                                <Button
                                    htmlType="submit"
                                    icon={<UserPlus aria-hidden="true" size={15} />}
                                    loading={addPending}
                                    type="primary"
                                >
                                    添加
                                </Button>
                            </Form.Item>
                        </Form>
                        {addError ? <Alert className="modal-alert" message={addError} showIcon type="error" /> : null}

                        <div className="drawer-table">
                            {membersLoading ? (
                                <div className="drawer-loading">
                                    <Spin size="small" />
                                </div>
                            ) : members.length === 0 ? (
                                <Empty description="团队还没有成员" />
                            ) : (
                                <table className="module-table">
                                    <thead>
                                        <tr>
                                            <th scope="col">成员</th>
                                            <th scope="col">角色</th>
                                            <th scope="col">已分配</th>
                                            <th scope="col">操作</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {members.map((member) => (
                                            <tr key={member.userId}>
                                                <th scope="row">
                                                    <div className="user-cell">
                                                        <span className="user-cell-mail">
                                                            {member.email}
                                                            <CopyButton label="复制成员 ID" value={member.userId} />
                                                        </span>
                                                        <small>{member.userId}</small>
                                                    </div>
                                                </th>
                                                <td>{member.role === "admin" ? "团队管理员" : "成员"}</td>
                                                <td className="num">{formatPoints(member.allocatedPoints)}</td>
                                                <td>
                                                    <div className="cell-actions">
                                                        <Button
                                                            size="small"
                                                            type="text"
                                                            onClick={() => {
                                                                setAllocationMode("allocate");
                                                                setAllocationError(undefined);
                                                                setAllocationTarget(member);
                                                            }}
                                                        >
                                                            分配
                                                        </Button>
                                                        <Button
                                                            disabled={member.allocatedPoints === 0}
                                                            size="small"
                                                            type="text"
                                                            onClick={() => {
                                                                setAllocationMode("revoke");
                                                                setAllocationError(undefined);
                                                                setAllocationTarget(member);
                                                            }}
                                                        >
                                                            回收
                                                        </Button>
                                                        <Button
                                                            danger
                                                            disabled={member.role === "admin"}
                                                            icon={<UserMinus aria-hidden="true" size={14} />}
                                                            size="small"
                                                            title={member.role === "admin" ? "团队管理员不能移出" : undefined}
                                                            type="text"
                                                            onClick={() => void handleRemoveMember(member)}
                                                        >
                                                            移出
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <p className="panel-note">
                            成员还有已分配积分时不能移出，否则积分会凭空悬空；先把积分回收再移出。
                        </p>
                    </>
                ) : null}
            </Drawer>

            <Modal
                cancelButtonProps={{ disabled: allocationPending }}
                confirmLoading={allocationPending}
                okText={allocationMode === "allocate" ? "确认分配" : "确认回收"}
                open={Boolean(allocationTarget)}
                title={allocationMode === "allocate" ? "分配积分" : "回收积分"}
                onCancel={() => {
                    if (!allocationPending) {
                        setAllocationTarget(undefined);
                        setAllocationError(undefined);
                    }
                }}
                onOk={() => allocationForm.submit()}
            >
                <Typography.Paragraph className="modal-intro">
                    {allocationTarget
                        ? `${allocationTarget.email} 当前已分配 ${formatPoints(allocationTarget.allocatedPoints)}。`
                        : null}
                </Typography.Paragraph>
                {allocationError ? <Alert showIcon type="error" message={allocationError} /> : null}
                <Form<AllocationValues>
                    form={allocationForm}
                    initialValues={{ amount: 100 }}
                    layout="vertical"
                    requiredMark={false}
                    onFinish={handleAllocation}
                >
                    {/* 方向由组件状态控制，不挂 name，避免和 Radio 自身绑定冲突。 */}
                    <Form.Item label="方向">
                        <Radio.Group
                            optionType="button"
                            options={[
                                { label: "分配", value: "allocate" },
                                { label: "回收", value: "revoke" },
                            ]}
                            value={allocationMode}
                            onChange={(event) => setAllocationMode(event.target.value as "allocate" | "revoke")}
                        />
                    </Form.Item>
                    <Form.Item
                        label="积分数"
                        name="amount"
                        rules={[{ required: true, message: "请输入积分。" }, { type: "number", min: 1, message: "至少 1。" }]}
                    >
                        <InputNumber max={100_000_000} min={1} precision={0} style={{ width: "100%" }} />
                    </Form.Item>
                    <Form.Item label="备注" name="note">
                        <Input placeholder="可选，写入流水便于对账" />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
}
