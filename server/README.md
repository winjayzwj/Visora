# Visora 本地账号服务

这是仅供本地开发的 Go 账号服务。它只允许 loopback 监听地址；不要将它直接暴露到公网。

## 配置

将 [`.env.example`](.env.example) 的每一项填成实际的本地开发值，并在启动前导出到进程环境。服务不读取或创建 `.env`，也不为以下参数提供默认边界值：

- `VISORA_SESSION_TTL`：Go duration。
- `VISORA_REQUEST_TIMEOUT`：Go duration，同时作为 HTTP header/read/write/idle 超时。
- `VISORA_MAX_BODY_BYTES`：正整数。
- `VISORA_PAGE_SIZE`：正整数。

`VISORA_ALLOWED_ORIGINS` 为逗号分隔的精确 origin。HTTP 只能是 loopback origin；不能混用 HTTP 与 HTTPS。开发用户端与 Admin 统一使用 `127.0.0.1`，不要混用 `localhost`。HTTPS origin 会使用 Secure session cookie。

同组 HTTP origins 必须使用同一主机（可以不同端口），不能混用 `localhost`、`127.0.0.1`、`::1` 或不同 loopback 地址。Cookie 的 Max-Age/Expires 按显式 `VISORA_SESSION_TTL` 向上取整到秒，服务端仍以原始 TTL 校验会话到期。

## 命令

在 `server/` 目录执行：

```sh
go run ./cmd/visora init-db
go run ./cmd/visora serve
```

`init-db` 显式创建 `users`、`sessions`、`admin_audit` 所需索引；正常 `serve` 不会创建索引或管理员。

创建管理员使用单条重定向 stdin JSON，且不接受命令行密码：

```json
{"email":"admin@example.test","password":"your-password"}
```

将该 JSON 从受保护的文件或安全管道传给：

```sh
go run ./cmd/visora create-admin
```

为避免密码回显，`create-admin` 拒绝直接从交互终端读取输入。

`create-admin` 在同一 replica set 事务中创建管理员与 `admin.bootstrap_created` 审计事件，actor 为 `bootstrap`；审计失败时不会留下管理员。先执行 `init-db`，正常 `serve` 不触发 bootstrap。

## HTTP 约束

所有写请求必须同时包含 `Content-Type: application/json`、`X-Visora-Request: 1` 以及与配置严格相等的 `Origin`。服务不发送 CORS 放行头。session 仅通过 `visora_session` HttpOnly、SameSite=Strict cookie 传递，服务端只保存 token 的 SHA-256 哈希。

超过 `VISORA_MAX_BODY_BYTES` 的 JSON 请求返回 `413 PAYLOAD_TOO_LARGE`。管理员列表按 `createdAt`、`_id` 倒序；cursor 与当前标准化邮箱筛选绑定，变更查询时应回到第一页。

## 测试

```sh
go test ./...
```

MongoDB 集成测试仅在显式提供 `VISORA_TEST_MONGO_URI` 时运行；测试会拒绝非 loopback URI、`27017` 和非 `visora_test_` 前缀数据库。
