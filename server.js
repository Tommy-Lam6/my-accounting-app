const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 6100;

console.log('🚀 啟動智能記賬系統...');

// 系統日誌存儲
const systemLogs = [];

// 添加日誌函數
function addSystemLog(level, message, user = '系統') {
    const logEntry = {
        timestamp: new Date().toISOString(),
        level: level,
        message: message,
        user: user
    };
    systemLogs.push(logEntry);
    if (systemLogs.length > 100) systemLogs.shift();
    console.log(`[${logEntry.timestamp}] [${level.toUpperCase()}] [${user}] ${message}`);
}

// 中間件設置
app.use(cors());
app.use(express.json());

// 請求日誌
app.use((req, res, next) => {
    addSystemLog('info', `收到請求: ${req.method} ${req.url}`);
    next();
});

// 資料庫連接
const db = new sqlite3.Database('./accounting.db', (err) => {
    if (err) {
        addSystemLog('error', `資料庫連接失敗: ${err.message}`);
    } else {
        addSystemLog('info', '已連接到 SQLite 資料庫');
        initializeDatabase();
    }
});

// 初始化資料庫
function initializeDatabase() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('income', 'fixed_expense', 'expense')),
            category TEXT NOT NULL,
            month_key TEXT NOT NULL,
            username TEXT NOT NULL DEFAULT 'default',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS monthly_data (
            month_key TEXT PRIMARY KEY,
            month_name TEXT NOT NULL,
            spending_limit REAL DEFAULT 0,
            is_current INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            description TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            email TEXT,
            is_admin INTEGER DEFAULT 0,
            last_login DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS login_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            ip_address TEXT,
            user_agent TEXT
        )`, () => {
            addSystemLog('info', '資料庫表初始化完成');
            initializeDefaultData();
        });
    });
}

// 初始化默認數據
function initializeDefaultData() {
    const adminUsers = [
        { username: 'admin', password: 'admin123', email: 'admin@system.com', is_admin: 1 },
        { username: 'admin2', password: 'admin123', email: 'admin2@system.com', is_admin: 1 },
        { username: 'admin3', password: 'admin123', email: 'admin3@system.com', is_admin: 1 },
        { username: 'user1', password: 'pass123', email: 'user1@example.com', is_admin: 0 },
        { username: 'user2', password: 'pass123', email: 'user2@example.com', is_admin: 0 }
    ];

    let completed = 0;
    adminUsers.forEach(user => {
        db.run(`INSERT OR IGNORE INTO users (username, password, email, is_admin) VALUES (?, ?, ?, ?)`,
            [user.username, user.password, user.email, user.is_admin], (err) => {
                if (err) {
                    addSystemLog('error', `初始化用戶失敗: ${user.username} - ${err.message}`);
                } else {
                    addSystemLog('info', `初始化用戶: ${user.username}`);
                }
                completed++;
                if (completed === adminUsers.length) initializeCurrentMonth();
            });
    });
}

// 初始化當前月份
function initializeCurrentMonth() {
    const currentMonth = getCurrentMonthKey();
    const currentMonthName = getCurrentMonthName();
    db.get("SELECT * FROM monthly_data WHERE month_key = ?", [currentMonth], (err, row) => {
        if (err) {
            addSystemLog('error', `查詢月份數據失敗: ${err.message}`);
            return;
        }
        if (!row) {
            db.run("UPDATE monthly_data SET is_current = 0");
            db.run("INSERT OR IGNORE INTO monthly_data (month_key, month_name, is_current) VALUES (?, ?, 1)", 
                [currentMonth, currentMonthName], (err) => {
                    if (err) {
                        addSystemLog('error', `插入月份數據失敗: ${err.message}`);
                    } else {
                        addSystemLog('info', `初始化當前月份: ${currentMonthName}`);
                    }
                });
        } else {
            addSystemLog('info', `當前月份已存在: ${currentMonthName}`);
        }
    });
}

function getCurrentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
function getCurrentMonthName() {
    const months = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
    const now = new Date();
    return `${now.getFullYear()}年${months[now.getMonth()]}`;
}

// 香港時區時間輔助函數
function getHongKongTime() {
    const now = new Date();
    const hkTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Hong_Kong"}));
    
    return {
        date: hkTime,
        year: hkTime.getFullYear(),
        month: String(hkTime.getMonth() + 1).padStart(2, '0'),
        day: String(hkTime.getDate()).padStart(2, '0'),
        formattedDate: `${hkTime.getFullYear()}-${String(hkTime.getMonth() + 1).padStart(2, '0')}-${String(hkTime.getDate()).padStart(2, '0')}`,
        monthKey: `${hkTime.getFullYear()}-${String(hkTime.getMonth() + 1).padStart(2, '0')}`
    };
}

// 然後修改 getCurrentMonthKey 函數
function getCurrentMonthKey() {
    return getHongKongTime().monthKey;
}

// ================= API 區域 =================

// ================= 認證 API =================

// 用戶登入
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.json({ success: false, error: '用戶名和密碼不能為空' });
    }

    db.get("SELECT username, password, is_admin as isAdmin FROM users WHERE username = ?", [username], (err, row) => {
        if (err) {
            addSystemLog('error', `登入查詢失敗: ${err.message}`);
            return res.json({ success: false, error: '伺服器錯誤' });
        }
        
        if (!row) {
            addSystemLog('warn', `登入失敗 - 用戶不存在: ${username}`);
            return res.json({ success: false, error: '用戶名或密碼錯誤' });
        }
        
        // 簡單密碼驗證（生產環境應該用 bcrypt）
        if (row.password !== password) {
            addSystemLog('warn', `登入失敗 - 密碼錯誤: ${username}`);
            return res.json({ success: false, error: '用戶名或密碼錯誤' });
        }

        // 更新最後登入時間
        db.run("UPDATE users SET last_login = datetime('now') WHERE username = ?", [username]);

        addSystemLog('info', `用戶登入成功: ${username}`);
        res.json({ 
            success: true, 
            user: {
                username: row.username,
                isAdmin: row.isAdmin === 1
            }
        });
    });
});

// 用戶註冊
app.post('/api/auth/register', (req, res) => {
    const { username, password, email } = req.body;

    if (!username || !password) {
        return res.json({ success: false, error: '用戶名和密碼不能為空' });
    }

    if (username.length < 3) {
        return res.json({ success: false, error: '用戶名至少3個字符' });
    }

    if (password.length < 6) {
        return res.json({ success: false, error: '密碼至少6個字符' });
    }

    // 檢查用戶名是否已存在
    db.get("SELECT username FROM users WHERE username = ?", [username], (err, row) => {
        if (err) {
            addSystemLog('error', `註冊檢查失敗: ${err.message}`);
            return res.json({ success: false, error: '伺服器錯誤' });
        }
        
        if (row) {
            return res.json({ success: false, error: '用戶名已存在' });
        }

        // 創建新用戶
        db.run(
            "INSERT INTO users (username, password, email, is_admin) VALUES (?, ?, ?, 0)",
            [username, password, email || null],
            function(err) {
                if (err) {
                    addSystemLog('error', `註冊用戶失敗: ${err.message}`);
                    return res.json({ success: false, error: '註冊失敗' });
                }
                
                addSystemLog('info', `新用戶註冊: ${username}`);
                res.json({ 
                    success: true, 
                    message: '註冊成功',
                    user: {
                        username: username,
                        isAdmin: false
                    }
                });
            }
        );
    });
});

// 重置密碼請求
app.post('/api/auth/reset-password', (req, res) => {
    const { username } = req.body;
    
    db.get("SELECT email FROM users WHERE username = ?", [username], (err, row) => {
        if (err || !row) {
            // 即使用戶不存在，也返回成功避免信息洩露
            return res.json({ success: true, message: '如果用戶存在，重設連結已發送到註冊郵箱' });
        }
        
        addSystemLog('info', `密碼重設請求: ${username}`);
        res.json({ success: true, message: '重設連結已發送到您的註冊郵箱' });
    });
});

// ================= 電郵恢復 API =================

// 忘記用戶名稱及密碼 - 統一處理
app.post('/api/auth/forgot-account', (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.json({ success: false, error: '請輸入註冊的電子郵箱' });
    }

    // 查找對應用戶
    db.get("SELECT username, email FROM users WHERE email = ?", [email], (err, row) => {
        if (err) {
            addSystemLog('error', `找回帳戶查詢失敗: ${err.message}`);
            return res.json({ success: false, error: '伺服器錯誤' });
        }
        
        if (!row) {
            // 為安全起見，即使郵箱不存在也返回成功
            addSystemLog('warn', `找回帳戶請求 - 郵箱不存在: ${email}`);
            return res.json({ 
                success: true, 
                message: '如果該郵箱已註冊，帳戶信息已發送到您的郵箱' 
            });
        }

        // 模擬發送電郵（實際環境應該集成郵件服務）
        const emailContent = `
親愛的用戶，

您請求找回帳戶信息：

用戶名稱：${row.username}
註冊郵箱：${row.email}

如果您忘記密碼，請聯繫管理員重設。

謝謝！
智能記賬系統團隊
        `;

        // 記錄模擬發送（實際應該調用郵件API）
        addSystemLog('info', `模擬發送帳戶恢復郵件到: ${email}`);
        addSystemLog('info', `郵件內容: 用戶名 ${row.username} 發送到 ${email}`);

        res.json({ 
            success: true, 
            message: '帳戶信息已發送到您的註冊郵箱',
            debugInfo: process.env.NODE_ENV === 'development' ? {
                username: row.username,
                email: row.email
            } : null
        });
    });
});

// 管理員重設用戶密碼
app.post('/api/auth/admin-reset-password', (req, res) => {
    const { username, newPassword } = req.body;
    const adminUser = req.headers['x-username'];

    if (!username || !newPassword) {
        return res.json({ success: false, error: '請填寫所有欄位' });
    }

    if (newPassword.length < 6) {
        return res.json({ success: false, error: '密碼至少6個字符' });
    }

    // 驗證管理員權限
    db.get("SELECT is_admin FROM users WHERE username = ?", [adminUser], (err, row) => {
        if (err || !row || !row.is_admin) {
            return res.status(403).json({ error: '權限不足' });
        }

        // 更新密碼
        db.run(
            "UPDATE users SET password = ? WHERE username = ?",
            [newPassword, username],
            function(err) {
                if (err) {
                    addSystemLog('error', `管理員重設密碼失敗: ${err.message}`);
                    return res.json({ success: false, error: '重設密碼失敗' });
                }
                
                if (this.changes === 0) {
                    return res.json({ success: false, error: '用戶不存在' });
                }

                addSystemLog('info', `管理員 ${adminUser} 重設用戶 ${username} 的密碼`);
                res.json({ 
                    success: true, 
                    message: '密碼重設成功',
                    newPassword: newPassword // 僅在開發環境返回
                });
            }
        );
    });
});

// ================= 香港時區輔助函數 =================

// 香港時區時間輔助函數
function getHongKongTime() {
    const now = new Date();
    // 將UTC時間轉換為香港時區的時間字符串，然後創建新的Date對象
    const hkTimeStr = now.toLocaleString("en-US", {timeZone: "Asia/Hong_Kong"});
    const hkTime = new Date(hkTimeStr);
    
    return {
        date: hkTime,
        year: hkTime.getFullYear(),
        month: String(hkTime.getMonth() + 1).padStart(2, '0'),
        day: String(hkTime.getDate()).padStart(2, '0'),
        formattedDate: `${hkTime.getFullYear()}-${String(hkTime.getMonth() + 1).padStart(2, '0')}-${String(hkTime.getDate()).padStart(2, '0')}`,
        monthKey: `${hkTime.getFullYear()}-${String(hkTime.getMonth() + 1).padStart(2, '0')}`
    };
}

// 修改 getCurrentMonthKey 函數，使用香港時區
function getCurrentMonthKey() {
    return getHongKongTime().monthKey;
}

// ================= 伺服器時間 API =================

// 獲取伺服器時間（基於香港時區）
app.get('/api/current-time', (req, res) => {
    const hkTime = getHongKongTime();
    const now = new Date();
    
    console.log('🕒 香港時間計算:', {
        UTC時間: now.toISOString(),
        香港日期: hkTime.formattedDate,
        香港月份: hkTime.monthKey
    });
    
    res.json({
        serverTime: now.toISOString(),
        serverTimeFormatted: now.toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' }),
        currentDate: hkTime.formattedDate,
        currentMonth: hkTime.monthKey,
        timezone: 'Asia/Hong_Kong'
    });
});


// ================= 伺服器時間 API =================

// 獲取伺服器時間（基於香港時區）
app.get('/api/current-time', (req, res) => {
    const now = new Date();
    
    // 轉換為香港時區的時間
    const hkTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Hong_Kong"}));
    
    // 格式化香港時間的日期
    const hkYear = hkTime.getFullYear();
    const hkMonth = String(hkTime.getMonth() + 1).padStart(2, '0');
    const hkDay = String(hkTime.getDate()).padStart(2, '0');
    const hkDate = `${hkYear}-${hkMonth}-${hkDay}`;
    
    console.log('🕒 伺服器時間計算:', {
        UTC時間: now.toISOString(),
        香港時間: hkTime.toISOString(),
        香港日期: hkDate
    });
    
    res.json({
        serverTime: now.toISOString(),
        serverTimeFormatted: now.toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' }),
        currentDate: hkDate, // 使用香港時區的日期
        currentMonth: `${hkYear}-${hkMonth}`, // 使用香港時區的月份
        timezone: 'Asia/Hong_Kong',
        debug: {
            utcTime: now.toISOString(),
            hkTime: hkTime.toISOString(),
            hkDate: hkDate
        }
    });
});

// 修改 getCurrentMonthKey 函數，使用香港時區
function getCurrentMonthKey() {
    const now = new Date();
    const hkTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Hong_Kong"}));
    return `${hkTime.getFullYear()}-${String(hkTime.getMonth() + 1).padStart(2, '0')}`;
}

// ================= 靜態檔案 & 路由 =================

// 前台靜態文件
app.use(express.static(path.join(__dirname, 'public')));

// 後台靜態文件
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// 前台 SPA catch-all（排除 /api 和 /admin）
app.get(/^\/(?!api|admin).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ================= 管理員 API 區域 =================

// 管理員中間件 - 檢查是否管理員
function requireAdmin(req, res, next) {
    const username = req.headers['x-username'] || 'default';
    
    db.get("SELECT is_admin FROM users WHERE username = ?", [username], (err, row) => {
        if (err || !row || !row.is_admin) {
            addSystemLog('warn', `未授權的管理員訪問嘗試: ${username}`);
            return res.status(403).json({ error: '權限不足' });
        }
        next();
    });
}

// 獲取所有用戶
app.get('/api/admin/users', requireAdmin, (req, res) => {
    db.all("SELECT username, email, is_admin as isAdmin, created_at as createdAt, last_login as lastLogin FROM users", (err, rows) => {
        if (err) {
            addSystemLog('error', `獲取用戶列表失敗: ${err.message}`);
            return res.status(500).json({ error: '伺服器錯誤' });
        }
        res.json(rows);
    });
});

// 創建新用戶
app.post('/api/admin/users', requireAdmin, (req, res) => {
    const { username, email, isAdmin, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: '用戶名和密碼不能為空' });
    }
    
    db.run(
        "INSERT INTO users (username, email, is_admin, password) VALUES (?, ?, ?, ?)",
        [username, email, isAdmin ? 1 : 0, password],
        function(err) {
            if (err) {
                addSystemLog('error', `創建用戶失敗: ${err.message}`);
                return res.status(400).json({ error: '用戶已存在' });
            }
            addSystemLog('info', `管理員創建新用戶: ${username}`);
            res.json({ success: true, message: '用戶創建成功' });
        }
    );
});

// 刪除用戶
app.delete('/api/admin/users/:username', requireAdmin, (req, res) => {
    const username = req.params.username;
    
    db.run("DELETE FROM users WHERE username = ?", [username], function(err) {
        if (err) {
            addSystemLog('error', `刪除用戶失敗: ${err.message}`);
            return res.status(500).json({ error: '刪除失敗' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: '用戶不存在' });
        }
        addSystemLog('info', `管理員刪除用戶: ${username}`);
        res.json({ success: true, message: '用戶刪除成功' });
    });
});

// 切換管理員權限
app.put('/api/admin/users/:username/toggle-admin', requireAdmin, (req, res) => {
    const username = req.params.username;
    
    db.run("UPDATE users SET is_admin = NOT is_admin WHERE username = ?", [username], function(err) {
        if (err) {
            addSystemLog('error', `切換管理員權限失敗: ${err.message}`);
            return res.status(500).json({ error: '操作失敗' });
        }
        addSystemLog('info', `切換用戶管理員權限: ${username}`);
        res.json({ success: true, message: '權限更新成功' });
    });
});

// 搜尋用戶記錄
app.get('/api/admin/transactions', requireAdmin, (req, res) => {
    const { username, month } = req.query;
    
    let sql = `SELECT t.*, u.username 
               FROM transactions t 
               JOIN users u ON t.username = u.username 
               WHERE 1=1`;
    let params = [];
    
    if (username && username !== 'all') {
        sql += " AND t.username = ?";
        params.push(username);
    }
    
    if (month) {
        sql += " AND t.month_key = ?";
        params.push(month);
    }
    
    sql += " ORDER BY t.date DESC";
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            addSystemLog('error', `搜尋交易記錄失敗: ${err.message}`);
            return res.status(500).json({ error: '搜尋失敗' });
        }
        res.json(rows);
    });
});

// 獲取系統信息
app.get('/api/admin/system-info', requireAdmin, (req, res) => {
    const queries = [
        "SELECT COUNT(*) as totalUsers FROM users",
        "SELECT COUNT(*) as totalTransactions FROM transactions",
        "SELECT COUNT(DISTINCT month_key) as totalMonths FROM monthly_data",
        "SELECT COUNT(*) as todayTransactions FROM transactions WHERE date = date('now')"
    ];
    
    Promise.all(queries.map(query => 
        new Promise((resolve, reject) => {
            db.get(query, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        })
    )).then(results => {
        res.json({
            totalUsers: results[0].totalUsers,
            totalTransactions: results[1].totalTransactions,
            totalMonths: results[2].totalMonths,
            todayTransactions: results[3].todayTransactions,
            currentTime: new Date().toLocaleString('zh-HK'),
            uptime: Math.floor(process.uptime()) + '秒'
        });
    }).catch(err => {
        addSystemLog('error', `獲取系統信息失敗: ${err.message}`);
        res.status(500).json({ error: '獲取系統信息失敗' });
    });
});

// 獲取系統日誌
app.get('/api/admin/logs', requireAdmin, (req, res) => {
    res.json(systemLogs.slice(-50).reverse()); // 返回最近50條日誌
});

// 啟動伺服器
app.listen(PORT, () => {
    addSystemLog('info', `記賬系統啟動成功: http://localhost:${PORT}`);
    console.log('========================================');
    console.log('🚀 智能記賬系統啟動成功！');
    console.log(`📍 用戶前台: http://localhost:${PORT}`);
    console.log(`📍 管理後台: http://localhost:${PORT}/admin`);
    console.log('========================================');
});

// 錯誤處理
process.on('uncaughtException', (error) => {
    addSystemLog('error', `未捕獲的異常: ${error.message}`);
});
process.on('unhandledRejection', (reason, promise) => {
    addSystemLog('error', `未處理的Promise拒絕: ${reason}`);
});