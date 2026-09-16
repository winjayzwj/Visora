# Visora Admin

## 创作台回跳

同源部署时，Admin 与用户 Web 共用 origin，保持 `VITE_WEB_ORIGIN` 为空即可；无权限页会回到当前 origin 的根路径。

独立本地开发时，必须设置用户 Web 的精确 origin。例如 Admin 为 `http://127.0.0.1:5174`、用户 Web 为 `http://127.0.0.1:5173`：

```env
VITE_WEB_ORIGIN=http://127.0.0.1:5173
```

该值只接受 `http(s)` origin，且必须与 Admin 的 hostname、protocol 一致（端口可不同）。开发环境未配置或配置无效时，无权限页不会显示可点击的“返回创作台”链接。
