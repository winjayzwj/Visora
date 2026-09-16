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

type mongoPoint struct {
	ID           bson.ObjectID `bson:"_id"`
	UserID       bson.ObjectID `bson:"userId"`
	UserEmail    string        `bson:"userEmail"`
	TeamID       bson.ObjectID `bson:"teamId,omitempty"`
	TeamName     string        `bson:"teamName,omitempty"`
	Scope        string        `bson:"scope"`
	Kind         string        `bson:"kind"`
	Delta        int64         `bson:"delta"`
	BalanceAfter int64         `bson:"balanceAfter"`
	ModelName    string        `bson:"modelName,omitempty"`
	Note         string        `bson:"note,omitempty"`
	ActorID      string        `bson:"actorId"`
	CreatedAt    time.Time     `bson:"createdAt"`
}

func (document mongoPoint) entry() PointEntry {
	entry := PointEntry{
		ID:           document.ID.Hex(),
		UserID:       document.UserID.Hex(),
		UserEmail:    document.UserEmail,
		Scope:        document.Scope,
		Kind:         document.Kind,
		Delta:        document.Delta,
		BalanceAfter: document.BalanceAfter,
		ModelName:    document.ModelName,
		Note:         document.Note,
		ActorID:      document.ActorID,
		CreatedAt:    document.CreatedAt.UTC(),
	}
	if !document.TeamID.IsZero() {
		entry.TeamID = document.TeamID.Hex()
	}
	entry.TeamName = document.TeamName
	return entry
}

func (store *MongoStore) GrantPoints(ctx context.Context, input GrantPointsInput) (PointEntry, error) {
	return store.moveUserPoints(ctx, input, PointGrant, input.Amount)
}

func (store *MongoStore) RevokePoints(ctx context.Context, input GrantPointsInput) (PointEntry, error) {
	return store.moveUserPoints(ctx, input, PointRevoke, -input.Amount)
}

// moveUserPoints 在同一事务里同时改余额和写流水。
func (store *MongoStore) moveUserPoints(ctx context.Context, input GrantPointsInput, kind string, delta int64) (PointEntry, error) {
	var entry PointEntry
	err := store.transaction(ctx, func(transactionContext context.Context) error {
		var err error
		entry, err = store.applyUserPoints(transactionContext, input, kind, delta)
		return err
	})
	if err != nil {
		return PointEntry{}, err
	}
	return entry, nil
}

// applyUserPoints 不自己开事务，供需要把改余额和别的写入合并到同一事务的调用方使用
// （例如会员审批：通过申请、建会员、赠积分必须原子完成，不能只成功一半）。
// 撤销走带余额条件的原子更新：余额不足时更新不匹配，返回 ErrInsufficientPoints，
// 而不是把余额截断到 0——账实不符比失败更难查。
func (store *MongoStore) applyUserPoints(ctx context.Context, input GrantPointsInput, kind string, delta int64) (PointEntry, error) {
	if input.Amount <= 0 {
		return PointEntry{}, ErrInvalidInput
	}
	objectID, err := bson.ObjectIDFromHex(input.UserID)
	if err != nil {
		return PointEntry{}, ErrNotFound
	}

	filter := bson.D{{Key: "_id", Value: objectID}}
	if delta < 0 {
		filter = append(filter, bson.E{Key: "points", Value: bson.D{{Key: "$gte", Value: -delta}}})
	}
	var updated mongoUser
	err = store.users.FindOneAndUpdate(
		ctx,
		filter,
		bson.D{{Key: "$inc", Value: bson.D{{Key: "points", Value: delta}}}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&updated)
	if errors.Is(err, mongo.ErrNoDocuments) {
		if delta < 0 {
			if _, findErr := store.FindUserByID(ctx, input.UserID); errors.Is(findErr, ErrNotFound) {
				return PointEntry{}, ErrNotFound
			}
			return PointEntry{}, ErrInsufficientPoints
		}
		return PointEntry{}, ErrNotFound
	}
	if err != nil {
		return PointEntry{}, err
	}

	document := mongoPoint{
		ID:           bson.NewObjectID(),
		UserID:       objectID,
		UserEmail:    updated.Email,
		Scope:        PointScopeUser,
		Kind:         kind,
		Delta:        delta,
		BalanceAfter: updated.Points,
		Note:         input.Note,
		ActorID:      input.ActorID,
		CreatedAt:    input.CreatedAt.UTC(),
	}
	if _, err := store.points.InsertOne(ctx, document); err != nil {
		return PointEntry{}, err
	}
	if err := store.writeAudit(ctx, input.ActorID, input.UserID, "points."+kind, input.CreatedAt); err != nil {
		return PointEntry{}, err
	}
	return document.entry(), nil
}

func (store *MongoStore) ListPointEntries(ctx context.Context, input ListPointEntriesInput) ([]PointEntry, error) {
	filter := bson.D{}
	if input.UserID != "" {
		objectID, err := bson.ObjectIDFromHex(input.UserID)
		if err != nil {
			return nil, ErrInvalidInput
		}
		filter = append(filter, bson.E{Key: "userId", Value: objectID})
	}
	if input.Kind != "" {
		filter = append(filter, bson.E{Key: "kind", Value: input.Kind})
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
	cursor, err := store.points.Find(ctx, filter, options.Find().
		SetSort(bson.D{{Key: "createdAt", Value: -1}, {Key: "_id", Value: -1}}).
		SetLimit(input.Limit))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	items := make([]PointEntry, 0)
	for cursor.Next(ctx) {
		var document mongoPoint
		if err := cursor.Decode(&document); err != nil {
			return nil, err
		}
		items = append(items, document.entry())
	}
	return items, cursor.Err()
}

// findUserObjectID 供其他域在事务内解析用户引用，顺带拿到邮箱做冗余。
func (store *MongoStore) findUserObjectID(ctx context.Context, id string) (bson.ObjectID, User, error) {
	objectID, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return bson.ObjectID{}, User{}, ErrNotFound
	}
	var document mongoUser
	if err := store.users.FindOne(ctx, bson.D{{Key: "_id", Value: objectID}}).Decode(&document); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return bson.ObjectID{}, User{}, ErrNotFound
		}
		return bson.ObjectID{}, User{}, err
	}
	return objectID, document.user(), nil
}

// writePointEntry 供团队与会员域写非用户余额的流水。
func (store *MongoStore) writePointEntry(ctx context.Context, document mongoPoint) error {
	if document.ID.IsZero() {
		document.ID = bson.NewObjectID()
	}
	_, err := store.points.InsertOne(ctx, document)
	return err
}

func (store *MongoStore) writeAudit(ctx context.Context, actorID, targetID, action string, at time.Time) error {
	_, err := store.audits.InsertOne(ctx, mongoAudit{
		ID:           bson.NewObjectID(),
		ActorID:      actorID,
		TargetUserID: targetID,
		Action:       action,
		CreatedAt:    at.UTC(),
	})
	return err
}

// ── HTTP ────────────────────────────────────────────────────

var pointKinds = map[string]struct{}{
	PointGrant:            {},
	PointRevoke:           {},
	PointTopUp:            {},
	PointAllocate:         {},
	PointAllocationRevoke: {},
	PointConsume:          {},
}

func (app *app) listPointEntries(w http.ResponseWriter, r *http.Request) {
	if _, err := app.requireAdmin(r); err != nil {
		app.writeAuthError(w, err)
		return
	}
	input := ListPointEntriesInput{Limit: app.config.PageSize + 1}
	if kind := r.URL.Query().Get("kind"); kind != "" {
		if _, ok := pointKinds[kind]; !ok {
			writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
			return
		}
		input.Kind = kind
	}
	if userID := r.URL.Query().Get("userId"); userID != "" {
		input.UserID = userID
	}
	if raw := r.URL.Query().Get("cursor"); raw != "" {
		parsed, err := decodeSimpleCursor(raw)
		if err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
			return
		}
		input.After = &PointCursor{CreatedAt: parsed.CreatedAt, ID: parsed.ID}
	}
	items, err := app.store.ListPointEntries(r.Context(), input)
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
		Items      []PointEntry `json:"items"`
		NextCursor *string      `json:"nextCursor"`
	}{Items: items, NextCursor: nextCursor})
}

type pointMoveInput struct {
	UserID string `json:"userId"`
	Amount int64  `json:"amount"`
	Note   string `json:"note"`
}

func (app *app) grantPoints(w http.ResponseWriter, r *http.Request) {
	app.moveUserPointsHTTP(w, r, true)
}

func (app *app) revokePoints(w http.ResponseWriter, r *http.Request) {
	app.moveUserPointsHTTP(w, r, false)
}

func (app *app) moveUserPointsHTTP(w http.ResponseWriter, r *http.Request, grant bool) {
	admin, err := app.requireAdmin(r)
	if err != nil {
		app.writeAuthError(w, err)
		return
	}
	var input pointMoveInput
	if !app.decodeJSON(w, r, &input) {
		return
	}
	if input.UserID == "" || input.Amount <= 0 || input.Amount > maxPointAmount {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
		return
	}
	move := GrantPointsInput{
		UserID:    input.UserID,
		Amount:    input.Amount,
		Note:      strings.TrimSpace(input.Note),
		ActorID:   admin.ID,
		CreatedAt: app.now().UTC(),
	}
	var entry PointEntry
	if grant {
		entry, err = app.store.GrantPoints(r.Context(), move)
	} else {
		entry, err = app.store.RevokePoints(r.Context(), move)
	}
	if err != nil {
		app.writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Entry PointEntry `json:"entry"`
	}{Entry: entry})
}
