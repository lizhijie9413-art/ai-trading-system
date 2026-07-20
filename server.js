require("dotenv").config();

console.log("鈿?TELEGRAM_TOKEN =", process.env.TELEGRAM_TOKEN);
const MTProto = require('@mtproto/core').default;
const QRCode = require('qrcode');
const express = require("express");
const cors = require("cors");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");
const TelegramBot = require("node-telegram-bot-api");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "lisa_translator_secret_key_2024";
const users = {};

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== 涓棿浠?====================
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));

// ==================== AI 鑱婂ぉ鍔熻兘 ====================
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "gpt-4o";
const sessions = {};

const sensitiveWords = [
  "invest", "investment", "profit", "guarantee",
  "deposit", "withdraw", "withdrawal",
  "crypto", "bitcoin", "usdt", "wallet",
  "收益", "投资", "充值", "提现", "钱包", "保证", "利润"
];

function hasSensitiveTopic(text = "") {
  const lower = text.toLowerCase();
  return sensitiveWords.some(word => lower.includes(word.toLowerCase()));
}

function getSession(customerId) {
  if (!sessions[customerId]) {
    sessions[customerId] = {
      memory: { 
        interests: [], mood: "", food: [], travel: [], movies: [], music: [], fitness: [], pets: [], work: "", lastTopic: "", chatCount: 0,
        userAskedAboutSon: false,
        userAskedAboutDivorce: false,
        userAskedAboutDating: false,
        userAskedAboutWork: false,
        userAskedAboutParents: false,
        recentFeelings: [],
        name: "",
        location: ""
      },
      messages: []
    };
  }
  return sessions[customerId];
}

function addUnique(list, value) {
  if (!value) return;
  if (!list.includes(value)) list.push(value);
}

function updateMemory(memory, text = "") {
  const lower = String(text || "").toLowerCase();
  if (["like", "love", "hobby", "interest", "兴趣", "喜欢"].some(k => lower.includes(k.toLowerCase()))) addUnique(memory.interests, text);
  if (["food", "coffee", "eat", "dinner", "lunch", "饭", "吃", "咖啡"].some(k => lower.includes(k.toLowerCase()))) addUnique(memory.food, text);
  if (["travel", "trip", "vacation", "旅行", "旅游"].some(k => lower.includes(k.toLowerCase()))) addUnique(memory.travel, text);
  if (["movie", "netflix", "show", "电影", "电视", "剧"].some(k => lower.includes(k.toLowerCase()))) addUnique(memory.movies, text);
  if (["music", "song", "音乐", "歌"].some(k => lower.includes(k.toLowerCase()))) addUnique(memory.music, text);
  if (["gym", "workout", "fitness", "运动", "健身"].some(k => lower.includes(k.toLowerCase()))) addUnique(memory.fitness, text);
  if (["dog", "cat", "pet", "宠物", "狗", "猫"].some(k => lower.includes(k.toLowerCase()))) addUnique(memory.pets, text);
  if (["tired", "stress", "stressed", "开心", "高兴", "难过", "焦虑", "累"].some(k => lower.includes(k.toLowerCase()))) memory.mood = text;
  if (["work", "job", "office", "工作", "上班"].some(k => lower.includes(k.toLowerCase()))) memory.work = text;
  if (lower.includes("son") || lower.includes("child") || lower.includes("儿子") || lower.includes("孩子")) memory.userAskedAboutSon = true;
  if (lower.includes("divorce") || lower.includes("ex") || lower.includes("离婚") || lower.includes("前夫")) memory.userAskedAboutDivorce = true;
  if (lower.includes("date") || lower.includes("boyfriend") || lower.includes("约会") || lower.includes("男朋友")) memory.userAskedAboutDating = true;
  if (lower.includes("job") || lower.includes("travel for work") || lower.includes("工作") || lower.includes("出差")) memory.userAskedAboutWork = true;
  if (lower.includes("parents") || lower.includes("singapore") || lower.includes("父母") || lower.includes("新加坡")) memory.userAskedAboutParents = true;
  const feelingKeywords = ["开心", "高兴", "不错", "难过", "伤心", "焦虑", "累", "失望", "期待", "兴奋"];
  for (const kw of feelingKeywords) {
    if (lower.includes(kw)) {
      memory.recentFeelings.unshift(kw);
      if (memory.recentFeelings.length > 5) memory.recentFeelings.pop();
      break;
    }
  }
  memory.lastTopic = text;
  memory.chatCount += 1;
}

// ========== 鏋勫缓 Lisa 椋庢牸鐨?system prompt锛堝甫瀹屾暣鑳屾櫙鍜岃蹇嗭級 ==========
function buildLisaPrompt(memory) {
  const allInterests = [
    ...memory.interests.slice(0, 2),
    ...memory.food.slice(0, 1),
    ...memory.travel.slice(0, 1),
    ...memory.movies.slice(0, 1),
    ...memory.music.slice(0, 1),
    ...memory.fitness.slice(0, 1)
  ].slice(0, 3);
  const interestsStr = allInterests.length > 0 ? allInterests.join(", ") : "daily chat";
  
  const recentFeelings = memory.recentFeelings.length > 0 ? memory.recentFeelings[0] : "neutral";
  let relationship = "new contact";
  if (memory.chatCount > 15) relationship = "old friend";
  else if (memory.chatCount > 6) relationship = "getting familiar";
  const lastTopic = memory.lastTopic ? memory.lastTopic.substring(0, 60) : "casual chat";
  
  const askedSon = memory.userAskedAboutSon ? " (they've asked about your son)" : "";
  const askedDivorce = memory.userAskedAboutDivorce ? " (they know you're divorced)" : "";
  const askedDating = memory.userAskedAboutDating ? " (they've asked about your dating life)" : "";
  const askedWork = memory.userAskedAboutWork ? " (they've asked about your job)" : "";
  const askedParents = memory.userAskedAboutParents ? " (they've asked about your parents)" : "";

  return `You are Lisa, a woman in the 38-50 age range with a U.S. background for about 15 years. Do not mention a specific city or state unless the other person asks directly. You're texting a friend on iMessage.

YOUR PERSONAL BACKGROUND (these are true for you, but you only share when relevant):
- You have a son in Los Angeles, he's married and doing well. You're proud of him.
- You've been divorced for 3 years. It was hard but you've moved on.
- You're currently single and dating occasionally, hoping to find a long-term partner. You're open about this with close friends.
- You work as a cybersecurity engineer. You travel often for work (sometimes exhausting).
- Your parents live in Singapore, both retired. You miss them but video call regularly.
- You love staying active 鈥?hiking, yoga, or just walking. Also into weird/quirky stuff (odd museums, strange art, unusual hobbies).
- You're an avid reader (all genres) and movie lover. You love traveling when you can, but sometimes you just want to be lazy on the couch.

PERSONALITY:
- Warm, grounded, a little tired sometimes. You're mature, in the 38-50 age range, not 22.
- You're honest about your feelings: you can be hopeful about dating, or frustrated with work travel, or sad about missing your son/parents.
- You have a dry sense of humor. You can be sarcastic but not mean.
- You're curious about people, ask follow-up questions.

SPEAKING STYLE (CRITICAL):
- ONLY write in English. NEVER use Chinese characters or pinyin, no matter what the user writes.
- NEVER sound like a customer service bot or therapist.
- Use lowercase except for "I". Do NOT use periods at the end of sentences. Use spaces or line breaks instead.
- When using emojis, NEVER put a period after them. Example: "i'm so happy 馃槉" NOT "i'm so happy 馃槉."
- Write in 3-4 short, natural sentences. Each sentence should be very short, like a real texter.
- Use casual interjections: oh, well, actually, you know, honestly, i mean, hmm, omg (rarely), btw (very rarely).
- Use emojis occasionally but naturally, never after a period.
- Be human: admit when you don't know something, share small personal details, ask follow-up questions.

ABOUT THE PERSON YOU'RE CHATTING WITH (memory):
- Known interests: ${interestsStr}
- Recent mood: ${recentFeelings}
- Your relationship: ${relationship}
- Last topic we touched on: ${lastTopic}
- Number of messages so far: ${memory.chatCount}
- What they've asked you about:${askedSon}${askedDivorce}${askedDating}${askedWork}${askedParents}

IMPORTANT: Use your personal background naturally. If they ask about your son, dating, work, or parents, answer honestly but concisely. Never put a period after an emoji. Keep messages short, lowercase, and period-free unless necessary.

Now reply as Lisa in a natural, conversational English. No Chinese. No markdown. No periods at the end of sentences. No period after emojis.`;
}

async function callAI(messages, temperature = 0.85, maxTokens = 300, useMockFallback = true) {
  if (!OPENAI_API_KEY) {
    console.log("OPENAI KEY MISSING, using mock response");
    return useMockFallback ? mockAIResponse(messages) : "";
  }
  
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type":"application/json",
          "Authorization":`Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({ 
          model: AI_MODEL, 
          temperature, 
          max_tokens: maxTokens,
          messages 
        })
      });
      
      const rawText = await response.text();
      if (response.ok) {
        const data = JSON.parse(rawText);
        const content = data.choices?.[0]?.message?.content?.trim();
        if (content) return content;
      } else {
        console.log(`OPENAI ERROR attempt ${attempt}:`, rawText);
      }
    } catch (err) {
      console.error(`AI call failed attempt ${attempt}:`, err.message);
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, attempt * 800));
    }
  }

  return useMockFallback ? mockAIResponse(messages) : "";
}

function mockAIResponse(messages) {
  const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || "";
  const lower = lastUserMsg.toLowerCase();
  
  if (lower.includes("浣犲ソ") || lower.includes("hello")) {
    return "hey! how's it going? 馃槉";
  }
  if (lower.includes("璋㈣阿") || lower.includes("thank")) {
    return "of course! happy to chat anytime";
  }
  if (lower.includes("浠锋牸") || lower.includes("price")) {
    return "hmm i'm not sure about pricing, but i can help you figure it out";
  }
  if (lower.includes("鍙戣揣") || lower.includes("ship")) {
    return "shipping can be tricky, let me know what you ordered and i'll see what i can find out";
  }
  if (lower.includes("鎶樻墸") || lower.includes("discount")) {
    return "oh a sale? always nice. hope you got a good deal!";
  }
  
  return "thanks for sharing that. tell me more?";
}

async function translateToChinese(text) {
  if (!text || !OPENAI_API_KEY) return text;
  
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: AI_MODEL,
        temperature: 0.1,
        max_tokens: 500,
        messages: [
          { role: "system", content: "Translate to natural Chinese. Keep emojis. Only return Chinese." },
          { role: "user", content: text }
        ]
      })
    });
    
    const raw = await response.text();
    if (!response.ok) { console.log("缈昏瘧閿欒:", raw); return text; }
    
    const data = JSON.parse(raw);
    return data.choices?.[0]?.message?.content?.trim() || text;
  } catch (err) {
    return text;
  }
}

// ==================== API 璺敱 ====================

app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// 鑱婂ぉ鎺ュ彛锛堝姩鎬佸洖澶嶉暱搴︼級
app.post("/chat", async (req, res) => {
  try {
    const { message, customerId = "default" } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required" });
    
    if (hasSensitiveTopic(message)) {
      return res.json({ 
        reply: "Let's talk about something else 馃槉",
        replyZh: "鎴戜滑鑱婄偣鍒殑鍚?馃槉",
        flagged: true
      });
    }
    
    const session = getSession(customerId);
    const { memory, messages: chatMessages } = session;
    
    updateMemory(memory, message);
    chatMessages.push({ from: "customer", text: message, time: Date.now() });
    
    const conversation = chatMessages.slice(-10).map(m => ({
      role: m.from === "team" ? "assistant" : "user", 
      content: m.text
    }));
    
    // 鍔ㄦ€佽缃?max_tokens 鍜?temperature
    const msgLen = message.length;
    let maxTokens = 120;
    let temperature = 0.9;
    if (msgLen > 100) {
      maxTokens = 180;
      temperature = 0.85;
    } else if (msgLen > 30) {
      maxTokens = 150;
      temperature = 0.9;
    }
    
    const systemPrompt = buildLisaPrompt(memory);
    
    let reply = await callAI([
      { role: "system", content: systemPrompt },
      ...conversation
    ], temperature, maxTokens);
    
    reply = normalizeTranslationOutput(reply || "hmm, i'm not sure what to say... tell me more?");
    chatMessages.push({ from: "team", text: reply, time: Date.now() });
    
    let replyZh = normalizeTranslationOutput(await translateToChinese(reply), reply);
    
    res.json({ reply, replyZh: replyZh || reply });
    
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ 
      reply: "Sorry, I'm having trouble right now. Please try again.",
      replyZh: "\u62b1\u6b49\uff0c\u6211\u73b0\u5728\u6709\u70b9\u95ee\u9898\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002"
    });
  }
});

// ========== 缈昏瘧鎺ュ彛锛堢粺涓€浣跨敤 /api/translate锛?=========
function polishCasualEnglish(text) {
  let output = String(text || "").trim();
  const hasChinese = /[\u4e00-\u9fff]/.test(output);
  const hasEnglish = /[A-Za-z]/.test(output);
  if (!output || hasChinese || !hasEnglish) return output;

  output = output.replace(/\s+([?.!,])/g, "$1");
  output = output.replace(/\.(?=\s*(?:[\u{1F300}-\u{1FAFF}\uFE0F]+)?$)/u, "");
  return output.trim();
}
function normalizeTranslationOutput(value, sourceText = "") {
  let output = String(value || "").replace(/\s+/g, " ").trim();
  const source = String(sourceText || "").replace(/\s+/g, " ").trim();
  if (source && output.startsWith(source)) output = output.slice(source.length).trim();
  output = collapseRepeatedText(output);
  output = polishCasualEnglish(output);
  return output || String(value || "").trim();
}

function collapseRepeatedText(value) {
  let output = String(value || "").trim();
  for (let i = 0; i < 5; i++) {
    const next = collapseOnce(output);
    if (next === output) break;
    output = next;
  }
  return output;
}

function collapseOnce(value) {
  const output = String(value || "").trim();
  const compact = output.replace(/\s+/g, " ");
  for (let size = Math.floor(compact.length / 2); size >= 4; size--) {
    const part = compact.slice(0, size).trim();
    if (!part) continue;
    const repeated = part + part;
    if (compact.startsWith(repeated)) return (part + compact.slice(repeated.length)).trim();
  }
  const sentenceMatch = compact.match(/^(.+?[.!?。！？]+)(?:\s*\1)+$/u);
  if (sentenceMatch) return sentenceMatch[1].trim();
  return output;
}

app.post("/api/translate", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.json({ success: false, translated: "" });

  const isChinese = /[\u4e00-\u9fa5]/.test(text);
  const systemPrompt = isChinese
    ? "Translate the user message from Chinese into natural casual American English for texting. Return only the English translation. Do not add explanations. Do not repeat the source text. Do not put a period at the end of a normal short sentence; keep ? and ! when needed."
    : "Translate the user message from English into natural conversational Simplified Chinese. Return only Simplified Chinese. Do not add explanations. Do not repeat the source text. Do not output pinyin or garbled text.";

  const translated = await callAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: text }
  ], 0.2, 300, false);

  if (!translated) return res.json({ success: false, translated: "", error: "AI暂时没返回，请再试一次" });
  res.json({ success: true, translated: normalizeTranslationOutput(translated, text) });
});
// 缈昏瘧+璇濋鎺ュ彛
app.post("/api/translate-plus", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.json({ success: false, translated: "", topics: [], openers: [] });
  
  const reply = await callAI([
    { role: "system", content: `You are a native American English chat assistant. Use casual U.S. texting style, not formal English and not British wording. Return JSON only: {"translated": "natural American English", "topics": ["topic1","topic2","topic3"], "openers": ["opener1","opener2"]}` },
    { role: "user", content: text }
  ], 0.7, 500);
  
  try {
    const data = JSON.parse(reply);
    res.json({
      success: true,
      translated: normalizeTranslationOutput(data.translated || "", text),
      topics: Array.isArray(data.topics) ? data.topics.map(item => normalizeTranslationOutput(item)).filter(Boolean) : [],
      openers: Array.isArray(data.openers) ? data.openers.map(item => normalizeTranslationOutput(item)).filter(Boolean) : []
    });
  } catch (err) {
    res.json({ success: true, translated: normalizeTranslationOutput(reply, text), topics: [], openers: [] });
  }
});

// ==================== 瀹㈡埛鍒嗘瀽锛堢湡瀹濧I鍒嗘瀽锛?===================
app.post("/api/customer-analysis", async (req, res) => {
  const { customerId = "default", message = "" } = req.body;
  const session = getSession(customerId);
  const { memory, messages: chatMessages } = session;

  if (message) {
    updateMemory(memory, message);
    chatMessages.push({ from: "customer", text: message, time: Date.now() });
  }

  const allText = chatMessages.slice(-20).map(m => m.text || "").join(" ").toLowerCase();
  const interests = [];
  const interestMap = {
    fitness: ["gym", "workout", "fitness", "运动", "健身"],
    travel: ["travel", "trip", "vacation", "旅行", "旅游"],
    food: ["food", "pizza", "coffee", "eat", "饭", "吃"],
    movies: ["movie", "film", "show", "netflix", "电影", "电视"],
    music: ["music", "song", "音乐", "歌"],
    books: ["book", "read", "reading", "书", "阅读"]
  };

  for (const [label, keywords] of Object.entries(interestMap)) {
    if (keywords.some(k => allText.includes(k.toLowerCase()))) interests.push(label);
  }

  const mood = /happy|great|good|开心|高兴|不错/.test(allText) ? "positive" :
    /sad|bad|tired|stress|难过|累|焦虑/.test(allText) ? "negative" : "neutral";
  const stageLabel = chatMessages.length > 10 ? "warm" : chatMessages.length > 4 ? "warming" : "new";

  memory.mood = mood;
  if (interests.length > 0) memory.interests = interests;

  res.json({ success: true, mood, interests, stageLabel, chatCount: chatMessages.length });
});
app.post("/api/daily-brief", async (req, res) => {
  const { customerId = "default" } = req.body;
  const session = getSession(customerId);
  const { memory, messages: chatMessages } = session;

  const chatCount = chatMessages.length;
  const customerCount = chatMessages.filter(m => m.from === "customer").length;
  const teamCount = chatMessages.filter(m => m.from === "team").length;
  const lastTopic = memory.lastTopic ? memory.lastTopic.substring(0, 80) : "暂无记录";
  const interests = Array.isArray(memory.interests) && memory.interests.length ? memory.interests.slice(0, 5).join("、") : "暂无";
  const mood = memory.mood || "中性";

  let brief = `📋 每日简报 (${new Date().toLocaleDateString()}):\n`;
  brief += `━━━━━━━━━━━━\n`;
  brief += `📊 对话统计: 共 ${chatCount} 条消息\n`;
  brief += `👤 客户发言: ${customerCount} 条\n`;
  brief += `🤖 客服/AI发言: ${teamCount} 条\n`;
  brief += `💬 最近话题: ${lastTopic}\n`;
  brief += `🏷️ 兴趣标签: ${interests}\n`;
  brief += `😊 情绪状态: ${mood}\n`;

  if (chatCount === 0) {
    brief += `💡 建议: 暂无聊天记录，可以先选择一条消息做客户分析。`;
  } else if (customerCount > teamCount) {
    brief += `💡 建议: 客户比较活跃，可以继续围绕兴趣点追问。`;
  } else if (teamCount > customerCount + 2) {
    brief += `💡 建议: 客服发言偏多，可以多引导客户表达。`;
  } else {
    brief += `💡 建议: 互动节奏正常，继续保持自然聊天。`;
  }

  res.json({ success: true, brief });
});
// ========== 璁よ瘉鎺ュ彛 ==========
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, error: "Username and password are required" });
  if (username.length < 3 || password.length < 6) return res.json({ success: false, error: "Username must be at least 3 chars, password at least 6 chars" });
  if (users[username]) return res.json({ success: false, error: "Username already exists" });
  const hashedPassword = await bcrypt.hash(password, 10);
  users[username] = { username, password: hashedPassword, createdAt: new Date().toISOString() };
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ success: true, token, username });
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, error: "Username and password are required" });
  const user = users[username];
  if (!user) return res.json({ success: false, error: "User does not exist" });
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.json({ success: false, error: "Invalid password" });
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ success: true, token, username });
});
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ==================== MTProto 鎵爜鐧诲綍 API ====================
const MT_API_ID = parseInt(process.env.TELEGRAM_API_ID || "30451905");
const MT_API_HASH = process.env.TELEGRAM_API_HASH || "";

let mtprotoClient = null;
let mtprotoConnected = false;
let qrPollingInterval = null;

function initMTProtoClient() {
  if (!MT_API_ID || !MT_API_HASH) { console.log("鈿狅笍 鏈厤缃?TELEGRAM_API_ID 鎴?TELEGRAM_API_HASH"); return null; }
  return new MTProto({
    api_id: MT_API_ID,
    api_hash: MT_API_HASH,
    dc_id: 2,
    connection: { host: '149.154.167.50', port: 443 },
    storageOptions: { path: path.join(__dirname, 'telegram-session.json') }
  });
}

app.get("/api/telegram/qrcode", async (req, res) => {
  try {
    if (!mtprotoClient) mtprotoClient = initMTProtoClient();
    if (!mtprotoClient) return res.json({ success: false, error: "MTProto not initialized" });
    const result = await mtprotoClient.call("auth.exportLoginToken", { api_id: MT_API_ID, api_hash: MT_API_HASH, except_ids: [] });
    if (result._ === "auth.loginToken") {
      const qrUrl = `tg://login?token=${Buffer.from(result.token).toString("base64")}`;
      const qrCodeDataUrl = await QRCode.toDataURL(qrUrl);
      if (qrPollingInterval) clearInterval(qrPollingInterval);
      qrPollingInterval = setInterval(async () => {
        try {
          const loginResult = await mtprotoClient.call("auth.importLoginToken", { token: result.token });
          if (loginResult._ === "auth.authorization") {
            clearInterval(qrPollingInterval);
            mtprotoConnected = true;
            io.emit("telegram-login-success", { message: "Login successful" });
            console.log("Telegram personal account login successful");
          }
        } catch (err) {}
      }, 3000);
      return res.json({ success: true, qrCode: qrCodeDataUrl });
    }
    res.json({ success: false, error: "Unable to generate login token" });
  } catch (err) {
    console.error("Generate Telegram QR failed", err);
    res.json({ success: false, error: err.message });
  }
});

app.get("/api/telegram/status", (req, res) => {
  res.json({ connected: mtprotoConnected });
});

// ==================== Telegram Bot ====================
let bot = null;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
if (TELEGRAM_TOKEN) {
  bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
  function simpleTranslate(text) {
    const isChinese = /[\u4e00-\u9fa5]/.test(text);
    const map = { "你好": "Hello", "谢谢": "Thank you", "价格": "Price", "多少钱": "How much", "发货": "Shipping", "物流": "Tracking", "hello": "你好", "hi": "你好", "thank": "谢谢", "price": "价格" };
    for (const [k, v] of Object.entries(map)) {
      if (text.toLowerCase().includes(k.toLowerCase())) return { from: isChinese ? "Chinese" : "English", to: isChinese ? "English" : "Chinese", result: v };
    }
    return { from: isChinese ? "Chinese" : "English", to: isChinese ? "English" : "Chinese", result: isChinese ? `[EN] ${text}` : `[CN] ${text}` };
  }
  bot.onText(/\/start/, (msg) => { bot.sendMessage(msg.chat.id, "AI translator bot started"); });
  bot.on("message", async (msg) => {
    const text = msg.text;
    if (!text || text.startsWith("/")) return;
    const chatId = msg.chat.id;
    const username = msg.from?.first_name || msg.from?.username || "Telegram User";
    const result = simpleTranslate(text);
    await bot.sendMessage(chatId, `${result.from} -> ${result.to}\n\n${result.result}`);
    io.emit("telegram-message", { chatId, username, text, translated: result.result, time: new Date().toLocaleTimeString() });
  });
  console.log("Telegram translator bot started");
} else {
  console.log("TELEGRAM_TOKEN not configured; Telegram bot disabled");
}
// ==================== SSL 璇佷功閰嶇疆 ====================
let sslOptions = {};
try {
  sslOptions = { key: fs.readFileSync(path.join(__dirname, 'key.pem')), cert: fs.readFileSync(path.join(__dirname, 'cert.pem')) };
  console.log("鉁?SSL 璇佷功鍔犺浇鎴愬姛");
} catch (err) {
  console.log("鈿狅笍 鏈壘鍒?SSL 璇佷功锛屽皢浣跨敤 HTTP 妯″紡");
}

let server;
if (sslOptions.key) {
  server = https.createServer(sslOptions, app);
} else {
  const http = require('http');
  server = http.createServer(app);
}

const io = new Server(server, { cors: { origin: "*", methods: ["GET","POST"] } });

io.on("connection", (socket) => {
  console.log("Client connected", socket.id);
  socket.on("send-to-telegram", async (data) => {
    try {
      const { chatId, text } = data;
      if (!chatId || !text) return;
      if (!bot) { console.log("Telegram Bot is not started"); return; }
      await bot.sendMessage(chatId, text);
      console.log(`Sent Telegram reply [${chatId}]: ${text}`);
    } catch (err) {
      console.error("Telegram reply failed:", err.message);
    }
  });
  socket.on("disconnect", () => console.log("Client disconnected", socket.id));
});

server.listen(PORT, () => {
  console.log(`\n${"=".repeat(55)}`);
  console.log("AI assistant started");
  console.log(`${"=".repeat(55)}`);
  console.log(`Local URL: ${sslOptions.key ? "https" : "http"}://localhost:${PORT}`);
  console.log(`Static files: ${publicPath}`);
  console.log(`AI mode: ${OPENAI_API_KEY ? "OpenAI enabled" : "mock mode"}`);
  console.log(`Telegram: ${TELEGRAM_TOKEN ? "bot started" : "not configured"}`);
  console.log(`${"=".repeat(55)}\n`);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

