package server

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const sessionCookieName = "visora_session"

// Public, non-credential DefaultCost hash for equal-work rejected logins.
const dummyPasswordHash = "$2a$10$XajjQvNhvvRt5GSeFk1xFeyqRrsxkhBkUiQeg0dt.wU1qD4aFDcga"

var (
	errUnauthenticated = errors.New("unauthenticated")
	errForbidden       = errors.New("forbidden")
)

type app struct {
	config          Config
	store           Store
	now             func() time.Time
	comparePassword func([]byte, []byte) error
}

func NewHandler(config Config, store Store) http.Handler {
	handler := &app{config: config, store: store, now: time.Now, comparePassword: bcrypt.CompareHashAndPassword}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), config.RequestTimeout)
		defer cancel()
		handler.serveHTTP(w, r.WithContext(ctx))
	})
}

// isWriteMethod 决定哪些方法要过 Origin / 自定义头 / Content-Type 三道闸。
// DELETE 和 PUT 必须一起纳入：只放行 POST/PATCH 会让新加的写接口绕过来源校验。
func isWriteMethod(method string) bool {
	switch method {
	case http.MethodPost, http.MethodPatch, http.MethodPut, http.MethodDelete:
		return true
	}
	return false
}

func trimPrefix(path, prefix string) (string, bool) {
	if !strings.HasPrefix(path, prefix) {
		return "", false
	}
	return strings.TrimPrefix(path, prefix), true
}

func (app *app) serveHTTP(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	if strings.HasPrefix(path, "/api/") {
		w.Header().Set("Cache-Control", "no-store")
		if isWriteMethod(r.Method) && !app.requireWriteRequest(w, r) {
			return
		}
	}

	switch path {
	case "/healthz":
		app.healthz(w, r)
	case "/readyz":
		app.readyz(w, r)
	case "/api/auth/login":
		if r.Method != http.MethodPost {
			methodNotAllowed(w, http.MethodPost)
			return
		}
		app.login(w, r)
	case "/api/auth/me":
		if r.Method != http.MethodGet {
			methodNotAllowed(w, http.MethodGet)
			return
		}
		app.me(w, r)
	case "/api/auth/logout":
		if r.Method != http.MethodPost {
			methodNotAllowed(w, http.MethodPost)
			return
		}
		app.logout(w, r)
	case "/api/membership/applications":
		if r.Method != http.MethodPost {
			methodNotAllowed(w, http.MethodPost)
			return
		}
		app.submitApplication(w, r)
	case "/api/admin/users":
		switch r.Method {
		case http.MethodGet:
			app.listUsers(w, r)
		case http.MethodPost:
			app.createUser(w, r)
		default:
			methodNotAllowed(w, http.MethodGet, http.MethodPost)
		}
	case "/api/admin/points/ledger":
		if r.Method != http.MethodGet {
			methodNotAllowed(w, http.MethodGet)
			return
		}
		app.listPointEntries(w, r)
	case "/api/admin/points/grant":
		if r.Method != http.MethodPost {
			methodNotAllowed(w, http.MethodPost)
			return
		}
		app.grantPoints(w, r)
	case "/api/admin/points/revoke":
		if r.Method != http.MethodPost {
			methodNotAllowed(w, http.MethodPost)
			return
		}
		app.revokePoints(w, r)
	case "/api/admin/models":
		switch r.Method {
		case http.MethodGet:
			app.listModels(w, r)
		case http.MethodPost:
			app.createModel(w, r)
		default:
			methodNotAllowed(w, http.MethodGet, http.MethodPost)
		}
	case "/api/admin/teams":
		switch r.Method {
		case http.MethodGet:
			app.listTeams(w, r)
		case http.MethodPost:
			app.createTeam(w, r)
		default:
			methodNotAllowed(w, http.MethodGet, http.MethodPost)
		}
	case "/api/admin/membership/plans":
		switch r.Method {
		case http.MethodGet:
			app.listPlans(w, r)
		case http.MethodPut:
			app.updatePlan(w, r)
		default:
			methodNotAllowed(w, http.MethodGet, http.MethodPut)
		}
	case "/api/admin/membership/applications":
		if r.Method != http.MethodGet {
			methodNotAllowed(w, http.MethodGet)
			return
		}
		app.listApplications(w, r)
	case "/api/admin/membership/members":
		if r.Method != http.MethodGet {
			methodNotAllowed(w, http.MethodGet)
			return
		}
		app.listMemberships(w, r)
	case "/api/admin/accounts":
		switch r.Method {
		case http.MethodGet:
			app.listAdmins(w, r)
		case http.MethodPost:
			app.createAdminAccount(w, r)
		default:
			methodNotAllowed(w, http.MethodGet, http.MethodPost)
		}
	case "/api/admin/stats/overview":
		if r.Method != http.MethodGet {
			methodNotAllowed(w, http.MethodGet)
			return
		}
		app.overview(w, r)
	case "/api/admin/permissions":
		if r.Method != http.MethodGet {
			methodNotAllowed(w, http.MethodGet)
			return
		}
		app.listPermissions(w, r)
	default:
		if app.serveAdminSubroutes(w, r, path) {
			return
		}
		writeError(w, http.StatusNotFound, "NOT_FOUND", "接口不存在")
	}
}

// serveAdminSubroutes 处理带路径参数的接口，例如 /api/admin/teams/{id}/members/{userId}。
func (app *app) serveAdminSubroutes(w http.ResponseWriter, r *http.Request, path string) bool {
	if rest, ok := trimPrefix(path, "/api/admin/users/"); ok && rest != "" {
		if r.Method != http.MethodPatch {
			methodNotAllowed(w, http.MethodPatch)
			return true
		}
		app.setUserStatus(w, r, rest)
		return true
	}
	if rest, ok := trimPrefix(path, "/api/admin/models/"); ok && rest != "" {
		if r.Method != http.MethodPatch {
			methodNotAllowed(w, http.MethodPatch)
			return true
		}
		app.updateModel(w, r, rest)
		return true
	}
	if rest, ok := trimPrefix(path, "/api/admin/accounts/"); ok && rest != "" {
		if r.Method != http.MethodPatch {
			methodNotAllowed(w, http.MethodPatch)
			return true
		}
		app.setAdminStatus(w, r, rest)
		return true
	}
	if rest, ok := trimPrefix(path, "/api/admin/membership/applications/"); ok && rest != "" {
		segments := strings.Split(rest, "/")
		if len(segments) != 2 {
			return false
		}
		if r.Method != http.MethodPost {
			methodNotAllowed(w, http.MethodPost)
			return true
		}
		switch segments[1] {
		case "approve":
			app.decideApplication(w, r, segments[0], true)
		case "reject":
			app.decideApplication(w, r, segments[0], false)
		default:
			return false
		}
		return true
	}
	if rest, ok := trimPrefix(path, "/api/admin/teams/"); ok && rest != "" {
		segments := strings.Split(rest, "/")
		teamID := segments[0]
		if teamID == "" {
			return false
		}
		switch {
		case len(segments) == 2 && segments[1] == "dissolve":
			if r.Method != http.MethodPost {
				methodNotAllowed(w, http.MethodPost)
				return true
			}
			app.dissolveTeam(w, r, teamID)
		case len(segments) == 2 && segments[1] == "members":
			switch r.Method {
			case http.MethodGet:
				app.listTeamMembers(w, r, teamID)
			case http.MethodPost:
				app.addTeamMember(w, r, teamID)
			default:
				methodNotAllowed(w, http.MethodGet, http.MethodPost)
			}
		case len(segments) == 3 && segments[1] == "members":
			if r.Method != http.MethodDelete {
				methodNotAllowed(w, http.MethodDelete)
				return true
			}
			app.removeTeamMember(w, r, teamID, segments[2])
		case len(segments) == 3 && segments[1] == "points":
			if r.Method != http.MethodPost {
				methodNotAllowed(w, http.MethodPost)
				return true
			}
			switch segments[2] {
			case "topup":
				app.topUpTeam(w, r, teamID)
			case "allocate":
				app.allocateTeamPoints(w, r, teamID)
			case "revoke":
				app.revokeTeamAllocation(w, r, teamID)
			default:
				return false
			}
		default:
			return false
		}
		return true
	}
	return false
}

func (app *app) healthz(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, http.MethodGet)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (app *app) readyz(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, http.MethodGet)
		return
	}
	if err := app.store.Ping(r.Context()); err != nil {
		writeError(w, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "服务暂不可用")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func (app *app) login(w http.ResponseWriter, r *http.Request) {
	var input credentialsInput
	if !app.decodeJSON(w, r, &input) {
		return
	}
	email, err := NormalizeEmail(input.Email)
	if err != nil || !passwordAllowed(input.Password) {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
		return
	}
	user, err := app.store.FindUserByEmail(r.Context(), email)
	missing := errors.Is(err, ErrNotFound)
	if err != nil && !missing {
		writeError(w, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "服务暂不可用")
		return
	}
	passwordHash := user.PasswordHash
	if missing || user.Status != StatusActive {
		passwordHash = []byte(dummyPasswordHash)
	}
	passwordErr := app.comparePassword(passwordHash, []byte(input.Password))
	if missing || user.Status != StatusActive || passwordErr != nil {
		writeError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "邮箱或密码错误")
		return
	}

	token, tokenHash, err := newSessionToken()
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "服务暂不可用")
		return
	}
	now := app.now().UTC()
	if err := app.store.CreateSession(r.Context(), Session{
		TokenHash:      tokenHash,
		UserID:         user.ID,
		SessionVersion: user.SessionVersion,
		CreatedAt:      now,
		ExpiresAt:      now.Add(app.config.SessionTTL),
	}); err != nil {
		writeError(w, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "服务暂不可用")
		return
	}
	app.setSessionCookie(w, token)
	writeJSON(w, http.StatusOK, struct {
		User User `json:"user"`
	}{User: user})
}

func (app *app) me(w http.ResponseWriter, r *http.Request) {
	user, err := app.currentUser(r)
	if err != nil {
		app.writeAuthError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		User User `json:"user"`
	}{User: user})
}

func (app *app) logout(w http.ResponseWriter, r *http.Request) {
	var input struct{}
	if !app.decodeJSON(w, r, &input) {
		return
	}
	if cookie, err := r.Cookie(sessionCookieName); err == nil && cookie.Value != "" {
		if err := app.store.DeleteSession(r.Context(), sha256.Sum256([]byte(cookie.Value))); err != nil {
			writeError(w, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "服务暂不可用")
			return
		}
	}
	app.setSessionCookie(w, "")
	w.WriteHeader(http.StatusNoContent)
}

func (app *app) listUsers(w http.ResponseWriter, r *http.Request) {
	if _, err := app.requireAdmin(r); err != nil {
		app.writeAuthError(w, err)
		return
	}
	input := ListUsersInput{Limit: app.config.PageSize + 1}
	if email := r.URL.Query().Get("email"); email != "" {
		var err error
		input.Email, err = NormalizeEmail(email)
		if err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
			return
		}
	}
	if cursor := r.URL.Query().Get("cursor"); cursor != "" {
		parsed, err := decodeCursor(cursor)
		if err != nil || parsed.Email != input.Email {
			writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
			return
		}
		input.After = &parsed
	}
	items, err := app.store.ListUsers(r.Context(), input)
	if errors.Is(err, ErrInvalidInput) {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
		return
	}
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "服务暂不可用")
		return
	}
	var nextCursor *string
	if int64(len(items)) > app.config.PageSize {
		items = items[:app.config.PageSize]
		cursor := encodeCursor(UserCursor{CreatedAt: items[len(items)-1].CreatedAt, ID: items[len(items)-1].ID, Email: input.Email})
		nextCursor = &cursor
	}
	writeJSON(w, http.StatusOK, struct {
		Items      []User  `json:"items"`
		NextCursor *string `json:"nextCursor"`
	}{Items: items, NextCursor: nextCursor})
}

func (app *app) createUser(w http.ResponseWriter, r *http.Request) {
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
	user, err := app.store.CreateUser(r.Context(), CreateUserInput{
		Email:        email,
		PasswordHash: passwordHash,
		ActorID:      admin.ID,
		CreatedAt:    app.now().UTC(),
	})
	if errors.Is(err, ErrEmailExists) {
		writeError(w, http.StatusConflict, "EMAIL_EXISTS", "邮箱已存在")
		return
	}
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "服务暂不可用")
		return
	}
	writeJSON(w, http.StatusCreated, struct {
		User User `json:"user"`
	}{User: user})
}

func (app *app) setUserStatus(w http.ResponseWriter, r *http.Request, userID string) {
	if userID == "" || strings.Contains(userID, "/") {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "用户不存在")
		return
	}
	admin, err := app.requireAdmin(r)
	if err != nil {
		app.writeAuthError(w, err)
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
	user, err := app.store.SetUserStatus(r.Context(), SetUserStatusInput{
		UserID:    userID,
		Status:    input.Status,
		ActorID:   admin.ID,
		CreatedAt: app.now().UTC(),
	})
	switch {
	case errors.Is(err, ErrNotFound):
		writeError(w, http.StatusNotFound, "NOT_FOUND", "用户不存在")
	case errors.Is(err, ErrUserProtected):
		writeError(w, http.StatusConflict, "USER_PROTECTED", "该用户不能修改")
	case err != nil:
		writeError(w, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "服务暂不可用")
	default:
		writeJSON(w, http.StatusOK, struct {
			User User `json:"user"`
		}{User: user})
	}
}

func (app *app) requireAdmin(r *http.Request) (User, error) {
	user, err := app.currentUser(r)
	if err != nil {
		return User{}, err
	}
	if user.Role != RoleAdmin {
		return User{}, errForbidden
	}
	return user, nil
}

func (app *app) currentUser(r *http.Request) (User, error) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil || cookie.Value == "" {
		return User{}, errUnauthenticated
	}
	session, err := app.store.FindSessionByTokenHash(r.Context(), sha256.Sum256([]byte(cookie.Value)))
	if errors.Is(err, ErrNotFound) {
		return User{}, errUnauthenticated
	}
	if err != nil {
		return User{}, err
	}
	if !session.ExpiresAt.After(app.now()) {
		return User{}, errUnauthenticated
	}
	user, err := app.store.FindUserByID(r.Context(), session.UserID)
	if errors.Is(err, ErrNotFound) {
		return User{}, errUnauthenticated
	}
	if err != nil {
		return User{}, err
	}
	if user.Status != StatusActive || user.SessionVersion != session.SessionVersion {
		return User{}, errUnauthenticated
	}
	return user, nil
}

func (app *app) writeAuthError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errUnauthenticated):
		writeError(w, http.StatusUnauthorized, "UNAUTHENTICATED", "请先登录")
	case errors.Is(err, errForbidden):
		writeError(w, http.StatusForbidden, "FORBIDDEN", "无权限")
	default:
		writeError(w, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "服务暂不可用")
	}
}

func (app *app) requireWriteRequest(w http.ResponseWriter, r *http.Request) bool {
	origins := r.Header.Values("Origin")
	if len(origins) != 1 {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "请求来源不被允许")
		return false
	}
	if _, ok := app.config.AllowedOrigins[origins[0]]; !ok {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "请求来源不被允许")
		return false
	}
	requests := r.Header.Values("X-Visora-Request")
	if len(requests) != 1 || requests[0] != "1" {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "请求来源不被允许")
		return false
	}
	contentTypes := r.Header.Values("Content-Type")
	if len(contentTypes) != 1 {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
		return false
	}
	contentType, _, err := mime.ParseMediaType(contentTypes[0])
	if err != nil || contentType != "application/json" {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
		return false
	}
	return true
}

func (app *app) decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, app.config.MaxBodyBytes)
	decoder := json.NewDecoder(r.Body)
	var raw json.RawMessage
	if err := decoder.Decode(&raw); err != nil {
		app.writeJSONDecodeError(w, err)
		return false
	}
	if len(raw) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
		return false
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		app.writeJSONDecodeError(w, err)
		return false
	}
	decoder = json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
		return false
	}
	return true
}

func (app *app) writeJSONDecodeError(w http.ResponseWriter, err error) {
	var maxBodyError *http.MaxBytesError
	if errors.As(err, &maxBodyError) {
		writeError(w, http.StatusRequestEntityTooLarge, "PAYLOAD_TOO_LARGE", "请求体过大")
		return
	}
	writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
}

func (app *app) setSessionCookie(w http.ResponseWriter, value string) {
	maxAge := -1
	expires := time.Unix(1, 0).UTC()
	if value != "" {
		maxAge = int(app.config.SessionTTL / time.Second)
		if app.config.SessionTTL%time.Second != 0 {
			maxAge++
		}
		expires = app.now().UTC().Add(app.config.SessionTTL)
		// Cookies have second precision; the stored session deadline stays exact.
		if expires.Nanosecond() != 0 {
			expires = expires.Truncate(time.Second).Add(time.Second)
		}
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		Secure:   app.config.CookieSecure,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   maxAge,
		Expires:  expires,
	})
}

func NormalizeEmail(value string) (string, error) {
	value = strings.TrimSpace(value)
	address, err := mail.ParseAddress(value)
	if err != nil || value == "" || address.Address != value {
		return "", ErrInvalidInput
	}
	return strings.ToLower(address.Address), nil
}

func HashPassword(value string) ([]byte, error) {
	if !passwordAllowed(value) {
		return nil, ErrInvalidInput
	}
	return bcrypt.GenerateFromPassword([]byte(value), bcrypt.DefaultCost)
}

func passwordAllowed(value string) bool {
	return value != "" && len([]byte(value)) <= 72
}

func newSessionToken() (string, [32]byte, error) {
	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", [32]byte{}, err
	}
	token := base64.RawURLEncoding.EncodeToString(raw[:])
	return token, sha256.Sum256([]byte(token)), nil
}

func encodeCursor(cursor UserCursor) string {
	payload, _ := json.Marshal(struct {
		CreatedAt time.Time `json:"createdAt"`
		ID        string    `json:"id"`
		Email     string    `json:"email"`
	}{CreatedAt: cursor.CreatedAt.UTC(), ID: cursor.ID, Email: cursor.Email})
	return base64.RawURLEncoding.EncodeToString(payload)
}

func decodeCursor(value string) (UserCursor, error) {
	payload, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return UserCursor{}, ErrInvalidInput
	}
	var cursor struct {
		CreatedAt time.Time `json:"createdAt"`
		ID        string    `json:"id"`
		Email     *string   `json:"email"`
	}
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&cursor); err != nil || cursor.CreatedAt.IsZero() || cursor.ID == "" || cursor.Email == nil {
		return UserCursor{}, ErrInvalidInput
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		return UserCursor{}, ErrInvalidInput
	}
	return UserCursor{CreatedAt: cursor.CreatedAt.UTC(), ID: cursor.ID, Email: *cursor.Email}, nil
}

type credentialsInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type statusInput struct {
	Status string `json:"status"`
}

// simpleCursor 是「只按 createdAt + _id 排序」的通用游标载荷，
// 模型、团队、流水、申请、会员列表都用它，避免为每种列表再写一套编解码。
type simpleCursor struct {
	CreatedAt time.Time `json:"createdAt"`
	ID        string    `json:"id"`
}

func encodeSimpleCursor(createdAt time.Time, id string) string {
	payload, _ := json.Marshal(simpleCursor{CreatedAt: createdAt.UTC(), ID: id})
	return base64.RawURLEncoding.EncodeToString(payload)
}

func decodeSimpleCursor(value string) (simpleCursor, error) {
	payload, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return simpleCursor{}, ErrInvalidInput
	}
	var cursor simpleCursor
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&cursor); err != nil || cursor.CreatedAt.IsZero() || cursor.ID == "" {
		return simpleCursor{}, ErrInvalidInput
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		return simpleCursor{}, ErrInvalidInput
	}
	return simpleCursor{CreatedAt: cursor.CreatedAt.UTC(), ID: cursor.ID}, nil
}

// writeStoreError 把领域错误映射成稳定的错误码。
// 新增领域错误时在这里补一条，避免各 handler 各写一套 switch。
func (app *app) writeStoreError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		writeError(w, http.StatusNotFound, "NOT_FOUND", "资源不存在")
	case errors.Is(err, ErrInvalidInput):
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "请求参数无效")
	case errors.Is(err, ErrNameExists):
		writeError(w, http.StatusConflict, "NAME_EXISTS", "名称已存在")
	case errors.Is(err, ErrEmailExists):
		writeError(w, http.StatusConflict, "EMAIL_EXISTS", "邮箱已存在")
	case errors.Is(err, ErrInsufficientPoints):
		writeError(w, http.StatusConflict, "INSUFFICIENT_POINTS", "积分余额不足")
	case errors.Is(err, ErrMemberHasPoints):
		writeError(w, http.StatusConflict, "MEMBER_HAS_POINTS", "该成员仍有已分配积分，请先撤销后再移出")
	case errors.Is(err, ErrLastAdmin):
		writeError(w, http.StatusConflict, "LAST_ADMIN", "至少要保留一个启用中的管理员")
	case errors.Is(err, ErrSelfAction):
		writeError(w, http.StatusConflict, "SELF_ACTION", "不能对自己的账号执行该操作")
	case errors.Is(err, ErrAlreadyDecided):
		writeError(w, http.StatusConflict, "ALREADY_DECIDED", "该申请已经处理过")
	case errors.Is(err, ErrTeamProtected):
		writeError(w, http.StatusConflict, "TEAM_INACTIVE", "团队已解散，不能继续操作")
	case errors.Is(err, ErrMemberExists):
		writeError(w, http.StatusConflict, "MEMBER_EXISTS", "该用户已在团队中")
	case errors.Is(err, ErrMemberNotFound):
		writeError(w, http.StatusNotFound, "MEMBER_NOT_FOUND", "该用户不在团队中")
	case errors.Is(err, ErrPlanNotFound):
		writeError(w, http.StatusNotFound, "PLAN_NOT_FOUND", "套餐不存在")
	case errors.Is(err, ErrUserProtected):
		writeError(w, http.StatusConflict, "USER_PROTECTED", "该账号不能这样修改")
	default:
		writeError(w, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "服务暂不可用")
	}
}

func methodNotAllowed(w http.ResponseWriter, methods ...string) {
	w.Header().Set("Allow", strings.Join(methods, ", "))
	writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "请求方法不被允许")
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}{Error: struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}{Code: code, Message: message}})
}
