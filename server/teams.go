package server

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type mongoTeam struct {
	ID             bson.ObjectID `bson:"_id"`
	Name           string        `bson:"name"`
	AdminUserID    bson.ObjectID `bson:"adminUserId"`
	AdminEmail     string        `bson:"adminEmail"`
	MemberCount    int64         `bson:"memberCount"`
	PointsPool     int64         `bson:"pointsPool"`
	AllocatedTotal int64         `bson:"allocatedTotal"`
	Status         string        `bson:"status"`
	CreatedAt      time.Time     `bson:"createdAt"`
}

func (document mongoTeam) team() Team {
	return Team{
		ID:             document.ID.Hex(),
		Name:           document.Name,
		AdminUserID:    document.AdminUserID.Hex(),
		AdminEmail:     document.AdminEmail,
		MemberCount:    document.MemberCount,
		PointsPool:     document.PointsPool,
		AllocatedTotal: document.AllocatedTotal,
		Status:         document.Status,
		CreatedAt:      document.CreatedAt.UTC(),
	}
}

type mongoTeamMember struct {
	ID              bson.ObjectID `bson:"_id"`
	TeamID          bson.ObjectID `bson:"teamId"`
	UserID          bson.ObjectID `bson:"userId"`
	Email           string        `bson:"email"`
	Role            string        `bson:"role"`
	AllocatedPoints int64         `bson:"allocatedPoints"`
	CreatedAt       time.Time     `bson:"createdAt"`
}

func (document mongoTeamMember) member() TeamMember {
	return TeamMember{
		UserID:          document.UserID.Hex(),
		Email:           document.Email,
		Role:            document.Role,
		AllocatedPoints: document.AllocatedPoints,
		CreatedAt:       document.CreatedAt.UTC(),
	}
}

func (store *MongoStore) ListTeams(ctx context.Context, input ListTeamsInput) ([]Team, error) {
	filter := bson.D{}
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
	cursor, err := store.teams.Find(ctx, filter, options.Find().
		SetSort(bson.D{{Key: "createdAt", Value: -1}, {Key: "_id", Value: -1}}).
		SetLimit(input.Limit))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	items := make([]Team, 0)
	ids := make([]bson.ObjectID, 0)
	for cursor.Next(ctx) {
		var document mongoTeam
		if err := cursor.Decode(&document); err != nil {
			return nil, err
		}
		items = append(items, document.team())
		ids = append(ids, document.ID)
	}
	if err := cursor.Err(); err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return items, nil
	}
	// 「本月已分配」只能从流水算，团队文档上只维护累计值。
	monthly, err := store.allocatedThisMonth(ctx, ids)
	if err != nil {
		return nil, err
	}
	for index := range items {
		items[index].AllocatedThisMonth = monthly[items[index].ID]
	}
	return items, nil
}

func (store *MongoStore) allocatedThisMonth(ctx context.Context, teamIDs []bson.ObjectID) (map[string]int64, error) {
	now := time.Now().UTC()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	cursor, err := store.points.Aggregate(ctx, bson.A{
		bson.D{{Key: "$match", Value: bson.D{
			{Key: "teamId", Value: bson.D{{Key: "$in", Value: teamIDs}}},
			{Key: "kind", Value: PointAllocate},
			{Key: "createdAt", Value: bson.D{{Key: "$gte", Value: monthStart}}},
		}}},
		bson.D{{Key: "$group", Value: bson.D{
			{Key: "_id", Value: "$teamId"},
			{Key: "total", Value: bson.D{{Key: "$sum", Value: "$delta"}}},
		}}},
	})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	result := make(map[string]int64, len(teamIDs))
	for cursor.Next(ctx) {
		var row struct {
			ID    bson.ObjectID `bson:"_id"`
			Total int64         `bson:"total"`
		}
		if err := cursor.Decode(&row); err != nil {
			return nil, err
		}
		result[row.ID.Hex()] = row.Total
	}
	return result, cursor.Err()
}

func (store *MongoStore) CreateTeam(ctx context.Context, input CreateTeamInput) (Team, error) {
	var result mongoTeam
	err := store.transaction(ctx, func(transactionContext context.Context) error {
		adminID, admin, err := store.findUserObjectID(transactionContext, input.AdminUserID)
		if err != nil {
			return err
		}
		document := mongoTeam{
			ID:          bson.NewObjectID(),
			Name:        input.Name,
			AdminUserID: adminID,
			AdminEmail:  admin.Email,
			MemberCount: 1,
			PointsPool:  0,
			Status:      StatusActive,
			CreatedAt:   input.CreatedAt.UTC(),
		}
		if _, err := store.teams.InsertOne(transactionContext, document); err != nil {
			if mongo.IsDuplicateKeyError(err) {
				return ErrNameExists
			}
			return err
		}
		if _, err := store.members.InsertOne(transactionContext, mongoTeamMember{
			ID:        bson.NewObjectID(),
			TeamID:    document.ID,
			UserID:    adminID,
			Email:     admin.Email,
			Role:      TeamRoleAdmin,
			CreatedAt: input.CreatedAt.UTC(),
		}); err != nil {
			return err
		}
		if err := store.writeAudit(transactionContext, input.ActorID, document.ID.Hex(), "team.created", input.CreatedAt); err != nil {
			return err
		}
		result = document
		return nil
	})
	if mongo.IsDuplicateKeyError(err) {
		return Team{}, ErrNameExists
	}
	if err != nil {
		return Team{}, err
	}
	return result.team(), nil
}

// DissolveTeam 只把状态改成 dissolved，并按需求对照 C07 保留积分池与成员关系。
// 清空积分、删除团队素材属于破坏性动作，D09 未确认前不实施。
func (store *MongoStore) DissolveTeam(ctx context.Context, input TeamActionInput) (Team, error) {
	objectID, err := bson.ObjectIDFromHex(input.TeamID)
	if err != nil {
		return Team{}, ErrNotFound
	}
	var result mongoTeam
	err = store.transaction(ctx, func(transactionContext context.Context) error {
		err := store.teams.FindOneAndUpdate(
			transactionContext,
			bson.D{{Key: "_id", Value: objectID}},
			bson.D{{Key: "$set", Value: bson.D{{Key: "status", Value: StatusDissolved}}}},
			options.FindOneAndUpdate().SetReturnDocument(options.After),
		).Decode(&result)
		if errors.Is(err, mongo.ErrNoDocuments) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		return store.writeAudit(transactionContext, input.ActorID, input.TeamID, "team.dissolved", input.CreatedAt)
	})
	if err != nil {
		return Team{}, err
	}
	return result.team(), nil
}

func (store *MongoStore) ListTeamMembers(ctx context.Context, teamID string) ([]TeamMember, error) {
	objectID, err := bson.ObjectIDFromHex(teamID)
	if err != nil {
		return nil, ErrNotFound
	}
	cursor, err := store.members.Find(ctx,
		bson.D{{Key: "teamId", Value: objectID}},
		options.Find().SetSort(bson.D{{Key: "createdAt", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	items := make([]TeamMember, 0)
	for cursor.Next(ctx) {
		var document mongoTeamMember
		if err := cursor.Decode(&document); err != nil {
			return nil, err
		}
		items = append(items, document.member())
	}
	return items, cursor.Err()
}

func (store *MongoStore) AddTeamMember(ctx context.Context, input TeamMemberInput) (TeamMember, error) {
	var result mongoTeamMember
	err := store.transaction(ctx, func(transactionContext context.Context) error {
		if err := store.requireActiveTeam(transactionContext, input.TeamID); err != nil {
			return err
		}
		teamID, _ := bson.ObjectIDFromHex(input.TeamID)
		userID, user, err := store.findUserObjectID(transactionContext, input.UserID)
		if err != nil {
			return err
		}
		document := mongoTeamMember{
			ID:        bson.NewObjectID(),
			TeamID:    teamID,
			UserID:    userID,
			Email:     user.Email,
			Role:      TeamRoleMember,
			CreatedAt: input.CreatedAt.UTC(),
		}
		if _, err := store.members.InsertOne(transactionContext, document); err != nil {
			if mongo.IsDuplicateKeyError(err) {
				return ErrMemberExists
			}
			return err
		}
		if _, err := store.teams.UpdateOne(transactionContext,
			bson.D{{Key: "_id", Value: teamID}},
			bson.D{{Key: "$inc", Value: bson.D{{Key: "memberCount", Value: 1}}}},
		); err != nil {
			return err
		}
		if err := store.writeAudit(transactionContext, input.ActorID, input.UserID, "team.member_added", input.CreatedAt); err != nil {
			return err
		}
		result = document
		return nil
	})
	if mongo.IsDuplicateKeyError(err) {
		return TeamMember{}, ErrMemberExists
	}
	if err != nil {
		return TeamMember{}, err
	}
	return result.member(), nil
}

// RemoveTeamMember 在该成员还有已分配积分时拒绝移出，避免积分凭空悬空。
// 需求对照 C07 要求解散/退出不自动清空积分，因此这里选择失败而不是静默扣减。
func (store *MongoStore) RemoveTeamMember(ctx context.Context, input TeamMemberInput) (TeamMember, error) {
	var result mongoTeamMember
	err := store.transaction(ctx, func(transactionContext context.Context) error {
		teamID, _ := bson.ObjectIDFromHex(input.TeamID)
		userID, err := bson.ObjectIDFromHex(input.UserID)
		if err != nil {
			return ErrMemberNotFound
		}
		var member mongoTeamMember
		err = store.members.FindOne(transactionContext,
			bson.D{{Key: "teamId", Value: teamID}, {Key: "userId", Value: userID}}).Decode(&member)
		if errors.Is(err, mongo.ErrNoDocuments) {
			return ErrMemberNotFound
		}
		if err != nil {
			return err
		}
		if member.Role == TeamRoleAdmin {
			return ErrUserProtected
		}
		if member.AllocatedPoints > 0 {
			return ErrMemberHasPoints
		}
		if _, err := store.members.DeleteOne(transactionContext,
			bson.D{{Key: "_id", Value: member.ID}}); err != nil {
			return err
		}
		if _, err := store.teams.UpdateOne(transactionContext,
			bson.D{{Key: "_id", Value: teamID}},
			bson.D{{Key: "$inc", Value: bson.D{{Key: "memberCount", Value: -1}}}},
		); err != nil {
			return err
		}
		if err := store.writeAudit(transactionContext, input.ActorID, input.UserID, "team.member_removed", input.CreatedAt); err != nil {
			return err
		}
		result = member
		return nil
	})
	if err != nil {
		return TeamMember{}, err
	}
	return result.member(), nil
}

func (store *MongoStore) TopUpTeam(ctx context.Context, input TeamPointsInput) (Team, error) {
	if input.Amount <= 0 {
		return Team{}, ErrInvalidInput
	}
	var result mongoTeam
	err := store.transaction(ctx, func(transactionContext context.Context) error {
		if err := store.requireActiveTeam(transactionContext, input.TeamID); err != nil {
			return err
		}
		teamID, _ := bson.ObjectIDFromHex(input.TeamID)
		err := store.teams.FindOneAndUpdate(
			transactionContext,
			bson.D{{Key: "_id", Value: teamID}},
			bson.D{{Key: "$inc", Value: bson.D{{Key: "pointsPool", Value: input.Amount}}}},
			options.FindOneAndUpdate().SetReturnDocument(options.After),
		).Decode(&result)
		if errors.Is(err, mongo.ErrNoDocuments) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		if err := store.writePointEntry(transactionContext, mongoPoint{
			TeamID:       teamID,
			TeamName:     result.Name,
			Scope:        PointScopeTeamPool,
			Kind:         PointTopUp,
			Delta:        input.Amount,
			BalanceAfter: result.PointsPool,
			Note:         input.Note,
			ActorID:      input.ActorID,
			CreatedAt:    input.CreatedAt.UTC(),
		}); err != nil {
			return err
		}
		return store.writeAudit(transactionContext, input.ActorID, input.TeamID, "team.points_topped_up", input.CreatedAt)
	})
	if err != nil {
		return Team{}, err
	}
	return result.team(), nil
}

func (store *MongoStore) AllocateTeamPoints(ctx context.Context, input TeamPointsInput) (TeamMember, error) {
	return store.moveTeamPoints(ctx, input, PointAllocate)
}

func (store *MongoStore) RevokeTeamAllocation(ctx context.Context, input TeamPointsInput) (TeamMember, error) {
	return store.moveTeamPoints(ctx, input, PointAllocationRevoke)
}

// moveTeamPoints 在团队池与成员已分配积分之间搬运。
// 两个方向都用带余额条件的原子更新，余额不足直接失败，不做截断。
func (store *MongoStore) moveTeamPoints(ctx context.Context, input TeamPointsInput, kind string) (TeamMember, error) {
	if input.Amount <= 0 {
		return TeamMember{}, ErrInvalidInput
	}
	teamID, err := bson.ObjectIDFromHex(input.TeamID)
	if err != nil {
		return TeamMember{}, ErrNotFound
	}
	userID, err := bson.ObjectIDFromHex(input.UserID)
	if err != nil {
		return TeamMember{}, ErrMemberNotFound
	}
	amount := input.Amount
	if kind == PointAllocationRevoke {
		amount = -input.Amount
	}

	var result mongoTeamMember
	err = store.transaction(ctx, func(transactionContext context.Context) error {
		if err := store.requireActiveTeam(transactionContext, input.TeamID); err != nil {
			return err
		}

		poolDelta, memberDelta := -amount, amount
		poolFilter := bson.D{{Key: "_id", Value: teamID}}
		if poolDelta < 0 {
			poolFilter = append(poolFilter, bson.E{Key: "pointsPool", Value: bson.D{{Key: "$gte", Value: -poolDelta}}})
		}
		var team mongoTeam
		err := store.teams.FindOneAndUpdate(
			transactionContext,
			poolFilter,
			bson.D{{Key: "$inc", Value: bson.D{{Key: "pointsPool", Value: poolDelta}}}},
			options.FindOneAndUpdate().SetReturnDocument(options.After),
		).Decode(&team)
		if errors.Is(err, mongo.ErrNoDocuments) {
			return ErrInsufficientPoints
		}
		if err != nil {
			return err
		}

		memberFilter := bson.D{{Key: "teamId", Value: teamID}, {Key: "userId", Value: userID}}
		if memberDelta < 0 {
			memberFilter = append(memberFilter, bson.E{Key: "allocatedPoints", Value: bson.D{{Key: "$gte", Value: -memberDelta}}})
		}
		var member mongoTeamMember
		err = store.members.FindOneAndUpdate(
			transactionContext,
			memberFilter,
			bson.D{{Key: "$inc", Value: bson.D{{Key: "allocatedPoints", Value: memberDelta}}}},
			options.FindOneAndUpdate().SetReturnDocument(options.After),
		).Decode(&member)
		if errors.Is(err, mongo.ErrNoDocuments) {
			var probe mongoTeamMember
			if probeErr := store.members.FindOne(transactionContext, bson.D{
				{Key: "teamId", Value: teamID}, {Key: "userId", Value: userID},
			}).Decode(&probe); probeErr == nil {
				return ErrInsufficientPoints
			}
			return ErrMemberNotFound
		}
		if err != nil {
			return err
		}

		if amount > 0 {
			if _, err := store.teams.UpdateOne(transactionContext,
				bson.D{{Key: "_id", Value: teamID}},
				bson.D{{Key: "$inc", Value: bson.D{{Key: "allocatedTotal", Value: amount}}}},
			); err != nil {
				return err
			}
		}

		if err := store.writePointEntry(transactionContext, mongoPoint{
			UserID:       userID,
			UserEmail:    member.Email,
			TeamID:       teamID,
			TeamName:     team.Name,
			Scope:        PointScopeTeamMember,
			Kind:         kind,
			Delta:        amount,
			BalanceAfter: member.AllocatedPoints,
			Note:         input.Note,
			ActorID:      input.ActorID,
			CreatedAt:    input.CreatedAt.UTC(),
		}); err != nil {
			return err
		}
		if err := store.writeAudit(transactionContext, input.ActorID, input.UserID, "team."+kind, input.CreatedAt); err != nil {
			return err
		}
		result = member
		return nil
	})
	if err != nil {
		return TeamMember{}, err
	}
	return result.member(), nil
}

func (store *MongoStore) requireActiveTeam(ctx context.Context, teamID string) error {
	objectID, err := bson.ObjectIDFromHex(teamID)
	if err != nil {
		return ErrNotFound
	}
	var document struct {
		Status string `bson:"status"`
	}
	err = store.teams.FindOne(ctx, bson.D{{Key: "_id", Value: objectID}}, options.FindOne().SetProjection(bson.D{{Key: "status", Value: 1}})).Decode(&document)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if document.Status != StatusActive {
		return ErrTeamProtected
	}
	return nil
}

// ── HTTP ────────────────────────────────────────────────────

func (app *app) listTeams(w http.ResponseWriter, r *http.Request) {
	if _, err := app.requireAdmin(r); err != nil {
		app.writeAuthError(w, err)
		return
	}
	input := ListTeamsInput{Limit: app.config.PageSize + 1}
	if raw := r.URL.Query().Get("cursor"); raw != "" {
		parsed, err := decodeSimpleCursor(raw)
		if err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
			return
		}
		input.After = &TeamCursor{CreatedAt: parsed.CreatedAt, ID: parsed.ID}
	}
	items, err := app.store.ListTeams(r.Context(), input)
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
		Items      []Team  `json:"items"`
		NextCursor *string `json:"nextCursor"`
	}{Items: items, NextCursor: nextCursor})
}

type createTeamInput struct {
	Name        string `json:"name"`
	AdminUserID string `json:"adminUserId"`
}

func (app *app) createTeam(w http.ResponseWriter, r *http.Request) {
	admin, err := app.requireAdmin(r)
	if err != nil {
		app.writeAuthError(w, err)
		return
	}
	var input createTeamInput
	if !app.decodeJSON(w, r, &input) {
		return
	}
	name := strings.TrimSpace(input.Name)
	if name == "" || len([]rune(name)) > 60 || input.AdminUserID == "" {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
		return
	}
	team, err := app.store.CreateTeam(r.Context(), CreateTeamInput{
		Name:        name,
		AdminUserID: input.AdminUserID,
		ActorID:     admin.ID,
		CreatedAt:   app.now().UTC(),
	})
	if err != nil {
		app.writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, struct {
		Team Team `json:"team"`
	}{Team: team})
}

func (app *app) dissolveTeam(w http.ResponseWriter, r *http.Request, teamID string) {
	admin, err := app.requireAdmin(r)
	if err != nil {
		app.writeAuthError(w, err)
		return
	}
	var input struct{}
	if !app.decodeJSON(w, r, &input) {
		return
	}
	team, err := app.store.DissolveTeam(r.Context(), TeamActionInput{
		TeamID:    teamID,
		ActorID:   admin.ID,
		CreatedAt: app.now().UTC(),
	})
	if err != nil {
		app.writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Team Team `json:"team"`
	}{Team: team})
}

func (app *app) listTeamMembers(w http.ResponseWriter, r *http.Request, teamID string) {
	if _, err := app.requireAdmin(r); err != nil {
		app.writeAuthError(w, err)
		return
	}
	items, err := app.store.ListTeamMembers(r.Context(), teamID)
	if err != nil {
		app.writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Items []TeamMember `json:"items"`
	}{Items: items})
}

func (app *app) addTeamMember(w http.ResponseWriter, r *http.Request, teamID string) {
	admin, err := app.requireAdmin(r)
	if err != nil {
		app.writeAuthError(w, err)
		return
	}
	var input struct {
		UserID string `json:"userId"`
	}
	if !app.decodeJSON(w, r, &input) {
		return
	}
	if input.UserID == "" {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
		return
	}
	member, err := app.store.AddTeamMember(r.Context(), TeamMemberInput{
		TeamID:    teamID,
		UserID:    input.UserID,
		Role:      TeamRoleMember,
		ActorID:   admin.ID,
		CreatedAt: app.now().UTC(),
	})
	if err != nil {
		app.writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, struct {
		Member TeamMember `json:"member"`
	}{Member: member})
}

func (app *app) removeTeamMember(w http.ResponseWriter, r *http.Request, teamID, userID string) {
	admin, err := app.requireAdmin(r)
	if err != nil {
		app.writeAuthError(w, err)
		return
	}
	member, err := app.store.RemoveTeamMember(r.Context(), TeamMemberInput{
		TeamID:    teamID,
		UserID:    userID,
		ActorID:   admin.ID,
		CreatedAt: app.now().UTC(),
	})
	if err != nil {
		app.writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Member TeamMember `json:"member"`
	}{Member: member})
}

type teamPointsInput struct {
	UserID string `json:"userId"`
	Amount int64  `json:"amount"`
	Note   string `json:"note"`
}

func (app *app) topUpTeam(w http.ResponseWriter, r *http.Request, teamID string) {
	admin, err := app.requireAdmin(r)
	if err != nil {
		app.writeAuthError(w, err)
		return
	}
	var input teamPointsInput
	if !app.decodeJSON(w, r, &input) {
		return
	}
	if input.Amount <= 0 || input.Amount > maxPointAmount {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
		return
	}
	team, err := app.store.TopUpTeam(r.Context(), TeamPointsInput{
		TeamID:    teamID,
		Amount:    input.Amount,
		Note:      strings.TrimSpace(input.Note),
		ActorID:   admin.ID,
		CreatedAt: app.now().UTC(),
	})
	if err != nil {
		app.writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Team Team `json:"team"`
	}{Team: team})
}

func (app *app) allocateTeamPoints(w http.ResponseWriter, r *http.Request, teamID string) {
	app.moveTeamPointsHTTP(w, r, teamID, true)
}

func (app *app) revokeTeamAllocation(w http.ResponseWriter, r *http.Request, teamID string) {
	app.moveTeamPointsHTTP(w, r, teamID, false)
}

func (app *app) moveTeamPointsHTTP(w http.ResponseWriter, r *http.Request, teamID string, allocate bool) {
	admin, err := app.requireAdmin(r)
	if err != nil {
		app.writeAuthError(w, err)
		return
	}
	var input teamPointsInput
	if !app.decodeJSON(w, r, &input) {
		return
	}
	if input.UserID == "" || input.Amount <= 0 || input.Amount > maxPointAmount {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
		return
	}
	move := TeamPointsInput{
		TeamID:    teamID,
		UserID:    input.UserID,
		Amount:    input.Amount,
		Note:      strings.TrimSpace(input.Note),
		ActorID:   admin.ID,
		CreatedAt: app.now().UTC(),
	}
	var member TeamMember
	if allocate {
		member, err = app.store.AllocateTeamPoints(r.Context(), move)
	} else {
		member, err = app.store.RevokeTeamAllocation(r.Context(), move)
	}
	if err != nil {
		app.writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Member TeamMember `json:"member"`
	}{Member: member})
}
