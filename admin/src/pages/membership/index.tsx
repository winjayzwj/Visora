import {
    Alert,
    Button,
    Empty,
    Form,
    Input,
    InputNumber,
    Modal,
    Segmented,
    Select,
    Skeleton,
    Tabs,
    Typography,
} from "../../components/ui/heroui-compat";
import type { TableColumnsType } from "../../components/ui/heroui-compat";
import { Check, Pencil, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CopyButton } from "../../components/copy-button";
import { DataConsole } from "../../components/data-console";
import { PageHeading } from "../../components/page-heading";
import { SealBadge } from "../../components/seal-badge";
import { useCursorList } from "../../hooks/use-cursor-list";
import { errorMessage } from "../../lib/error-message";
import { formatDateTime, formatPoints } from "../../lib/format";
import { createRequestGate } from "../../lib/request-gate";
import {
    api,
    ApiError,
    type Membership,
    type MembershipApplication,
    type MembershipPlan,
} from "../../services/api/platform";

type Notice = { type: "success" | "error"; message: string };
type PlanValues = {
    code: string;
    name: string;
    description?: string;
    durationDays: number;
    bonusPoints: number;
    features?: string;
    status: "active" | "disabled";
};

const STATUS_FILTERS = [
    { label: "全部", value: "" },
    { label: "待审批", value: "pending" },
    { label: "已通过", value: "approved" },
    { label: "已拒绝", value: "rejected" },
];

export function MembershipPage({
    onForbidden,
    onUnauthorized,
    sessionToken,
}: {
    onForbidden: () => void;
    onUnauthorized: () => void;
    sessionToken: number;
}) {
    const [notice, setNotice] = useState<Notice>();
    const [status, setStatus] = useState("");

    const [plans, setPlans] = useState<MembershipPlan[]>([]);
    const [plansLoading, setPlansLoading] = useState(true);
    const [plansError, setPlansError] = useState<string>();

    const [approveTarget, setApproveTarget] = useState<MembershipApplication>();
    const [approvePlanCode, setApprovePlanCode] = useState<string>();
    const [decidePending, setDecidePending] = useState(false);
    const [decideError, setDecideError] = useState<string>();

    const [planEditing, setPlanEditing] = useState<MembershipPlan | "new">();
    const [planPending, setPlanPending] = useState(false);
    const [planError, setPlanError] = useState<string>();
    const [planForm] = Form.useForm<PlanValues>();

    const plansGate = useRef(createRequestGate());

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

    const loadPlans = useCallback(async () => {
        const ticket = plansGate.current.issue();
        setPlansLoading(true);
        setPlansError(undefined);

        try {
            const result = await api.listPlans();
            if (plansGate.current.isCurrent(ticket)) {
                setPlans(result.items);
            }
        } catch (thrown) {
            if (plansGate.current.isCurrent(ticket)) {
                report(thrown, setPlansError, "套餐加载失败，请重试。");
            }
        } finally {
            if (plansGate.current.isCurrent(ticket)) {
                setPlansLoading(false);
            }
        }
    }, [report]);

    useEffect(() => {
        void loadPlans();
        return () => plansGate.current.invalidate();
    }, [loadPlans, sessionToken]);

    const loadApplications = useCallback(
        (cursor: string | null, signal: AbortSignal) => api.listApplications({ cursor, status: status || undefined }, signal),
        [status],
    );
    const applications = useCursorList<MembershipApplication>({
        load: loadApplications,
        onForbidden,
        onUnauthorized,
        resetKey: sessionToken,
    });

    const loadMemberships = useCallback(
        (cursor: string | null, signal: AbortSignal) => api.listMemberships({ cursor }, signal),
        [],
    );
    const memberships = useCursorList<Membership>({
        load: loadMemberships,
        onForbidden,
        onUnauthorized,
        resetKey: sessionToken,
    });

    const decide = async (application: MembershipApplication, approve: boolean) => {
        setDecidePending(true);
        setDecideError(undefined);

        try {
            const result = approve
                ? await api.approveApplication(application.id, approvePlanCode ?? "")
                : await api.rejectApplication(application.id);
            setApproveTarget(undefined);
            setApprovePlanCode(undefined);
            setNotice({
                type: "success",
                message: approve ? `已通过 ${result.application.userEmail} 的会员申请。` : `已拒绝 ${result.application.userEmail} 的申请。`,
            });
            applications.reload();
            memberships.reload();
        } catch (thrown) {
            report(thrown, setDecideError, "审批未完成，请重试。");
        } finally {
            setDecidePending(false);
        }
    };

    const submitPlan = async (values: PlanValues) => {
        setPlanPending(true);
        setPlanError(undefined);

        try {
            await api.upsertPlan({
                bonusPoints: values.bonusPoints,
                code: values.code.trim(),
                description: values.description?.trim(),
                durationDays: values.durationDays,
                features: (values.features ?? "")
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean),
                name: values.name.trim(),
                status: values.status,
            });
            setPlanEditing(undefined);
            planForm.resetFields();
            setNotice({ type: "success", message: `套餐 ${values.name.trim()} 已保存。` });
            void loadPlans();
        } catch (thrown) {
            report(thrown, setPlanError, "套餐保存失败，请检查输入。");
        } finally {
            setPlanPending(false);
        }
    };

    const applicationColumns: TableColumnsType<MembershipApplication> = [
        {
            title: "申请人",
            dataIndex: "userEmail",
            key: "userEmail",
            render: (email: string, row) => (
                <div className="user-cell">
                    <span className="user-cell-mail">
                        {email}
                        <CopyButton label="复制用户 ID" value={row.userId} />
                    </span>
                    <small>{row.userId}</small>
                </div>
            ),
        },
        { title: "场景", dataIndex: "scene", key: "scene", width: 130 },
        {
            title: "申请理由",
            dataIndex: "reason",
            key: "reason",
            render: (reason: string) => <span className="module-note">{reason || "—"}</span>,
        },
        {
            title: "状态",
            dataIndex: "status",
            key: "status",
            width: 110,
            render: (value: MembershipApplication["status"]) => (
                <SealBadge status={value}>
                    {value === "pending" ? "待审批" : value === "approved" ? "已通过" : "已拒绝"}
                </SealBadge>
            ),
        },
        {
            title: "申请时间",
            dataIndex: "createdAt",
            key: "createdAt",
            width: 176,
            render: (createdAt: string) => <time dateTime={createdAt}>{formatDateTime(createdAt)}</time>,
        },
        {
            title: "操作",
            key: "actions",
            width: 176,
            align: "right",
            render: (_, row) =>
                row.status === "pending" ? (
                    <div className="cell-actions cell-actions-end">
                        <Button
                            icon={<Check aria-hidden="true" size={15} />}
                            size="small"
                            type="text"
                            onClick={() => {
                                setDecideError(undefined);
                                setApprovePlanCode(plans.find((plan) => plan.status === "active")?.code);
                                setApproveTarget(row);
                            }}
                        >
                            通过
                        </Button>
                        <Button
                            danger
                            icon={<X aria-hidden="true" size={15} />}
                            size="small"
                            type="text"
                            onClick={() => void decide(row, false)}
                        >
                            拒绝
                        </Button>
                    </div>
                ) : (
                    <span className="hint">{row.planCode ? `套餐 ${row.planCode}` : "已处理"}</span>
                ),
        },
    ];

    const membershipColumns: TableColumnsType<Membership> = [
        {
            title: "会员",
            dataIndex: "userEmail",
            key: "userEmail",
            render: (email: string, row) => (
                <div className="user-cell">
                    <span className="user-cell-mail">
                        {email}
                        <CopyButton label="复制用户 ID" value={row.userId} />
                    </span>
                    <small>{row.userId}</small>
                </div>
            ),
        },
        {
            title: "套餐",
            dataIndex: "planName",
            key: "planName",
            width: 170,
            render: (name: string, row) => (
                <span>
                    {name}
                    <small className="hint"> · {row.planCode}</small>
                </span>
            ),
        },
        {
            title: "赠送积分",
            dataIndex: "grantedPoints",
            key: "grantedPoints",
            width: 120,
            align: "right",
            render: (points: number) => <span className="num amount-in">{formatPoints(points)}</span>,
        },
        {
            title: "生效时间",
            dataIndex: "startedAt",
            key: "startedAt",
            width: 176,
            render: (value: string) => <time dateTime={value}>{formatDateTime(value)}</time>,
        },
        {
            title: "到期时间",
            dataIndex: "expiresAt",
            key: "expiresAt",
            width: 176,
            render: (value: string) => <time dateTime={value}>{formatDateTime(value)}</time>,
        },
        {
            title: "状态",
            dataIndex: "status",
            key: "status",
            width: 104,
            render: (value: Membership["status"]) => (
                <SealBadge status={value}>
                    {value === "active" ? "有效" : value === "expired" ? "已过期" : "已停用"}
                </SealBadge>
            ),
        },
    ];

    const applicationTab = (
        <DataConsole<MembershipApplication>
            columns={applicationColumns}
            emptyText="没有符合条件的申请"
            label="会员申请列表"
            list={applications}
            rowKey="id"
            scrollX={1120}
            toolbar={
                <div className="console-query">
                    <label>申请状态</label>
                    <div className="console-query-row">
                        <Segmented options={STATUS_FILTERS} value={status} onChange={(value) => setStatus(value as string)} />
                    </div>
                </div>
            }
        />
    );

    const membershipTab = (
        <DataConsole<Membership>
            columns={membershipColumns}
            emptyText="尚无会员"
            label="会员列表"
            list={memberships}
            rowKey="id"
            scrollX={1100}
        />
    );

    const planTab = plansError ? (
        <Alert
            action={
                <Button size="small" onClick={() => void loadPlans()}>
                    重试
                </Button>
            }
            message={plansError}
            showIcon
            type="error"
        />
    ) : plansLoading ? (
        <div className="panel">
            <Skeleton active paragraph={{ rows: 4 }} />
        </div>
    ) : (
        <section className="panel" aria-labelledby="plans-title">
            <div className="panel-head">
                <h2 id="plans-title">套餐配置</h2>
                <Button
                    icon={<Plus aria-hidden="true" size={16} />}
                    type="primary"
                    onClick={() => {
                        setPlanError(undefined);
                        planForm.setFieldsValue({
                            bonusPoints: 0,
                            code: "",
                            description: "",
                            durationDays: 30,
                            features: "",
                            name: "",
                            status: "active",
                        });
                        setPlanEditing("new");
                    }}
                >
                    新建套餐
                </Button>
            </div>

            {plans.length === 0 ? (
                <Empty description="还没有配置套餐，审批通过时无法赠送积分" />
            ) : (
                <table className="module-table">
                    <thead>
                        <tr>
                            <th scope="col">套餐</th>
                            <th scope="col">时长</th>
                            <th scope="col">赠送积分</th>
                            <th scope="col">权益</th>
                            <th scope="col">状态</th>
                            <th scope="col">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {plans.map((plan) => (
                            <tr key={plan.code}>
                                <th scope="row">
                                    <div className="user-cell">
                                        <span>{plan.name}</span>
                                        <small className="mono">{plan.code}</small>
                                    </div>
                                </th>
                                <td className="num">{plan.durationDays} 天</td>
                                <td className="num">{formatPoints(plan.bonusPoints)}</td>
                                <td className="module-note">
                                    {plan.features.length > 0 ? plan.features.join(" · ") : "—"}
                                </td>
                                <td>
                                    <SealBadge status={plan.status}>
                                        {plan.status === "active" ? "启用" : "停用"}
                                    </SealBadge>
                                </td>
                                <td>
                                    <Button
                                        icon={<Pencil aria-hidden="true" size={14} />}
                                        size="small"
                                        type="text"
                                        onClick={() => {
                                            setPlanError(undefined);
                                            planForm.setFieldsValue({
                                                bonusPoints: plan.bonusPoints,
                                                code: plan.code,
                                                description: plan.description,
                                                durationDays: plan.durationDays,
                                                features: plan.features.join("\n"),
                                                name: plan.name,
                                                status: plan.status,
                                            });
                                            setPlanEditing(plan);
                                        }}
                                    >
                                        编辑
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            <p className="panel-note">
                套餐保存是整表覆盖：一次提交就是这套餐的完整定义，不做局部合并，避免出现「有编码没名称」的半成品。
            </p>
        </section>
    );

    return (
        <>
            <PageHeading copy="审批会员申请、查看会员有效期、维护套餐与赠送积分。" title="会员管理" />

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

            <Tabs
                className="page-tabs"
                items={[
                    { children: applicationTab, key: "applications", label: "申请审批" },
                    { children: membershipTab, key: "members", label: "会员列表" },
                    { children: planTab, key: "plans", label: "套餐配置" },
                ]}
            />

            <Modal
                cancelButtonProps={{ disabled: decidePending }}
                confirmLoading={decidePending}
                okText="通过并赠送积分"
                open={Boolean(approveTarget)}
                title="通过会员申请"
                onCancel={() => {
                    if (!decidePending) {
                        setApproveTarget(undefined);
                        setDecideError(undefined);
                    }
                }}
                onOk={() => approveTarget && void decide(approveTarget, true)}
            >
                <Typography.Paragraph className="modal-intro">
                    {approveTarget ? `${approveTarget.userEmail} · ${approveTarget.scene}` : null}
                </Typography.Paragraph>
                <Alert
                    className="modal-alert"
                    message="通过后开通会员并按套餐赠送积分。审批带状态闸门，重复提交不会二次赠送。"
                    showIcon
                    type="info"
                />
                {decideError ? <Alert showIcon type="error" message={decideError} /> : null}
                <div className="field-block">
                    <label htmlFor="approve-plan">开通套餐</label>
                    <Select
                        id="approve-plan"
                        options={plans
                            .filter((plan) => plan.status === "active")
                            .map((plan) => ({
                                label: `${plan.name} · ${plan.durationDays} 天 · 赠 ${plan.bonusPoints} 积分`,
                                value: plan.code,
                            }))}
                        placeholder="选择套餐"
                        style={{ width: "100%" }}
                        value={approvePlanCode}
                        onChange={setApprovePlanCode}
                    />
                    {plans.filter((plan) => plan.status === "active").length === 0 ? (
                        <p className="hint">没有启用中的套餐，请先到「套餐配置」新建。</p>
                    ) : null}
                </div>
            </Modal>

            <Modal
                cancelButtonProps={{ disabled: planPending }}
                confirmLoading={planPending}
                forceRender
                okText="保存套餐"
                open={Boolean(planEditing)}
                title={planEditing === "new" ? "新建套餐" : "编辑套餐"}
                onCancel={() => {
                    if (!planPending) {
                        setPlanEditing(undefined);
                        setPlanError(undefined);
                    }
                }}
                onOk={() => planForm.submit()}
            >
                {planError ? <Alert showIcon type="error" message={planError} /> : null}
                <Form<PlanValues> form={planForm} layout="vertical" requiredMark={false} onFinish={submitPlan}>
                    <Form.Item
                        label="套餐编码"
                        name="code"
                        rules={[{ required: true, message: "请输入编码。" }]}
                        tooltip="编码是套餐唯一标识，保存时按编码覆盖"
                    >
                        <Input placeholder="例如：pro-monthly" />
                    </Form.Item>
                    <Form.Item label="套餐名称" name="name" rules={[{ required: true, message: "请输入名称。" }]}>
                        <Input placeholder="例如：专业版月卡" />
                    </Form.Item>
                    <Form.Item label="说明" name="description">
                        <Input placeholder="可选" />
                    </Form.Item>
                    <div className="field-row">
                        <Form.Item
                            label="有效期（天）"
                            name="durationDays"
                            rules={[{ required: true, message: "请输入天数。" }]}
                        >
                            <InputNumber max={3650} min={1} precision={0} style={{ width: "100%" }} />
                        </Form.Item>
                        <Form.Item label="赠送积分" name="bonusPoints" rules={[{ required: true, message: "请输入积分。" }]}>
                            <InputNumber max={100_000_000} min={0} precision={0} style={{ width: "100%" }} />
                        </Form.Item>
                        <Form.Item label="状态" name="status">
                            <Select
                                options={[
                                    { label: "启用", value: "active" },
                                    { label: "停用", value: "disabled" },
                                ]}
                            />
                        </Form.Item>
                    </div>
                    <Form.Item label="权益" name="features" tooltip="每行一条，保存时按行拆分">
                        <Input.TextArea autoSize={{ maxRows: 6, minRows: 3 }} placeholder={"高并发队列\n优先生成\n专属素材库"} />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
}
