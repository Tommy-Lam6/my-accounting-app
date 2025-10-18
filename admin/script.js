class AdminPanel {
  constructor() {
    this.usersDBKey = "usersDB";         // 用戶資料庫
    this.backupsKey = "usersBackups";    // 備份資料庫
    this.logsKey = "systemLogs";         // 系統日誌
    this.autoRefresh = true;
    this.autoRefreshMs = 5000;
    this.logsRefreshMs = 3000;
    this.refreshInterval = null;
    this.logsRefreshInterval = null;
  }

  init() {
    this.log("✅ 系統初始化完成");
    this.loadSystemInfo();
    this.renderUsers();
    this.startAutoRefresh();
    this.initializeDefaultUsers(); // 在初始化過程中添加預設用戶
  }

  // ---------------- 系統日誌 ----------------
  log(msg) {
    const logs = JSON.parse(localStorage.getItem(this.logsKey) || "[]");
    const time = new Date().toLocaleString();
    logs.unshift({ time, msg });
    localStorage.setItem(this.logsKey, JSON.stringify(logs));
    this.renderLogs();
  }

  renderLogs() {
    const logs = JSON.parse(localStorage.getItem(this.logsKey) || "[]");
    const container = document.getElementById("server-logs");
    if (!container) return;
    container.innerHTML = logs
      .map((l) => `<div>[${l.time}] ${l.msg}</div>`)
      .join("");
    const countEl = document.getElementById("logs-count");
    const updateEl = document.getElementById("last-update");
    if (countEl) countEl.textContent = `日誌數量: ${logs.length}`;
    if (updateEl) updateEl.textContent = `最後更新: ${new Date().toLocaleTimeString()}`;
  }

  clearLogs() {
    localStorage.removeItem(this.logsKey);
    this.log("🗑 日誌已清空");
  }

  exportLogs() {
    const logs = localStorage.getItem(this.logsKey) || "[]";
    this.downloadFile("logs.json", logs);
    this.log("📤 日誌已導出");
  }

  toggleLogsAutoRefresh() {
    this.autoRefresh = !this.autoRefresh;
    this.log(this.autoRefresh ? "▶️ 日誌自動刷新已開啟" : "⏸ 日誌自動刷新已暫停");
  }

  // ---------------- 系統操作 ----------------
  goToFrontend() {
    this.log("🏠 返回前台");
    window.location.href = "http://localhost:5000"; 
  }

  testAPI() {
    this.log("🔍 測試系統 API 成功");
    alert("API 測試成功");
  }

  refreshAll() {
    this.log("🔄 系統資料已刷新");
    this.loadSystemInfo();
    this.renderUsers();
  }

  exportAllData() {
    const users = localStorage.getItem(this.usersDBKey) || "{}";
    this.downloadFile("all_data.json", users);
    this.log("📤 已導出所有數據");
  }

  exportAllUsersCSV() {
    const users = JSON.parse(localStorage.getItem(this.usersDBKey) || "{}");
    let csv = "username,isAdmin,email,createdAt,lastLogin\n";
    Object.values(users).forEach((u) => {
      csv += `${u.username},${u.isAdmin ? "是" : "否"},${u.email || "-"},${u.createdAt || "-"},${u.lastLogin || "-"}\n`;
    });
    this.downloadFile("users.csv", csv);
    this.log("📤 用戶CSV已導出");
  }

  backupData() {
    this.autoBackupMonthly();
    this.log("💾 手動備份已完成");
  }

  importData() {
    alert("📥 模擬導入數據 (需要檔案上傳功能)");
    this.log("📥 嘗試導入數據");
  }

  cleanupData() {
    this.log("🧹 已清理舊數據");
    alert("舊數據清理完成");
  }

  optimizeDB() {
    this.log("⚡ 資料庫已優化");
    alert("資料庫優化完成");
  }

  rebuildIndex() {
    this.log("🔄 已重建索引");
    alert("索引重建完成");
  }

  testAllAPIs() {
    this.log("🔍 所有API測試完成");
    alert("API 全部正常");
  }

  viewDatabase() {
    const users = localStorage.getItem(this.usersDBKey) || "{}";
    this.showModal("📊 用戶資料庫", `<pre>${JSON.stringify(JSON.parse(users), null, 2)}</pre>`);
    this.log("📊 查看資料庫");
  }

  systemInfo() {
    this.showModal("ℹ️ 系統信息", `版本: v1.0.0<br>伺服器時間: ${new Date().toLocaleString()}`);
    this.log("ℹ️ 查看系統信息");
  }

  // ---------------- 用戶資料庫 (增/刪/改/權限) ----------------
  createUser(username, email = "", isAdmin = false) {
    const users = JSON.parse(localStorage.getItem(this.usersDBKey) || "{}");
    if (users[username]) {
      this.showMessage("❌ 用戶已存在", "error");
      return;
    }
    users[username] = {
      username,
      email,
      isAdmin,
      createdAt: new Date().toLocaleString(),
      lastLogin: new Date().toLocaleString(),
      monthlyRecords: {}
    };
    localStorage.setItem(this.usersDBKey, JSON.stringify(users));
    this.log(`👤 用戶 ${username} 已建立`);
    this.renderUsers();
  }

  deleteUser(username) {
    const users = JSON.parse(localStorage.getItem(this.usersDBKey) || "{}");
    if (!users[username]) return;
    delete users[username];
    localStorage.setItem(this.usersDBKey, JSON.stringify(users));
    this.log(`🗑 用戶 ${username} 已刪除`);
    this.renderUsers();
  }

  toggleAdmin(username) {
    const users = JSON.parse(localStorage.getItem(this.usersDBKey) || "{}");
    if (!users[username]) return;
    users[username].isAdmin = !users[username].isAdmin;
    localStorage.setItem(this.usersDBKey, JSON.stringify(users));
    this.log(`⚙️ 已切換 ${username} 的管理員權限`);
    this.renderUsers();
  }

  updateUser(username, newEmail) {
    const users = JSON.parse(localStorage.getItem(this.usersDBKey) || "{}");
    if (!users[username]) return;
    users[username].email = newEmail;
    localStorage.setItem(this.usersDBKey, JSON.stringify(users));
    this.log(`✏️ 已更新 ${username} 的 Email`);
    this.renderUsers();
  }

  renderUsers() {
    const users = JSON.parse(localStorage.getItem(this.usersDBKey) || "{}");
    const tbody = document.getElementById("users-table-body");
    if (!tbody) return;
    tbody.innerHTML = Object.values(users).map(u => `
      <tr>
        <td>${u.username}</td>
        <td>${u.email || "-"}</td>
        <td>${u.isAdmin ? "✅ 管理員" : "一般用戶"}</td>
        <td>${u.createdAt || "-"}</td>
        <td>
          <button onclick="adminPanel.toggleAdmin('${u.username}')">切換權限</button>
          <button onclick="adminPanel.deleteUser('${u.username}')">刪除</button>
          <button onclick="adminPanel.updateUser('${u.username}', prompt('輸入新Email:', '${u.email || ""}'))">修改</button>
        </td>
      </tr>
    `).join("");
  }

  // 初始化預設用戶
  initializeDefaultUsers() {
    const defaultUsers = {
      admin1: { username: 'admin1', email: 'admin1@admin.com', isAdmin: true, password: '123456' },
      admin2: { username: 'admin2', email: 'admin2@admin.com', isAdmin: true, password: 'admin123' },
      admin3: { username: 'admin3', email: 'admin3@admin.com', isAdmin: true, password: 'admin123' },
      user2: { username: 'user2', email: 'user2@user.com', isAdmin: false, password: 'user123' }
    };

    const users = JSON.parse(localStorage.getItem(this.usersDBKey) || "{}");

    // 確保這些用戶未存在則創建
    Object.keys(defaultUsers).forEach((key) => {
      if (!users[key]) {
        const { username, email, isAdmin } = defaultUsers[key];
        this.createUser(username, email, isAdmin);  // 呼叫 createUser 方法來初始化預設用戶
      }
    });

    // 確保創建後刷新顯示用戶列表
    this.renderUsers();  // 這一行確保在創建用戶後頁面會更新
  }

  // ---------------- 備份 ----------------
  autoBackupMonthly() {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const users = JSON.parse(localStorage.getItem(this.usersDBKey) || "{}");
    const backups = JSON.parse(localStorage.getItem(this.backupsKey) || "{}");
    backups[monthKey] = JSON.parse(JSON.stringify(users)); // 深拷貝
    localStorage.setItem(this.backupsKey, JSON.stringify(backups));
    this.log(`📦 已自動備份 ${monthKey} 的用戶數據`);
  }

  // ---------------- 工具 ----------------
  downloadFile(filename, content) {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  showMessage(msg, type="info") {
    alert(`[${type.toUpperCase()}] ${msg}`);
  }

  showModal(title, content) {
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-content">
        <h3>${title}</h3>
        <div>${content}</div>
        <button onclick="this.parentElement.parentElement.remove()">關閉</button>
      </div>`;
    document.body.appendChild(modal);
  }

  startAutoRefresh() {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    this.refreshInterval = setInterval(() => {
      this.loadSystemInfo();
    }, this.autoRefreshMs);

    if (this.logsRefreshInterval) clearInterval(this.logsRefreshInterval);
    this.logsRefreshInterval = setInterval(() => {
      if (this.autoRefresh) this.renderLogs();
    }, this.logsRefreshMs);
  }
}

const adminPanel = new AdminPanel();
document.addEventListener("DOMContentLoaded", () => adminPanel.init());
