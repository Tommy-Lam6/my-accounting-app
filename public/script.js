// ==================== 全局路由守衛 ====================
(function() {
    // 檢查當前頁面是否需要登入
    const protectedPages = ['index.html', 'admin.html', 'daily-report.html'];
    const currentPage = window.location.pathname.split('/').pop();
    
    // 如果係需要保護嘅頁面，檢查登入狀態
    if (protectedPages.includes(currentPage)) {
        const currentUser = JSON.parse(localStorage.getItem('currentUser'));
        if (!currentUser) {
            // 立即跳轉到登入頁，唔加入歷史記錄
            window.location.replace('login.html');
        }
    }
    
    // 如果係登入頁面但已經登入，跳轉到主頁
    if (currentPage === 'login.html' || currentPage === 'register.html') {
        const currentUser = JSON.parse(localStorage.getItem('currentUser'));
        if (currentUser) {
            window.location.replace('index.html');
        }
    }
})();

// 監聽頁面顯示事件（包括返回鍵）
window.addEventListener('pageshow', function(event) {
    const protectedPages = ['index.html', 'admin.html', 'daily-report.html'];
    const currentPage = window.location.pathname.split('/').pop();
    
    if (protectedPages.includes(currentPage)) {
        const currentUser = JSON.parse(localStorage.getItem('currentUser'));
        if (!currentUser) {
            window.location.replace('login.html');
        }
    }
});

// 監聽頁面隱藏事件，清除緩存
window.addEventListener('beforeunload', function() {
    // 確保登出狀態唔會被緩存
    if (!localStorage.getItem('currentUser')) {
        // 清除可能嘅緩存
        sessionStorage.clear();
    }
});

// 🔧 測試模式：true = 每次開 index.html 都會強制跳返 login.html
const DEBUG_MODE = false;

const accountingApp = {
    transactions: [],
    spendingLimit: 0,
    username: null,

    // 新增：獲取伺服器時間
    async getServerTime() {
        try {
            const response = await fetch('/api/current-time');
            const timeData = await response.json();
            return {
                date: timeData.currentDate,
                monthKey: timeData.currentMonth,
                success: true
            };
        } catch (error) {
            console.warn('⚠️ 無法獲取伺服器時間，使用客戶端時間:', error);
            const now = new Date();
            return {
                date: now.toISOString().split('T')[0],
                monthKey: this.getCurrentMonthKey(now),
                success: false
            };
        }
    },

    // 新增：安全的日期計算函數
calculateYesterday(todayDate) {
    console.log('📅 計算昨天日期，輸入:', todayDate);
    
    // 方法1：直接減去一天的毫秒數
    const yesterday = new Date(todayDate);
    yesterday.setTime(yesterday.getTime() - (24 * 60 * 60 * 1000));
    const yesterdayStr1 = yesterday.toISOString().split('T')[0];
    
    // 方法2：使用 setDate
    const yesterday2 = new Date(todayDate);
    yesterday2.setDate(yesterday2.getDate() - 1);
    const yesterdayStr2 = yesterday2.toISOString().split('T')[0];
    
    console.log('📅 日期計算結果:', {
        方法1: yesterdayStr1,
        方法2: yesterdayStr2,
        是否一致: yesterdayStr1 === yesterdayStr2
    });
    
    // 返回方法2的結果（更可靠）
    return yesterdayStr2;
},

    // 新增：獲取月份key的獨立函數
    getCurrentMonthKey(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const username = this.username || 'default';
        return `transactions-${username}-${year}-${month}`;
    },

    async init() {
    this.checkLogin();
    this.checkDailyReset();
    
    // 先獲取伺服器時間
    const timeData = await this.getServerTime();
    console.log('📅 從伺服器獲取時間:', timeData);
    
    // 使用準確的時間初始化
    this.loadTransactions();
    this.loadSpendingLimit();
    this.updateUI();
    this.updateMonth(timeData.monthKey);
    
    // 設置表單日期
    document.getElementById("date").value = timeData.date;
    
    // 添加自動月結檢查
    await this.checkMonthlyReset();
    
    if (!timeData.success) {
        console.warn('⚠️ 使用客戶端時間，可能不準確');
    }
},


// 修改 getServerTime 函數
async getServerTime() {
    try {
        console.log('🌐 嘗試獲取伺服器時間...');
        const response = await fetch('/api/current-time');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const timeData = await response.json();
        console.log('✅ 伺服器時間獲取成功:', timeData);
        
        // 確保返回的數據包含必要的字段
        if (!timeData.currentDate) {
            throw new Error('伺服器返回的數據缺少 currentDate 字段');
        }
        
        return {
            date: timeData.currentDate,        // 使用 currentDate 而不是 date
            monthKey: timeData.currentMonth,   // 使用 currentMonth 而不是 monthKey
            success: true,
            rawData: timeData  // 保留原始數據用於調試
        };
    } catch (error) {
        console.error('❌ 無法獲取伺服器時間:', error);
        const now = new Date();
        const fallbackDate = now.toISOString().split('T')[0];
        console.log('🔄 使用後備日期:', fallbackDate);
        return {
            date: fallbackDate,
            monthKey: this.getCurrentMonthKey(now),
            success: false
        };
    }
},

// 添加手動刷新日期功能
refreshDate() {
    console.log('🔄 手動刷新日期...');
    this.getServerTime().then(timeData => {
        if (timeData.date) {
            document.getElementById("date").value = timeData.date;
            this.showMessage(`✅ 日期已更新: ${timeData.date}`);
            console.log('✅ 日期更新成功:', timeData.date);
        }
    });
},

    // 添加日結檢查方法
    async checkDailyReset() {
    try {
        const timeData = await this.getServerTime();
        const today = timeData.date;
        const yesterdayStr = this.calculateYesterday(today);
        const lastReset = localStorage.getItem('lastResetDate');
        
        console.log('🔍 日結檢查:', { 
            今天: today, 
            昨天: yesterdayStr, 
            lastReset 
        });
        
        // 如果今日未做過日結，且上次日結唔係今日
        if (lastReset !== today) {
            console.log('🔄 執行日結...');
            await this.performDailyReset(yesterdayStr);
            localStorage.setItem('lastResetDate', today);
        } else {
            console.log('✅ 今日已執行日結');
        }
    } catch (error) {
        console.error('日結檢查錯誤:', error);
    }
},

// 新增：自動月結檢查
async checkMonthlyReset() {
    try {
        const timeData = await this.getServerTime();
        const today = new Date(timeData.date + 'T00:00:00');
        
        // 檢查是否是每月第一天
        const isFirstDayOfMonth = today.getDate() === 1;
        
        console.log('📅 自動月結檢查:', {
            今天: timeData.date,
            是否每月第一天: isFirstDayOfMonth
        });
        
        if (isFirstDayOfMonth) {
            // 計算上個月的月份鍵
            const lastMonth = new Date(today);
            lastMonth.setMonth(lastMonth.getMonth() - 1);
            const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
            
            console.log('🔄 檢測到每月第一天，準備執行上個月月結:', lastMonthKey);
            
            // 檢查上個月是否已經月結過
            const username = this.username || 'default';
            const monthlyArchiveKey = `monthly-archive-${username}-${lastMonthKey}`;
            const alreadyArchived = localStorage.getItem(monthlyArchiveKey) !== null;
            
            if (!alreadyArchived) {
                if (confirm(`檢測到今天是每月第一天，是否要自動執行 ${this.getMonthName(lastMonthKey)} 的月結？`)) {
                    await this.performAutoMonthlyReset(lastMonthKey);
                }
            } else {
                console.log('✅ 上個月已經月結過，跳過自動月結');
            }
        }
    } catch (error) {
        console.error('自動月結檢查錯誤:', error);
    }
},

// 新增：自動月結執行方法
async performAutoMonthlyReset(monthKey) {
    console.log('🔄 開始自動月結:', monthKey);
    
    try {
        const username = this.username || 'default';
        const monthName = this.getMonthName(monthKey);
        
        console.log('📊 準備自動月結:', { 
            username: username, 
            month: monthKey,
            monthName: monthName
        });
        
        // 收集該月份的所有日結數據
        const dailyArchives = this.collectDailyArchivesForMonth(monthKey);
        console.log('📋 收集到的日結檔案數量:', dailyArchives.length);
        
        if (dailyArchives.length === 0) {
            this.showMessage(`ℹ️ ${monthName} 沒有日結記錄需要月結`);
            return;
        }
        
        // 合併所有日結的交易記錄
        const allTransactions = [];
        const dailySummaries = [];
        
        dailyArchives.forEach(archive => {
            allTransactions.push(...archive.transactions);
            dailySummaries.push({
                date: archive.date,
                summary: archive.summary
            });
        });
        
        console.log('📈 合併後的交易記錄:', allTransactions.length, '筆');
        
        // 計算月度統計數據
        const monthlyStats = this.calculateMonthlyStats(allTransactions);
        
        // 添加日結匯總信息
        monthlyStats.dailySummaries = dailySummaries;
        monthlyStats.dailyArchiveCount = dailyArchives.length;
        
        // 保存記錄到月結存檔
        this.archiveMonthlyData(monthKey, allTransactions, monthlyStats);
        
        // 生成月度報告
        this.generateMonthlyReport(monthKey, monthlyStats);
        
        // 可選：刪除日結存檔以節省空間
        this.cleanupDailyArchivesAfterMonthlyReset(monthKey);
        
        console.log('✅ 自動月結完成');
        
    } catch (error) {
        console.error('❌ 自動月結錯誤:', error);
        this.showMessage(`❌ 自動月結失敗: ${error.message}`);
    }
},

// 新增：收集指定月份的所有日結數據
collectDailyArchivesForMonth(monthKey) {
    const username = this.username || 'default';
    const archives = [];
    
    console.log('🔍 收集日結數據，月份:', monthKey);
    
    // 遍歷 localStorage 查找該月份的所有日結存檔
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(`daily-archive-${username}-${monthKey}-`)) {
            try {
                const archiveData = JSON.parse(localStorage.getItem(key));
                archives.push(archiveData);
                console.log('📁 找到日結存檔:', key);
            } catch (error) {
                console.warn('❌ 解析日結存檔失敗:', key, error);
            }
        }
    }
    
    // 按日期排序
    archives.sort((a, b) => a.date.localeCompare(b.date));
    
    console.log('✅ 日結數據收集完成，總數:', archives.length);
    return archives;
},

// 新增：月結後清理日結存檔
cleanupDailyArchivesAfterMonthlyReset(monthKey) {
    const username = this.username || 'default';
    let deletedCount = 0;
    
    console.log('🧹 開始清理日結存檔，月份:', monthKey);
    
    // 收集要刪除的鍵
    const keysToDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(`daily-archive-${username}-${monthKey}-`)) {
            keysToDelete.push(key);
        }
    }
    
    // 刪除日結存檔
    keysToDelete.forEach(key => {
        localStorage.removeItem(key);
        deletedCount++;
        console.log('🗑️ 刪除日結存檔:', key);
    });
    
    console.log(`✅ 日結存檔清理完成，刪除 ${deletedCount} 個檔案`);
    
    if (deletedCount > 0) {
        this.showMessage(`🧹 已清理 ${deletedCount} 個日結存檔`);
    }
},

    // 手動執行日結（用於測試）
    manualDailyReset() {
        if (confirm('確定要手動執行日結嗎？這將歸檔昨日的交易記錄。')) {
            this.performDailyReset();
        }
    },

    // 手動執行月結
async manualMonthlyReset() {
    console.log('🔄 開始手動月結...');
    
    try {
        // 使用伺服器時間獲取當前月份
        const timeData = await this.getServerTime();
        console.log('📅 從伺服器獲取時間:', timeData);
        
        if (!timeData || !timeData.monthKey) {
            throw new Error('無法獲取伺服器月份數據');
        }
        
        const currentMonth = timeData.monthKey; // 格式：2025-10
        const monthName = this.getMonthName(currentMonth);
        
        console.log('📊 月結月份:', { 月份鍵: currentMonth, 月份名: monthName });
        
        // 獲取當前月份的所有交易
        this.loadTransactions();
        console.log('📋 當前月份交易數量:', this.transactions.length);
        
        if (this.transactions.length === 0) {
            this.showMessage(`ℹ️ ${monthName} 沒有交易記錄需要月結`);
            return;
        }
        
        if (confirm(`確定要執行 ${monthName} 的月結嗎？這將歸檔整個月份的交易記錄並生成月度報告。`)) {
            await this.performMonthlyReset(currentMonth);
            this.showMessage(`✅ ${monthName} 月結完成`);
        }
    } catch (error) {
        console.error('❌ 手動月結錯誤:', error);
        console.error('錯誤詳細信息:', error.stack);
        this.showMessage(`❌ 月結失敗: ${error.message}`);
    }
},

// 新增：獲取月份名稱
getMonthName(monthKey) {
    const [year, month] = monthKey.split('-');
    const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', 
                       '七月', '八月', '九月', '十月', '十一月', '十二月'];
    return `${year}年${monthNames[parseInt(month) - 1]}`;
},

    // 檢查日結狀態
async checkDailyStatus() {
    try {
        const timeData = await this.getServerTime();
        const today = timeData.date;
        const yesterday = new Date(today + 'T00:00:00');
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        const username = this.username || 'default';
        const archiveKey = `daily-archive-${username}-${yesterdayStr}`;
        const isArchived = localStorage.getItem(archiveKey) !== null;
        
        const statusInfo = {
            今天日期: today,
            檢查日期: yesterdayStr,
            已日結: isArchived,
            歸檔鍵: archiveKey
        };
        
        console.log('📊 日結狀態檢查:', statusInfo);
        
        if (isArchived) {
            this.showMessage(`✅ ${yesterdayStr} 已完成日結`);
        } else {
            this.showMessage(`❌ ${yesterdayStr} 尚未日結，請執行手動日結`);
        }
        
        return statusInfo;
    } catch (error) {
        console.error('日結狀態檢查錯誤:', error);
        this.showMessage('❌ 日結狀態檢查失敗');
    }
},

    // ==================== 登入檢查 ====================
    checkLogin() {
        if (DEBUG_MODE) {
            localStorage.removeItem("currentUser");
            window.location.href = "login.html";
            return;
        }

        const currentUser = JSON.parse(localStorage.getItem("currentUser"));
        if (!currentUser) {
            window.location.href = "login.html";
            return;
        }

        this.username = currentUser.username;
        document.getElementById("username-display").textContent = `👤 ${this.username}`;
        document.getElementById("user-info").style.display = "block";

        // 管理員先顯示後台按鈕
        if (currentUser.isAdmin) {
            document.getElementById("admin-panel-btn").style.display = "inline-block";
        } else {
            document.getElementById("admin-panel-btn").style.display = "none";
        }
    },

    logout() {
        localStorage.removeItem("currentUser");
        this.username = null;
        window.location.href = "login.html";
    },

    // ==================== 🔑 月份 key ====================
    getCurrentKey() {
        return this.getCurrentMonthKey();
    },

    // ==================== 交易處理 ====================
    loadTransactions() {
        const key = this.getCurrentKey();
        const data = localStorage.getItem(key);
        this.transactions = data ? JSON.parse(data) : [];
    },

    saveTransactions() {
        const key = this.getCurrentKey();
        localStorage.setItem(key, JSON.stringify(this.transactions));
    },

    addTransaction(event) {
        event.preventDefault();

        const date = document.getElementById("date").value;
        const description = document.getElementById("description").value;
        const amount = parseFloat(document.getElementById("amount").value);
        const type = document.getElementById("type").value;
        const category = document.getElementById("category").value;

        if (!date || !description || isNaN(amount) || !category) {
            this.showMessage("❌ 請完整填寫資料");
            return;
        }

        const transaction = { 
            id: Date.now(), 
            date, 
            description, 
            amount, 
            type, 
            category,
            timestamp: new Date().toISOString()  // 添加時間戳
        };
        this.transactions.push(transaction);
        this.saveTransactions();
        this.updateUI();
        this.resetForm();
        this.showMessage("✅ 交易已添加");
    },

    deleteTransaction(id) {
        this.transactions = this.transactions.filter(t => t.id !== id);
        this.saveTransactions();
        this.updateUI();
        this.showMessage("🗑️ 已刪除交易");
    },

    async resetForm() {
        document.getElementById("transaction-form").reset();
        this.updateCategoryOptions();

        // 使用伺服器時間設置日期
        const timeData = await this.getServerTime();
        document.getElementById("date").value = timeData.date;
    },

// 修改：重置所有數據（不影響消費限額）
resetAllData() {
    if (confirm("⚠️ 確認要重置當前月份的所有數據嗎？此操作不會影響消費限額設定和已日結的數據。")) {
        const currentUser = JSON.parse(localStorage.getItem('currentUser'));
        const username = this.username || 'default';
        const currentKey = this.getCurrentKey(); // 只獲取當前月份的key
        
        console.log('🔄 重置數據，只清除:', currentKey);
        
        // 只清除當前月份的數據，保留其他月份和歸檔數據
        localStorage.removeItem(currentKey);
        
        // 注意：不清除消費限額！
        // localStorage.removeItem(`spendingLimit-${username}`);
        
        this.transactions = [];
        // this.spendingLimit = 0; // 不重置消費限額
        
        // 重新加載頁面數據
        this.loadTransactions();
        this.loadSpendingLimit(); // 仍然加載消費限額
        this.updateUI();
        this.updateSpendingProgress(); // 更新進度條
        this.showMessage("✅ 當前月份數據已重置（消費限額和歸檔數據不受影響）");
    }
},

    logout() {
        if (confirm("🚪 確定要登出嗎？")) {
            // 只清除登入狀態，保留所有交易數據
            localStorage.removeItem('currentUser');
            this.username = null;
            
            // 使用 replace 跳轉，避免加入瀏覽歷史
            window.location.replace('login.html');
        }
    },

    refreshData() {
        this.loadTransactions();
        this.updateUI();
        this.showMessage("🔄 數據已刷新");
    },

    updateCategoryOptions() {
        const type = document.getElementById("type").value;
        const categorySelect = document.getElementById("category");
        categorySelect.innerHTML = "";

        let categories = [];
        
        if (type === "income") {
            categories = [
                "💰 薪資", 
                "🎯 獎金", 
                "📈 投資收益", 
                "💼 兼職收入", 
                "🎁 禮金收入", 
                "🏠 租金收入", 
                "🔙 退款", 
                "📦 其他收入"
            ];
        }
        else if (type === "fixed_expense") {
            categories = [
                "🏠 房租", 
                "⚡ 水電煤", 
                "📞 電話網絡", 
                "🛡️ 保險", 
                "🚗 車貸", 
                "🏦 房貸", 
                "📺 訂閱服務", 
                "🎓 學費", 
                "💳 信用卡", 
                "📦 其他固定開支"
            ];
        }
        else if (type === "expense") {
            categories = [
                "🍽️ 飲食", 
                "🚗 交通", 
                "🛍️ 購物", 
                "🎮 娛樂", 
                "🏥 醫療", 
                "📚 教育", 
                "✈️ 旅遊", 
                "🎁 人情", 
                "💇 美容", 
                "🏠 家居", 
                "📱 電子產品", 
                "👕 服飾", 
                "📦 其他開支"
            ];
        }

        categories.forEach(cat => {
            const option = document.createElement("option");
            option.value = cat.replace(/[💰🎯📈💼🎁🏠🔙📦⚡📞🛡️🚗🏦📺🎓💳🍽️🛍️🎮🏥📚✈️💇📱👕]/g, '').trim();
            option.textContent = cat;
            categorySelect.appendChild(option);
        });

        // ✅ 每次切換類別時檢查描述欄
        this.handleDescriptionAutoFill();
    },

    // ==================== 固定開支描述自動處理 ====================
    handleDescriptionAutoFill() {
        const type = document.getElementById("type").value;
        const category = document.getElementById("category").value;
        const descriptionInput = document.getElementById("description");

        if (type === "fixed_expense") {
            // 擴展固定開支自動填充嘅分類
            const autoFillCategories = [
                "房租", "水電煤", "電話網絡", "保險", "車貸", 
                "房貸", "訂閱服務", "學費", "信用卡"
            ];
            
            if (autoFillCategories.includes(category)) {
                descriptionInput.value = category;
                descriptionInput.readOnly = true; // 鎖住
            } else {
                descriptionInput.value = "";
                descriptionInput.readOnly = false; // 解除鎖定
            }
        } else {
            descriptionInput.value = "";
            descriptionInput.readOnly = false;
        }
    },

    // ==================== UI 更新 ====================
    updateUI() {
        this.renderTransactions();
        this.updateSummary();
        this.updateSpendingProgress();
    },

    renderTransactions() {
        const incomeTable = document.getElementById("income-transactions");
        const fixedTable = document.getElementById("fixed-transactions");
        const expenseTable = document.getElementById("expense-transactions");

        incomeTable.innerHTML = "";
        fixedTable.innerHTML = "";
        expenseTable.innerHTML = "";

        let hasIncome = false, hasFixed = false, hasExpense = false;

        this.transactions.forEach(t => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${t.date}</td>
                <td>${t.description}</td>
                <td>${t.category}</td>
                <td>$${t.amount.toFixed(2)}</td>
                <td><button onclick="accountingApp.deleteTransaction(${t.id})" class="btn-danger">刪除</button></td>
            `;

            if (t.type === "income") {
                incomeTable.appendChild(row);
                hasIncome = true;
            } else if (t.type === "fixed_expense") {
                fixedTable.appendChild(row);
                hasFixed = true;
            } else {
                expenseTable.appendChild(row);
                hasExpense = true;
            }
        });

        document.getElementById("empty-income").style.display = hasIncome ? "none" : "block";
        document.getElementById("empty-fixed").style.display = hasFixed ? "none" : "block";
        document.getElementById("empty-expense").style.display = hasExpense ? "none" : "block";
    },

    updateSummary() {
        const totalIncome = this.transactions.filter(t => t.type === "income").reduce((a, b) => a + b.amount, 0);
        const totalFixed = this.transactions.filter(t => t.type === "fixed_expense").reduce((a, b) => a + b.amount, 0);
        const totalExpense = this.transactions.filter(t => t.type === "expense").reduce((a, b) => a + b.amount, 0);
        const balance = totalIncome - totalFixed - totalExpense;

        document.getElementById("total-income").textContent = `$${totalIncome.toFixed(2)}`;
        document.getElementById("total-fixed-expense").textContent = `$${totalFixed.toFixed(2)}`;
        document.getElementById("total-expense").textContent = `$${totalExpense.toFixed(2)}`;
        document.getElementById("balance").textContent = `$${balance.toFixed(2)}`;
    },

    updateMonth(monthKey = null) {
        let year, month;
        
        if (monthKey) {
            // 從月份key解析年份和月份
            const parts = monthKey.split('-');
            year = parts[parts.length - 2];
            month = parts[parts.length - 1];
        } else {
            // 後備方案：使用客戶端時間
            const now = new Date();
            year = now.getFullYear();
            month = now.getMonth() + 1;
        }
        
        document.getElementById("current-month").textContent = `${year}年 ${month}月`;
    },

    // ==================== 消費限額 ====================
    loadSpendingLimit() {
        const username = this.username || 'default';
        this.spendingLimit = parseFloat(localStorage.getItem(`spendingLimit-${username}`)) || 0;
    },

    // 修改：保存消費限額
saveSpendingLimit() {
    const limit = parseFloat(document.getElementById("limit-amount").value);
    if (isNaN(limit) || limit < 0) {
        this.showMessage("❌ 請輸入有效限額");
        return;
    }
    const username = this.username || 'default';
    this.spendingLimit = limit;
    localStorage.setItem(`spendingLimit-${username}`, limit);
    
    // 更新進度條
    this.updateSpendingProgress();
    this.closeLimitModal();
    
    // 顯示詳細信息
    const expenseData = this.getMonthlyExpenseTotal();
    const remaining = limit - expenseData.total;
    
    let message = "✅ 消費限額已保存\n\n";
    message += `📊 本月已支出: $${expenseData.total.toFixed(2)}\n`;
    message += `🎯 消費限額: $${limit.toFixed(2)}\n`;
    message += `💰 剩餘額度: $${remaining > 0 ? remaining.toFixed(2) : '0.00'}\n`;
    
    if (remaining < 0) {
        message += `❌ 已超出限額: $${Math.abs(remaining).toFixed(2)}`;
    }
    
    this.showMessage(message);
},

    editSpendingLimit() {
        document.getElementById("limit-modal").style.display = "block";
        document.getElementById("limit-amount").value = this.spendingLimit || "";
    },

    closeLimitModal() {
        document.getElementById("limit-modal").style.display = "none";
    },

    // 新增：顯示消費限額詳細信息
showSpendingLimitDetails() {
    const expenseData = this.getMonthlyExpenseTotal();
    const limit = this.spendingLimit;
    const remaining = limit - expenseData.total;
    const percent = limit > 0 ? Math.min((expenseData.total / limit) * 100, 100) : 0;
    
    let message = "📊 消費限額詳情\n\n";
    message += `🎯 設定限額: $${limit.toFixed(2)}\n`;
    message += `💰 本月總支出: $${expenseData.total.toFixed(2)}\n`;
    message += `  ├─ 當前數據: $${expenseData.current.toFixed(2)}\n`;
    message += `  └─ 已日結數據: $${expenseData.archived.toFixed(2)}\n\n`;
    
    if (limit > 0) {
        message += `📈 使用進度: ${percent.toFixed(1)}%\n`;
        message += `💵 剩餘額度: $${remaining > 0 ? remaining.toFixed(2) : '0.00'}\n\n`;
        
        if (remaining < 0) {
            message += `❌ 已超出限額: $${Math.abs(remaining).toFixed(2)}`;
        } else if (percent >= 90) {
            message += `⚠️ 接近消費限額，請注意控制支出`;
        } else {
            message += `✅ 支出控制良好`;
        }
    } else {
        message += `ℹ️ 未設定消費限額`;
    }
    
    console.log('📋 消費限額詳情:', message);
    alert(message);
},

// 新增：重置消費限額
resetSpendingLimit() {
    if (confirm("⚠️ 確認要重置消費限額嗎？這將清除設定的限額值，但不會刪除任何交易數據。")) {
        const username = this.username || 'default';
        localStorage.removeItem(`spendingLimit-${username}`);
        this.spendingLimit = 0;
        
        this.updateSpendingProgress();
        this.showMessage("✅ 消費限額已重置");
    }
},

    // 修改：更新消費限額進度條
updateSpendingProgress() {
    console.log('📊 更新消費限額進度條...');
    
    // 獲取整個月的總支出（包括已日結的）
    const expenseData = this.getMonthlyExpenseTotal();
    const totalExpense = expenseData.total;
    const limit = this.spendingLimit;

    document.getElementById("spent-amount").textContent = `$${totalExpense.toFixed(2)}`;
    document.getElementById("total-limit").textContent = `$${limit.toFixed(2)}`;

    const progressFill = document.getElementById("spending-progress");

    if (limit > 0) {
        const percent = Math.min((totalExpense / limit) * 100, 100);
        progressFill.style.width = percent + "%";
        
        // 更新進度條顏色
        if (percent >= 100) {
            progressFill.style.background = "#dc3545"; // 紅色 - 超出限額
        } else if (percent >= 90) {
            progressFill.style.background = "#ffc107"; // 黃色 - 接近限額
        } else {
            progressFill.style.background = "#667eea"; // 藍色 - 正常
        }
        
        // 如果消費達到限額90%，顯示警告
        if (percent >= 90) {
            document.getElementById("spending-alert").style.display = "block";
            
            // 更新警告訊息
            const alertElement = document.getElementById("spending-alert");
            if (percent >= 100) {
                alertElement.innerHTML = "⚠️ 已超出消費限額！請注意用錢。";
                alertElement.style.background = "#f8d7da";
                alertElement.style.color = "#721c24";
            } else {
                alertElement.innerHTML = "⚠️ 即將達到消費限額！請謹慎消費。";
                alertElement.style.background = "#fff3cd";
                alertElement.style.color = "#856404";
            }
        } else {
            document.getElementById("spending-alert").style.display = "none";
        }
        
        console.log('📈 消費限額進度:', {
            總支出: totalExpense,
            限額: limit,
            百分比: percent + '%'
        });
    } else {
        progressFill.style.width = "0%";
        document.getElementById("spending-alert").style.display = "none";
        console.log('ℹ️ 未設置消費限額');
    }
},

    // 修改：獲取整個月的支出（包括已日結的數據）
getMonthlyExpenseTotal() {
    const username = this.username || 'default';
    const currentMonth = this.getCurrentKey().replace(`transactions-${username}-`, '');
    
    let totalExpense = 0;
    
    console.log('🧮 計算月度總支出，月份:', currentMonth);
    
    // 1. 計算當前月份數據中的支出
    const currentExpense = this.transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
    
    totalExpense += currentExpense;
    console.log('📊 當前數據支出:', currentExpense);
    
    // 2. 計算已日結數據中的支出
    const dailyArchives = this.getDailyArchivesForMonth(currentMonth);
    const archivedExpense = dailyArchives.reduce((sum, archive) => {
        return sum + (archive.summary?.totalExpense || 0);
    }, 0);
    
    totalExpense += archivedExpense;
    console.log('📁 歸檔數據支出:', archivedExpense);
    
    console.log('💰 月度總支出:', totalExpense);
    
    return {
        total: totalExpense,
        current: currentExpense,
        archived: archivedExpense
    };
},

// 新增：獲取指定月份的所有日結數據
getDailyArchivesForMonth(monthKey) {
    const username = this.username || 'default';
    const archives = [];
    
    // 查找該月份的所有日結存檔
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(`daily-archive-${username}-${monthKey}-`)) {
            try {
                const archiveData = JSON.parse(localStorage.getItem(key));
                archives.push(archiveData);
            } catch (error) {
                console.warn('❌ 解析日結存檔失敗:', key, error);
            }
        }
    }
    
    return archives;
},

    // ==================== 搜索功能（改進版，支援年份+月份） ====================
    getAllTransactions() {
        let all = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith("transactions-")) {
                const data = JSON.parse(localStorage.getItem(key)) || [];
                all = all.concat(data);
            }
        }
        return all;
    },

    // ==================== 跳轉後台 ====================
    goToAdminPanel() {
        window.location.href = "/admin/";
    },

    // ==================== 導航功能 ====================

    goToDailyReport() {
        window.location.href = "daily-report.html";
    },

    // ==================== 自動日結功能 ====================

   // 手動執行日結（使用香港時間）
async manualDailyReset() {
    console.log('🔄 開始手動日結...');
    
    try {
        // 使用伺服器時間計算昨天日期（香港時間）
        const timeData = await this.getServerTime();
        console.log('📅 從伺服器獲取時間:', timeData);
        
        if (!timeData || !timeData.date) {
            throw new Error('無法獲取伺服器時間數據: ' + JSON.stringify(timeData));
        }
        
        // 使用安全的日期計算方法
        const yesterdayStr = this.calculateYesterday(timeData.date);
        
        console.log('📅 日結計算:', {
            伺服器日期: timeData.date,
            昨天: yesterdayStr
        });
        
        if (confirm(`確定要手動執行 ${yesterdayStr} 的日結嗎？這將歸檔該日的交易記錄。`)) {
            await this.performDailyReset(yesterdayStr);
            this.showMessage(`✅ ${yesterdayStr} 日結完成`);
        }
    } catch (error) {
        console.error('❌ 手動日結錯誤:', error);
        console.error('錯誤詳細信息:', error.stack);
        this.showMessage(`❌ 日結失敗: ${error.message}`);
    }
},

// 日結執行方法
async performDailyReset(targetDate = null) {
    console.log('🎯 執行 performDailyReset，目標日期:', targetDate);
    
    try {
        const username = this.username || 'default';
        
        // 如果沒有指定日期，使用昨天
        let dateToReset;
        if (targetDate) {
            dateToReset = targetDate;
        } else {
            const timeData = await this.getServerTime();
            if (!timeData.currentDate) {
                throw new Error('無法獲取當前日期');
            }
            const today = new Date(timeData.currentDate + 'T00:00:00');
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            dateToReset = yesterday.toISOString().split('T')[0];
        }
        
        console.log('📊 準備日結:', { 
            username: username, 
            date: dateToReset,
            transactions: this.transactions.length
        });
        
        // 重新加載交易數據確保最新
        this.loadTransactions();
        console.log('📋 加載後的交易數量:', this.transactions.length);
        
        // 獲取目標日期的交易記錄
        const targetTransactions = this.transactions.filter(t => t.date === dateToReset);
        console.log('🎯 找到目標交易記錄:', {
            目標日期: dateToReset,
            交易數量: targetTransactions.length,
            交易詳情: targetTransactions
        });
        
        if (targetTransactions.length > 0) {
            // 保存記錄到日結存檔
            console.log('💾 開始歸檔數據...');
            this.archiveDailyData(dateToReset, targetTransactions);
            
            // 從當前月份移除已歸檔的交易 - 修改為強制刪除
            console.log('🗑️ 開始移除交易...');
            this.removeTransactionsByDate(dateToReset, true); // true 表示強制刪除
            
            console.log('✅ 日結流程完成');
            
            // 顯示日結摘要
            this.showDailyResetSummary(dateToReset, targetTransactions);
        } else {
            console.log('ℹ️ 該日期沒有交易記錄需要日結');
            this.showMessage(`ℹ️ ${dateToReset} 沒有交易記錄需要日結`);
        }
    } catch (error) {
        console.error('❌ performDailyReset 錯誤:', error);
        throw error;
    }
},

// 修改：移除指定日期的交易（增強功能） - 修改為不移除收入記錄
removeTransactionsByDate(date, forceDelete = false) {
    console.log('🗑️ 開始移除交易，日期:', date, '強制刪除:', forceDelete);
    
    try {
        const originalLength = this.transactions.length;
        console.log('移除前交易數量:', originalLength);
        
        // 記錄要刪除的交易詳情
        const transactionsToRemove = this.transactions.filter(t => t.date === date);
        
        // 修改：日結時不移除收入記錄，讓收入在月份中持續顯示
        this.transactions = this.transactions.filter(t => {
            // 如果不是指定日期，保留
            if (t.date !== date) return true;
            
            // 如果是指定日期，但是收入類型，也保留
            if (t.type === 'income') {
                console.log('💰 保留收入記錄:', t);
                return true;
            }
            
            // 其他交易（開支）則移除
            return false;
        });
        
        const removedCount = originalLength - this.transactions.length;
        console.log(`移除 ${removedCount} 筆交易，剩餘 ${this.transactions.length} 筆`);
        
        // 保存更新後的交易數據
        this.saveTransactions();
        console.log('✅ 交易數據保存成功');
        
        // 記錄刪除操作
        if (forceDelete && removedCount > 0) {
            const deleteLog = {
                date: date,
                deletedAt: new Date().toISOString(),
                removedCount: removedCount,
                transactions: transactionsToRemove
            };
            const username = this.username || 'default';
            localStorage.setItem(`delete-log-${username}-${date}`, JSON.stringify(deleteLog));
        }
        
    } catch (error) {
        console.error('❌ 移除交易錯誤:', error);
        throw error;
    }
},

// 新增：顯示日結摘要
showDailyResetSummary(date, transactions) {
    const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const fixed = transactions.filter(t => t.type === 'fixed_expense').reduce((sum, t) => sum + t.amount, 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    
    let summary = `📊 ${date} 日結完成\n\n`;
    summary += `💰 收入: $${income.toFixed(2)}\n`;
    summary += `🏠 固定開支: $${fixed.toFixed(2)}\n`;
    summary += `💸 其他開支: $${expense.toFixed(2)}\n`;
    summary += `📋 總交易: ${transactions.length} 筆\n\n`;
    summary += `✅ 已從當前記錄中刪除上述交易`;
    
    console.log('📄 日結摘要:', summary);
    this.showMessage(summary);
},

// 月結執行方法
async performMonthlyReset(monthKey) {
    console.log('🎯 執行 performMonthlyReset，目標月份:', monthKey);
    
    try {
        const username = this.username || 'default';
        const monthName = this.getMonthName(monthKey);
        
        console.log('📊 準備月結:', { 
            username: username, 
            month: monthKey,
            monthName: monthName,
            transactions: this.transactions.length
        });
        
        if (this.transactions.length === 0) {
            throw new Error('沒有交易記錄需要月結');
        }
        
        // 計算月度統計數據
        console.log('📈 開始計算月度統計...');
        const monthlyStats = this.calculateMonthlyStats(this.transactions);
        
        // 保存記錄到月結存檔
        console.log('💾 開始歸檔月度數據...');
        this.archiveMonthlyData(monthKey, this.transactions, monthlyStats);
        
        // 生成月度報告
        console.log('📄 生成月度報告...');
        this.generateMonthlyReport(monthKey, monthlyStats);
        
        console.log('✅ 月結流程完成');
    } catch (error) {
        console.error('❌ performMonthlyReset 錯誤:', error);
        throw error;
    }
},

// 新增：計算月度統計數據
calculateMonthlyStats(transactions) {
    console.log('🧮 計算月度統計數據...');
    
    const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalFixed = transactions.filter(t => t.type === 'fixed_expense').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const totalSpending = totalFixed + totalExpense;
    const balance = totalIncome - totalSpending;
    
    // 按分類統計
    const categoryStats = {};
    transactions.forEach(t => {
        if (!categoryStats[t.category]) {
            categoryStats[t.category] = { amount: 0, count: 0, type: t.type };
        }
        categoryStats[t.category].amount += t.amount;
        categoryStats[t.category].count += 1;
    });
    
    // 按日期統計（交易天數）
    const uniqueDates = [...new Set(transactions.map(t => t.date))];
    
    const stats = {
        totalIncome,
        totalFixed,
        totalExpense,
        totalSpending,
        balance,
        transactionCount: transactions.length,
        daysCount: uniqueDates.length,
        categoryStats,
        dailyAverage: {
            income: uniqueDates.length > 0 ? totalIncome / uniqueDates.length : 0,
            spending: uniqueDates.length > 0 ? totalSpending / uniqueDates.length : 0
        }
    };
    
    console.log('📊 月度統計計算完成:', stats);
    return stats;
},

// 新增：歸檔月度數據
archiveMonthlyData(monthKey, transactions, stats) {
    console.log('💾 開始歸檔月度數據:', { monthKey, transactionCount: transactions.length });
    
    try {
        const username = this.username || 'default';
        const archiveKey = `monthly-archive-${username}-${monthKey}`;
        
        console.log('🔑 月結歸檔鍵:', archiveKey);
        
        const monthlySummary = {
            month: monthKey,
            monthName: this.getMonthName(monthKey),
            transactions: transactions,
            stats: stats,
            archivedAt: new Date().toISOString()
        };
        
        // 保存歸檔數據
        localStorage.setItem(archiveKey, JSON.stringify(monthlySummary));
        console.log('✅ 月度歸檔數據保存成功');
        
        // 驗證保存是否成功
        const savedData = localStorage.getItem(archiveKey);
        if (savedData) {
            console.log('✅ 月度歸檔驗證成功');
        } else {
            throw new Error('月度歸檔數據保存失敗');
        }
        
    } catch (error) {
        console.error('❌ 月度歸檔數據錯誤:', error);
        throw error;
    }
},

// 生成月度報告
generateMonthlyReport(monthKey, stats) {
    console.log('📄 生成月度報告...');
    
    try {
        const monthName = this.getMonthName(monthKey);
        const username = this.username || 'default';
        
        // 創建報告內容
        const report = {
            title: `${monthName} 財務報告`,
            generatedAt: new Date().toLocaleString('zh-HK'),
            username: username,
            summary: {
                '總收入': `$${stats.totalIncome.toFixed(2)}`,
                '固定開支': `$${stats.totalFixed.toFixed(2)}`,
                '其他開支': `$${stats.totalExpense.toFixed(2)}`,
                '總支出': `$${stats.totalSpending.toFixed(2)}`,
                '月度結餘': `$${stats.balance.toFixed(2)}`,
                '交易總數': `${stats.transactionCount} 筆`,
                '交易天數': `${stats.daysCount} 天`,
                '日均收入': `$${stats.dailyAverage.income.toFixed(2)}`,
                '日均支出': `$${stats.dailyAverage.spending.toFixed(2)}`,
                '日結天數': stats.dailyArchiveCount ? `${stats.dailyArchiveCount} 天` : '未知'
            },
            categoryBreakdown: Object.entries(stats.categoryStats).map(([category, data]) => ({
                分類: category,
                金額: `$${data.amount.toFixed(2)}`,
                交易數: `${data.count} 筆`,
                類型: data.type === 'income' ? '收入' : 
                      data.type === 'fixed_expense' ? '固定開支' : '其他開支'
            }))
        };
        
        // 如果有日結匯總信息，添加到報告中
        if (stats.dailySummaries) {
            report.dailySummaries = stats.dailySummaries.map(daily => ({
                日期: daily.date,
                收入: `$${daily.summary.totalIncome.toFixed(2)}`,
                固定開支: `$${daily.summary.totalFixed.toFixed(2)}`,
                其他開支: `$${daily.summary.totalExpense.toFixed(2)}`,
                日結餘: `$${daily.summary.balance.toFixed(2)}`
            }));
        }
        
        // 保存報告
        const reportKey = `monthly-report-${username}-${monthKey}`;
        localStorage.setItem(reportKey, JSON.stringify(report));
        
        console.log('✅ 月度報告生成成功:', report);
        
        // 顯示報告摘要
        this.showMonthlyReportSummary(report);
        
    } catch (error) {
        console.error('❌ 生成月度報告錯誤:', error);
        throw error;
    }
},

// 新增：查看月度報告
viewMonthlyReports() {
    console.log('📋 查看月度報告...');
    
    try {
        const username = this.username || 'default';
        const reports = [];
        
        // 查找所有月度報告
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(`monthly-report-${username}-`)) {
                try {
                    const report = JSON.parse(localStorage.getItem(key));
                    reports.push({
                        key: key,
                        month: key.replace(`monthly-report-${username}-`, ''),
                        report: report
                    });
                } catch (e) {
                    console.warn(`無法解析報告 ${key}:`, e);
                }
            }
        }
        
        // 按月份排序（最新的在前面）
        reports.sort((a, b) => b.month.localeCompare(a.month));
        
        console.log('📚 找到月度報告:', reports);
        
        if (reports.length === 0) {
            this.showMessage('ℹ️ 暫無月度報告');
            return;
        }
        
        // 顯示報告列表
        let message = '📚 月度報告列表:\n\n';
        reports.forEach((item, index) => {
            message += `${index + 1}. ${item.report.title}\n`;
            message += `   生成時間: ${item.report.generatedAt}\n`;
            message += `   結餘: ${item.report.summary['月度結餘']}\n\n`;
        });
        
        message += '請輸入要查看的報告編號 (1-' + reports.length + ')，或輸入 0 取消:';
        
        const choice = prompt(message);
        if (choice && choice !== '0') {
            const index = parseInt(choice) - 1;
            if (index >= 0 && index < reports.length) {
                this.showMonthlyReportDetail(reports[index].report);
            }
        }
        
    } catch (error) {
        console.error('❌ 查看月度報告錯誤:', error);
        this.showMessage('❌ 查看月度報告失敗');
    }
},

// 新增：顯示月度報告詳情
showMonthlyReportDetail(report) {
    let message = `📊 ${report.title}\n\n`;
    message += `📅 生成時間: ${report.generatedAt}\n`;
    message += `👤 用戶: ${report.username}\n\n`;
    
    message += "📈 月度摘要:\n";
    Object.entries(report.summary).forEach(([key, value]) => {
        message += `  • ${key}: ${value}\n`;
    });
    
    message += "\n📋 分類明細:\n";
    report.categoryBreakdown.forEach(item => {
        const typeIcon = item.類型 === '收入' ? '💰' : 
                        item.類型 === '固定開支' ? '🏠' : '💸';
        message += `  ${typeIcon} ${item.分類}: ${item.金額} (${item.交易數})\n`;
    });
    
    alert(message);
},

// 新增：顯示月度報告摘要
showMonthlyReportSummary(report) {
    let message = `📊 ${report.title}\n\n`;
    message += `📅 生成時間: ${report.generatedAt}\n`;
    message += `👤 用戶: ${report.username}\n\n`;
    
    message += "📈 月度摘要:\n";
    Object.entries(report.summary).forEach(([key, value]) => {
        message += `  ${key}: ${value}\n`;
    });
    
    message += "\n📋 分類明細:\n";
    report.categoryBreakdown.forEach(item => {
        message += `  ${item.分類}: ${item.金額} (${item.交易數})\n`;
    });
    
    console.log('📄 月度報告內容:', message);
    
    // 可以選擇彈出 alert 或在頁面顯示
    if (confirm(`${report.title}\n\n是否要查看詳細報告？`)) {
        alert(message);
    }
},


// 歸檔每日數據（增強日誌）
archiveDailyData(date, transactions) {
    console.log('💾 開始歸檔數據:', { date, transactionCount: transactions.length });
    
    try {
        const username = this.username || 'default';
        const archiveKey = `daily-archive-${username}-${date}`;
        
        console.log('🔑 歸檔鍵:', archiveKey);
        
        // 計算統計數據
        const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        const totalFixed = transactions.filter(t => t.type === 'fixed_expense').reduce((sum, t) => sum + t.amount, 0);
        const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
        const totalSpending = totalFixed + totalExpense;
        const balance = totalIncome - totalSpending;
        
        console.log('📈 統計數據計算完成:', {
            totalIncome, totalFixed, totalExpense, totalSpending, balance
        });
        
        const dailySummary = {
            date: date,
            transactions: transactions,
            summary: {
                totalIncome: totalIncome,
                totalFixed: totalFixed,
                totalExpense: totalExpense,
                totalSpending: totalSpending,
                balance: balance,
                transactionCount: transactions.length
            },
            archivedAt: new Date().toISOString()
        };
        
        // 保存歸檔數據
        localStorage.setItem(archiveKey, JSON.stringify(dailySummary));
        console.log('✅ 歸檔數據保存成功');
        
        // 驗證保存是否成功
        const savedData = localStorage.getItem(archiveKey);
        if (savedData) {
            console.log('✅ 歸檔驗證成功');
        } else {
            throw new Error('歸檔數據保存失敗');
        }
        
    } catch (error) {
        console.error('❌ 歸檔數據錯誤:', error);
        throw error;
    }
},

// 移除指定日期的交易（增強日誌）
removeTransactionsByDate(date) {
    console.log('🗑️ 開始移除交易，日期:', date);
    
    try {
        const originalLength = this.transactions.length;
        console.log('移除前交易數量:', originalLength);
        
        this.transactions = this.transactions.filter(t => {
            const shouldKeep = t.date !== date;
            if (!shouldKeep) {
                console.log('移除交易:', t);
            }
            return shouldKeep;
        });
        
        const removedCount = originalLength - this.transactions.length;
        console.log(`移除 ${removedCount} 筆交易，剩餘 ${this.transactions.length} 筆`);
        
        // 保存更新後的交易數據
        this.saveTransactions();
        console.log('✅ 交易數據保存成功');
        
    } catch (error) {
        console.error('❌ 移除交易錯誤:', error);
        throw error;
    }
},

// 新增：日期調試功能
debugDateCalculation() {
    console.group('🔧 日期計算調試');
    
    // 測試當前日期計算
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const yesterdayStr = this.calculateYesterday(todayStr);
    
    console.log('🕒 當前時間:', {
        本地時間: now.toString(),
        ISO字符串: now.toISOString(),
        本地日期: now.toLocaleDateString('zh-HK'),
        UTC日期: todayStr
    });
    
    console.log('📅 日期計算:', {
        今天: todayStr,
        昨天: yesterdayStr
    });
    
    // 測試伺服器時間
    this.getServerTime().then(timeData => {
        console.log('🌐 伺服器時間:', timeData);
        const serverYesterday = this.calculateYesterday(timeData.date);
        console.log('📅 基於伺服器時間的昨天:', serverYesterday);
    });
    
    console.groupEnd();
    this.showMessage('🔧 日期調試完成，請查看控制台');
},

// 新增：測試自動月結功能
testAutoMonthlyReset() {
    console.log('🧪 測試自動月結功能...');
    
    // 模擬今天是每月第一天
    const today = new Date();
    const testMonth = new Date(today);
    testMonth.setMonth(testMonth.getMonth() - 1); // 上個月
    const testMonthKey = `${testMonth.getFullYear()}-${String(testMonth.getMonth() + 1).padStart(2, '0')}`;
    
    console.log('🧪 測試月份:', testMonthKey);
    
    if (confirm(`這將測試 ${this.getMonthName(testMonthKey)} 的自動月結功能。繼續嗎？`)) {
        this.performAutoMonthlyReset(testMonthKey);
    }
},

    // ==================== 通用訊息提示 ====================
    showMessage(msg) {
        const toast = document.getElementById("message-toast");
        toast.textContent = msg;
        toast.style.display = "block";

        // reset animation
        toast.style.animation = "none";
        toast.offsetHeight;
        toast.style.animation = "bounceIn 0.8s ease, fadeOut 0.8s ease 2.5s forwards";

        setTimeout(() => {
            toast.style.display = "none";
        }, 4000);
    }
};



window.onload = () => {
    accountingApp.init();
    accountingApp.updateCategoryOptions();

    // ✅ 當用戶改變「type / category」時即時更新描述欄
    document.getElementById("type").addEventListener("change", () => accountingApp.updateCategoryOptions());
    document.getElementById("category").addEventListener("change", () => accountingApp.handleDescriptionAutoFill());
};