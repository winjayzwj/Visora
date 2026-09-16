package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"golang.org/x/crypto/bcrypt"
)

// TestMongoDomainFlowIntegration 覆盖积分、模型、团队、会员、后台账号五块新领域。
// 重点是账务不变量：余额不允许透支、团队池与成员已分配积分不能凭空产生或消失、
// 会员审批重复提交只赠送一次积分。
func TestMongoDomainFlowIntegration(t *testing.T) {
	uri := os.Getenv("VISORA_TEST_MONGO_URI")
	if uri == "" {
		t.Skip("VISORA_TEST_MONGO_URI is not set")
	}
	if !isSafeTestMongoURI(uri) {
		t.Fatal("VISORA_TEST_MONGO_URI must use a non-27017 loopback mongodb:// endpoint")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatal(err)
	}
	databaseName := fmt.Sprintf("visora_test_domain_%d", time.Now().UnixNano())
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
	handler := NewHandler(testConfig(), store)
	adminCookie := login(t, handler, "admin@example.test", "admin-password")

	// 建一个普通用户作为所有账务操作的对象。
	create := apiRequest(handler, http.MethodPost, "/api/admin/users", `{"email":"member@example.test","password":"member-password"}`, adminCookie)
	if create.Code != http.StatusCreated {
		t.Fatalf("create user status = %d, body = %s", create.Code, create.Body.String())
	}
	var created struct {
		User User `json:"user"`
	}
	if err := json.NewDecoder(create.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}
	userID := created.User.ID

	t.Run("积分发放与撤销不允许透支", func(t *testing.T) {
		grant := apiRequest(handler, http.MethodPost, "/api/admin/points/grant",
			fmt.Sprintf(`{"userId":%q,"amount":100,"note":"内测额度"}`, userID), adminCookie)
		if grant.Code != http.StatusOK {
			t.Fatalf("grant status = %d, body = %s", grant.Code, grant.Body.String())
		}
		var granted struct {
			Entry PointEntry `json:"entry"`
		}
		if err := json.NewDecoder(grant.Body).Decode(&granted); err != nil {
			t.Fatal(err)
		}
		if granted.Entry.Delta != 100 || granted.Entry.BalanceAfter != 100 {
			t.Fatalf("grant entry = %#v", granted.Entry)
		}

		revoke := apiRequest(handler, http.MethodPost, "/api/admin/points/revoke",
			fmt.Sprintf(`{"userId":%q,"amount":40}`, userID), adminCookie)
		if revoke.Code != http.StatusOK {
			t.Fatalf("revoke status = %d, body = %s", revoke.Code, revoke.Body.String())
		}
		var revoked struct {
			Entry PointEntry `json:"entry"`
		}
		if err := json.NewDecoder(revoke.Body).Decode(&revoked); err != nil {
			t.Fatal(err)
		}
		if revoked.Entry.Delta != -40 || revoked.Entry.BalanceAfter != 60 {
			t.Fatalf("revoke entry = %#v", revoked.Entry)
		}

		// 余额 60，撤销 100 必须失败且不把余额截断成 0。
		assertAPIError(t, apiRequest(handler, http.MethodPost, "/api/admin/points/revoke",
			fmt.Sprintf(`{"userId":%q,"amount":100}`, userID), adminCookie), http.StatusConflict, "INSUFFICIENT_POINTS")

		user, err := store.FindUserByID(ctx, userID)
		if err != nil {
			t.Fatal(err)
		}
		if user.Points != 60 {
			t.Fatalf("points after failed revoke = %d, want 60", user.Points)
		}

		ledger := apiRequest(handler, http.MethodGet, "/api/admin/points/ledger?userId="+userID, "", adminCookie)
		if ledger.Code != http.StatusOK {
			t.Fatalf("ledger status = %d, body = %s", ledger.Code, ledger.Body.String())
		}
		var page struct {
			Items []PointEntry `json:"items"`
		}
		if err := json.NewDecoder(ledger.Body).Decode(&page); err != nil {
			t.Fatal(err)
		}
		if len(page.Items) != 2 {
			t.Fatalf("ledger entries = %d, want 2 (失败的那次不应写入流水)", len(page.Items))
		}
	})

	t.Run("模型目录", func(t *testing.T) {
		body := `{"name":"测试图像模型","kind":"image","pointsCost":12}`
		response := apiRequest(handler, http.MethodPost, "/api/admin/models", body, adminCookie)
		if response.Code != http.StatusCreated {
			t.Fatalf("create model status = %d, body = %s", response.Code, response.Body.String())
		}
		var created struct {
			Model AIModel `json:"model"`
		}
		if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
			t.Fatal(err)
		}
		if created.Model.Status != StatusActive || created.Model.PointsCost != 12 {
			t.Fatalf("model = %#v", created.Model)
		}
		assertAPIError(t, apiRequest(handler, http.MethodPost, "/api/admin/models", body, adminCookie), http.StatusConflict, "NAME_EXISTS")
		assertAPIError(t, apiRequest(handler, http.MethodPost, "/api/admin/models", `{"name":"坏类型","kind":"music","pointsCost":1}`, adminCookie), http.StatusBadRequest, "INVALID_INPUT")

		updated := apiRequest(handler, http.MethodPatch, "/api/admin/models/"+created.Model.ID, `{"pointsCost":30,"status":"disabled"}`, adminCookie)
		if updated.Code != http.StatusOK {
			t.Fatalf("update model status = %d, body = %s", updated.Code, updated.Body.String())
		}
		var after struct {
			Model AIModel `json:"model"`
		}
		if err := json.NewDecoder(updated.Body).Decode(&after); err != nil {
			t.Fatal(err)
		}
		if after.Model.PointsCost != 30 || after.Model.Status != StatusDisabled || after.Model.Name != "测试图像模型" {
			t.Fatalf("updated model = %#v", after.Model)
		}
	})

	var teamID string
	t.Run("团队积分池与成员分配", func(t *testing.T) {
		create := apiRequest(handler, http.MethodPost, "/api/admin/teams",
			fmt.Sprintf(`{"name":"设计组","adminUserId":%q}`, userID), adminCookie)
		if create.Code != http.StatusCreated {
			t.Fatalf("create team status = %d, body = %s", create.Code, create.Body.String())
		}
		var createdTeam struct {
			Team Team `json:"team"`
		}
		if err := json.NewDecoder(create.Body).Decode(&createdTeam); err != nil {
			t.Fatal(err)
		}
		teamID = createdTeam.Team.ID
		if createdTeam.Team.MemberCount != 1 || createdTeam.Team.PointsPool != 0 {
			t.Fatalf("new team = %#v", createdTeam.Team)
		}
		assertAPIError(t, apiRequest(handler, http.MethodPost, "/api/admin/teams",
			fmt.Sprintf(`{"name":"设计组","adminUserId":%q}`, userID), adminCookie), http.StatusConflict, "NAME_EXISTS")

		if response := apiRequest(handler, http.MethodPost, "/api/admin/teams/"+teamID+"/points/topup", `{"amount":500,"note":"季度额度"}`, adminCookie); response.Code != http.StatusOK {
			t.Fatalf("topup status = %d, body = %s", response.Code, response.Body.String())
		}
		assertAPIError(t, apiRequest(handler, http.MethodPost, "/api/admin/teams/"+teamID+"/points/topup", `{"amount":0}`, adminCookie),
			http.StatusBadRequest, "INVALID_INPUT")

		team, err := findTeamForTest(t, store, teamID)
		if err != nil {
			t.Fatal(err)
		}
		if team.PointsPool != 500 {
			t.Fatalf("pool after topup = %d, want 500", team.PointsPool)
		}

		// 团队管理员本人也是成员，可以直接分配给他。
		allocate := apiRequest(handler, http.MethodPost, "/api/admin/teams/"+teamID+"/points/allocate",
			fmt.Sprintf(`{"userId":%q,"amount":200}`, userID), adminCookie)
		if allocate.Code != http.StatusOK {
			t.Fatalf("allocate status = %d, body = %s", allocate.Code, allocate.Body.String())
		}
		var member struct {
			Member TeamMember `json:"member"`
		}
		if err := json.NewDecoder(allocate.Body).Decode(&member); err != nil {
			t.Fatal(err)
		}
		if member.Member.AllocatedPoints != 200 {
			t.Fatalf("member allocated = %d, want 200", member.Member.AllocatedPoints)
		}

		team, err = findTeamForTest(t, store, teamID)
		if err != nil {
			t.Fatal(err)
		}
		if team.PointsPool != 300 || team.AllocatedTotal != 200 {
			t.Fatalf("after allocate: pool = %d, allocatedTotal = %d", team.PointsPool, team.AllocatedTotal)
		}

		// 池里只剩 300，分配 400 必须失败。
		assertAPIError(t, apiRequest(handler, http.MethodPost, "/api/admin/teams/"+teamID+"/points/allocate",
			fmt.Sprintf(`{"userId":%q,"amount":400}`, userID), adminCookie), http.StatusConflict, "INSUFFICIENT_POINTS")

		// 成员只持有 200，撤销 300 必须失败。
		assertAPIError(t, apiRequest(handler, http.MethodPost, "/api/admin/teams/"+teamID+"/points/revoke",
			fmt.Sprintf(`{"userId":%q,"amount":300}`, userID), adminCookie), http.StatusConflict, "INSUFFICIENT_POINTS")

		// 撤销 200 后积分应回到池中。
		if response := apiRequest(handler, http.MethodPost, "/api/admin/teams/"+teamID+"/points/revoke",
			fmt.Sprintf(`{"userId":%q,"amount":200}`, userID), adminCookie); response.Code != http.StatusOK {
			t.Fatalf("revoke allocation status = %d, body = %s", response.Code, response.Body.String())
		}
		team, err = findTeamForTest(t, store, teamID)
		if err != nil {
			t.Fatal(err)
		}
		if team.PointsPool != 500 {
			t.Fatalf("pool after revoke = %d, want 500", team.PointsPool)
		}
	})

	t.Run("解散后不再接受积分操作", func(t *testing.T) {
		if response := apiRequest(handler, http.MethodPost, "/api/admin/teams/"+teamID+"/dissolve", `{}`, adminCookie); response.Code != http.StatusOK {
			t.Fatalf("dissolve status = %d, body = %s", response.Code, response.Body.String())
		}
		assertAPIError(t, apiRequest(handler, http.MethodPost, "/api/admin/teams/"+teamID+"/points/topup", `{"amount":10}`, adminCookie),
			http.StatusConflict, "TEAM_INACTIVE")

		// 解散按 C07 只冻结状态：积分池余额必须保留，不能被清空。
		team, err := findTeamForTest(t, store, teamID)
		if err != nil {
			t.Fatal(err)
		}
		if team.Status != StatusDissolved || team.PointsPool != 500 {
			t.Fatalf("dissolved team = %#v（积分池应保留）", team)
		}
	})

	t.Run("会员审批幂等且只赠送一次", func(t *testing.T) {
		plan := apiRequest(handler, http.MethodPut, "/api/admin/membership/plans",
			`{"code":"trial","name":"内测会员","description":"内测期间开通","durationDays":30,"bonusPoints":50,"features":["高清生成"]}`, adminCookie)
		if plan.Code != http.StatusOK {
			t.Fatalf("upsert plan status = %d, body = %s", plan.Code, plan.Body.String())
		}

		userCookie := login(t, handler, "member@example.test", "member-password")
		submit := apiRequest(handler, http.MethodPost, "/api/membership/applications",
			`{"scene":"个人创作","reason":"想测试高清生成"}`, userCookie)
		if submit.Code != http.StatusCreated {
			t.Fatalf("submit status = %d, body = %s", submit.Code, submit.Body.String())
		}
		var submitted struct {
			Application MembershipApplication `json:"application"`
		}
		if err := json.NewDecoder(submit.Body).Decode(&submitted); err != nil {
			t.Fatal(err)
		}
		applicationID := submitted.Application.ID

		before, err := store.FindUserByID(ctx, userID)
		if err != nil {
			t.Fatal(err)
		}
		approve := apiRequest(handler, http.MethodPost, "/api/admin/membership/applications/"+applicationID+"/approve", `{"planCode":"trial"}`, adminCookie)
		if approve.Code != http.StatusOK {
			t.Fatalf("approve status = %d, body = %s", approve.Code, approve.Body.String())
		}
		after, err := store.FindUserByID(ctx, userID)
		if err != nil {
			t.Fatal(err)
		}
		if after.Points != before.Points+50 {
			t.Fatalf("points after approve = %d, want %d", after.Points, before.Points+50)
		}

		// 重复审批必须被挡住，积分不能发第二次。
		assertAPIError(t, apiRequest(handler, http.MethodPost, "/api/admin/membership/applications/"+applicationID+"/approve", `{"planCode":"trial"}`, adminCookie),
			http.StatusConflict, "ALREADY_DECIDED")
		again, err := store.FindUserByID(ctx, userID)
		if err != nil {
			t.Fatal(err)
		}
		if again.Points != after.Points {
			t.Fatalf("points after duplicate approve = %d, want %d", again.Points, after.Points)
		}

		members := apiRequest(handler, http.MethodGet, "/api/admin/membership/members", "", adminCookie)
		if members.Code != http.StatusOK {
			t.Fatalf("members status = %d, body = %s", members.Code, members.Body.String())
		}
		var memberPage struct {
			Items []Membership `json:"items"`
		}
		if err := json.NewDecoder(members.Body).Decode(&memberPage); err != nil {
			t.Fatal(err)
		}
		if len(memberPage.Items) != 1 || memberPage.Items[0].PlanCode != "trial" || memberPage.Items[0].GrantedPoints != 50 {
			t.Fatalf("membership page = %#v", memberPage.Items)
		}
	})

	t.Run("后台账号保护", func(t *testing.T) {
		second := apiRequest(handler, http.MethodPost, "/api/admin/accounts", `{"email":"ops@example.test","password":"ops-password"}`, adminCookie)
		if second.Code != http.StatusCreated {
			t.Fatalf("create admin status = %d, body = %s", second.Code, second.Body.String())
		}
		var createdAdmin struct {
			User User `json:"user"`
		}
		if err := json.NewDecoder(second.Body).Decode(&createdAdmin); err != nil {
			t.Fatal(err)
		}
		admins, err := store.ListAdmins(ctx, ListAdminsInput{Limit: 10})
		if err != nil {
			t.Fatal(err)
		}
		var selfID string
		for _, admin := range admins {
			if admin.Email == "admin@example.test" {
				selfID = admin.ID
			}
		}
		if selfID == "" {
			t.Fatal("bootstrap admin not found")
		}
		assertAPIError(t, apiRequest(handler, http.MethodPatch, "/api/admin/accounts/"+selfID, `{"status":"disabled"}`, adminCookie),
			http.StatusConflict, "SELF_ACTION")

		// 先停用第二个管理员，让启用中的管理员只剩一个，才能验证最后一条底线。
		if _, err := store.SetAdminStatus(ctx, SetUserStatusInput{
			UserID: createdAdmin.User.ID, Status: StatusDisabled, ActorID: selfID, CreatedAt: time.Now().UTC(),
		}); err != nil {
			t.Fatalf("disable second admin: %v", err)
		}
		if _, err := store.SetAdminStatus(ctx, SetUserStatusInput{
			UserID: selfID, Status: StatusDisabled, ActorID: "another-actor", CreatedAt: time.Now().UTC(),
		}); !errors.Is(err, ErrLastAdmin) {
			t.Fatalf("disabling the last active admin error = %v, want ErrLastAdmin", err)
		}
	})

	t.Run("授权矩阵是只读的服务端事实", func(t *testing.T) {
		response := apiRequest(handler, http.MethodGet, "/api/admin/permissions", "", adminCookie)
		if response.Code != http.StatusOK {
			t.Fatalf("permissions status = %d, body = %s", response.Code, response.Body.String())
		}
		var page struct {
			Items []PermissionRule `json:"items"`
		}
		if err := json.NewDecoder(response.Body).Decode(&page); err != nil {
			t.Fatal(err)
		}
		if len(page.Items) == 0 {
			t.Fatal("permission matrix is empty")
		}
		// 普通用户可访问的项必须存在，否则矩阵会把用户侧入口描述成全管理员专属。
		var hasUserAllowed bool
		for _, rule := range page.Items {
			if rule.UserAllowed {
				hasUserAllowed = true
			}
		}
		if !hasUserAllowed {
			t.Fatal("permission matrix marks every endpoint as admin-only")
		}
	})

	t.Run("看板只统计有真实来源的指标", func(t *testing.T) {
		response := apiRequest(handler, http.MethodGet, "/api/admin/stats/overview", "", adminCookie)
		if response.Code != http.StatusOK {
			t.Fatalf("overview status = %d, body = %s", response.Code, response.Body.String())
		}
		var page struct {
			Stats OverviewStats `json:"stats"`
		}
		if err := json.NewDecoder(response.Body).Decode(&page); err != nil {
			t.Fatal(err)
		}
		stats := page.Stats
		if stats.TotalUsers != 1 || stats.AdminUsers != 2 {
			t.Fatalf("user counts = %d/%d, want 1/2", stats.TotalUsers, stats.AdminUsers)
		}
		if stats.TotalModels != 1 || stats.TotalTeams != 1 || stats.ActiveTeams != 0 {
			t.Fatalf("resource counts = %#v", stats)
		}
		if stats.ActiveMemberships != 1 {
			t.Fatalf("active memberships = %d, want 1", stats.ActiveMemberships)
		}
		if stats.IssuedPoints != 150 || stats.RevokedPoints != 40 || stats.OutstandingPoints != 110 {
			t.Fatalf("points summary = issued %d, revoked %d, outstanding %d", stats.IssuedPoints, stats.RevokedPoints, stats.OutstandingPoints)
		}
		if stats.TeamPoolPoints != 500 {
			t.Fatalf("team pool total = %d, want 500", stats.TeamPoolPoints)
		}
		if len(stats.Signups) != 7 {
			t.Fatalf("signup series length = %d, want 7", len(stats.Signups))
		}
	})
}

// findTeamForTest 通过公开的 ListTeams 读取团队，
// 避免为了测试在生产代码里开一个只有测试用的专用方法。
func findTeamForTest(t *testing.T, store *MongoStore, teamID string) (Team, error) {
	t.Helper()
	teams, err := store.ListTeams(context.Background(), ListTeamsInput{Limit: 100})
	if err != nil {
		return Team{}, err
	}
	for _, team := range teams {
		if team.ID == teamID {
			return team, nil
		}
	}
	return Team{}, ErrNotFound
}
