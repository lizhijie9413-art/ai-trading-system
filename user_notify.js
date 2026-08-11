(function () {
  if (window.__userSupportNotifierLoaded) return;
  window.__userSupportNotifierLoaded = true;

  const API_BASE = "https://ai-trading-system-j5jf.onrender.com";
  const defaultTitle = document.title;
  const seenMessages = new Set();
  let socketInstance = null;

  function getCurrentUser() {
    try {
      const raw = localStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  const user = getCurrentUser();
  if (!user) return;

  const userId = String(user.id || user._id || user.userId || "");
  const uid = String(user.uid || "");
  const email = String(user.email || "").toLowerCase();
  if (!userId && !uid && !email) return;

  const username = user.name || user.username || "User";
  const unreadStorageKey = "supportUnreadCount_" + (userId || uid || email);
  let unreadCount = Number(localStorage.getItem(unreadStorageKey) || 0);

  function uniqueValues(values) {
    return Array.from(new Set(values.map(function (value) {
      return String(value || "").trim();
    }).filter(Boolean)));
  }

  function getSupportRecordKeys() {
    return uniqueValues([
      userId,
      user._id,
      user.userId,
      uid,
      email
    ]).map(function (key) {
      return "supportChatRecords_" + key;
    });
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>]/g, function (char) {
      if (char === "&") return "&amp;";
      if (char === "<") return "&lt;";
      if (char === ">") return "&gt;";
      return char;
    });
  }

  function messageKey(data) {
    return String(data.id || data._id || [
      data.user || "",
      data.sender || "",
      data.type || "",
      data.message || "",
      data.imageUrl || "",
      data.time || ""
    ].join("|"));
  }

  function playSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 760;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.42);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.42);
    } catch (err) {
      console.log("User notification sound blocked:", err.message);
    }
  }

  function ensureStyle() {
    if (document.getElementById("userSupportToastStyle")) return;

    const style = document.createElement("style");
    style.id = "userSupportToastStyle";
    style.textContent = `
      .user-support-toast{
        position:fixed;left:50%;top:72px;transform:translateX(-50%);
        z-index:2147483647;width:min(390px,calc(100vw - 28px));
        padding:14px 16px;border-radius:16px;
        background:linear-gradient(135deg,#7c3aed,#38bdf8);
        color:#fff;box-shadow:0 18px 42px rgba(0,0,0,.36);
        font-family:Arial,sans-serif;cursor:pointer;
        border:1px solid rgba(255,255,255,.18);
      }
      .user-support-toast strong{display:block;font-size:15px;margin-bottom:5px}
      .user-support-toast div{font-size:13px;line-height:1.45;opacity:.96}
      .user-support-unread-badge{
        position:fixed;right:16px;bottom:92px;z-index:2147483646;
        min-width:112px;padding:12px 14px;border-radius:999px;
        background:linear-gradient(135deg,#7c3aed,#38bdf8);
        color:white;font-family:Arial,sans-serif;font-weight:800;
        box-shadow:0 14px 34px rgba(0,0,0,.34);cursor:pointer;
        display:none;align-items:center;justify-content:center;gap:7px;
        border:1px solid rgba(255,255,255,.2);
      }
      .user-support-unread-badge span{
        min-width:22px;height:22px;border-radius:50%;background:#ff1744;
        display:inline-flex;align-items:center;justify-content:center;
        font-size:12px;
      }
    `;
    document.head.appendChild(style);
  }

  function renderUnreadBadge() {
    ensureStyle();

    let badge = document.getElementById("userSupportUnreadBadge");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "userSupportUnreadBadge";
      badge.className = "user-support-unread-badge";
      badge.onclick = function () {
        window.location.href = "support_chat.html";
      };
      document.body.appendChild(badge);
    }

    if (unreadCount > 0) {
      badge.innerHTML = `Support <span>${unreadCount}</span>`;
      badge.style.display = "inline-flex";
      document.title = "(" + unreadCount + ") Support message";
    } else {
      badge.style.display = "none";
      document.title = defaultTitle;
    }
  }

  function showToast(data) {
    ensureStyle();

    const oldToast = document.querySelector(".user-support-toast");
    if (oldToast) oldToast.remove();

    const text = data.type === "image" ? "[Image]" : (data.message || "New support message");
    const toast = document.createElement("div");
    toast.className = "user-support-toast";
    toast.innerHTML = `<strong>Support message</strong><div>${escapeHtml(text)}</div>`;
    toast.onclick = function () {
      window.location.href = "support_chat.html";
    };

    document.body.appendChild(toast);
    setTimeout(function () {
      if (toast.parentNode) toast.remove();
    }, 9000);
  }

  function isMessageForCurrentUser(data) {
    const messageUserId = String(data.user || data.userId || "");
    const messageUid = String(data.uid || "");
    const messageEmail = String(data.email || "").toLowerCase();

    return (
      (userId && messageUserId && messageUserId === userId) ||
      (uid && messageUid && messageUid === uid) ||
      (email && messageEmail && messageEmail === email)
    );
  }

  function normalizeSupportMessage(data) {
    return {
      id: data.id || data._id || "",
      _id: data._id || data.id || "",
      user: data.user || data.userId || userId || uid || email,
      userId: data.userId || data.user || userId || "",
      username: data.username || username,
      uid: data.uid || uid,
      email: data.email || email,
      serviceId: data.serviceId || "CS-001",
      sender: data.sender || "service",
      type: data.type || "text",
      message: data.message || "",
      imageUrl: data.imageUrl || "",
      time: data.time || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };
  }

  function saveMessageToLocalChat(data) {
    const message = normalizeSupportMessage(data);
    const key = messageKey(message);

    getSupportRecordKeys().forEach(function (storageKey) {
      let records = [];
      try {
        records = JSON.parse(localStorage.getItem(storageKey) || "[]");
      } catch (err) {
        records = [];
      }

      const exists = records.some(function (item) {
        return messageKey(item) === key;
      });

      if (!exists) {
        records.push(message);
        localStorage.setItem(storageKey, JSON.stringify(records.slice(-300)));
      }
    });
  }

  function notify(data) {
    if (!data || data.sender !== "service") return;
    if (!isMessageForCurrentUser(data)) return;

    const key = messageKey(data);
    if (seenMessages.has(key)) return;
    seenMessages.add(key);

    saveMessageToLocalChat(data);
    unreadCount += 1;
    localStorage.setItem(unreadStorageKey, String(unreadCount));
    renderUnreadBadge();
    playSound();
    showToast(data);

    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification("Support message", {
          body: data.message || "[image]"
        });
      } else if (Notification.permission === "default") {
        Notification.requestPermission().catch(function () {});
      }
    }
  }

  function loadSocketIo(callback) {
    if (window.io) {
      callback();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.socket.io/4.7.5/socket.io.min.js";
    script.onload = callback;
    script.onerror = function () {
      console.log("User notifier failed to load Socket.IO");
    };
    document.head.appendChild(script);
  }

  function connect() {
    if (socketInstance || !window.io) return;

    socketInstance = window.io(API_BASE, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      timeout: 10000
    });

    socketInstance.on("connect", function () {
      socketInstance.emit("user_online", {
        userId,
        uid,
        username,
        email: user.email || ""
      });
    });

    socketInstance.on("receive_message", notify);
  }

  renderUnreadBadge();
  loadSocketIo(connect);
})();
