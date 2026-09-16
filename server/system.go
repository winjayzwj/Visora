package server

import (
	"context"
	"errors"
	"net/http"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func (store *MongoStore) ListAdmins(ctx context.Context, input ListAdminsInput) ([]User, error) {
	filter := bson.D{{Key: "role", Value: RoleAdmin}}
	if input.After != nil {
		objectID, err := bson.ObjectIDFromHex(input.After.ID)
		if err != nil {
			return nil, ErrInvalidInput
		}
		filter = append(filter, bson.E{Key: "$or", Value: bson.A{
			bson.D{{Key: "createdAt", Value: bson.D{{Key: "$lt", Value: input.After.CreatedAt.UTC()}}}},
			bson.D{{Key: "createdAt", Value: input.After.CreatedAt.UTC()}, {Key: "_id", Value: bson.D{{Key: "$lt", Value: objectID}}}},
		}})
	}
	cursor, err := store.users.Find(ctx, filter, options.Find().
		SetSort(bson.D{{Key: "createdAt", Value: -1}, {Key: "_id", Value: -1}}).
		SetLimit(input.Limit))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	items := make([]User, 0)
	for cursor.Next(ctx) {
		var document mongoUser
		if err := cursor.Decode(&document); err != nil {
			return nil, err
		}
		items = append(items, document.user())
	}
	return items, cursor.Err()
}

func (store *MongoStore) CreateAdminAccount(ctx context.Context, input CreateUserInput) (User, error) {
	document := mongoUser{
		ID:           bson.NewObjectID(),
		Email:        input.Email,
		PasswordHash: append([]byte(nil), input.PasswordHash...),
		Role:         RoleAdmin,
		Status:       StatusActive,
		CreatedAt:    input.CreatedAt.UTC(),
	}
	err := store.transaction(ctx, func(transactionContext context.Context) error {
		if _, err := store.users.InsertOne(transactionContext, document); err != nil {
			if mongo.IsDuplicateKeyError(err) {
				return ErrEmailExists
			}
			return err
		}
		return store.writeAudit(transactionContext, input.ActorID, document.ID.Hex(), "admin.created", input.CreatedAt)
	})
	if mongo.IsDuplicateKeyError(err) {
		return User{}, ErrEmailExists
	}
	if err != nil {
		return User{}, err
	}
	return document.user(), nil
}

func (store *MongoStore) CountActiveAdmins(ctx context.Context) (int64, error) {
	return store.users.CountDocuments(ctx, bson.D{
		{Key: "role", Value: RoleAdmin},
		{Key: "status", Value: StatusActive},
	})
}

// SetAdminStatus 保护两条底线：不能停用自己，也不能停用最后一个启用中的管理员。
// 停用同时递增 sessionVersion，让已签发的会话立即失效。
func (store *MongoStore) SetAdminStatus(ctx context.Context, input SetUserStatusInput) (User, error) {
	if input.UserID == input.ActorID {
		return User{}, ErrSelfAction
	}
	objectID, err := bson.ObjectIDFromHex(input.UserID)
	if err != nil {
		return User{}, ErrNotFound
	}
	var result mongoUser
	err = store.transaction(ctx, func(transactionContext context.Context) error {
		var current mongoUser
		err := store.users.FindOne(transactionContext, bson.D{{Key: "_id", Value: objectID}}).Decode(&current)
		if errors.Is(err, mongo.ErrNoDocuments) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		if current.Role != RoleAdmin {
			return ErrUserProtected
		}
		if current.Status == input.Status {
			result = current
			return nil
		}
		if input.Status == StatusDisabled {
			count, err := store.CountActiveAdmins(transactionContext)
			if err != nil {
				return err
			}
			if count <= 1 {
				return ErrLastAdmin
			}
		}

		update := bson.D{{Key: "$set", Value: bson.D{{Key: "status", Value: input.Status}}}}
		if input.Status == StatusDisabled {
			update = append(update, bson.E{Key: "$inc", Value: bson.D{{Key: "sessionVersion", Value: 1}}})
		}
		err = store.users.FindOneAndUpdate(
			transactionContext,
			bson.D{{Key: "_id", Value: objectID}, {Key: "role", Value: RoleAdmin}},
			update,
			options.FindOneAndUpdate().SetReturnDocument(options.After),
		).Decode(&result)
		if errors.Is(err, mongo.ErrNoDocuments) {
			return ErrUserProtected
		}
		if err != nil {
			return err
		}
		return store.writeAudit(transactionContext, input.ActorID, input.UserID, "admin.status_changed", input.CreatedAt)
	})
	if err != nil {
		return User{}, err
	}
	return result.user(), nil
}

func (store *MongoStore) Overview(ctx context.Context, now time.Time) (OverviewStats, error) {
	now = now.UTC()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	weekStart := todayStart.AddDate(0, 0, -6)

	stats := OverviewStats{Signups: make([]DailyCount, 0, 7)}
	count := func(filter bson.D) (int64, error) {
		return store.users.CountDocuments(ctx, filter)
	}

	var err error
	if stats.TotalUsers, err = count(bson.D{{Key: "role", Value: RoleUser}}); err != nil {
		return OverviewStats{}, err
	}
	if stats.ActiveUsers, err = count(bson.D{{Key: "role", Value: RoleUser}, {Key: "status", Value: StatusActive}}); err != nil {
		return OverviewStats{}, err
	}
	if stats.DisabledUsers, err = count(bson.D{{Key: "role", Value: RoleUser}, {Key: "status", Value: StatusDisabled}}); err != nil {
		return OverviewStats{}, err
	}
	if stats.AdminUsers, err = count(bson.D{{Key: "role", Value: RoleAdmin}}); err != nil {
		return OverviewStats{}, err
	}
	if stats.NewUsersThisMonth, err = count(bson.D{
		{Key: "role", Value: RoleUser},
		{Key: "createdAt", Value: bson.D{{Key: "$gte", Value: monthStart}}},
	}); err != nil {
		return OverviewStats{}, err
	}
	if stats.TotalModels, err = store.models.CountDocuments(ctx, bson.D{}); err != nil {
		return OverviewStats{}, err
	}
	if stats.ActiveModels, err = store.models.CountDocuments(ctx, bson.D{{Key: "status", Value: StatusActive}}); err != nil {
		return OverviewStats{}, err
	}
	if stats.TotalTeams, err = store.teams.CountDocuments(ctx, bson.D{}); err != nil {
		return OverviewStats{}, err
	}
	if stats.ActiveTeams, err = store.teams.CountDocuments(ctx, bson.D{{Key: "status", Value: StatusActive}}); err != nil {
		return OverviewStats{}, err
	}
	if stats.PendingApplications, err = store.applications.CountDocuments(ctx, bson.D{{Key: "status", Value: StatusPending}}); err != nil {
		return OverviewStats{}, err
	}
	if stats.ActiveMemberships, err = store.memberships.CountDocuments(ctx, bson.D{
		{Key: "status", Value: StatusActive},
		{Key: "expiresAt", Value: bson.D{{Key: "$gt", Value: now}}},
	}); err != nil {
		return OverviewStats{}, err
	}

	if stats.OutstandingPoints, err = store.sumPoints(ctx, store.users, bson.D{{Key: "role", Value: RoleUser}}, "points"); err != nil {
		return OverviewStats{}, err
	}
	if stats.TeamPoolPoints, err = store.sumPoints(ctx, store.teams, bson.D{}, "pointsPool"); err != nil {
		return OverviewStats{}, err
	}
	if stats.IssuedPoints, err = store.sumPoints(ctx, store.points, bson.D{{Key: "kind", Value: PointGrant}}, "delta"); err != nil {
		return OverviewStats{}, err
	}
	var revoked int64
	if revoked, err = store.sumPoints(ctx, store.points, bson.D{{Key: "kind", Value: PointRevoke}}, "delta"); err != nil {
		return OverviewStats{}, err
	}
	// 撤销流水存的是负值，展示成正数更好读。
	stats.RevokedPoints = -revoked

	signups, err := store.signupSeries(ctx, weekStart, todayStart)
	if err != nil {
		return OverviewStats{}, err
	}
	for offset := 0; offset < 7; offset++ {
		day := weekStart.AddDate(0, 0, offset)
		key := day.Format("2006-01-02")
		stats.Signups = append(stats.Signups, DailyCount{Date: key, Count: signups[key]})
	}
	return stats, nil
}

func (store *MongoStore) sumPoints(ctx context.Context, collection *mongo.Collection, filter bson.D, field string) (int64, error) {
	cursor, err := collection.Aggregate(ctx, bson.A{
		bson.D{{Key: "$match", Value: filter}},
		bson.D{{Key: "$group", Value: bson.D{
			{Key: "_id", Value: nil},
			{Key: "total", Value: bson.D{{Key: "$sum", Value: "$" + field}}},
		}}},
	})
	if err != nil {
		return 0, err
	}
	defer cursor.Close(ctx)
	if !cursor.Next(ctx) {
		return 0, cursor.Err()
	}
	var row struct {
		Total int64 `bson:"total"`
	}
	if err := cursor.Decode(&row); err != nil {
		return 0, err
	}
	return row.Total, cursor.Err()
}

// signupSeries 按天统计注册数。时间口径固定为 UTC，UI 上要写明，
// 不要让人误以为是本地时区（D10 尚未确认报表时区）。
func (store *MongoStore) signupSeries(ctx context.Context, from, to time.Time) (map[string]int64, error) {
	cursor, err := store.users.Aggregate(ctx, bson.A{
		bson.D{{Key: "$match", Value: bson.D{
			{Key: "role", Value: RoleUser},
			{Key: "createdAt", Value: bson.D{{Key: "$gte", Value: from}, {Key: "$lte", Value: to.AddDate(0, 0, 1)}}},
		}}},
		bson.D{{Key: "$group", Value: bson.D{
			{Key: "_id", Value: bson.D{{Key: "$dateToString", Value: bson.D{
				{Key: "format", Value: "%Y-%m-%d"},
				{Key: "date", Value: "$createdAt"},
				{Key: "timezone", Value: "UTC"},
			}}}},
			{Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}},
		}}},
	})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	result := make(map[string]int64)
	for cursor.Next(ctx) {
		var row struct {
			Date  string `bson:"_id"`
			Count int64  `bson:"count"`
		}
		if err := cursor.Decode(&row); err != nil {
			return nil, err
		}
		result[row.Date] = row.Count
	}
	return result, cursor.Err()
}

// PermissionRules 返回真实的服务端授权矩阵。
// 需求对照 D08 要求「不只隐藏菜单充当授权」，所以这里描述的是
// 各接口实际要求的身份，而不是可编辑的菜单可见性。
func PermissionRules() []PermissionRule {
	return []PermissionRule{
		{Group: "账号与会话", Action: "登录 / 退出 / 查看本人身份", Endpoint: "/api/auth/*", UserAllowed: true, Note: "已登录账号可访问自身会话"},
		{Group: "用户管理", Action: "查看用户列表与精确邮箱查询", Endpoint: "GET /api/admin/users", UserAllowed: false, Note: "仅管理员"},
		{Group: "用户管理", Action: "创建用户", Endpoint: "POST /api/admin/users", UserAllowed: false, Note: "仅管理员，只能创建普通用户"},
		{Group: "用户管理", Action: "停用 / 恢复用户", Endpoint: "PATCH /api/admin/users/{id}", UserAllowed: false, Note: "管理员账号受保护，不可通过此接口修改"},
		{Group: "积分管理", Action: "查看积分流水", Endpoint: "GET /api/admin/points/ledger", UserAllowed: false, Note: "仅管理员"},
		{Group: "积分管理", Action: "发放 / 撤销积分", Endpoint: "POST /api/admin/points/*", UserAllowed: false, Note: "仅管理员，撤销不允许透支"},
		{Group: "AI 资源", Action: "查看与维护模型目录", Endpoint: "/api/admin/models*", UserAllowed: false, Note: "仅管理员，密钥不进入本目录"},
		{Group: "团队管理", Action: "团队、成员与团队积分", Endpoint: "/api/admin/teams*", UserAllowed: false, Note: "仅管理员"},
		{Group: "会员管理", Action: "套餐配置与申请审批", Endpoint: "/api/admin/membership*", UserAllowed: false, Note: "仅管理员"},
		{Group: "会员管理", Action: "提交会员申请", Endpoint: "POST /api/membership/applications", UserAllowed: true, Note: "已登录用户可提交"},
		{Group: "系统", Action: "后台账号与授权查看", Endpoint: "/api/admin/accounts*", UserAllowed: false, Note: "仅管理员，不能停用自己或最后一个管理员"},
		{Group: "概览", Action: "查看运营看板", Endpoint: "GET /api/admin/stats/overview", UserAllowed: false, Note: "仅管理员"},
	}
}

// ── HTTP ────────────────────────────────────────────────────

func (app *app) listAdmins(w http.ResponseWriter, r *http.Request) {
	if _, err := app.requireAdmin(r); err != nil {
		app.writeAuthError(w, err)
		return
	}
	input := ListAdminsInput{Limit: app.config.PageSize + 1}
	if raw := r.URL.Query().Get("cursor"); raw != "" {
		parsed, err := decodeSimpleCursor(raw)
		if err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
			return
		}
		input.After = &UserCursor{CreatedAt: parsed.CreatedAt, ID: parsed.ID}
	}
	items, err := app.store.ListAdmins(r.Context(), input)
	if err != nil {
		app.writeStoreError(w, err)
		return
	}
	var nextCursor *string
	if int64(len(items)) > app.config.PageSize {
		items = items[:app.config.PageSize]
		cursor := encodeSimpleCursor(items[len(items)-1].CreatedAt, items[len(items)-1].ID)
		nextCursor = &cursor
	}
	writeJSON(w, http.StatusOK, struct {
		Items      []User  `json:"items"`
		NextCursor *string `json:"nextCursor"`
	}{Items: items, NextCursor: nextCursor})
}

func (app *app) createAdminAccount(w http.ResponseWriter, r *http.Request) {
	admin, err := app.requireAdmin(r)
	if err != nil {
		app.writeAuthError(w, err)
		return
	}
	var input credentialsInput
	if !app.decodeJSON(w, r, &input) {
		return
	}
	email, err := NormalizeEmail(input.Email)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
		return
	}
	passwordHash, err := HashPassword(input.Password)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
		return
	}
	user, err := app.store.CreateAdminAccount(r.Context(), CreateUserInput{
		Email:        email,
		PasswordHash: passwordHash,
		ActorID:      admin.ID,
		CreatedAt:    app.now().UTC(),
	})
	if err != nil {
		app.writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, struct {
		User User `json:"user"`
	}{User: user})
}

func (app *app) setAdminStatus(w http.ResponseWriter, r *http.Request, userID string) {
	admin, err := app.requireAdmin(r)
	if err != nil {
		app.writeAuthError(w, err)
		return
	}
	if userID == "" {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "账号不存在")
		return
	}
	var input statusInput
	if !app.decodeJSON(w, r, &input) {
		return
	}
	if input.Status != StatusActive && input.Status != StatusDisabled {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
		return
	}
	user, err := app.store.SetAdminStatus(r.Context(), SetUserStatusInput{
		UserID:    userID,
		Status:    input.Status,
		ActorID:   admin.ID,
		CreatedAt: app.now().UTC(),
	})
	if err != nil {
		app.writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		User User `json:"user"`
	}{User: user})
}

func (app *app) listPermissions(w http.ResponseWriter, r *http.Request) {
	if _, err := app.requireAdmin(r); err != nil {
		app.writeAuthError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Items []PermissionRule `json:"items"`
	}{Items: PermissionRules()})
}

func (app *app) overview(w http.ResponseWriter, r *http.Request) {
	if _, err := app.requireAdmin(r); err != nil {
		app.writeAuthError(w, err)
		return
	}
	stats, err := app.store.Overview(r.Context(), app.now())
	if err != nil {
		app.writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Stats OverviewStats `json:"stats"`
	}{Stats: stats})
}
