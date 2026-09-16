package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/event"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"golang.org/x/crypto/bcrypt"
)

func TestMongoAccountFlowIntegration(t *testing.T) {
	uri := os.Getenv("VISORA_TEST_MONGO_URI")
	if uri == "" {
		t.Skip("VISORA_TEST_MONGO_URI is not set")
	}
	if !isSafeTestMongoURI(uri) {
		t.Fatal("VISORA_TEST_MONGO_URI must use a non-27017 loopback mongodb:// endpoint")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	var cleanupMu sync.Mutex
	var cleanupDeadlines []bool
	client, err := mongo.Connect(options.Client().ApplyURI(uri).SetMonitor(&event.CommandMonitor{
		Started: func(commandContext context.Context, event *event.CommandStartedEvent) {
			if event.CommandName == "killCursors" {
				_, bounded := commandContext.Deadline()
				cleanupMu.Lock()
				cleanupDeadlines = append(cleanupDeadlines, bounded)
				cleanupMu.Unlock()
			}
		},
	}))
	if err != nil {
		t.Fatal(err)
	}
	databaseName := fmt.Sprintf("visora_test_p1_%d", time.Now().UnixNano())
	if !strings.HasPrefix(databaseName, "visora_test_") {
		t.Fatal("test database must use the visora_test_ prefix")
	}
	database := client.Database(databaseName)
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cleanupCancel()
		_ = database.Drop(cleanupCtx)
		_ = client.Disconnect(cleanupCtx)
	})
	if err := client.Ping(ctx, nil); err != nil {
		t.Fatal(err)
	}

	store := NewMongoStore(database)
	if err := store.InitIndexes(ctx); err != nil {
		t.Fatal(err)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte("admin-password"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreateAdmin(ctx, "admin@example.test", hash, time.Now().UTC()); err != nil {
		t.Fatal(err)
	}
	t.Run("bootstrap audit", func(t *testing.T) {
		var audit mongoAudit
		if err := database.Collection("admin_audit").FindOne(ctx, map[string]any{"action": "admin.bootstrap_created"}).Decode(&audit); err != nil {
			t.Fatalf("bootstrap audit missing: %v", err)
		}
		admin, err := store.FindUserByEmail(ctx, "admin@example.test")
		if err != nil || audit.ActorID != "bootstrap" || audit.TargetUserID != admin.ID {
			t.Fatalf("bootstrap audit actor/target mismatch: %v", err)
		}
		if _, err := store.CreateAdmin(ctx, "admin@example.test", hash, time.Now().UTC()); !errors.Is(err, ErrEmailExists) {
			t.Fatalf("duplicate admin error = %v", err)
		}
	})
	t.Run("bootstrap audit failure rolls back user", func(t *testing.T) {
		// Reject audit inserts only in this test-owned database, then restore its validator.
		if err := database.RunCommand(ctx, bson.D{{Key: "collMod", Value: "admin_audit"}, {Key: "validator", Value: bson.M{"rejectTestAudit": bson.M{"$exists": true}}}}).Err(); err != nil {
			t.Fatal(err)
		}
		defer func() {
			if err := database.RunCommand(ctx, bson.D{{Key: "collMod", Value: "admin_audit"}, {Key: "validator", Value: bson.M{}}}).Err(); err != nil {
				t.Error(err)
			}
		}()
		if _, err := store.CreateAdmin(ctx, "rollback@example.test", hash, time.Now().UTC()); err == nil {
			t.Error("bootstrap succeeded despite rejected audit")
		}
		if _, err := store.FindUserByEmail(ctx, "rollback@example.test"); !errors.Is(err, ErrNotFound) {
			t.Errorf("bootstrap user survived failed audit: %v", err)
		}
	})
	config := testConfig()
	config.PageSize = 1
	handler := NewHandler(config, store)
	adminCookie := login(t, handler, "admin@example.test", "admin-password")

	create := apiRequest(handler, "POST", "/api/admin/users", `{"email":"user@example.test","password":"user-password"}`, adminCookie)
	if create.Code != 201 {
		t.Fatalf("create status = %d, body = %s", create.Code, create.Body.String())
	}
	assertAPIError(t, apiRequest(handler, "POST", "/api/admin/users", `{"email":"user@example.test","password":"user-password"}`, adminCookie), 409, "EMAIL_EXISTS")
	userCookie := login(t, handler, "user@example.test", "user-password")

	var created struct {
		User User `json:"user"`
	}
	if err := json.NewDecoder(create.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}
	if created.User.ID == "" {
		t.Fatal("created user has no id")
	}
	if disabled := apiRequest(handler, "PATCH", "/api/admin/users/"+created.User.ID, `{"status":"disabled"}`, adminCookie); disabled.Code != 200 {
		t.Fatalf("disable status = %d, body = %s", disabled.Code, disabled.Body.String())
	}
	assertAPIError(t, apiRequest(handler, "GET", "/api/auth/me", "", userCookie), 401, "UNAUTHENTICATED")
	if restored := apiRequest(handler, "PATCH", "/api/admin/users/"+created.User.ID, `{"status":"active"}`, adminCookie); restored.Code != 200 {
		t.Fatalf("restore status = %d, body = %s", restored.Code, restored.Body.String())
	}
	assertAPIError(t, apiRequest(handler, "GET", "/api/auth/me", "", userCookie), 401, "UNAUTHENTICATED")
	if me := apiRequest(handler, "GET", "/api/auth/me", "", login(t, handler, "user@example.test", "user-password")); me.Code != 200 {
		t.Fatalf("fresh session status = %d, body = %s", me.Code, me.Body.String())
	}

	page := apiRequest(handler, "GET", "/api/admin/users", "", adminCookie)
	if page.Code != 200 {
		t.Fatalf("list status = %d, body = %s", page.Code, page.Body.String())
	}
	var result struct {
		NextCursor *string `json:"nextCursor"`
	}
	if err := json.NewDecoder(page.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if result.NextCursor == nil || *result.NextCursor == "" {
		t.Fatal("first page has no next cursor")
	}
	if next := apiRequest(handler, "GET", "/api/admin/users?cursor="+*result.NextCursor, "", adminCookie); next.Code != 200 {
		t.Fatalf("next page status = %d, body = %s", next.Code, next.Body.String())
	}

	audits, err := database.Collection("admin_audit").CountDocuments(ctx, map[string]any{})
	if err != nil {
		t.Fatal(err)
	}
	if audits != 4 {
		t.Fatalf("audit count = %d, want 4 (bootstrap, create, disable, restore)", audits)
	}
	t.Run("decode failure closes cursor with deadline", func(t *testing.T) {
		// Exceed MongoDB's first batch so a decode error leaves a live cursor.
		documents := make([]any, 110)
		for i := range documents {
			documents[i] = bson.M{"_id": bson.NewObjectID(), "email": fmt.Sprintf("malformed-%d@example.test", i), "createdAt": time.Now().UTC().Add(time.Hour), "status": bson.A{"not-a-string"}}
		}
		if _, err := database.Collection("users").InsertMany(ctx, documents); err != nil {
			t.Fatal(err)
		}
		if _, err := store.ListUsers(ctx, ListUsersInput{Limit: 110}); err == nil {
			t.Fatal("malformed user unexpectedly decoded")
		}
		cleanupMu.Lock()
		defer cleanupMu.Unlock()
		if len(cleanupDeadlines) == 0 {
			t.Fatal("live cursor cleanup was not observed")
		}
		for _, bounded := range cleanupDeadlines {
			if !bounded {
				t.Error("killCursors received an unbounded context")
			}
		}
	})
}

func isSafeTestMongoURI(value string) bool {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme != "mongodb" || parsed.Host == "" {
		return false
	}
	for _, rawHost := range strings.Split(parsed.Host, ",") {
		host, port, err := net.SplitHostPort(rawHost)
		if err != nil || port == "27017" || !isLoopbackHost(host) {
			return false
		}
		if _, err := strconv.ParseUint(port, 10, 16); err != nil {
			return false
		}
	}
	return true
}
