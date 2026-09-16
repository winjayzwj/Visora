import { Alert, Button, Input, Segmented, type TableColumnsType } from "../../components/ui/heroui-compat";
import { Coins, Search, X } from "lucide-react";
import { useCallback, useState } from "react";
import { CopyButton } from "../../components/copy-button";
import { DataConsole } from "../../components/data-console";
import { PageHeading } from "../../components/page-heading";
import { PointsDialog } from "../../components/points-dialog";
import { useCursorList } from "../../hooks/use-cursor-list";
import { formatDateTime, formatPoints } from "../../lib/format";
import { api, type PointEntry, type PointKind } from "../../services/api/platform";

type Notice = { type: "success" | "error"; message: string };

const KIND_LABEL: Record<PointKind, string> = {
    allocate: "团队分配",
    allocation_revoke: "分配回收",
    consume: "生成消耗",
    grant: "发放",
    revoke: "撤销",
    topup: "团队充入",
};

const SCOPE_LABEL: Record<PointEntry["scope"], string> = {
    team_member: "成员已分配",
    team_pool: "团队池",
    user: "账号",
};

const KIND_FILTERS = [
    { label: "全部", value: "" },
    ...(Object.keys(KIND_LABEL) as PointKind[]).map((kind) => ({ label: KIND_LABEL[kind], value: kind })),
];

export function PointsPage({
    onForbidden,
    onUnauthorized,
    sessionToken,
}: {
    onForbidden: () => void;
    onUnauthorized: () => void;
    sessionToken: number;
}) {
    const [notice, setNotice] = useState<Notice>();
    const [userInput, setUserInput] = useState("");
    const [userId, setUserId] = useState("");
    const [kind, setKind] = useState("");
    const [adjusting, setAdjusting] = useState(false);

    const load = useCallback(
        (cursor: string | null, signal: AbortSignal) =>
            api.listPointEntries({ cursor, kind: kind || undefined, userId: userId || undefined }, signal),
        [kind, userId],
    );

    const list = useCursorList<PointEntry>({ load, onForbidden, onUnauthorized, resetKey: sessionToken });

    const columns: TableColumnsType<PointEntry> = [
        {
            title: "时间",
            dataIndex: "createdAt",
            key: "createdAt",
            width: 176,
            render: (value: string) => <time dateTime={value}>{formatDateTime(value)}</time>,
        },
        {
            title: "归属",
            key: "owner",
            render: (_, row) => (
                <div className="user-cell">
                    <span className="user-cell-mail">
                        {row.teamName ?? row.userEmail ?? row.teamId ?? row.userId ?? "—"}
                        <CopyButton
                            label="复制归属 ID"
                            value={row.teamId ?? row.userId ?? ""}
                        />
                    </span>
                    <small>{row.teamId ?? row.userId ?? ""}</small>
                </div>
            ),
        },
        {
            title: "范围",
            dataIndex: "scope",
            key: "scope",
            width: 124,
            render: (scope: PointEntry["scope"]) => <span className="chip">{SCOPE_LABEL[scope]}</span>,
        },
        {
            title: "类型",
            dataIndex: "kind",
            key: "kind",
            width: 116,
            render: (value: PointKind) => KIND_LABEL[value] ?? value,
        },
        {
            title: "变动",
            dataIndex: "delta",
            key: "delta",
            width: 118,
            align: "right",
            render: (delta: number) => (
                <span className={delta >= 0 ? "amount-in" : "amount-out"}>
                    {delta >= 0 ? "+" : "−"}
                    {formatPoints(Math.abs(delta))}
                </span>
            ),
        },
        {
            title: "变动后余额",
            dataIndex: "balanceAfter",
            key: "balanceAfter",
            width: 124,
            align: "right",
            render: (balance: number) => <span className="num">{formatPoints(balance)}</span>,
        },
        {
            title: "关联",
            key: "context",
            width: 168,
            render: (_, row) => <span className="hint">{row.modelName ?? row.note ?? "—"}</span>,
        },
    ];

    const applied = Boolean(userId || kind);

    return (
        <>
            <PageHeading
                action={
                    <Button icon={<Coins aria-hidden="true" size={16} />} type="primary" onClick={() => setAdjusting(true)}>
                        调整积分
                    </Button>
                }
                copy="账号积分、团队池、成员已分配是三套独立余额，每笔变动都留流水。"
                title="积分管理"
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

            <DataConsole<PointEntry>
                columns={columns}
                emptyText={applied ? "没有匹配的流水" : "还没有积分流水"}
                label="积分流水"
                list={list}
                rowKey="id"
                scrollX={1160}
                toolbar={
                    <div className="console-filters">
                        <div className="console-query">
                            <label htmlFor="ledger-user">按账号筛选</label>
                            <div className="console-query-row">
                                <Input
                                    id="ledger-user"
                                    placeholder="用户 ID 或团队 ID"
                                    value={userInput}
                                    onChange={(event) => setUserInput(event.target.value)}
                                    onPressEnter={() => setUserId(userInput.trim())}
                                />
                                <Button
                                    icon={<Search aria-hidden="true" size={16} />}
                                    onClick={() => setUserId(userInput.trim())}
                                >
                                    筛选
                                </Button>
                                {applied ? (
                                    <Button
                                        icon={<X aria-hidden="true" size={16} />}
                                        type="text"
                                        onClick={() => {
                                            setUserInput("");
                                            setUserId("");
                                            setKind("");
                                        }}
                                    >
                                        清除
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                        <div className="console-query">
                            <label>按类型筛选</label>
                            <div className="console-query-row">
                                <Segmented options={KIND_FILTERS} value={kind} onChange={(value) => setKind(value as string)} />
                            </div>
                        </div>
                    </div>
                }
            />

            {adjusting ? (
                <PointsDialog
                    onClose={() => setAdjusting(false)}
                    onDone={(entry) => {
                        setAdjusting(false);
                        setNotice({
                            type: "success",
                            message: `积分已变动 ${entry.delta >= 0 ? "+" : "−"}${formatPoints(Math.abs(entry.delta))}，余额 ${formatPoints(entry.balanceAfter)}。`,
                        });
                        list.reload();
                    }}
                    onForbidden={onForbidden}
                    onUnauthorized={onUnauthorized}
                />
            ) : null}
        </>
    );
}
