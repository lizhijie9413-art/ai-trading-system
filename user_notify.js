(function () {
  if (window.__userSupportNotifierLoaded) return;
  window.__userSupportNotifierLoaded = true;

  const API_BASE = "https://ai-trading-system-j5jf.onrender.com";
  const defaultTitle = document.title;
  const seenMessages = new Set();
  let unreadCount = 0;
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
    `;
    document.head.appendChild(style);
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

  function notify(data) {
    if (!data || data.sender !== "service") return;
    if (!isMessageForCurrentUser(data)) return;

    const key = messageKey(data);
    if (seenMessages.has(key)) return;
    seenMessages.add(key);

    unreadCount += 1;
    document.title = "(" + unreadCount + ") Support message";
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

  window.addEventListener("focus", function () {
    unreadCount = 0;
    document.title = defaultTitle;
  });

  loadSocketIo(connect);
})();
