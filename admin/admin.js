// ==================== 管理後台路由守衛 ====================
(function() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser || !currentUser.isAdmin) {
        // 使用 replace 避免加入歷史記錄
        window.location.replace('/login.html');
    }
})();

// 監聽返回鍵
window.addEventListener('pageshow', function(event) {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser || !currentUser.isAdmin) {
        window.location.replace('/login.html');
    }
});

class AdminPanel {
    constructor() {
        this.currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        this.apiBase = '/api/admin';
        this.init();
    }

    init() {
        console.log('🔧 管理後台初始化...');
        this.checkAdminPermission();
        this.bindEvents();
        this.loadAllData();
    }

    checkAdminPermission() {
    if (!this.currentUser || !this.currentUser.isAdmin) {
        alert('❌ 權限不足！請使用管理員帳戶登入。');
        window.location.href = '/login.html';  // 前面加咗 /
        return false;
    }
    return true;
}
    bindEvents() {
        // 綁定所有按鈕
        document.getElementById('goToFrontendBtn').onclick = () => this.goToFrontend();
        document.getElementById('testApiBtn').onclick = () => this.testAPI();
        document.getElementById('refreshAllBtn').onclick = () => this.refreshAll();
        document.getElementById('addUserBtn').onclick = () => this.handleAddUser();
        document.getElementById('searchRecordsBtn').onclick = () => this.searchUserRecords();
        document.getElementById('refreshLogsBtn').onclick = () => this.loadSystemLogs();
        
        console.log('✅ 所有按鈕事件已綁定');
    }

    async loadAllData() {
        await this.loadSystemInfo();
        await this.loadUsers();
        await this.loadSystemLogs();
        console.log('✅ 所有數據加載完成');
    }

    // 基本功能
    goToFrontend() {
        window.location.href = "/";
    }

    testAPI() {
        alert('✅ 系統連接正常！管理後台運作中。');
    }

    refreshAll() {
        this.loadAllData();
        alert('🔄 所有數據已刷新');
    }

    // 用戶管理
    async handleAddUser() {
        const username = document.getElementById('new-username').value.trim();
        const email = document.getElementById('new-email').value.trim();
        const isAdmin = document.getElementById('new-role').value === 'true';

        if (!username) {
            alert('❌ 請輸入用戶名');
            return;
        }

        try {
            const response = await fetch(`${this.apiBase}/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-username': this.currentUser.username
                },
                body: JSON.stringify({ 
                    username, 
                    email, 
                    isAdmin, 
                    password: 'pass123' 
                })
            });

            const result = await response.json();
            
            if (response.ok) {
                alert(`✅ 用戶 ${username} 創建成功！預設密碼: pass123`);
                document.getElementById('new-username').value = '';
                document.getElementById('new-email').value = '';
                this.loadUsers();
            } else {
                alert(`❌ ${result.error}`);
            }
        } catch (error) {
            console.error('創建用戶錯誤:', error);
            alert('❌ 網絡錯誤，創建用戶失敗');
        }
    }

    async loadUsers() {
        try {
            console.log('📋 加載用戶列表...');
            const response = await fetch(`${this.apiBase}/users`, {
                headers: { 'x-username': this.currentUser.username }
            });

            if (response.ok) {
                const users = await response.json();
                this.renderUsers(users);
                console.log(`✅ 加載 ${users.length} 個用戶`);
            } else {
                console.error('❌ 加載用戶列表失敗');
            }
        } catch (error) {
            console.error('❌ 網絡錯誤:', error);
        }
    }

    renderUsers(users) {
        const tbody = document.getElementById('users-table-body');
        if (!tbody) return;

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">暫無用戶數據</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(user => `
    <tr>
        <td>${user.username}</td>
        <td>${user.email || '-'}</td>
        <td>${user.isAdmin ? '✅ 管理員' : '👤 一般用戶'}</td>
        <td>${user.createdAt ? new Date(user.createdAt).toLocaleDateString('zh-HK') : '-'}</td>
        <td>
            <button onclick="adminPanel.toggleAdmin('${user.username}')">🔄 權限</button>
            <button onclick="adminPanel.deleteUser('${user.username}')">🗑 刪除</button>
            <button onclick="adminPanel.adminResetPassword('${user.username}')">🔑 重設密碼</button>
            <button onclick="adminPanel.searchUserRecords('${user.username}')">🔍 記錄</button>
        </td>
    </tr>
`).join('');
    }

    async toggleAdmin(username) {
        if (username === this.currentUser.username) {
            alert('❌ 不能修改自己的管理員權限');
            return;
        }

        try {
            const response = await fetch(`${this.apiBase}/users/${username}/toggle-admin`, {
                method: 'PUT',
                headers: { 'x-username': this.currentUser.username }
            });

            if (response.ok) {
                alert('✅ 權限更新成功');
                this.loadUsers();
            } else {
                const result = await response.json();
                alert(`❌ ${result.error}`);
            }
        } catch (error) {
            alert('❌ 網絡錯誤，更新權限失敗');
        }
    }

    async deleteUser(username) {
        if (username === this.currentUser.username) {
            alert('❌ 不能刪除當前登入的用戶');
            return;
        }
        
        if (!confirm(`確定要刪除用戶 ${username} 嗎？此操作無法復原！`)) return;

        try {
            const response = await fetch(`${this.apiBase}/users/${username}`, {
                method: 'DELETE',
                headers: { 'x-username': this.currentUser.username }
            });

            if (response.ok) {
                alert('✅ 用戶刪除成功');
                this.loadUsers();
            } else {
                const result = await response.json();
                alert(`❌ ${result.error}`);
            }
        } catch (error) {
            alert('❌ 網絡錯誤，刪除用戶失敗');
        }
    }

    // 搜尋功能
    async searchUserRecords(username = '') {
        let searchUsername = username;
        
        if (!searchUsername) {
            searchUsername = prompt('請輸入要搜尋的用戶名（留空則搜尋所有用戶）:', '');
            if (searchUsername === null) return;
        }
        
        const searchMonth = prompt('請輸入要搜尋的月份 (YYYY-MM格式，留空則搜尋所有月份):', '');
        if (searchMonth === null) return;

        try {
            const params = new URLSearchParams();
            if (searchUsername) params.append('username', searchUsername);
            if (searchMonth) params.append('month', searchMonth);

            const response = await fetch(`${this.apiBase}/transactions?${params}`, {
                headers: { 'x-username': this.currentUser.username }
            });

            if (response.ok) {
                const transactions = await response.json();
                this.displaySearchResults(transactions, searchUsername, searchMonth);
            } else {
                alert('❌ 搜尋失敗');
            }
        } catch (error) {
            alert('❌ 網絡錯誤，搜尋失敗');
        }
    }

    displaySearchResults(transactions, username, month) {
        if (transactions.length === 0) {
            alert('❌ 未找到相關記錄');
            return;
        }

        let message = `📊 搜尋結果 (${username || '所有用戶'}${month ? ` - ${month}` : ''}):\n\n`;
        
        transactions.forEach((t, index) => {
            message += `${index + 1}. [${t.username}] ${t.date} | ${t.description} | ${t.category} | $${t.amount} | ${t.type}\n`;
        });

        alert(message);
    }

    // 系統信息
    async loadSystemInfo() {
        try {
            const response = await fetch(`${this.apiBase}/system-info`, {
                headers: { 'x-username': this.currentUser.username }
            });

            if (response.ok) {
                const info = await response.json();
                this.updateSystemInfo(info);
            }
        } catch (error) {
            console.error('加載系統信息失敗:', error);
        }
    }

    updateSystemInfo(info) {
        if (info.totalUsers !== undefined) document.getElementById('total-users').textContent = info.totalUsers;
        if (info.totalTransactions !== undefined) document.getElementById('total-transactions').textContent = info.totalTransactions;
        if (info.totalMonths !== undefined) document.getElementById('total-months').textContent = info.totalMonths;
        if (info.todayTransactions !== undefined) document.getElementById('today-transactions').textContent = info.todayTransactions;
        if (info.currentTime) document.getElementById('current-time').textContent = info.currentTime;
        if (info.uptime) document.getElementById('uptime').textContent = info.uptime;
    }

    // 系統日誌
    async loadSystemLogs() {
        try {
            const response = await fetch(`${this.apiBase}/logs`, {
                headers: { 'x-username': this.currentUser.username }
            });

            if (response.ok) {
                const logs = await response.json();
                this.renderLogs(logs);
            }
        } catch (error) {
            console.error('加載系統日誌失敗:', error);
        }
    }



    // 管理員重設用戶密碼
async adminResetPassword(username) {
    const newPassword = prompt(`請輸入 ${username} 的新密碼（至少6位）:`);
    
    if (!newPassword) return;
    
    if (newPassword.length < 6) {
        alert('❌ 密碼至少需要6位字符');
        return;
    }

    if (!confirm(`確定要將 ${username} 的密碼重設為 "${newPassword}" 嗎？`)) {
        return;
    }

    try {
        const response = await fetch('/api/auth/admin-reset-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-username': this.currentUser.username
            },
            body: JSON.stringify({ 
                username, 
                newPassword 
            })
        });

        const result = await response.json();
        
        if (response.ok) {
            alert(`✅ ${username} 的密碼已重設為: ${newPassword}`);
            // 在開發環境顯示新密碼，生產環境應該只告訴管理員
            if (result.newPassword) {
                console.log(`新密碼: ${result.newPassword}`);
            }
        } else {
            alert(`❌ ${result.error}`);
        }
    } catch (error) {
        alert('❌ 網絡錯誤，重設密碼失敗');
    }
}




    renderLogs(logs) {
        const container = document.getElementById('server-logs');
        if (!container) return;

        container.innerHTML = logs.map(log => `
            <div class="log-entry">
                <span class="log-time">[${new Date(log.timestamp).toLocaleString('zh-HK')}]</span>
                <span class="log-level ${log.level}">[${log.level.toUpperCase()}]</span>
                <span class="log-user">[${log.user}]</span>
                <span class="log-message">${log.message}</span>
            </div>
        `).join('');

        const countEl = document.getElementById('logs-count');
        if (countEl) countEl.textContent = `日誌數量: ${logs.length}`;
    }
}

// 全局實例
const adminPanel = new AdminPanel();