export type UserRole = "user" | "admin";
export type UserStatus = "active" | "disabled";

export type Credentials = { email: string; password: string };

export type User = {
    id: string;
    email: string;
    role: UserRole;
    status: UserStatus;
    points: number;
    createdAt: string;
};

export type ModelKind = "image" | "video" | "text" | "audio";
export type ModelStatus = "active" | "disabled";

export type AIModel = {
    id: string;
    name: string;
    kind: ModelKind;
    pointsCost: number;
    status: ModelStatus;
    calls: number;
    createdAt: string;
    updatedAt: string;
};

export type PointKind = "grant" | "revoke" | "topup" | "allocate" | "allocation_revoke" | "consume";
export type PointScope = "user" | "team_pool" | "team_member";

export type PointEntry = {
    id: string;
    userId?: string;
    userEmail?: string;
    teamId?: string;
    teamName?: string;
    scope: PointScope;
    kind: PointKind;
    delta: number;
    balanceAfter: number;
    modelName?: string;
    note?: string;
    actorId: string;
    createdAt: string;
};

export type TeamStatus = "active" | "dissolved";

export type Team = {
    id: string;
    name: string;
    adminUserId: string;
    adminEmail: string;
    memberCount: number;
    pointsPool: number;
    allocatedTotal: number;
    allocatedThisMonth: number;
    status: TeamStatus;
    createdAt: string;
};

export type TeamMember = {
    userId: string;
    email: string;
    role: "admin" | "member";
    allocatedPoints: number;
    createdAt: string;
};

export type MembershipPlan = {
    code: string;
    name: string;
    description: string;
    durationDays: number;
    bonusPoints: number;
    features: string[];
    status: ModelStatus;
};

export type ApplicationStatus = "pending" | "approved" | "rejected";

export type MembershipApplication = {
    id: string;
    userId: string;
    userEmail: string;
    scene: string;
    reason: string;
    status: ApplicationStatus;
    decidedBy?: string;
    decidedAt?: string;
    planCode?: string;
    createdAt: string;
};

export type Membership = {
    id: string;
    userId: string;
    userEmail: string;
    planCode: string;
    planName: string;
    grantedPoints: number;
    startedAt: string;
    expiresAt: string;
    status: "active" | "expired" | "disabled";
    createdAt: string;
};

export type PermissionRule = {
    group: string;
    action: string;
    endpoint: string;
    userAllowed: boolean;
    note: string;
};

export type DailyCount = { date: string; count: number };

export type OverviewStats = {
    totalUsers: number;
    activeUsers: number;
    disabledUsers: number;
    adminUsers: number;
    newUsersThisMonth: number;
    totalModels: number;
    activeModels: number;
    totalTeams: number;
    activeTeams: number;
    pendingApplications: number;
    activeMemberships: number;
    issuedPoints: number;
    revokedPoints: number;
    outstandingPoints: number;
    teamPoolPoints: number;
    signups: DailyCount[];
};

export type Page<T> = { items: T[]; nextCursor: string | null };

type ErrorPayload = {
    error?: {
        code?: string;
        message?: string;
    };
};

export class ApiError extends Error {
    status: number;
    code: string;

    constructor(status: number, code: string, message: string) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.code = code;
    }
}

export function isAbortError(error: unknown) {
    return error instanceof Error && error.name === "AbortError";
}

function parseJson(text: string) {
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return null;
    }
}

async function request<T>(path: string, init: RequestInit = {}) {
    let response: Response;

    try {
        response = await fetch(path, {
            ...init,
            credentials: "same-origin",
        });
    } catch (error) {
        if (isAbortError(error)) {
            throw error;
        }
        throw new ApiError(0, "NETWORK_ERROR", "无法连接服务，请检查后重试。");
    }

    const text = response.status === 204 ? "" : await response.text();
    const payload = text ? parseJson(text) : null;

    if (!response.ok) {
        const error = (payload as ErrorPayload | null)?.error;
        throw new ApiError(
            response.status,
            error?.code ?? "REQUEST_FAILED",
            error?.message ?? "请求未完成，请稍后重试。",
        );
    }

    return payload as T;
}

// 服务端的写方法闸门覆盖 POST/PATCH/PUT/DELETE，
// 这四种都必须带 Origin、X-Visora-Request 与 Content-Type。
type WriteMethod = "POST" | "PATCH" | "PUT" | "DELETE";

function write<T>(path: string, method: WriteMethod, body?: unknown, signal?: AbortSignal) {
    return request<T>(path, {
        method,
        signal,
        headers: {
            "Content-Type": "application/json",
            "X-Visora-Request": "1",
        },
        body: JSON.stringify(body ?? {}),
    });
}

function cursorQuery(values: { cursor?: string | null; [key: string]: string | null | undefined }) {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(values)) {
        if (value) {
            params.set(key, value);
        }
    }

    const query = params.toString();
    return query ? `?${query}` : "";
}

const id = (value: string) => encodeURIComponent(value);

export const api = {
    getMe(signal?: AbortSignal) {
        return request<{ user: User }>("/api/auth/me", { signal });
    },
    login(values: Credentials, signal?: AbortSignal) {
        return write<{ user: User }>("/api/auth/login", "POST", values, signal);
    },
    logout(signal?: AbortSignal) {
        return write<void>("/api/auth/logout", "POST", {}, signal);
    },
    overview(signal?: AbortSignal) {
        return request<{ stats: OverviewStats }>("/api/admin/stats/overview", { signal });
    },

    listUsers(values: { cursor?: string | null; email?: string }, signal?: AbortSignal) {
        return request<Page<User>>(`/api/admin/users${cursorQuery(values)}`, { signal });
    },
    createUser(values: Credentials, signal?: AbortSignal) {
        return write<{ user: User }>("/api/admin/users", "POST", values, signal);
    },
    updateUserStatus(userId: string, status: UserStatus, signal?: AbortSignal) {
        return write<{ user: User }>(`/api/admin/users/${id(userId)}`, "PATCH", { status }, signal);
    },

    listPointEntries(
        values: { cursor?: string | null; userId?: string; kind?: string },
        signal?: AbortSignal,
    ) {
        return request<Page<PointEntry>>(`/api/admin/points/ledger${cursorQuery(values)}`, { signal });
    },
    grantPoints(values: { userId: string; amount: number; note?: string }, signal?: AbortSignal) {
        return write<{ entry: PointEntry }>("/api/admin/points/grant", "POST", values, signal);
    },
    revokePoints(values: { userId: string; amount: number; note?: string }, signal?: AbortSignal) {
        return write<{ entry: PointEntry }>("/api/admin/points/revoke", "POST", values, signal);
    },

    listModels(values: { cursor?: string | null } = {}, signal?: AbortSignal) {
        return request<Page<AIModel>>(`/api/admin/models${cursorQuery(values)}`, { signal });
    },
    createModel(
        values: { name: string; kind: ModelKind; pointsCost: number },
        signal?: AbortSignal,
    ) {
        return write<{ model: AIModel }>("/api/admin/models", "POST", values, signal);
    },
    updateModel(
        modelId: string,
        values: Partial<{ name: string; kind: ModelKind; pointsCost: number; status: ModelStatus }>,
        signal?: AbortSignal,
    ) {
        return write<{ model: AIModel }>(`/api/admin/models/${id(modelId)}`, "PATCH", values, signal);
    },

    listTeams(values: { cursor?: string | null } = {}, signal?: AbortSignal) {
        return request<Page<Team>>(`/api/admin/teams${cursorQuery(values)}`, { signal });
    },
    createTeam(values: { name: string; adminUserId: string }, signal?: AbortSignal) {
        return write<{ team: Team }>("/api/admin/teams", "POST", values, signal);
    },
    dissolveTeam(teamId: string, signal?: AbortSignal) {
        return write<{ team: Team }>(`/api/admin/teams/${id(teamId)}/dissolve`, "POST", {}, signal);
    },
    listTeamMembers(teamId: string, signal?: AbortSignal) {
        return request<{ items: TeamMember[] }>(`/api/admin/teams/${id(teamId)}/members`, { signal });
    },
    addTeamMember(teamId: string, userId: string, signal?: AbortSignal) {
        return write<{ member: TeamMember }>(`/api/admin/teams/${id(teamId)}/members`, "POST", { userId }, signal);
    },
    removeTeamMember(teamId: string, userId: string, signal?: AbortSignal) {
        return write<{ member: TeamMember }>(
            `/api/admin/teams/${id(teamId)}/members/${id(userId)}`,
            "DELETE",
            {},
            signal,
        );
    },
    topUpTeam(teamId: string, values: { amount: number; note?: string }, signal?: AbortSignal) {
        return write<{ team: Team }>(`/api/admin/teams/${id(teamId)}/points/topup`, "POST", values, signal);
    },
    allocateTeamPoints(
        teamId: string,
        values: { userId: string; amount: number; note?: string },
        signal?: AbortSignal,
    ) {
        return write<{ member: TeamMember }>(
            `/api/admin/teams/${id(teamId)}/points/allocate`,
            "POST",
            values,
            signal,
        );
    },
    revokeTeamAllocation(
        teamId: string,
        values: { userId: string; amount: number; note?: string },
        signal?: AbortSignal,
    ) {
        return write<{ member: TeamMember }>(
            `/api/admin/teams/${id(teamId)}/points/revoke`,
            "POST",
            values,
            signal,
        );
    },

    listPlans(signal?: AbortSignal) {
        return request<{ items: MembershipPlan[] }>("/api/admin/membership/plans", { signal });
    },
    upsertPlan(
        values: {
            code: string;
            name: string;
            description?: string;
            durationDays?: number;
            bonusPoints?: number;
            features?: string[];
            status?: ModelStatus;
        },
        signal?: AbortSignal,
    ) {
        return write<{ plan: MembershipPlan }>("/api/admin/membership/plans", "PUT", values, signal);
    },
    listApplications(
        values: { cursor?: string | null; status?: string } = {},
        signal?: AbortSignal,
    ) {
        return request<Page<MembershipApplication>>(
            `/api/admin/membership/applications${cursorQuery(values)}`,
            { signal },
        );
    },
    approveApplication(applicationId: string, planCode: string, signal?: AbortSignal) {
        return write<{ application: MembershipApplication }>(
            `/api/admin/membership/applications/${id(applicationId)}/approve`,
            "POST",
            { planCode },
            signal,
        );
    },
    rejectApplication(applicationId: string, signal?: AbortSignal) {
        return write<{ application: MembershipApplication }>(
            `/api/admin/membership/applications/${id(applicationId)}/reject`,
            "POST",
            {},
            signal,
        );
    },
    listMemberships(values: { cursor?: string | null } = {}, signal?: AbortSignal) {
        return request<Page<Membership>>(`/api/admin/membership/members${cursorQuery(values)}`, { signal });
    },

    listAdmins(values: { cursor?: string | null } = {}, signal?: AbortSignal) {
        return request<Page<User>>(`/api/admin/accounts${cursorQuery(values)}`, { signal });
    },
    createAdminAccount(values: Credentials, signal?: AbortSignal) {
        return write<{ user: User }>("/api/admin/accounts", "POST", values, signal);
    },
    updateAdminStatus(userId: string, status: UserStatus, signal?: AbortSignal) {
        return write<{ user: User }>(`/api/admin/accounts/${id(userId)}`, "PATCH", { status }, signal);
    },
    listPermissions(signal?: AbortSignal) {
        return request<{ items: PermissionRule[] }>("/api/admin/permissions", { signal });
    },
};
