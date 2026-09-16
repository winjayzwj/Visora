package server

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type MongoStore struct {
	client       *mongo.Client
	users        *mongo.Collection
	sessions     *mongo.Collection
	audits       *mongo.Collection
	points       *mongo.Collection
	models       *mongo.Collection
	teams        *mongo.Collection
	members      *mongo.Collection
	plans        *mongo.Collection
	applications *mongo.Collection
	memberships  *mongo.Collection
}

type mongoUser struct {
	ID             bson.ObjectID `bson:"_id"`
	Email          string        `bson:"email"`
	PasswordHash   []byte        `bson:"passwordHash"`
	Role           string        `bson:"role"`
	Status         string        `bson:"status"`
	Points         int64         `bson:"points"`
	SessionVersion int64         `bson:"sessionVersion"`
	CreatedAt      time.Time     `bson:"createdAt"`
}

type mongoSession struct {
	ID             bson.ObjectID `bson:"_id"`
	TokenHash      []byte        `bson:"tokenHash"`
	UserID         bson.ObjectID `bson:"userId"`
	SessionVersion int64         `bson:"sessionVersion"`
	CreatedAt      time.Time     `bson:"createdAt"`
	ExpiresAt      time.Time     `bson:"expiresAt"`
}

type mongoAudit struct {
	ID           bson.ObjectID `bson:"_id"`
	ActorID      string        `bson:"actorId"`
	TargetUserID string        `bson:"targetUserId"`
	Action       string        `bson:"action"`
	CreatedAt    time.Time     `bson:"createdAt"`
}

func NewMongoStore(database *mongo.Database) *MongoStore {
	return &MongoStore{
		client:       database.Client(),
		users:        database.Collection("users"),
		sessions:     database.Collection("sessions"),
		audits:       database.Collection("admin_audit"),
		points:       database.Collection("point_ledger"),
		models:       database.Collection("ai_models"),
		teams:        database.Collection("teams"),
		members:      database.Collection("team_members"),
		plans:        database.Collection("membership_plans"),
		applications: database.Collection("membership_applications"),
		memberships:  database.Collection("memberships"),
	}
}

func (store *MongoStore) Ping(ctx context.Context) error {
	return store.client.Ping(ctx, nil)
}

func (store *MongoStore) FindUserByEmail(ctx context.Context, email string) (User, error) {
	var document mongoUser
	err := store.users.FindOne(ctx, bson.D{{Key: "email", Value: email}}).Decode(&document)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, err
	}
	return document.user(), nil
}

func (store *MongoStore) FindUserByID(ctx context.Context, id string) (User, error) {
	objectID, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return User{}, ErrNotFound
	}
	var document mongoUser
	err = store.users.FindOne(ctx, bson.D{{Key: "_id", Value: objectID}}).Decode(&document)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, err
	}
	return document.user(), nil
}

func (store *MongoStore) CreateSession(ctx context.Context, session Session) error {
	userID, err := bson.ObjectIDFromHex(session.UserID)
	if err != nil {
		return fmt.Errorf("invalid session user id")
	}
	_, err = store.sessions.InsertOne(ctx, mongoSession{
		ID:             bson.NewObjectID(),
		TokenHash:      append([]byte(nil), session.TokenHash[:]...),
		UserID:         userID,
		SessionVersion: session.SessionVersion,
		CreatedAt:      session.CreatedAt.UTC(),
		ExpiresAt:      session.ExpiresAt.UTC(),
	})
	return err
}

func (store *MongoStore) FindSessionByTokenHash(ctx context.Context, hash [32]byte) (Session, error) {
	var document mongoSession
	err := store.sessions.FindOne(ctx, bson.D{{Key: "tokenHash", Value: hash[:]}}).Decode(&document)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return Session{}, ErrNotFound
	}
	if err != nil {
		return Session{}, err
	}
	if len(document.TokenHash) != len(hash) {
		return Session{}, fmt.Errorf("stored session hash has invalid length")
	}
	var tokenHash [32]byte
	copy(tokenHash[:], document.TokenHash)
	return Session{
		TokenHash:      tokenHash,
		UserID:         document.UserID.Hex(),
		SessionVersion: document.SessionVersion,
		CreatedAt:      document.CreatedAt.UTC(),
		ExpiresAt:      document.ExpiresAt.UTC(),
	}, nil
}

func (store *MongoStore) DeleteSession(ctx context.Context, hash [32]byte) error {
	_, err := store.sessions.DeleteOne(ctx, bson.D{{Key: "tokenHash", Value: hash[:]}})
	return err
}

func (store *MongoStore) CreateUser(ctx context.Context, input CreateUserInput) (User, error) {
	document := mongoUser{
		ID:             bson.NewObjectID(),
		Email:          input.Email,
		PasswordHash:   append([]byte(nil), input.PasswordHash...),
		Role:           RoleUser,
		Status:         StatusActive,
		SessionVersion: 0,
		CreatedAt:      input.CreatedAt.UTC(),
	}
	audit := mongoAudit{
		ID:           bson.NewObjectID(),
		ActorID:      input.ActorID,
		TargetUserID: document.ID.Hex(),
		Action:       "user.created",
		CreatedAt:    input.CreatedAt.UTC(),
	}
	err := store.transaction(ctx, func(transactionContext context.Context) error {
		if _, err := store.users.InsertOne(transactionContext, document); err != nil {
			if mongo.IsDuplicateKeyError(err) {
				return ErrEmailExists
			}
			return err
		}
		_, err := store.audits.InsertOne(transactionContext, audit)
		return err
	})
	if mongo.IsDuplicateKeyError(err) {
		return User{}, ErrEmailExists
	}
	if err != nil {
		return User{}, err
	}
	return document.user(), nil
}

func (store *MongoStore) SetUserStatus(ctx context.Context, input SetUserStatusInput) (User, error) {
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
		if current.Role != RoleUser || current.ID.Hex() == input.ActorID {
			return ErrUserProtected
		}
		if current.Status == input.Status {
			result = current
			return nil
		}

		update := bson.D{{Key: "$set", Value: bson.D{{Key: "status", Value: input.Status}}}}
		if input.Status == StatusDisabled {
			update = append(update, bson.E{Key: "$inc", Value: bson.D{{Key: "sessionVersion", Value: 1}}})
		}
		err = store.users.FindOneAndUpdate(
			transactionContext,
			bson.D{{Key: "_id", Value: objectID}, {Key: "role", Value: RoleUser}},
			update,
			options.FindOneAndUpdate().SetReturnDocument(options.After),
		).Decode(&result)
		if errors.Is(err, mongo.ErrNoDocuments) {
			return ErrUserProtected
		}
		if err != nil {
			return err
		}
		_, err = store.audits.InsertOne(transactionContext, mongoAudit{
			ID:           bson.NewObjectID(),
			ActorID:      input.ActorID,
			TargetUserID: input.UserID,
			Action:       "user.status_changed",
			CreatedAt:    input.CreatedAt.UTC(),
		})
		return err
	})
	if err != nil {
		return User{}, err
	}
	return result.user(), nil
}

func (store *MongoStore) ListUsers(ctx context.Context, input ListUsersInput) ([]User, error) {
	filter := bson.D{}
	if input.Email != "" {
		filter = append(filter, bson.E{Key: "email", Value: input.Email})
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
	cursor, err := store.users.Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}, {Key: "_id", Value: -1}}).SetLimit(input.Limit))
	if err != nil {
		return nil, err
	}
	// Reuse the request/CLI deadline; Cursor.All closes with Background internally.
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

func (store *MongoStore) CreateAdmin(ctx context.Context, email string, passwordHash []byte, createdAt time.Time) (User, error) {
	document := mongoUser{
		ID:             bson.NewObjectID(),
		Email:          email,
		PasswordHash:   append([]byte(nil), passwordHash...),
		Role:           RoleAdmin,
		Status:         StatusActive,
		SessionVersion: 0,
		CreatedAt:      createdAt.UTC(),
	}
	audit := mongoAudit{
		ID: bson.NewObjectID(), ActorID: "bootstrap", TargetUserID: document.ID.Hex(),
		Action: "admin.bootstrap_created", CreatedAt: createdAt.UTC(),
	}
	err := store.transaction(ctx, func(transactionContext context.Context) error {
		if _, err := store.users.InsertOne(transactionContext, document); err != nil {
			return err
		}
		_, err := store.audits.InsertOne(transactionContext, audit)
		return err
	})
	if mongo.IsDuplicateKeyError(err) {
		return User{}, ErrEmailExists
	}
	if err != nil {
		return User{}, err
	}
	return document.user(), nil
}

func (store *MongoStore) InitIndexes(ctx context.Context) error {
	if _, err := store.users.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "email", Value: 1}}, Options: options.Index().SetName("users_email_unique").SetUnique(true)},
		{Keys: bson.D{{Key: "createdAt", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("users_created_at_id")},
		{Keys: bson.D{{Key: "role", Value: 1}, {Key: "status", Value: 1}}, Options: options.Index().SetName("users_role_status")},
	}); err != nil {
		return err
	}
	if _, err := store.sessions.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "tokenHash", Value: 1}}, Options: options.Index().SetName("sessions_token_hash_unique").SetUnique(true)},
		{Keys: bson.D{{Key: "expiresAt", Value: 1}}, Options: options.Index().SetName("sessions_expires_at_ttl").SetExpireAfterSeconds(0)},
	}); err != nil {
		return err
	}
	if _, err := store.audits.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "createdAt", Value: 1}},
		Options: options.Index().SetName("admin_audit_created_at"),
	}); err != nil {
		return err
	}
	if _, err := store.points.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "createdAt", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("point_ledger_created_at_id")},
		{Keys: bson.D{{Key: "userId", Value: 1}, {Key: "createdAt", Value: -1}}, Options: options.Index().SetName("point_ledger_user_created_at")},
		{Keys: bson.D{{Key: "kind", Value: 1}, {Key: "createdAt", Value: -1}}, Options: options.Index().SetName("point_ledger_kind_created_at")},
	}); err != nil {
		return err
	}
	if _, err := store.models.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "name", Value: 1}}, Options: options.Index().SetName("ai_models_name_unique").SetUnique(true)},
		{Keys: bson.D{{Key: "createdAt", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("ai_models_created_at_id")},
	}); err != nil {
		return err
	}
	if _, err := store.teams.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "name", Value: 1}}, Options: options.Index().SetName("teams_name_unique").SetUnique(true)},
		{Keys: bson.D{{Key: "createdAt", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("teams_created_at_id")},
	}); err != nil {
		return err
	}
	if _, err := store.members.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "teamId", Value: 1}, {Key: "userId", Value: 1}}, Options: options.Index().SetName("team_members_team_user_unique").SetUnique(true)},
		{Keys: bson.D{{Key: "userId", Value: 1}}, Options: options.Index().SetName("team_members_user")},
	}); err != nil {
		return err
	}
	if _, err := store.plans.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "code", Value: 1}},
		Options: options.Index().SetName("membership_plans_code_unique").SetUnique(true),
	}); err != nil {
		return err
	}
	if _, err := store.applications.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "status", Value: 1}, {Key: "createdAt", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("membership_applications_status_created_at")},
		{Keys: bson.D{{Key: "userId", Value: 1}}, Options: options.Index().SetName("membership_applications_user")},
	}); err != nil {
		return err
	}
	_, err := store.memberships.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "createdAt", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("memberships_created_at_id")},
		{Keys: bson.D{{Key: "userId", Value: 1}}, Options: options.Index().SetName("memberships_user")},
	})
	return err
}

func (store *MongoStore) transaction(ctx context.Context, callback func(context.Context) error) error {
	session, err := store.client.StartSession()
	if err != nil {
		return err
	}
	defer session.EndSession(ctx)
	_, err = session.WithTransaction(ctx, func(transactionContext context.Context) (any, error) {
		return nil, callback(transactionContext)
	})
	return err
}

func (document mongoUser) user() User {
	return User{
		ID:             document.ID.Hex(),
		Email:          document.Email,
		Role:           document.Role,
		Status:         document.Status,
		Points:         document.Points,
		CreatedAt:      document.CreatedAt.UTC(),
		PasswordHash:   append([]byte(nil), document.PasswordHash...),
		SessionVersion: document.SessionVersion,
	}
}
