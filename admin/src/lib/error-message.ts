import { ApiError } from "../services/api/platform";

export function errorMessage(error: unknown, fallback = "请求未完成，请稍后重试。") {
    if (error instanceof ApiError) {
        return error.status === 503 ? "服务暂不可用，请稍后重试。" : error.message;
    }

    return fallback;
}
