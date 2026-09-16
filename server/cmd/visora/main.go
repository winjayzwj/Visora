package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	server "visora/server"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "visora:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) != 1 {
		return errors.New("用法: visora serve | init-db | create-admin")
	}
	config, err := server.LoadConfig(os.Getenv)
	if err != nil {
		return errors.New("配置无效")
	}
	client, err := mongo.Connect(options.Client().ApplyURI(config.MongoURI))
	if err != nil {
		return errors.New("MongoDB 客户端配置失败")
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), config.RequestTimeout)
		defer cancel()
		_ = client.Disconnect(ctx)
	}()
	store := server.NewMongoStore(client.Database(config.MongoDatabase))

	switch args[0] {
	case "serve":
		err := server.NewHTTPServer(config, server.NewHandler(config, store)).ListenAndServe()
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return errors.New("HTTP 服务启动失败")
		}
		return nil
	case "init-db":
		return withTimeout(config.RequestTimeout, store.InitIndexes)
	case "create-admin":
		return createAdmin(config, store)
	default:
		return errors.New("用法: visora serve | init-db | create-admin")
	}
}

func withTimeout(timeout time.Duration, run func(context.Context) error) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	if err := run(ctx); err != nil {
		return errors.New("MongoDB 操作失败")
	}
	return nil
}

func createAdmin(config server.Config, store *server.MongoStore) error {
	info, err := os.Stdin.Stat()
	if err != nil {
		return errors.New("无法读取标准输入")
	}
	if info.Mode()&os.ModeCharDevice != 0 {
		return errors.New("create-admin 仅接受重定向标准输入的单条 JSON，避免密码回显")
	}
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	decoder := json.NewDecoder(os.Stdin)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		return errors.New("管理员输入必须是一条 JSON")
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return errors.New("管理员输入必须是一条 JSON")
	}
	email, err := server.NormalizeEmail(input.Email)
	if err != nil {
		return errors.New("管理员输入无效")
	}
	passwordHash, err := server.HashPassword(input.Password)
	if err != nil {
		return errors.New("管理员输入无效")
	}
	ctx, cancel := context.WithTimeout(context.Background(), config.RequestTimeout)
	defer cancel()
	user, err := store.CreateAdmin(ctx, email, passwordHash, time.Now().UTC())
	if errors.Is(err, server.ErrEmailExists) {
		return errors.New("邮箱已存在")
	}
	if err != nil {
		return errors.New("MongoDB 操作失败")
	}
	fmt.Fprintln(os.Stdout, "管理员已创建:", user.Email)
	return nil
}
