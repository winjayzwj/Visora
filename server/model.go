package server

import (
	"context"
	"errors"
	"time"
)

const (
	RoleUser  = "user"
	RoleAdmin = "admin"

	StatusActive    = "active"
	StatusDisabled  = "disabled"
	StatusDissolved = "dissolved"

	StatusPending  = "pending"
	StatusApproved = "approved"
	StatusRejected = "rejected"
	StatusExpired  = "expired"

	// 积分流水类型。consume 由后续平台生成迭代产生，当前没有写入方。
	PointGrant            = "grant"
	PointRevoke           = "revoke"
	PointTopUp            = "topup"
	PointAllocate         = "allocate"
	PointAllocationRevoke = "allocation_revoke"
	PointConsume          = "consume"

	// 积分作用域。三个余额彼此独立，不互相隐式兜底。
	PointScopeUser       = "user"
	PointScopeTeamPool   = "team_pool"
	PointScopeTeamMember = "team_member"

	ModelKindImage = "image"
	ModelKindVideo = "video"
	ModelKindText  = "text"
	ModelKindAudio = "audio"

	TeamRoleAdmin  = "admin"
	TeamRoleMember = "member"
)

// maxPointAmount 是单次积分变动上限。用途是挡住把 999999999999 这类误输入
// 直接写进账本；积分是 int64，这个上限远低于溢出边界。
const maxPointAmount = 100_000_000

var (
	ErrNotFound      = errors.New("account not found")
	ErrEmailExists   = errors.New("email already exists")
	ErrUserProtected = errors.New("protected user")
	ErrInvalidInput  = errors.New("invalid input")

	ErrInsufficientPoints = errors.New("insufficient points")
	ErrLastAdmin          = errors.New("last active admin")
	ErrSelfAction         = errors.New("cannot act on own account")
	ErrAlreadyDecided     = errors.New("application already decided")
	ErrTeamProtected      = errors.New("team is not active")
	ErrMemberExists       = errors.New("member already in team")
	ErrMemberNotFound     = errors.New("member not in team")
	ErrMemberHasPoints    = errors.New("member still holds allocated points")
	ErrPlanNotFound       = errors.New("membership plan not found")
	ErrNameExists         = errors.New("name already exists")
)

type User struct {
	ID             string    `json:"id"`
	Email          string    `json:"email"`
	Name           string    `json:"name"`
	AvatarURL      string    `json:"avatarUrl"`
	Role           string    `json:"role"`
	Status         string    `json:"status"`
	Points         int64     `json:"points"`
	CreatedAt      time.Time `json:"createdAt"`
	PasswordHash   []byte    `json:"-"`
	SessionVersion int64     `json:"-"`
}

type Session struct {
	TokenHash      [32]byte
	UserID         string
	SessionVersion int64
	CreatedAt      time.Time
	ExpiresAt      time.Time
}

type UserCursor struct {
	CreatedAt time.Time
	ID        string
	Email     string
}

type CreateUserInput struct {
	Email        string
	PasswordHash []byte
	ActorID      string
	CreatedAt    time.Time
}

type UpdateUserProfileInput struct {
	UserID    string
	Name      string
	AvatarURL string
}

type SetUserStatusInput struct {
	UserID    string
	Status    string
	ActorID   string
	CreatedAt time.Time
}

type ListUsersInput struct {
	Email string
	After *UserCursor
	Limit int64
}

type AccountStore interface {
	Ping(context.Context) error
	FindUserByEmail(context.Context, string) (User, error)
	FindUserByID(context.Context, string) (User, error)
	CreateSession(context.Context, Session) error
	FindSessionByTokenHash(context.Context, [32]byte) (Session, error)
	DeleteSession(context.Context, [32]byte) error
	CreateUser(context.Context, CreateUserInput) (User, error)
	UpdateUserProfile(context.Context, UpdateUserProfileInput) (User, error)
	SetUserStatus(context.Context, SetUserStatusInput) (User, error)
	ListUsers(context.Context, ListUsersInput) ([]User, error)
	CreateAdmin(context.Context, string, []byte, time.Time) (User, error)
	InitIndexes(context.Context) error
}

// ── 积分账务 ─────────────────────────────────────────────────
// 用户余额、团队积分池、成员已分配积分是三个独立余额，各自有流水，
// 不互相隐式兜底（需求对照 C06/C08：不默认同时支持两套账务）。

type PointEntry struct {
	ID           string    `json:"id"`
	UserID       string    `json:"userId,omitempty"`
	UserEmail    string    `json:"userEmail,omitempty"`
	TeamID       string    `json:"teamId,omitempty"`
	TeamName     string    `json:"teamName,omitempty"`
	Scope        string    `json:"scope"`
	Kind         string    `json:"kind"`
	Delta        int64     `json:"delta"`
	BalanceAfter int64     `json:"balanceAfter"`
	ModelName    string    `json:"modelName,omitempty"`
	Note         string    `json:"note,omitempty"`
	ActorID      string    `json:"actorId"`
	CreatedAt    time.Time `json:"createdAt"`
}

type PointCursor struct {
	CreatedAt time.Time
	ID        string
}

type GrantPointsInput struct {
	UserID    string
	Amount    int64
	Note      string
	ActorID   string
	CreatedAt time.Time
}

type ListPointEntriesInput struct {
	UserID string
	Kind   string
	After  *PointCursor
	Limit  int64
}

type PointStore interface {
	GrantPoints(context.Context, GrantPointsInput) (PointEntry, error)
	RevokePoints(context.Context, GrantPointsInput) (PointEntry, error)
	ListPointEntries(context.Context, ListPointEntriesInput) ([]PointEntry, error)
}

// ── AI 模型目录 ──────────────────────────────────────────────
// 平台侧报价目录。密钥与供应商凭证不进入这里，也不下发给浏览器。

type AIModel struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	Kind       string    `json:"kind"`
	PointsCost int64     `json:"pointsCost"`
	Status     string    `json:"status"`
	Calls      int64     `json:"calls"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

type ModelCursor struct {
	CreatedAt time.Time
	ID        string
}

type ListModelsInput struct {
	After *ModelCursor
	Limit int64
}

type CreateModelInput struct {
	Name       string
	Kind       string
	PointsCost int64
	ActorID    string
	CreatedAt  time.Time
}

type UpdateModelInput struct {
	ModelID    string
	Name       *string
	Kind       *string
	PointsCost *int64
	Status     *string
	ActorID    string
	UpdatedAt  time.Time
}

type CatalogStore interface {
	ListModels(context.Context, ListModelsInput) ([]AIModel, error)
	CreateModel(context.Context, CreateModelInput) (AIModel, error)
	UpdateModel(context.Context, UpdateModelInput) (AIModel, error)
}

// ── 团队 ────────────────────────────────────────────────────

type Team struct {
	ID                 string    `json:"id"`
	Name               string    `json:"name"`
	AdminUserID        string    `json:"adminUserId"`
	AdminEmail         string    `json:"adminEmail"`
	MemberCount        int64     `json:"memberCount"`
	PointsPool         int64     `json:"pointsPool"`
	AllocatedTotal     int64     `json:"allocatedTotal"`
	AllocatedThisMonth int64     `json:"allocatedThisMonth"`
	Status             string    `json:"status"`
	CreatedAt          time.Time `json:"createdAt"`
}

type TeamMember struct {
	UserID          string    `json:"userId"`
	Email           string    `json:"email"`
	Role            string    `json:"role"`
	AllocatedPoints int64     `json:"allocatedPoints"`
	CreatedAt       time.Time `json:"createdAt"`
}

type TeamCursor struct {
	CreatedAt time.Time
	ID        string
}

type ListTeamsInput struct {
	After *TeamCursor
	Limit int64
}

type CreateTeamInput struct {
	Name        string
	AdminUserID string
	ActorID     string
	CreatedAt   time.Time
}

type TeamActionInput struct {
	TeamID    string
	ActorID   string
	CreatedAt time.Time
}

type TeamMemberInput struct {
	TeamID    string
	UserID    string
	Role      string
	ActorID   string
	CreatedAt time.Time
}

type TeamPointsInput struct {
	TeamID    string
	UserID    string
	Amount    int64
	Note      string
	ActorID   string
	CreatedAt time.Time
}

type TeamStore interface {
	ListTeams(context.Context, ListTeamsInput) ([]Team, error)
	CreateTeam(context.Context, CreateTeamInput) (Team, error)
	DissolveTeam(context.Context, TeamActionInput) (Team, error)
	ListTeamMembers(context.Context, string) ([]TeamMember, error)
	AddTeamMember(context.Context, TeamMemberInput) (TeamMember, error)
	RemoveTeamMember(context.Context, TeamMemberInput) (TeamMember, error)
	TopUpTeam(context.Context, TeamPointsInput) (Team, error)
	AllocateTeamPoints(context.Context, TeamPointsInput) (TeamMember, error)
	RevokeTeamAllocation(context.Context, TeamPointsInput) (TeamMember, error)
}

// ── 会员 ────────────────────────────────────────────────────

type MembershipPlan struct {
	Code         string   `json:"code"`
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	DurationDays int64    `json:"durationDays"`
	BonusPoints  int64    `json:"bonusPoints"`
	Features     []string `json:"features"`
	Status       string   `json:"status"`
}

type MembershipApplication struct {
	ID        string     `json:"id"`
	UserID    string     `json:"userId"`
	UserEmail string     `json:"userEmail"`
	Scene     string     `json:"scene"`
	Reason    string     `json:"reason"`
	Status    string     `json:"status"`
	DecidedBy string     `json:"decidedBy,omitempty"`
	DecidedAt *time.Time `json:"decidedAt,omitempty"`
	PlanCode  string     `json:"planCode,omitempty"`
	CreatedAt time.Time  `json:"createdAt"`
}

type Membership struct {
	ID            string    `json:"id"`
	UserID        string    `json:"userId"`
	UserEmail     string    `json:"userEmail"`
	PlanCode      string    `json:"planCode"`
	PlanName      string    `json:"planName"`
	GrantedPoints int64     `json:"grantedPoints"`
	StartedAt     time.Time `json:"startedAt"`
	ExpiresAt     time.Time `json:"expiresAt"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"createdAt"`
}

type ApplicationCursor struct {
	CreatedAt time.Time
	ID        string
}

type ListApplicationsInput struct {
	Status string
	After  *ApplicationCursor
	Limit  int64
}

type SubmitApplicationInput struct {
	UserID    string
	Scene     string
	Reason    string
	CreatedAt time.Time
}

type DecideApplicationInput struct {
	ApplicationID string
	Approve       bool
	PlanCode      string
	ActorID       string
	CreatedAt     time.Time
}

type ListMembershipsInput struct {
	After *ApplicationCursor
	Limit int64
}

// UpdatePlanInput 是整表覆盖：套餐在后台是一个表单一次保存，
// 拆成指针做局部更新只会让「新建时没有名称」这种半成品状态变得可能。
type UpdatePlanInput struct {
	Code         string
	Name         string
	Description  string
	DurationDays int64
	BonusPoints  int64
	Features     []string
	Status       string
}

type MembershipStore interface {
	ListPlans(context.Context) ([]MembershipPlan, error)
	UpdatePlan(context.Context, UpdatePlanInput) (MembershipPlan, error)
	ListApplications(context.Context, ListApplicationsInput) ([]MembershipApplication, error)
	SubmitApplication(context.Context, SubmitApplicationInput) (MembershipApplication, error)
	DecideApplication(context.Context, DecideApplicationInput) (MembershipApplication, error)
	ListMemberships(context.Context, ListMembershipsInput) ([]Membership, error)
}

// ── 后台账号与授权矩阵 ──────────────────────────────────────

type ListAdminsInput struct {
	After *UserCursor
	Limit int64
}

type PermissionRule struct {
	Group       string `json:"group"`
	Action      string `json:"action"`
	Endpoint    string `json:"endpoint"`
	UserAllowed bool   `json:"userAllowed"`
	Note        string `json:"note"`
}

type AdminStore interface {
	ListAdmins(context.Context, ListAdminsInput) ([]User, error)
	CreateAdminAccount(context.Context, CreateUserInput) (User, error)
	SetAdminStatus(context.Context, SetUserStatusInput) (User, error)
	CountActiveAdmins(context.Context) (int64, error)
}

// ── 看板 ────────────────────────────────────────────────────

type DailyCount struct {
	Date  string `json:"date"`
	Count int64  `json:"count"`
}

type OverviewStats struct {
	TotalUsers          int64        `json:"totalUsers"`
	ActiveUsers         int64        `json:"activeUsers"`
	DisabledUsers       int64        `json:"disabledUsers"`
	AdminUsers          int64        `json:"adminUsers"`
	NewUsersThisMonth   int64        `json:"newUsersThisMonth"`
	TotalModels         int64        `json:"totalModels"`
	ActiveModels        int64        `json:"activeModels"`
	TotalTeams          int64        `json:"totalTeams"`
	ActiveTeams         int64        `json:"activeTeams"`
	PendingApplications int64        `json:"pendingApplications"`
	ActiveMemberships   int64        `json:"activeMemberships"`
	IssuedPoints        int64        `json:"issuedPoints"`
	RevokedPoints       int64        `json:"revokedPoints"`
	OutstandingPoints   int64        `json:"outstandingPoints"`
	TeamPoolPoints      int64        `json:"teamPoolPoints"`
	Signups             []DailyCount `json:"signups"`
}

type StatsStore interface {
	Overview(context.Context, time.Time) (OverviewStats, error)
}

// Store 是 HTTP 层依赖的完整存储能力。拆成多个小接口是为了让
// 领域边界清晰，实际装配时由 MongoStore 一次性满足。
type Store interface {
	AccountStore
	PointStore
	CatalogStore
	TeamStore
	MembershipStore
	AdminStore
	StatsStore
}
