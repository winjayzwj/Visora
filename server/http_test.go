package server

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const testOrigin = "http://127.0.0.1:5173"

func TestCookieTTLAndExactSessionExpiry(t *testing.T) {
	_, store, _, _ := newTestHandler(t)
	for _, ttl := range []time.Duration{time.Hour, 1500 * time.Millisecond, 100 * time.Millisecond, time.Nanosecond} {
		t.Run(ttl.String(), func(t *testing.T) {
			config := testConfig()
			config.SessionTTL = ttl
			now := time.Date(2026, 9, 14, 0, 0, 0, 100000000, time.UTC)
			app := &app{config: config, store: store, now: func() time.Time { return now }, comparePassword: bcrypt.CompareHashAndPassword}
			handler := http.HandlerFunc(app.serveHTTP)
			cookie := login(t, handler, "user@example.test", "user-password")
			wantSeconds := int(ttl / time.Second)
			if ttl%time.Second != 0 {
				wantSeconds++
			}
			if cookie.MaxAge != wantSeconds || cookie.Expires.IsZero() || !cookie.Expires.After(now) {
				t.Errorf("TTL=%s: MaxAge=%d want=%d, Expires=%v", ttl, cookie.MaxAge, wantSeconds, cookie.Expires)
			}
			if cookie.Expires.Before(now.Add(ttl)) || cookie.Expires.Sub(now.Add(ttl)) >= time.Second {
				t.Error("cookie Expires must round up by less than one second")
			}
			session, err := store.FindSessionByTokenHash(context.Background(), sha256.Sum256([]byte(cookie.Value)))
			if err != nil || !session.ExpiresAt.Equal(now.Add(ttl)) {
				t.Fatalf("server expiry not exact: %v, %v", session.ExpiresAt, err)
			}
			now = session.ExpiresAt
			assertAPIError(t, apiRequest(handler, "GET", "/api/auth/me", "", cookie), 401, "UNAUTHENTICATED")
		})
	}
}

func TestInvalidLoginAlwaysComparesBcrypt(t *testing.T) {
	_, store, _, user := newTestHandler(t)
	for _, state := range []string{"missing", "disabled", "active"} {
		t.Run(state, func(t *testing.T) {
			row := user
			if state == "disabled" {
				row.Status = StatusDisabled
			}
			store.users[row.ID] = row
			email := row.Email
			if state == "missing" {
				email = "missing@example.test"
			}
			calls := 0
			handler := &app{config: testConfig(), store: store, now: time.Now,
				comparePassword: func(hash, password []byte) error {
					calls++
					cost, err := bcrypt.Cost(hash)
					if err != nil || cost != bcrypt.DefaultCost {
						t.Errorf("comparison must use valid DefaultCost hash: %v, %d", err, cost)
					}
					if state != "active" && bytes.Equal(hash, row.PasswordHash) {
						t.Error("inactive lookup compared real password hash")
					}
					if state == "active" && !bytes.Equal(hash, row.PasswordHash) {
						t.Error("active lookup did not compare stored hash")
					}
					return bcrypt.CompareHashAndPassword(hash, password)
				},
			}
			response := apiRequest(http.HandlerFunc(handler.serveHTTP), "POST", "/api/auth/login", fmt.Sprintf(`{"email":%q,"password":"wrong-password"}`, email), nil)
			assertAPIError(t, response, 401, "INVALID_CREDENTIALS")
			if calls != 1 {
				t.Errorf("bcrypt comparisons=%d, want 1", calls)
			}
		})
	}
}

func TestRegisterCreatesAnActiveSessionWithoutEmailVerification(t *testing.T) {
	handler, _, _, _ := newTestHandler(t)
	response := apiRequest(handler, http.MethodPost, "/api/auth/register", `{"email":"new.creator@example.test","password":"new-password"}`, nil)
	if response.Code != http.StatusCreated {
		t.Fatalf("register status = %d, body = %s", response.Code, response.Body.String())
	}
	cookie := responseCookie(t, response, sessionCookieName)
	if cookie.Value == "" || !cookie.HttpOnly {
		t.Fatalf("register did not start a safe session: %#v", cookie)
	}
	if me := apiRequest(handler, http.MethodGet, "/api/auth/me", "", cookie); me.Code != http.StatusOK {
		t.Fatalf("registered session is unusable: status=%d body=%s", me.Code, me.Body.String())
	}
	assertAPIError(t, apiRequest(handler, http.MethodPost, "/api/auth/register", `{"email":"new.creator@example.test","password":"new-password"}`, nil), http.StatusConflict, "EMAIL_EXISTS")
	assertAPIError(t, apiRequest(handler, http.MethodPost, "/api/auth/register", `{"email":"invalid-email","password":"new-password"}`, nil), http.StatusBadRequest, "INVALID_INPUT")
}

func TestProfileUpdateKeepsPointsServerControlled(t *testing.T) {
	handler, _, _, _ := newTestHandler(t)
	cookie := login(t, handler, "user@example.test", "user-password")
	response := apiRequest(handler, http.MethodPatch, "/api/auth/profile", `{"name":"映序创作者","avatarUrl":"https://example.test/avatar.png"}`, cookie)
	if response.Code != http.StatusOK {
		t.Fatalf("profile update status = %d, body = %s", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"name":"映序创作者"`) || !strings.Contains(response.Body.String(), `"avatarUrl":"https://example.test/avatar.png"`) {
		t.Fatalf("updated profile missing from response: %s", response.Body.String())
	}
	me := apiRequest(handler, http.MethodGet, "/api/auth/me", "", cookie)
	if me.Code != http.StatusOK || !strings.Contains(me.Body.String(), `"name":"映序创作者"`) {
		t.Fatalf("profile did not persist: status=%d body=%s", me.Code, me.Body.String())
	}
	assertAPIError(t, apiRequest(handler, http.MethodPatch, "/api/auth/profile", `{"points":999999}`, cookie), http.StatusBadRequest, "INVALID_INPUT")
}

func TestDummyPasswordCannotAuthenticate(t *testing.T) {
	handler, store, _, user := newTestHandler(t)
	user.Status = StatusDisabled
	store.users[user.ID] = user
	for _, email := range []string{user.Email, "missing@example.test"} {
		response := apiRequest(handler, "POST", "/api/auth/login", fmt.Sprintf(`{"email":%q,"password":"allmine"}`, email), nil)
		assertAPIError(t, response, 401, "INVALID_CREDENTIALS")
		if len(response.Result().Cookies()) != 0 {
			t.Error("dummy password issued a cookie")
		}
	}
}

func TestCursorRejectsInvalidFieldsAndTypes(t *testing.T) {
	for _, raw := range []string{
		`{"createdAt":"2026-09-14T00:00:00Z","id":"user-1"}`,
		`{"createdAt":"2026-09-14T00:00:00Z","id":"user-1","email":null}`,
		`{"createdAt":"2026-09-14T00:00:00Z","id":"user-1","email":"","role":"admin"}`,
		`{"createdAt":"2026-09-14T00:00:00Z","id":1,"email":""}`,
		`{"createdAt":"2026-09-14T00:00:00Z","id":"user-1","email":{}}`,
		`{"createdAt":null,"id":"user-1","email":""}`,
		`{"createdAt":"2026-09-14T00:00:00Z","id":"user-1","email":""}{}`,
	} {
		if _, err := decodeCursor(base64.RawURLEncoding.EncodeToString([]byte(raw))); err == nil {
			t.Errorf("invalid cursor accepted: %s", raw)
		}
	}
}

func TestWriteGuardAndLoginCookie(t *testing.T) {
	handler, store, _, _ := newTestHandler(t)

	request := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"email":"admin@example.test","password":"admin-password"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Visora-Request", "1")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	assertAPIError(t, response, http.StatusForbidden, "FORBIDDEN")

	request = httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"email":"admin@example.test","password":"admin-password"}`))
	request.Header.Set("Origin", testOrigin)
	request.Header.Set("Content-Type", "application/json")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	assertAPIError(t, response, http.StatusForbidden, "FORBIDDEN")

	response = apiRequest(handler, http.MethodPost, "/api/auth/login", `{"email":"admin@example.test","password":"admin-password"}`, nil)
	if response.Code != http.StatusOK {
		t.Fatalf("login status = %d, body = %s", response.Code, response.Body.String())
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("Cache-Control = %q", response.Header().Get("Cache-Control"))
	}
	cookie := responseCookie(t, response, "visora_session")
	if cookie.Value == "" || !cookie.HttpOnly || cookie.SameSite != http.SameSiteStrictMode || cookie.Path != "/" || cookie.Secure {
		t.Fatalf("unsafe cookie: %#v", cookie)
	}
	if response.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("handler must not opt into CORS")
	}

	secureConfig := testConfig()
	secureConfig.AllowedOrigins = map[string]struct{}{"https://127.0.0.1:8443": {}}
	secureConfig.CookieSecure = true
	secureHandler := NewHandler(secureConfig, store)
	secureRequest := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"email":"admin@example.test","password":"admin-password"}`))
	secureRequest.Header.Set("Origin", "https://127.0.0.1:8443")
	secureRequest.Header.Set("Content-Type", "application/json")
	secureRequest.Header.Set("X-Visora-Request", "1")
	secureResponse := httptest.NewRecorder()
	secureHandler.ServeHTTP(secureResponse, secureRequest)
	if secureResponse.Code != http.StatusOK {
		t.Fatalf("secure login status = %d, body = %s", secureResponse.Code, secureResponse.Body.String())
	}
	if !responseCookie(t, secureResponse, "visora_session").Secure {
		t.Fatal("HTTPS-only origins must issue Secure cookies")
	}
}

func TestJSONInputAndLogoutValidation(t *testing.T) {
	handler, _, _, _ := newTestHandler(t)

	assertAPIError(t, apiRequest(handler, http.MethodPost, "/api/auth/login", "", nil), http.StatusBadRequest, "INVALID_INPUT")
	assertAPIError(t, apiRequest(handler, http.MethodPost, "/api/auth/login", `{"email":"admin@example.test","password":"admin-password"}{}`, nil), http.StatusBadRequest, "INVALID_INPUT")
	assertAPIError(t, apiRequest(handler, http.MethodPost, "/api/auth/login", `{"email":"`+strings.Repeat("a", 5000)+`@example.test","password":"admin-password"}`, nil), http.StatusRequestEntityTooLarge, "PAYLOAD_TOO_LARGE")

	adminCookie := login(t, handler, "admin@example.test", "admin-password")
	assertAPIError(t, apiRequest(handler, http.MethodPost, "/api/admin/users", `{"email":"new@example.test","password":"new-password","role":"admin"}`, adminCookie), http.StatusBadRequest, "INVALID_INPUT")
	assertAPIError(t, apiRequest(handler, http.MethodPatch, "/api/admin/users/user-1", `{"status":"disabled","extra":true}`, adminCookie), http.StatusBadRequest, "INVALID_INPUT")

	logout := apiRequest(handler, http.MethodPost, "/api/auth/logout", `{}`, nil)
	if logout.Code != http.StatusNoContent {
		t.Fatalf("repeat logout status = %d, body = %s", logout.Code, logout.Body.String())
	}
	if logout.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("logout Cache-Control = %q", logout.Header().Get("Cache-Control"))
	}
	if responseCookie(t, logout, "visora_session").MaxAge >= 0 {
		t.Fatal("logout did not expire the session cookie")
	}
}

func TestLogoutClearsExpiredAndDisabledSessions(t *testing.T) {
	for _, state := range []string{"expired", "disabled"} {
		t.Run(state, func(t *testing.T) {
			handler, store, _, user := newTestHandler(t)
			cookie := login(t, handler, "user@example.test", "user-password")
			hash := sha256.Sum256([]byte(cookie.Value))
			store.mu.Lock()
			if state == "expired" {
				session := store.sessions[hash]
				session.ExpiresAt = time.Now().Add(-time.Second)
				store.sessions[hash] = session
			} else {
				record := store.users[user.ID]
				record.Status = StatusDisabled
				record.SessionVersion++
				store.users[user.ID] = record
			}
			store.mu.Unlock()

			response := apiRequest(handler, http.MethodPost, "/api/auth/logout", `{}`, cookie)
			if response.Code != http.StatusNoContent {
				t.Fatalf("logout status = %d, body = %s", response.Code, response.Body.String())
			}
			cleared := responseCookie(t, response, "visora_session")
			if cleared.MaxAge >= 0 || cleared.Path != "/" || !cleared.HttpOnly || cleared.SameSite != http.SameSiteStrictMode {
				t.Fatalf("logout cookie is not safely cleared: %#v", cleared)
			}
		})
	}
}

func TestAdminPermissionsAndDuplicateEmail(t *testing.T) {
	handler, _, _, _ := newTestHandler(t)
	userCookie := login(t, handler, "user@example.test", "user-password")
	assertAPIError(t, apiRequest(handler, http.MethodGet, "/api/admin/users", "", userCookie), http.StatusForbidden, "FORBIDDEN")
	forgedCursor := encodeCursor(UserCursor{ID: "admin", CreatedAt: time.Now(), Email: "admin@example.test"})
	assertAPIError(t, apiRequest(handler, http.MethodGet, "/api/admin/users?cursor="+forgedCursor+"&email=admin@example.test", "", userCookie), http.StatusForbidden, "FORBIDDEN")

	adminCookie := login(t, handler, "admin@example.test", "admin-password")
	assertAPIError(t, apiRequest(handler, http.MethodPost, "/api/admin/users", `{"email":"user@example.test","password":"new-password"}`, adminCookie), http.StatusConflict, "EMAIL_EXISTS")
}

func TestLoginReportsStoreOutage(t *testing.T) {
	handler, store, _, _ := newTestHandler(t)
	store.findUserErr = context.DeadlineExceeded
	assertAPIError(t, apiRequest(handler, http.MethodPost, "/api/auth/login", `{"email":"admin@example.test","password":"admin-password"}`, nil), http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE")
}

func TestDisabledSessionStaysInvalidAfterRestore(t *testing.T) {
	handler, store, admin, user := newTestHandler(t)
	adminCookie := login(t, handler, "admin@example.test", "admin-password")
	oldUserCookie := login(t, handler, "user@example.test", "user-password")

	disable := apiRequest(handler, http.MethodPatch, "/api/admin/users/"+user.ID, `{"status":"disabled"}`, adminCookie)
	if disable.Code != http.StatusOK {
		t.Fatalf("disable status = %d, body = %s", disable.Code, disable.Body.String())
	}
	assertAPIError(t, apiRequest(handler, http.MethodGet, "/api/auth/me", "", oldUserCookie), http.StatusUnauthorized, "UNAUTHENTICATED")

	restore := apiRequest(handler, http.MethodPatch, "/api/admin/users/"+user.ID, `{"status":"active"}`, adminCookie)
	if restore.Code != http.StatusOK {
		t.Fatalf("restore status = %d, body = %s", restore.Code, restore.Body.String())
	}
	assertAPIError(t, apiRequest(handler, http.MethodGet, "/api/auth/me", "", oldUserCookie), http.StatusUnauthorized, "UNAUTHENTICATED")
	if response := apiRequest(handler, http.MethodGet, "/api/auth/me", "", login(t, handler, "user@example.test", "user-password")); response.Code != http.StatusOK {
		t.Fatalf("new login session status = %d, body = %s", response.Code, response.Body.String())
	}
	if store.audits != 2 {
		t.Fatalf("status changes wrote %d audits, want 2", store.audits)
	}

	assertAPIError(t, apiRequest(handler, http.MethodPatch, "/api/admin/users/"+admin.ID, `{"status":"disabled"}`, adminCookie), http.StatusConflict, "USER_PROTECTED")
}

func TestUserPaginationUsesExactEmailAndCursor(t *testing.T) {
	store := newMemoryStore()
	base := time.Date(2026, 9, 14, 0, 0, 0, 0, time.UTC)
	addTestUser(t, store, "admin", "admin@example.test", "admin-password", "admin", "active", base)
	addTestUser(t, store, "user-1", "alice@example.test", "alice-password", "user", "active", base.Add(time.Second))
	addTestUser(t, store, "user-2", "bob@example.test", "bob-password", "user", "disabled", base.Add(time.Second))
	addTestUser(t, store, "user-3", "carol@example.test", "carol-password", "user", "active", base.Add(2*time.Second))
	config := testConfig()
	config.PageSize = 2
	handler := NewHandler(config, store)
	adminCookie := login(t, handler, "admin@example.test", "admin-password")

	first := apiRequest(handler, http.MethodGet, "/api/admin/users", "", adminCookie)
	if first.Code != http.StatusOK {
		t.Fatalf("first page status = %d, body = %s", first.Code, first.Body.String())
	}
	var firstPage struct {
		Items      []User `json:"items"`
		NextCursor string `json:"nextCursor"`
	}
	if err := json.NewDecoder(first.Body).Decode(&firstPage); err != nil {
		t.Fatal(err)
	}
	if len(firstPage.Items) != 2 || firstPage.NextCursor == "" {
		t.Fatalf("first page = %#v", firstPage)
	}
	if firstPage.Items[0].Email != "carol@example.test" || firstPage.Items[1].Email != "bob@example.test" {
		t.Fatalf("first page is not createdAt/_id descending: %#v", firstPage.Items)
	}

	second := apiRequest(handler, http.MethodGet, "/api/admin/users?cursor="+firstPage.NextCursor, "", adminCookie)
	if second.Code != http.StatusOK {
		t.Fatalf("second page status = %d, body = %s", second.Code, second.Body.String())
	}
	var secondPage struct {
		Items      []User  `json:"items"`
		NextCursor *string `json:"nextCursor"`
	}
	if err := json.NewDecoder(second.Body).Decode(&secondPage); err != nil {
		t.Fatal(err)
	}
	if len(secondPage.Items) != 2 || secondPage.NextCursor != nil {
		t.Fatalf("second page = %#v", secondPage)
	}
	if secondPage.Items[0].Email != "alice@example.test" || secondPage.Items[1].Email != "admin@example.test" {
		t.Fatalf("second page is not createdAt/_id descending: %#v", secondPage.Items)
	}

	exact := apiRequest(handler, http.MethodGet, "/api/admin/users?email=bob@example.test", "", adminCookie)
	if exact.Code != http.StatusOK {
		t.Fatalf("exact email status = %d, body = %s", exact.Code, exact.Body.String())
	}
	var exactPage struct {
		Items []User `json:"items"`
	}
	if err := json.NewDecoder(exact.Body).Decode(&exactPage); err != nil {
		t.Fatal(err)
	}
	if len(exactPage.Items) != 1 || exactPage.Items[0].Email != "bob@example.test" || exactPage.Items[0].Status != "disabled" {
		t.Fatalf("exact email result = %#v", exactPage.Items)
	}
	assertAPIError(t, apiRequest(handler, http.MethodGet, "/api/admin/users?cursor="+firstPage.NextCursor+"&email=bob@example.test", "", adminCookie), http.StatusBadRequest, "INVALID_INPUT")
	assertAPIError(t, apiRequest(handler, http.MethodGet, "/api/admin/users?cursor=not-a-cursor", "", adminCookie), http.StatusBadRequest, "INVALID_INPUT")
}

func TestHealthAndReadiness(t *testing.T) {
	handler, _, _, _ := newTestHandler(t)
	for _, path := range []string{"/healthz", "/readyz"} {
		response := apiRequest(handler, http.MethodGet, path, "", nil)
		if response.Code != http.StatusOK {
			t.Fatalf("%s status = %d, body = %s", path, response.Code, response.Body.String())
		}
	}
}

func testConfig() Config {
	return Config{
		AllowedOrigins: map[string]struct{}{testOrigin: {}},
		SessionTTL:     time.Hour,
		RequestTimeout: time.Second,
		MaxBodyBytes:   4096,
		PageSize:       20,
	}
}

func newTestHandler(t *testing.T) (http.Handler, *memoryStore, User, User) {
	t.Helper()
	store := newMemoryStore()
	base := time.Date(2026, 9, 14, 0, 0, 0, 0, time.UTC)
	admin := addTestUser(t, store, "admin", "admin@example.test", "admin-password", "admin", "active", base)
	user := addTestUser(t, store, "user-1", "user@example.test", "user-password", "user", "active", base.Add(time.Second))
	return NewHandler(testConfig(), store), store, admin, user
}

func login(t *testing.T, handler http.Handler, email, password string) *http.Cookie {
	t.Helper()
	response := apiRequest(handler, http.MethodPost, "/api/auth/login", fmt.Sprintf(`{"email":%q,"password":%q}`, email, password), nil)
	if response.Code != http.StatusOK {
		t.Fatalf("login %s status = %d, body = %s", email, response.Code, response.Body.String())
	}
	return responseCookie(t, response, "visora_session")
}

func apiRequest(handler http.Handler, method, path, body string, cookie *http.Cookie) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Header.Set("Origin", testOrigin)
	// 跟随服务端自己的定义，避免新增写方法（PUT/DELETE）时这里漏设头导致误报 403。
	if isWriteMethod(method) {
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("X-Visora-Request", "1")
	}
	if cookie != nil {
		request.AddCookie(cookie)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func responseCookie(t *testing.T, response *httptest.ResponseRecorder, name string) *http.Cookie {
	t.Helper()
	for _, cookie := range response.Result().Cookies() {
		if cookie.Name == name {
			return cookie
		}
	}
	t.Fatalf("response has no %s cookie", name)
	return nil
}

func assertAPIError(t *testing.T, response *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	if response.Code != status {
		t.Fatalf("status = %d, want %d, body = %s", response.Code, status, response.Body.String())
	}
	var body struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Error.Code != code {
		t.Fatalf("error code = %q, want %q", body.Error.Code, code)
	}
}

type memoryStore struct {
	unimplementedStore
	mu          sync.Mutex
	users       map[string]User
	sessions    map[[32]byte]Session
	audits      int
	findUserErr error
}

func newMemoryStore() *memoryStore {
	return &memoryStore{users: make(map[string]User), sessions: make(map[[32]byte]Session)}
}

func addTestUser(t *testing.T, store *memoryStore, id, email, password, role, status string, createdAt time.Time) User {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		t.Fatal(err)
	}
	user := User{ID: id, Email: email, PasswordHash: hash, Role: role, Status: status, CreatedAt: createdAt}
	store.mu.Lock()
	defer store.mu.Unlock()
	store.users[id] = user
	return user
}

func (store *memoryStore) Ping(context.Context) error { return nil }

func (store *memoryStore) FindUserByEmail(_ context.Context, email string) (User, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.findUserErr != nil {
		return User{}, store.findUserErr
	}
	for _, user := range store.users {
		if user.Email == email {
			return user, nil
		}
	}
	return User{}, ErrNotFound
}

func (store *memoryStore) FindUserByID(_ context.Context, id string) (User, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	user, ok := store.users[id]
	if !ok {
		return User{}, ErrNotFound
	}
	return user, nil
}

func (store *memoryStore) CreateSession(_ context.Context, session Session) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.sessions[session.TokenHash] = session
	return nil
}

func (store *memoryStore) FindSessionByTokenHash(_ context.Context, hash [32]byte) (Session, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	session, ok := store.sessions[hash]
	if !ok {
		return Session{}, ErrNotFound
	}
	return session, nil
}

func (store *memoryStore) DeleteSession(_ context.Context, hash [32]byte) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	delete(store.sessions, hash)
	return nil
}

func (store *memoryStore) CreateUser(_ context.Context, input CreateUserInput) (User, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	for _, existing := range store.users {
		if existing.Email == input.Email {
			return User{}, ErrEmailExists
		}
	}
	user := User{
		ID:           fmt.Sprintf("created-%d", len(store.users)+1),
		Email:        input.Email,
		PasswordHash: append([]byte(nil), input.PasswordHash...),
		Role:         "user",
		Status:       "active",
		CreatedAt:    input.CreatedAt,
	}
	store.users[user.ID] = user
	store.audits++
	return user, nil
}

func (store *memoryStore) UpdateUserProfile(_ context.Context, input UpdateUserProfileInput) (User, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	user, ok := store.users[input.UserID]
	if !ok {
		return User{}, ErrNotFound
	}
	user.Name = input.Name
	user.AvatarURL = input.AvatarURL
	store.users[input.UserID] = user
	return user, nil
}

func (store *memoryStore) SetUserStatus(_ context.Context, input SetUserStatusInput) (User, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	user, ok := store.users[input.UserID]
	if !ok {
		return User{}, ErrNotFound
	}
	if user.Role != "user" || user.ID == input.ActorID {
		return User{}, ErrUserProtected
	}
	if user.Status != input.Status {
		if input.Status == "disabled" {
			user.SessionVersion++
		}
		user.Status = input.Status
		store.users[user.ID] = user
		store.audits++
	}
	return user, nil
}

func (store *memoryStore) ListUsers(_ context.Context, input ListUsersInput) ([]User, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	items := make([]User, 0, len(store.users))
	for _, user := range store.users {
		if input.Email != "" && user.Email != input.Email {
			continue
		}
		if input.After != nil && (user.CreatedAt.After(input.After.CreatedAt) || (user.CreatedAt.Equal(input.After.CreatedAt) && user.ID >= input.After.ID)) {
			continue
		}
		items = append(items, user)
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].CreatedAt.Equal(items[j].CreatedAt) {
			return items[i].ID > items[j].ID
		}
		return items[i].CreatedAt.After(items[j].CreatedAt)
	})
	if int64(len(items)) > input.Limit {
		items = items[:input.Limit]
	}
	return items, nil
}

func (store *memoryStore) CreateAdmin(_ context.Context, email string, passwordHash []byte, createdAt time.Time) (User, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	for _, existing := range store.users {
		if existing.Email == email {
			return User{}, ErrEmailExists
		}
	}
	user := User{ID: fmt.Sprintf("admin-%d", len(store.users)+1), Email: email, PasswordHash: append([]byte(nil), passwordHash...), Role: "admin", Status: "active", CreatedAt: createdAt}
	store.users[user.ID] = user
	return user, nil
}

func (store *memoryStore) InitIndexes(context.Context) error { return nil }

// unimplementedStore 给 http_test 里的假存储补上新领域的默认实现。
// 这些 HTTP 测试聚焦鉴权与用户管理，因此新领域一律返回空结果或 ErrNotFound；
// 积分、团队、会员的真实行为由 mongo_integration_test.go 对真实 MongoDB 验证。
// memoryStore 上已定义的同名方法会覆盖这里的实现，所以两者不会互相干扰。
type unimplementedStore struct{}

func (unimplementedStore) UpdateUserProfile(context.Context, UpdateUserProfileInput) (User, error) {
	return User{}, ErrNotFound
}

func (unimplementedStore) GrantPoints(context.Context, GrantPointsInput) (PointEntry, error) {
	return PointEntry{}, ErrNotFound
}

func (unimplementedStore) RevokePoints(context.Context, GrantPointsInput) (PointEntry, error) {
	return PointEntry{}, ErrNotFound
}

func (unimplementedStore) ListPointEntries(context.Context, ListPointEntriesInput) ([]PointEntry, error) {
	return []PointEntry{}, nil
}

func (unimplementedStore) ListModels(context.Context, ListModelsInput) ([]AIModel, error) {
	return []AIModel{}, nil
}

func (unimplementedStore) CreateModel(context.Context, CreateModelInput) (AIModel, error) {
	return AIModel{}, ErrNotFound
}

func (unimplementedStore) UpdateModel(context.Context, UpdateModelInput) (AIModel, error) {
	return AIModel{}, ErrNotFound
}

func (unimplementedStore) ListTeams(context.Context, ListTeamsInput) ([]Team, error) {
	return []Team{}, nil
}

func (unimplementedStore) CreateTeam(context.Context, CreateTeamInput) (Team, error) {
	return Team{}, ErrNotFound
}

func (unimplementedStore) DissolveTeam(context.Context, TeamActionInput) (Team, error) {
	return Team{}, ErrNotFound
}

func (unimplementedStore) ListTeamMembers(context.Context, string) ([]TeamMember, error) {
	return []TeamMember{}, nil
}

func (unimplementedStore) AddTeamMember(context.Context, TeamMemberInput) (TeamMember, error) {
	return TeamMember{}, ErrNotFound
}

func (unimplementedStore) RemoveTeamMember(context.Context, TeamMemberInput) (TeamMember, error) {
	return TeamMember{}, ErrNotFound
}

func (unimplementedStore) TopUpTeam(context.Context, TeamPointsInput) (Team, error) {
	return Team{}, ErrNotFound
}

func (unimplementedStore) AllocateTeamPoints(context.Context, TeamPointsInput) (TeamMember, error) {
	return TeamMember{}, ErrNotFound
}

func (unimplementedStore) RevokeTeamAllocation(context.Context, TeamPointsInput) (TeamMember, error) {
	return TeamMember{}, ErrNotFound
}

func (unimplementedStore) ListPlans(context.Context) ([]MembershipPlan, error) {
	return []MembershipPlan{}, nil
}

func (unimplementedStore) UpdatePlan(context.Context, UpdatePlanInput) (MembershipPlan, error) {
	return MembershipPlan{}, ErrNotFound
}

func (unimplementedStore) ListApplications(context.Context, ListApplicationsInput) ([]MembershipApplication, error) {
	return []MembershipApplication{}, nil
}

func (unimplementedStore) SubmitApplication(context.Context, SubmitApplicationInput) (MembershipApplication, error) {
	return MembershipApplication{}, ErrNotFound
}

func (unimplementedStore) DecideApplication(context.Context, DecideApplicationInput) (MembershipApplication, error) {
	return MembershipApplication{}, ErrNotFound
}

func (unimplementedStore) ListMemberships(context.Context, ListMembershipsInput) ([]Membership, error) {
	return []Membership{}, nil
}

func (unimplementedStore) ListAdmins(context.Context, ListAdminsInput) ([]User, error) {
	return []User{}, nil
}

func (unimplementedStore) CreateAdminAccount(context.Context, CreateUserInput) (User, error) {
	return User{}, ErrNotFound
}

func (unimplementedStore) SetAdminStatus(context.Context, SetUserStatusInput) (User, error) {
	return User{}, ErrNotFound
}

func (unimplementedStore) CountActiveAdmins(context.Context) (int64, error) { return 0, nil }

func (unimplementedStore) Overview(context.Context, time.Time) (OverviewStats, error) {
	return OverviewStats{Signups: []DailyCount{}}, nil
}
