const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

console.log('🔧 初始化記賬系統資料庫...');

// 創建資料庫連接
const db = new sqlite3.Database('./accounting.db', (err) => {
    if (err) {
        console.error('❌ 資料庫創建失敗:', err.message);
        process.exit(1);
    }
    console.log('✅ 資料庫文件創建成功');
});

// 初始化資料表
db.serialize(() => {
    // 交易記錄表
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('income', 'fixed_expense', 'expense')),
        category TEXT NOT NULL,
        month_key TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('❌ 創建交易表失敗:', err.message);
        else console.log('✅ 交易記錄表創建成功');
    });

    // 固定開支模板表
    db.run(`CREATE TABLE IF NOT EXISTS fixed_expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('❌ 創建固定開支表失敗:', err.message);
        else {
            console.log('✅ 固定開支表創建成功');
            
            // 添加示例固定開支
            const sampleExpenses = [
                { description: '房租', amount: 8000, category: 'rent' },
                { description: '水電煤費', amount: 1500, category: 'utilities' },
                { description: '網絡費', amount: 200, category: 'subscription' }
            ];
            
            sampleExpenses.forEach(expense => {
                db.run("INSERT OR IGNORE INTO fixed_expenses (description, amount, category) VALUES (?, ?, ?)",
                    [expense.description, expense.amount, expense.category]);
            });
            console.log('✅ 示例固定開支添加完成');
        }
    });

    // 月份管理表
    db.run(`CREATE TABLE IF NOT EXISTS monthly_data (
        month_key TEXT PRIMARY KEY,
        month_name TEXT NOT NULL,
        spending_limit REAL DEFAULT 0,
        is_current INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('❌ 創建月份表失敗:', err.message);
        else {
            console.log('✅ 月份管理表創建成功');
            
            // 設置當前月份
            const currentDate = new Date();
            const currentMonthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
            const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
            const currentMonthName = `${currentDate.getFullYear()}年${monthNames[currentDate.getMonth()]}`;
            
            db.run("INSERT OR IGNORE INTO monthly_data (month_key, month_name, is_current) VALUES (?, ?, 1)",
                [currentMonthKey, currentMonthName], (err) => {
                    if (err) console.error('❌ 設置當前月份失敗:', err.message);
                    else console.log(`✅ 當前月份設置完成: ${currentMonthName}`);
                });
        }
    });

    // 系統設置表
    db.run(`CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('❌ 創建設置表失敗:', err.message);
        else {
            console.log('✅ 系統設置表創建成功');
            
            // 添加默認系統設置（例如消費限額、語言等）
            const defaultSettings = [
                { key: 'spending_limit', value: '10000', description: '每月消費限額' },
                { key: 'currency', value: 'HKD', description: '貨幣單位' }
            ];

            defaultSettings.forEach(setting => {
                db.run("INSERT OR IGNORE INTO system_settings (key, value, description) VALUES (?, ?, ?)",
                    [setting.key, setting.value, setting.description]);
            });
            console.log('✅ 默認系統設置添加完成');
        }
    });

    // 用戶表
    db.run(`CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        email TEXT,
        is_admin INTEGER DEFAULT 0,
        last_login DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('❌ 創建用戶表失敗:', err.message);
        else console.log('✅ 用戶表創建成功');
    });

    // 登錄日誌表
    db.run(`CREATE TABLE IF NOT EXISTS login_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        ip_address TEXT,
        user_agent TEXT
    )`, (err) => {
        if (err) console.error('❌ 創建登錄日誌表失敗:', err.message);
        else console.log('✅ 登錄日誌表創建成功');
    });
});

// 關閉資料庫連接
db.close((err) => {
    if (err) {
        console.error('❌ 關閉資料庫失敗:', err.message);
    } else {
        console.log('========================================');
        console.log('🎉 資料庫初始化完成！');
        console.log('📁 資料庫文件: accounting.db');
        console.log('🚀 現在可以運行: node server.js');
        console.log('========================================');
    }
});
