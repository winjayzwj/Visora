import { Alert, Button, Empty, Table, type TableColumnsType } from "./ui/heroui-compat";
import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import type { CursorList } from "../hooks/use-cursor-list";

// DataConsole 收拢「工具条 + 错误条 + 表格 + 游标翻页页脚」这套结构。
// 六个列表页的结构完全一致，分开写会把同一段翻页逻辑抄六遍。
// 泛型约束跟随 antd 的 AnyObject（Record<PropertyKey, any>），写 object 不满足它。
export function DataConsole<T extends Record<string, any>>({
    actions,
    columns,
    emptyText,
    label,
    list,
    rowKey,
    scrollX,
    toolbar,
}: {
    actions?: ReactNode;
    columns: TableColumnsType<T>;
    emptyText: string;
    label: string;
    list: CursorList<T>;
    rowKey: keyof T & string;
    scrollX?: number;
    toolbar?: ReactNode;
}) {
    const { error, goNext, goPrevious, items, loading, nextCursor, page, reload } = list;

    return (
        <section className="console" aria-label={label}>
            <div className="console-toolbar">
                {toolbar}
                <div className="console-toolbar-actions">
                    {actions}
                    <Button icon={<RefreshCw aria-hidden="true" size={16} />} loading={loading} onClick={reload}>
                        刷新
                    </Button>
                </div>
            </div>

            {error ? (
                <Alert
                    action={
                        <Button size="small" onClick={reload}>
                            重试
                        </Button>
                    }
                    message={error}
                    showIcon
                    type="error"
                />
            ) : null}

            <Table<T>
                className="user-table"
                columns={columns}
                dataSource={items}
                loading={loading}
                locale={{ emptyText: <Empty description={emptyText} /> }}
                pagination={false}
                rowKey={rowKey}
                scroll={scrollX ? { x: scrollX } : undefined}
            />

            <footer className="console-footer">
                <span>第 {page} 页</span>
                <div>
                    <Button disabled={loading || page < 2} onClick={goPrevious}>
                        上一页
                    </Button>
                    <Button disabled={loading || !nextCursor} onClick={goNext}>
                        下一页
                    </Button>
                </div>
            </footer>
        </section>
    );
}
