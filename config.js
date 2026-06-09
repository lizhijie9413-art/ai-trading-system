// ==================== 全局配置 ====================
// 统一后端API地址（公网）
const API_BASE = "https://ai-trading-system-j5jf.onrender.com";

// ==================== 用户管理 ====================
function getCurrentUser() {
    try {
        const user = localStorage.getItem("user");
        return user ? JSON.parse(user) : null;
    } catch (e) {
        return null;
    }
}

function saveCurrentUser(user) {
    localStorage.setItem("user", JSON.stringify(user));
}

function removeCurrentUser() {
    localStorage.removeItem("user");
    localStorage.removeItem("walletAddress");
}

function isLoggedIn() {
    const user = getCurrentUser();
    return user && user.id;
}

// ==================== 认证头 ====================
function getAuthHeaders() {
    const user = getCurrentUser();
    const headers = {
        "Content-Type": "application/json"
    };
    
    if (user && user.id) {
        headers["user-id"] = user.id;
    }
    
    const adminAuth = localStorage.getItem("adminAuth");
    if (adminAuth) {
        try {
            const admin = JSON.parse(adminAuth);
            if (admin.role === "admin") {
                headers["admin-token"] = "AI_ADMIN_2026";
            }
        } catch (e) {}
    }
    
    return headers;
}

// ==================== 统一请求方法 ====================
async function apiRequest(endpoint, options = {}) {
    const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint}`;
    const defaultOptions = {
        headers: getAuthHeaders()
    };
    
    const mergedOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers
        }
    };
    
    try {
        const response = await fetch(url, mergedOptions);
        const data = await response.json();
        return { success: true, data, response };
    } catch (error) {
        console.error(`API Request Failed: ${endpoint}`, error);
        return { success: false, error: error.message };
    }
}

// ==================== 格式化函数 ====================
function formatMoney(value) {
    return "$" + Number(value || 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function showToast(message, type = "info") {
    const existingToast = document.querySelector(".global-toast");
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement("div");
    toast.className = "global-toast";
    toast.textContent = message;
    
    const colors = { success: "#00f5a0", error: "#ff4d6d", info: "#c084fc" };
    toast.style.cssText = `
        position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%);
        background: rgba(10,20,40,0.95); border: 1px solid ${colors[type] || colors.info};
        color: ${colors[type] || colors.info}; padding: 12px 24px; border-radius: 50px;
        font-size: 14px; z-index: 10000; backdrop-filter: blur(10px);
    `;
    
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = "0"; setTimeout(() => toast.remove(), 300); }, 2500);
}

async function loadUserBalance() {
    const user = getCurrentUser();
    if (!user || !user.id) return null;
    
    const result = await apiRequest(`/api/users/${user.id}`);
    if (result.success && result.data && result.data.user) {
        const userData = result.data.user;
        saveCurrentUser({ ...user, ...userData });
        return userData;
    }
    return null;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}