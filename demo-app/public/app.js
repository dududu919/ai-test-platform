const storageKeys = {
  session: "demo-app-session",
  users: "demo-app-users"
};

const defaultUsers = [
  { name: "张三管理员", email: "admin@example.com", role: "admin" },
  { name: "李四访客", email: "viewer@example.com", role: "viewer" }
];

bootstrap();

function bootstrap() {
  if (!localStorage.getItem(storageKeys.users)) {
    localStorage.setItem(storageKeys.users, JSON.stringify(defaultUsers));
  }

  const page = document.body.dataset.page;

  if (page === "login") {
    mountLogin();
    return;
  }

  requireSession();

  if (page === "users") {
    mountUsers();
    return;
  }

  if (page === "user-create") {
    mountCreateUser();
  }
}

function mountLogin() {
  const form = document.querySelector("[data-form='login']");
  const message = document.querySelector("[data-testid='login-message']");

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const username = document.querySelector("input[name='username']")?.value.trim();
    const password = document.querySelector("input[name='password']")?.value.trim();

    if (!username || !password) {
      setMessage(message, "用户名和密码必填。", "error");
      return;
    }

    const role = username === "viewer" ? "viewer" : "admin";
    localStorage.setItem(
      storageKeys.session,
      JSON.stringify({ username, role, loggedInAt: new Date().toISOString() })
    );
    window.location.href = "/users";
  });
}

function mountUsers() {
  const users = readUsers();
  const tbody = document.querySelector("[data-testid='user-rows']");
  const currentUser = readSession();
  const roleChip = document.querySelector("[data-testid='current-role']");
  const createButton = document.querySelector("[data-testid='create']");
  const logoutButton = document.querySelector("[data-testid='logout']");

  if (roleChip && currentUser) {
    roleChip.textContent = `当前角色：${currentUser.role}`;
  }

  if (createButton && currentUser?.role !== "admin") {
    createButton.setAttribute("aria-disabled", "true");
    createButton.addEventListener("click", (event) => {
      event.preventDefault();
      const message = document.querySelector("[data-testid='users-message']");
      setMessage(message, "无权限执行该操作。", "error");
    });
  }

  logoutButton?.addEventListener("click", () => {
    localStorage.removeItem(storageKeys.session);
    window.location.href = "/login";
  });

  const flash = localStorage.getItem("demo-app-flash");
  if (flash) {
    const message = document.querySelector("[data-testid='users-message']");
    setMessage(message, flash, "success");
    localStorage.removeItem("demo-app-flash");
  }

  if (!tbody) {
    return;
  }

  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty">暂无用户数据。</td></tr>`;
    return;
  }

  tbody.innerHTML = users
    .map(
      (user) => `
        <tr>
          <td>${escapeHtml(user.name)}</td>
          <td>${escapeHtml(user.email)}</td>
          <td>${escapeHtml(user.role)}</td>
        </tr>
      `
    )
    .join("");
}

function mountCreateUser() {
  const form = document.querySelector("[data-form='create-user']");
  const message = document.querySelector("[data-testid='form-message']");
  const currentUser = readSession();

  if (currentUser?.role !== "admin") {
    setMessage(message, "无权限执行该操作。", "error");
  }

  form?.addEventListener("submit", (event) => {
    event.preventDefault();

    if (currentUser?.role !== "admin") {
      setMessage(message, "无权限执行该操作。", "error");
      return;
    }

    const name = document.querySelector("[data-testid='user.name']")?.value.trim();
    const email = document.querySelector("[data-testid='user.email']")?.value.trim();
    const role = document.querySelector("[data-testid='user.role']")?.value;

    if (!name || !email || !role) {
      setMessage(message, "必填", "error");
      return;
    }

    const users = readUsers();
    users.push({ name, email, role });
    localStorage.setItem(storageKeys.users, JSON.stringify(users));
    localStorage.setItem("demo-app-flash", "用户创建成功");
    window.location.href = "/users";
  });
}

function requireSession() {
  if (!readSession()) {
    window.location.href = "/login";
  }
}

function readSession() {
  const raw = localStorage.getItem(storageKeys.session);
  return raw ? JSON.parse(raw) : null;
}

function readUsers() {
  const raw = localStorage.getItem(storageKeys.users);
  return raw ? JSON.parse(raw) : [];
}

function setMessage(node, text, type) {
  if (!node) {
    return;
  }

  node.textContent = text;
  node.className = `message ${type}`;
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
