import { Alert, Button, Form, Input, InputNumber, Modal, Select, Typography, type TableColumnsType } from "../../components/ui/heroui-compat";
import { Pencil, Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { CopyButton } from "../../components/copy-button";
import { DataConsole } from "../../components/data-console";
import { PageHeading } from "../../components/page-heading";
import { SealBadge } from "../../components/seal-badge";
import { useCursorList } from "../../hooks/use-cursor-list";
import { errorMessage } from "../../lib/error-message";
import { formatDateTime, formatPoints } from "../../lib/format";
import { api, ApiError, type AIModel, type ModelKind } from "../../services/api/platform";

type Notice = { type: "success" | "error"; message: string };
type ModelValues = { kind: ModelKind; name: string; pointsCost: number; status: AIModel["status"] };

const KIND_LABEL: Record<ModelKind, string> = {
    audio: "音频",
    image: "图片",
    text: "文本",
    video: "视频",
};

const KIND_OPTIONS = (Object.keys(KIND_LABEL) as ModelKind[]).map((kind) => ({
    label: KIND_LABEL[kind],
    value: kind,
}));

export function ModelsPage({
    onForbidden,
    onUnauthorized,
    sessionToken,
}: {
    onForbidden: () => void;
    onUnauthorized: () => void;
    sessionToken: number;
}) {
    const [notice, setNotice] = useState<Notice>();
    const [editing, setEditing] = useState<AIModel | "new">();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string>();
    const [form] = Form.useForm<ModelValues>();

    const load = useCallback(
        (cursor: string | null, signal: AbortSignal) => api.listModels({ cursor }, signal),
        [],
    );

    const list = useCursorList<AIModel>({ load, onForbidden, onUnauthorized, resetKey: sessionToken });
    const { reload, setItems } = list;

    const open = (model: AIModel | "new") => {
        setError(undefined);
        form.setFieldsValue(
            model === "new"
                ? { kind: "image", name: "", pointsCost: 10, status: "active" }
                : {
                      kind: model.kind,
                      name: model.name,
                      pointsCost: model.pointsCost,
                      status: model.status,
                  },
        );
        setEditing(model);
    };

    const submit = async (values: ModelValues) => {
        setPending(true);
        setError(undefined);

        try {
            if (editing === "new") {
                const result = await api.createModel({
                    kind: values.kind,
                    name: values.name.trim(),
                    pointsCost: values.pointsCost,
                });
                setNotice({ type: "success", message: `已上架模型：${result.model.name}` });
                reload();
            } else if (editing) {
                const result = await api.updateModel(editing.id, {
                    kind: values.kind,
                    name: values.name.trim(),
                    pointsCost: values.pointsCost,
                    status: values.status,
                });
                setItems((current) => current.map((item) => (item.id === result.model.id ? result.model : item)));
                setNotice({ type: "success", message: `模型 ${result.model.name} 已更新。` });
            }

            setEditing(undefined);
            form.resetFields();
        } catch (thrown) {
            if (thrown instanceof ApiError && thrown.status === 401) {
                onUnauthorized();
                return;
            }
            if (thrown instanceof ApiError && thrown.status === 403) {
                onForbidden();
                return;
            }
            setError(errorMessage(thrown, "保存未完成，请检查输入后重试。"));
        } finally {
            setPending(false);
        }
    };

    const columns: TableColumnsType<AIModel> = [
        {
            title: "模型",
            dataIndex: "name",
            key: "name",
            render: (name: string, row) => (
                <div className="user-cell">
                    <span className="user-cell-mail">
                        {name}
                        <CopyButton label="复制模型 ID" value={row.id} />
                    </span>
                    <small>{row.id}</small>
                </div>
            ),
        },
        {
            title: "类型",
            dataIndex: "kind",
            key: "kind",
            width: 104,
            render: (kind: ModelKind) => <span className="chip">{KIND_LABEL[kind]}</span>,
        },
        {
            title: "单次积分",
            dataIndex: "pointsCost",
            key: "pointsCost",
            width: 116,
            align: "right",
            render: (cost: number) => <span className="num">{formatPoints(cost)}</span>,
        },
        {
            title: "调用次数",
            dataIndex: "calls",
            key: "calls",
            width: 116,
            align: "right",
            render: (calls: number) => <span className="num">{formatPoints(calls)}</span>,
        },
        {
            title: "状态",
            dataIndex: "status",
            key: "status",
            width: 104,
            render: (status: AIModel["status"]) => (
                <SealBadge status={status}>{status === "active" ? "上架" : "下架"}</SealBadge>
            ),
        },
        {
            title: "更新时间",
            dataIndex: "updatedAt",
            key: "updatedAt",
            width: 176,
            render: (value: string) => <time dateTime={value}>{formatDateTime(value)}</time>,
        },
        {
            title: "操作",
            key: "actions",
            width: 96,
            align: "right",
            render: (_, row) => (
                <Button
                    icon={<Pencil aria-hidden="true" size={14} />}
                    size="small"
                    type="text"
                    onClick={() => open(row)}
                >
                    编辑
                </Button>
            ),
        },
    ];

    return (
        <>
            <PageHeading
                action={
                    <Button icon={<Plus aria-hidden="true" size={16} />} type="primary" onClick={() => open("new")}>
                        上架模型
                    </Button>
                }
                copy="维护平台可调用的模型目录与按次积分报价。密钥不进入这个目录。"
                title="AI 模型管理"
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

            <DataConsole<AIModel>
                columns={columns}
                emptyText="模型目录还是空的"
                label="模型目录"
                list={list}
                rowKey="id"
                scrollX={1040}
            />

            <Modal
                cancelButtonProps={{ disabled: pending }}
                confirmLoading={pending}
                forceRender
                okText={editing === "new" ? "上架" : "保存"}
                open={Boolean(editing)}
                title={editing === "new" ? "上架模型" : "编辑模型"}
                onCancel={() => {
                    if (!pending) {
                        setEditing(undefined);
                        setError(undefined);
                    }
                }}
                onOk={() => form.submit()}
            >
                <Typography.Paragraph className="modal-intro">
                    单次积分是每次调用扣减的积分，下架后不再受理新的生成请求。
                </Typography.Paragraph>
                {error ? <Alert showIcon type="error" message={error} /> : null}
                <Form<ModelValues> form={form} layout="vertical" requiredMark={false} onFinish={submit}>
                    <Form.Item label="模型名称" name="name" rules={[{ required: true, message: "请输入模型名称。" }]}>
                        <Input placeholder="例如：gpt-image-1" />
                    </Form.Item>
                    <div className="field-row">
                        <Form.Item label="类型" name="kind" rules={[{ required: true, message: "请选择类型。" }]}>
                            <Select options={KIND_OPTIONS} />
                        </Form.Item>
                        <Form.Item
                            label="单次积分"
                            name="pointsCost"
                            rules={[{ required: true, message: "请输入积分。" }]}
                        >
                            <InputNumber max={100_000_000} min={0} precision={0} style={{ width: "100%" }} />
                        </Form.Item>
                        {editing === "new" ? null : (
                            <Form.Item label="状态" name="status">
                                <Select
                                    options={[
                                        { label: "上架", value: "active" },
                                        { label: "下架", value: "disabled" },
                                    ]}
                                />
                            </Form.Item>
                        )}
                    </div>
                </Form>
            </Modal>
        </>
    );
}
