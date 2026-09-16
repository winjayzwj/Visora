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

type mongoModel struct {
	ID         bson.ObjectID `bson:"_id"`
	Name       string        `bson:"name"`
	Kind       string        `bson:"kind"`
	PointsCost int64         `bson:"pointsCost"`
	Status     string        `bson:"status"`
	Calls      int64         `bson:"calls"`
	CreatedAt  time.Time     `bson:"createdAt"`
	UpdatedAt  time.Time     `bson:"updatedAt"`
}

func (document mongoModel) model() AIModel {
	return AIModel{
		ID:         document.ID.Hex(),
		Name:       document.Name,
		Kind:       document.Kind,
		PointsCost: document.PointsCost,
		Status:     document.Status,
		Calls:      document.Calls,
		CreatedAt:  document.CreatedAt.UTC(),
		UpdatedAt:  document.UpdatedAt.UTC(),
	}
}

func (store *MongoStore) ListModels(ctx context.Context, input ListModelsInput) ([]AIModel, error) {
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
	cursor, err := store.models.Find(ctx, filter, options.Find().
		SetSort(bson.D{{Key: "createdAt", Value: -1}, {Key: "_id", Value: -1}}).
		SetLimit(input.Limit))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	items := make([]AIModel, 0)
	for cursor.Next(ctx) {
		var document mongoModel
		if err := cursor.Decode(&document); err != nil {
			return nil, err
		}
		items = append(items, document.model())
	}
	return items, cursor.Err()
}

func (store *MongoStore) CreateModel(ctx context.Context, input CreateModelInput) (AIModel, error) {
	document := mongoModel{
		ID:         bson.NewObjectID(),
		Name:       input.Name,
		Kind:       input.Kind,
		PointsCost: input.PointsCost,
		Status:     StatusActive,
		CreatedAt:  input.CreatedAt.UTC(),
		UpdatedAt:  input.CreatedAt.UTC(),
	}
	var result mongoModel
	err := store.transaction(ctx, func(transactionContext context.Context) error {
		if _, err := store.models.InsertOne(transactionContext, document); err != nil {
			if mongo.IsDuplicateKeyError(err) {
				return ErrNameExists
			}
			return err
		}
		if err := store.writeAudit(transactionContext, input.ActorID, document.ID.Hex(), "model.created", input.CreatedAt); err != nil {
			return err
		}
		result = document
		return nil
	})
	if mongo.IsDuplicateKeyError(err) {
		return AIModel{}, ErrNameExists
	}
	if err != nil {
		return AIModel{}, err
	}
	return result.model(), nil
}

func (store *MongoStore) UpdateModel(ctx context.Context, input UpdateModelInput) (AIModel, error) {
	objectID, err := bson.ObjectIDFromHex(input.ModelID)
	if err != nil {
		return AIModel{}, ErrNotFound
	}
	set := bson.D{{Key: "updatedAt", Value: input.UpdatedAt.UTC()}}
	if input.Name != nil {
		set = append(set, bson.E{Key: "name", Value: *input.Name})
	}
	if input.Kind != nil {
		set = append(set, bson.E{Key: "kind", Value: *input.Kind})
	}
	if input.PointsCost != nil {
		set = append(set, bson.E{Key: "pointsCost", Value: *input.PointsCost})
	}
	if input.Status != nil {
		set = append(set, bson.E{Key: "status", Value: *input.Status})
	}

	var result mongoModel
	err = store.transaction(ctx, func(transactionContext context.Context) error {
		err := store.models.FindOneAndUpdate(
			transactionContext,
			bson.D{{Key: "_id", Value: objectID}},
			bson.D{{Key: "$set", Value: set}},
			options.FindOneAndUpdate().SetReturnDocument(options.After),
		).Decode(&result)
		if errors.Is(err, mongo.ErrNoDocuments) {
			return ErrNotFound
		}
		if err != nil {
			if mongo.IsDuplicateKeyError(err) {
				return ErrNameExists
			}
			return err
		}
		return store.writeAudit(transactionContext, input.ActorID, input.ModelID, "model.updated", input.UpdatedAt)
	})
	if err != nil {
		return AIModel{}, err
	}
	return result.model(), nil
}

// ── HTTP ────────────────────────────────────────────────────

var modelKinds = map[string]struct{}{
	ModelKindImage: {},
	ModelKindVideo: {},
	ModelKindText:  {},
	ModelKindAudio: {},
}

func (app *app) listModels(w http.ResponseWriter, r *http.Request) {
	if _, err := app.requireAdmin(r); err != nil {
		app.writeAuthError(w, err)
		return
	}
	input := ListModelsInput{Limit: app.config.PageSize + 1}
	if raw := r.URL.Query().Get("cursor"); raw != "" {
		parsed, err := decodeSimpleCursor(raw)
		if err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
			return
		}
		input.After = &ModelCursor{CreatedAt: parsed.CreatedAt, ID: parsed.ID}
	}
	items, err := app.store.ListModels(r.Context(), input)
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
		Items      []AIModel `json:"items"`
		NextCursor *string   `json:"nextCursor"`
	}{Items: items, NextCursor: nextCursor})
}

type createModelInput struct {
	Name       string `json:"name"`
	Kind       string `json:"kind"`
	PointsCost int64  `json:"pointsCost"`
}

func (app *app) createModel(w http.ResponseWriter, r *http.Request) {
	admin, err := app.requireAdmin(r)
	if err != nil {
		app.writeAuthError(w, err)
		return
	}
	var input createModelInput
	if !app.decodeJSON(w, r, &input) {
		return
	}
	name := strings.TrimSpace(input.Name)
	if name == "" || len([]rune(name)) > 60 || input.PointsCost < 0 {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
		return
	}
	if _, ok := modelKinds[input.Kind]; !ok {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
		return
	}
	model, err := app.store.CreateModel(r.Context(), CreateModelInput{
		Name:       name,
		Kind:       input.Kind,
		PointsCost: input.PointsCost,
		ActorID:    admin.ID,
		CreatedAt:  app.now().UTC(),
	})
	if err != nil {
		app.writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, struct {
		Model AIModel `json:"model"`
	}{Model: model})
}

type updateModelInput struct {
	Name       *string `json:"name"`
	Kind       *string `json:"kind"`
	PointsCost *int64  `json:"pointsCost"`
	Status     *string `json:"status"`
}

func (app *app) updateModel(w http.ResponseWriter, r *http.Request, modelID string) {
	admin, err := app.requireAdmin(r)
	if err != nil {
		app.writeAuthError(w, err)
		return
	}
	if modelID == "" {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "模型不存在")
		return
	}
	var input updateModelInput
	if !app.decodeJSON(w, r, &input) {
		return
	}
	update := UpdateModelInput{ModelID: modelID, ActorID: admin.ID, UpdatedAt: app.now().UTC()}
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" || len([]rune(name)) > 60 {
			writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
			return
		}
		update.Name = &name
	}
	if input.Kind != nil {
		if _, ok := modelKinds[*input.Kind]; !ok {
			writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
			return
		}
		update.Kind = input.Kind
	}
	if input.PointsCost != nil {
		if *input.PointsCost < 0 {
			writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
			return
		}
		update.PointsCost = input.PointsCost
	}
	if input.Status != nil {
		if *input.Status != StatusActive && *input.Status != StatusDisabled {
			writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
			return
		}
		update.Status = input.Status
	}
	if update.Name == nil && update.Kind == nil && update.PointsCost == nil && update.Status == nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
		return
	}
	model, err := app.store.UpdateModel(r.Context(), update)
	if err != nil {
		app.writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Model AIModel `json:"model"`
	}{Model: model})
}
