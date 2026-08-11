(function () {
  if (window.__adminSupportNotifierLoaded) return;
  window.__adminSupportNotifierLoaded = true;

  const API_BASE = "https://ai-trading-system-j5jf.onrender.com";
  const adminAuth = JSON.parse(localStorage.getItem("adminAuth") || "null");

  if (!adminAuth || adminAuth.role !== "admin") return;

  const defaultTitle = document.title;
  const seenMessages = new Set();
  let unreadCount = 0;
  let socketInstance = null;

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
      oscillator.frequency.value = 920;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.45);
    } catch (err) {
      console.log("Support notification sound blocked:", err.message);
    }
  }

  function ensureToastStyle() {
    if (document.getElementById("adminSupportToastStyle")) return;
    const style = document.createElement("style");
    style.id = "adminSupportToastStyle";
    style.textContent = `
      .admin-support-toast{
        position:fixed;right:22px;top:22px;z-index:2147483647;
        width:min(360px,calc(100vw - 44px));padding:16px 18px;
        border-radius:14px;background:linear-gradient(135deg,#7c3aed,#2563eb);
        color:#fff;box-shadow:0 18px 42px rgba(0,0,0,.38);
        font-family:Arial,sans-serif;cursor:pointer;border:1px solid rgba(255,255,255,.18);
      }
      .admin-support-toast strong{display:block;font-size:16px;margin-bottom:6px}
      .admin-support-toast div{font-size:14px;line-height:1.45;opacity:.96}
    `;
    document.head.appendChild(style);
  }

  function showToast(data) {
    ensureToastStyle();
    const oldToast = document.querySelector(".admin-support-toast");
    if (oldToast) oldToast.remove();

    const name = data.username || data.uid || "Customer";
    const text = data.type === "image" ? "[Image]" : (data.message || "New message");
    const toast = document.createElement("div");
    toast.className = "admin-support-toast";
    toast.innerHTML = `<strong>New customer message</strong><div>${escapeHtml(name)}: ${escapeHtml(text)}</div>`;
    toast.onclick = function () {
      window.location.href = "customer_service.html";
    };
    document.body.appendChild(toast);
    setTimeout(function () {
      if (toast.parentNode) toast.remove();
    }, 9000);
  }

  function notify(data) {
    if (!data || data.sender !== "user") return;
    const key = messageKey(data);
    if (seenMessages.has(key)) return;
    seenMessages.add(key);

    unreadCount += 1;
    document.title = "(" + unreadCount + ") New customer message";
    playSound();
    showToast(data);

    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification("New customer message", {
          body: (data.username || data.uid || "Customer") + ": " + (data.message || "[image]")
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
      console.log("Support notifier failed to load Socket.IO");
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

    socketInstance.emit("admin_join_support");
    socketInstance.on("admin_new_user_message", notify);
    socketInstance.on("receive_message", notify);
  }

  window.addEventListener("focus", function () {
    unreadCount = 0;
    document.title = defaultTitle;
  });

  loadSocketIo(connect);
})();
