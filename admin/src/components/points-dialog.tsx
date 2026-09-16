import { Alert, Form, Input, InputNumber, Modal, Radio, Typography } from "./ui/heroui-compat";
import { useState } from "react";
import { errorMessage } from "../lib/error-message";
import { api, ApiError, type PointEntry } from "../services/api/platform";

type FormValues = { userId: string; amount: number; note?: string };
type Mode = "grant" | "revoke";

// PointsDialog 同时服务两个入口：用户管理页带着固定账号打开，
// 积分管理页则要手填账号。发放与撤销走同一个表单，只换接口与文案。
export function PointsDialog({
    onClose,
    onDone,
    onForbidden,
    onUnauthorized,
    target,
}: {
    onClose: () => void;
    onDone: (entry: PointEntry) => void;
    onForbidden: () => void;
    onUnauthorized: () => void;
    target?: { email: string; id: string };
}) {
    const [mode, setMode] = useState<Mode>("grant");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string>();
    const [form] = Form.useForm<FormValues>();

    const submit = async (values: FormValues) => {
        setPending(true);
        setError(undefined);

        try {
            const payload = { userId: target?.id ?? values.userId.trim(), amount: values.amount, note: values.note };
            const result = mode === "grant" ? await api.grantPoints(payload) : await api.revokePoints(payload);
            form.resetFields();
            onDone(result.entry);
        } catch (thrown) {
            if (thrown instanceof ApiError && thrown.status === 401) {
                onUnauthorized();
                return;
            }
            if (thrown instanceof ApiError && thrown.status === 403) {
                onForbidden();
                return;
            }
            setError(errorMessage(thrown, "积分变动未完成，请检查输入后重试。"));
        } finally {
            setPending(false);
        }
    };

    return (
        <Modal
            cancelButtonProps={{ disabled: pending }}
            confirmLoading={pending}
            okText={mode === "grant" ? "确认发放" : "确认扣减"}
            open
            title={target ? "调整积分" : "积分调整"}
            onCancel={() => {
                if (!pending) {
                    onClose();
                }
            }}
            onOk={() => form.submit()}
        >
            <Typography.Paragraph className="modal-intro">
                {target ? `账号：${target.email}` : "按用户 ID 定位账号。积分变动会写入流水，撤销不允许透支。"}
            </Typography.Paragraph>
            {error ? <Alert showIcon type="error" message={error} /> : null}
            <Form<FormValues> form={form} initialValues={{ amount: 100 }} layout="vertical" requiredMark={false} onFinish={submit}>
                {/* 方向由组件自身状态控制，不挂 name：挂上 name 会和 Radio 自己的
                    value/onChange 双绑，Form 重置时方向会被一起清掉。 */}
                <Form.Item label="变动方向">
                    <Radio.Group
                        optionType="button"
                        options={[
                            { label: "发放", value: "grant" },
                            { label: "扣减", value: "revoke" },
                        ]}
                        value={mode}
                        onChange={(event) => setMode(event.target.value as Mode)}
                    />
                </Form.Item>
                {target ? null : (
                    <Form.Item label="用户 ID" name="userId" rules={[{ required: true, message: "请输入用户 ID。" }]}>
                        <Input placeholder="用户 ID" />
                    </Form.Item>
                )}
                <Form.Item
                    label="积分数"
                    name="amount"
                    rules={[{ required: true, message: "请输入积分数。" }, { type: "number", min: 1, message: "至少 1。" }]}
                >
                    <InputNumber max={100_000_000} min={1} precision={0} style={{ width: "100%" }} />
                </Form.Item>
                <Form.Item label="备注" name="note">
                    <Input placeholder="可选，写入流水便于对账" />
                </Form.Item>
            </Form>
        </Modal>
    );
}
