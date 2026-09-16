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

type mongoPlan struct {
	Code         string   `bson:"code"`
	Name         string   `bson:"name"`
	Description  string   `bson:"description"`
	DurationDays int64    `bson:"durationDays"`
	BonusPoints  int64    `bson:"bonusPoints"`
	Features     []string `bson:"features"`
	Status       string   `bson:"status"`
}

func (document mongoPlan) plan() MembershipPlan {
	features := document.Features
	if features == nil {
		features = []string{}
	}
	return MembershipPlan{
		Code:         document.Code,
		Name:         document.Name,
		Description:  document.Description,
		DurationDays: document.DurationDays,
		BonusPoints:  document.BonusPoints,
		Features:     append([]string{}, features...),
		Status:       document.Status,
	}
}

type mongoApplication struct {
	ID        bson.ObjectID `bson:"_id"`
	UserID    bson.ObjectID `bson:"userId"`
	UserEmail string        `bson:"userEmail"`
	Scene     string        `bson:"scene"`
	Reason    string        `bson:"reason"`
	Status    string        `bson:"status"`
	DecidedBy string        `bson:"decidedBy,omitempty"`
	DecidedAt *time.Time    `bson:"decidedAt,omitempty"`
	PlanCode  string        `bson:"planCode,omitempty"`
	CreatedAt time.Time     `bson:"createdAt"`
}

func (document mongoApplication) application() MembershipApplication {
	result := MembershipApplication{
		ID:        document.ID.Hex(),
		UserID:    document.UserID.Hex(),
		UserEmail: document.UserEmail,
		Scene:     document.Scene,
		Reason:    document.Reason,
		Status:    document.Status,
		DecidedBy: document.DecidedBy,
		PlanCode:  document.PlanCode,
		CreatedAt: document.CreatedAt.UTC(),
	}
	if document.DecidedAt != nil {
		decided := document.DecidedAt.UTC()
		result.DecidedAt = &decided
	}
	return result
}

type mongoMembership struct {
	ID            bson.ObjectID `bson:"_id"`
	UserID        bson.ObjectID `bson:"userId"`
	UserEmail     string        `bson:"userEmail"`
	PlanCode      string        `bson:"planCode"`
	PlanName      string        `bson:"planName"`
	GrantedPoints int64         `bson:"grantedPoints"`
	StartedAt     time.Time     `bson:"startedAt"`
	ExpiresAt     time.Time     `bson:"expiresAt"`
	Status        string        `bson:"status"`
	CreatedAt     time.Time     `bson:"createdAt"`
}

func (document mongoMembership) membership() Membership {
	status := document.Status
	if status == StatusActive && !document.ExpiresAt.After(time.Now().UTC()) {
		status = StatusExpired
	}
	return Membership{
		ID:            document.ID.Hex(),
		UserID:        document.UserID.Hex(),
		UserEmail:     document.UserEmail,
		PlanCode:      document.PlanCode,
		PlanName:      document.PlanName,
		GrantedPoints: document.GrantedPoints,
		StartedAt:     document.StartedAt.UTC(),
		ExpiresAt:     document.ExpiresAt.UTC(),
		Status:        status,
		CreatedAt:     document.CreatedAt.UTC(),
	}
}

func (store *MongoStore) ListPlans(ctx context.Context) ([]MembershipPlan, error) {
	cursor, err := store.plans.Find(ctx, bson.D{}, options.Find().SetSort(bson.D{{Key: "code", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	items := make([]MembershipPlan, 0)
	for cursor.Next(ctx) {
		var document mongoPlan
		if err := cursor.Decode(&document); err != nil {
			return nil, err
		}
		items = append(items, document.plan())
	}
	return items, cursor.Err()
}

// UpdatePlan 按 code 做 upsert：套餐是运营配置，允许先建后改。
func (store *MongoStore) UpdatePlan(ctx context.Context, input UpdatePlanInput) (MembershipPlan, error) {
	if input.Code == "" || input.Name == "" {
		return MembershipPlan{}, ErrInvalidInput
	}
	features := input.Features
	if features == nil {
		features = []string{}
	}
	status := input.Status
	if status == "" {
		status = StatusActive
	}
	var result mongoPlan
	err := store.plans.FindOneAndUpdate(
		ctx,
		bson.D{{Key: "code", Value: input.Code}},
		bson.D{{Key: "$set", Value: bson.D{
			{Key: "name", Value: input.Name},
			{Key: "description", Value: input.Description},
			{Key: "durationDays", Value: input.DurationDays},
			{Key: "bonusPoints", Value: input.BonusPoints},
			{Key: "features", Value: features},
			{Key: "status", Value: status},
		}}},
		options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After),
	).Decode(&result)
	if err != nil {
		return MembershipPlan{}, err
	}
	return result.plan(), nil
}

func (store *MongoStore) ListApplications(ctx context.Context, input ListApplicationsInput) ([]MembershipApplication, error) {
	filter := bson.D{}
	if input.Status != "" {
		filter = append(filter, bson.E{Key: "status", Value: input.Status})
	}
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
	cursor, err := store.applications.Find(ctx, filter, options.Find().
		SetSort(bson.D{{Key: "createdAt", Value: -1}, {Key: "_id", Value: -1}}).
		SetLimit(input.Limit))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	items := make([]MembershipApplication, 0)
	for cursor.Next(ctx) {
		var document mongoApplication
		if err := cursor.Decode(&document); err != nil {
			return nil, err
		}
		items = append(items, document.application())
	}
	return items, cursor.Err()
}

func (store *MongoStore) SubmitApplication(ctx context.Context, input SubmitApplicationInput) (MembershipApplication, error) {
	var result mongoApplication
	err := store.transaction(ctx, func(transactionContext context.Context) error {
		userID, user, err := store.findUserObjectID(transactionContext, input.UserID)
		if err != nil {
			return err
		}
		document := mongoApplication{
			ID:        bson.NewObjectID(),
			UserID:    userID,
			UserEmail: user.Email,
			Scene:     input.Scene,
			Reason:    input.Reason,
			Status:    StatusPending,
			CreatedAt: input.CreatedAt.UTC(),
		}
		if _, err := store.applications.InsertOne(transactionContext, document); err != nil {
			return err
		}
		result = document
		return nil
	})
	if err != nil {
		return MembershipApplication{}, err
	}
	return result.application(), nil
}

// DecideApplication 用 status=pending 的条件更新做幂等闸门：
// 同一份申请被重复提交时只有第一次能改到状态，后续返回 ErrAlreadyDecided，
// 因此赠送积分不会重复发放。
func (store *MongoStore) DecideApplication(ctx context.Context, input DecideApplicationInput) (MembershipApplication, error) {
	objectID, err := bson.ObjectIDFromHex(input.ApplicationID)
	if err != nil {
		return MembershipApplication{}, ErrNotFound
	}

	var result mongoApplication
	err = store.transaction(ctx, func(transactionContext context.Context) error {
		var application mongoApplication
		err := store.applications.FindOne(transactionContext, bson.D{{Key: "_id", Value: objectID}}).Decode(&application)
		if errors.Is(err, mongo.ErrNoDocuments) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}

		decided := input.CreatedAt.UTC()
		set := bson.D{
			{Key: "status", Value: StatusRejected},
			{Key: "decidedBy", Value: input.ActorID},
			{Key: "decidedAt", Value: decided},
		}

		var plan mongoPlan
		if input.Approve {
			err := store.plans.FindOne(transactionContext, bson.D{{Key: "code", Value: input.PlanCode}}).Decode(&plan)
			if errors.Is(err, mongo.ErrNoDocuments) {
				return ErrPlanNotFound
			}
			if err != nil {
				return err
			}
			set = bson.D{
				{Key: "status", Value: StatusApproved},
				{Key: "decidedBy", Value: input.ActorID},
				{Key: "decidedAt", Value: decided},
				{Key: "planCode", Value: plan.Code},
			}
		}

		var updated mongoApplication
		err = store.applications.FindOneAndUpdate(
			transactionContext,
			bson.D{{Key: "_id", Value: objectID}, {Key: "status", Value: StatusPending}},
			bson.D{{Key: "$set", Value: set}},
			options.FindOneAndUpdate().SetReturnDocument(options.After),
		).Decode(&updated)
		if errors.Is(err, mongo.ErrNoDocuments) {
			return ErrAlreadyDecided
		}
		if err != nil {
			return err
		}

		if input.Approve {
			expiresAt := decided
			if plan.DurationDays > 0 {
				expiresAt = decided.AddDate(0, 0, int(plan.DurationDays))
			}
			if _, err := store.memberships.InsertOne(transactionContext, mongoMembership{
				ID:            bson.NewObjectID(),
				UserID:        application.UserID,
				UserEmail:     application.UserEmail,
				PlanCode:      plan.Code,
				PlanName:      plan.Name,
				GrantedPoints: plan.BonusPoints,
				StartedAt:     decided,
				ExpiresAt:     expiresAt,
				Status:        StatusActive,
				CreatedAt:     decided,
			}); err != nil {
				return err
			}
			if plan.BonusPoints > 0 {
				if _, err := store.applyUserPoints(transactionContext, GrantPointsInput{
					UserID:    application.UserID.Hex(),
					Amount:    plan.BonusPoints,
					Note:      "会员开通赠送 · " + plan.Name,
					ActorID:   input.ActorID,
					CreatedAt: decided,
				}, PointGrant, plan.BonusPoints); err != nil {
					return err
				}
			}
		}

		if err := store.writeAudit(transactionContext, input.ActorID, application.UserID.Hex(), "membership.application_decided", input.CreatedAt); err != nil {
			return err
		}
		result = updated
		return nil
	})
	if err != nil {
		return MembershipApplication{}, err
	}
	return result.application(), nil
}

func (store *MongoStore) ListMemberships(ctx context.Context, input ListMembershipsInput) ([]Membership, error) {
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
	cursor, err := store.memberships.Find(ctx, filter, options.Find().
		SetSort(bson.D{{Key: "createdAt", Value: -1}, {Key: "_id", Value: -1}}).
		SetLimit(input.Limit))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	items := make([]Membership, 0)
	for cursor.Next(ctx) {
		var document mongoMembership
		if err := cursor.Decode(&document); err != nil {
			return nil, err
		}
		items = append(items, document.membership())
	}
	return items, cursor.Err()
}

// ── HTTP ────────────────────────────────────────────────────

func (app *app) listPlans(w http.ResponseWriter, r *http.Request) {
	if _, err := app.requireAdmin(r); err != nil {
		app.writeAuthError(w, err)
		return
	}
	items, err := app.store.ListPlans(r.Context())
	if err != nil {
		app.writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Items []MembershipPlan `json:"items"`
	}{Items: items})
}

type updatePlanInput struct {
	Code         string   `json:"code"`
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	DurationDays int64    `json:"durationDays"`
	BonusPoints  int64    `json:"bonusPoints"`
	Features     []string `json:"features"`
	Status       string   `json:"status"`
}

func (app *app) updatePlan(w http.ResponseWriter, r *http.Request) {
	if _, err := app.requireAdmin(r); err != nil {
		app.writeAuthError(w, err)
		return
	}
	var input updatePlanInput
	if !app.decodeJSON(w, r, &input) {
		return
	}
	code := strings.TrimSpace(input.Code)
	name := strings.TrimSpace(input.Name)
	description := strings.TrimSpace(input.Description)
	if code == "" || len([]rune(code)) > 32 || name == "" || len([]rune(name)) > 40 {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
		return
	}
	if len([]rune(description)) > 200 {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
		return
	}
	if input.DurationDays < 0 || input.DurationDays > 3650 {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
		return
	}
	if input.BonusPoints < 0 || input.BonusPoints > maxPointAmount {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
		return
	}
	if len(input.Features) > 20 {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
		return
	}
	features := make([]string, 0, len(input.Features))
	for _, feature := range input.Features {
		trimmed := strings.TrimSpace(feature)
		if trimmed == "" || len([]rune(trimmed)) > 60 {
			writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
			return
		}
		features = append(features, trimmed)
	}
	status := input.Status
	if status == "" {
		status = StatusActive
	}
	if status != StatusActive && status != StatusDisabled {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
		return
	}
	plan, err := app.store.UpdatePlan(r.Context(), UpdatePlanInput{
		Code:         code,
		Name:         name,
		Description:  description,
		DurationDays: input.DurationDays,
		BonusPoints:  input.BonusPoints,
		Features:     features,
		Status:       status,
	})
	if err != nil {
		app.writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Plan MembershipPlan `json:"plan"`
	}{Plan: plan})
}

func (app *app) listApplications(w http.ResponseWriter, r *http.Request) {
	if _, err := app.requireAdmin(r); err != nil {
		app.writeAuthError(w, err)
		return
	}
	input := ListApplicationsInput{Limit: app.config.PageSize + 1}
	status := r.URL.Query().Get("status")
	if status != "" {
		if status != StatusPending && status != StatusApproved && status != StatusRejected {
			writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
			return
		}
		input.Status = status
	}
	if raw := r.URL.Query().Get("cursor"); raw != "" {
		parsed, err := decodeSimpleCursor(raw)
		if err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
			return
		}
		input.After = &ApplicationCursor{CreatedAt: parsed.CreatedAt, ID: parsed.ID}
	}
	items, err := app.store.ListApplications(r.Context(), input)
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
		Items      []MembershipApplication `json:"items"`
		NextCursor *string                 `json:"nextCursor"`
	}{Items: items, NextCursor: nextCursor})
}

// submitApplication 是用户侧入口。没有它，审批页永远不会有真实数据。
func (app *app) submitApplication(w http.ResponseWriter, r *http.Request) {
	user, err := app.currentUser(r)
	if err != nil {
		app.writeAuthError(w, err)
		return
	}
	var input struct {
		Scene  string `json:"scene"`
		Reason string `json:"reason"`
	}
	if !app.decodeJSON(w, r, &input) {
		return
	}
	scene := strings.TrimSpace(input.Scene)
	reason := strings.TrimSpace(input.Reason)
	if scene == "" || len([]rune(scene)) > 60 || reason == "" || len([]rune(reason)) > 500 {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
		return
	}
	application, err := app.store.SubmitApplication(r.Context(), SubmitApplicationInput{
		UserID:    user.ID,
		Scene:     scene,
		Reason:    reason,
		CreatedAt: app.now().UTC(),
	})
	if err != nil {
		app.writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, struct {
		Application MembershipApplication `json:"application"`
	}{Application: application})
}

func (app *app) decideApplication(w http.ResponseWriter, r *http.Request, applicationID string, approve bool) {
	admin, err := app.requireAdmin(r)
	if err != nil {
		app.writeAuthError(w, err)
		return
	}
	var input struct {
		PlanCode string `json:"planCode"`
	}
	if !app.decodeJSON(w, r, &input) {
		return
	}
	planCode := strings.TrimSpace(input.PlanCode)
	if approve && planCode == "" {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请选择要开通的套餐")
		return
	}
	application, err := app.store.DecideApplication(r.Context(), DecideApplicationInput{
		ApplicationID: applicationID,
		Approve:       approve,
		PlanCode:      planCode,
		ActorID:       admin.ID,
		CreatedAt:     app.now().UTC(),
	})
	if err != nil {
		app.writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Application MembershipApplication `json:"application"`
	}{Application: application})
}

func (app *app) listMemberships(w http.ResponseWriter, r *http.Request) {
	if _, err := app.requireAdmin(r); err != nil {
		app.writeAuthError(w, err)
		return
	}
	input := ListMembershipsInput{Limit: app.config.PageSize + 1}
	if raw := r.URL.Query().Get("cursor"); raw != "" {
		parsed, err := decodeSimpleCursor(raw)
		if err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
			return
		}
		input.After = &ApplicationCursor{CreatedAt: parsed.CreatedAt, ID: parsed.ID}
	}
	items, err := app.store.ListMemberships(r.Context(), input)
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
		Items      []Membership `json:"items"`
		NextCursor *string      `json:"nextCursor"`
	}{Items: items, NextCursor: nextCursor})
}
