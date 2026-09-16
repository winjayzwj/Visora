const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" });
const dateFormatter = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" });
const pointsFormatter = new Intl.NumberFormat("zh-CN");

// 后端返回的是 RFC3339 字符串。解析失败时原样回显，不要显示成 Invalid Date。
export function formatDateTime(value?: string | null) {
    if (!value) {
        return "—";
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date);
}

export function formatDate(value?: string | null) {
    if (!value) {
        return "—";
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

export function formatPoints(value: number) {
    return pointsFormatter.format(value);
}
