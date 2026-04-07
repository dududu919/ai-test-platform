# Demo App

本地被测系统，提供最小用户管理流程：

- `/login`
- `/users`
- `/users/new`

## 启动

```bash
npm start
```

启动后访问：

```text
http://127.0.0.1:3000/login
```

## 说明

- 输入任意用户名和密码都能登录
- 用户名填 `viewer` 时会模拟低权限账号
- 用户数据保存在浏览器 `localStorage`
