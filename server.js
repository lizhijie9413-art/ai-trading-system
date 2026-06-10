require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const OpenAI = require("openai").default;
const bcrypt = require("bcryptjs");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");

const app = express();
// 修复：将管理员Token改为环境变量
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "AI_ADMIN_2026";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,

});

app.get("/test-server", (req, res) => {
  res.send("THIS IS MY CURRENT SERVER JS");
});

app.get("/api/market/quotes", async (req, res) => {
  try {
    const symbols = req.query.symbols;

    if (!symbols) {
      return res.json({
        success: false,
        message: "Symbols missing"
      });
    }

    if (!process.env.TWELVE_API_KEY) {
      return res.json({
        success: false,
        message: "TWELVE_API_KEY missing on server"
      });
    }

    const url =
      "https://api.twelvedata.com/quote?symbol=" +
      encodeURIComponent(symbols) +
      "&apikey=" +
      process.env.TWELVE_API_KEY;

    console.log("TwelveData symbols:", symbols);
    console.log("TwelveData key exists:", !!process.env.TWELVE_API_KEY);

    const response = await fetch(url);
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
    if (data && data.code === 401) {
      return res.json({
        success: false,
        message: "TwelveData API key invalid or missing",
        data
      });
    }

    res.json({
      success: true,
      data
    });

  } catch (err) {
    console.log("Market data error:", err);

    res.json({
      success: false,
      message: "Market data failed"
    });
  }
});

// 修复：添加用户认证中间件
async function authenticateUser(req, res, next) {
  const userId = req.headers["user-id"] || req.params.id;
  if (!userId) {
    return res.status(401).json({ success: false, message: "User ID required" });
  }
  const user = await User.findById(userId);
  if (!user) {
    return res.status(401).json({ success: false, message: "User not found" });
  }
  if (user.status !== 'active') {
    return res.status(403).json({ success: false, message: "Account is frozen" });
  }
  req.user = user;
  req.userId = userId;
  next();
}

// 修复：添加用户认证
app.get("/api/users/:id", authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.json({
        success: false,
        message: "User not found"
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        uid: user.uid || 20160,
        name: user.username || user.name,
        email: user.email,
        balance: user.asset || user.balance || 0,
        records: user.records || [],
        lockedAsset: user.lockedAsset || 0,
        totalProfit: user.totalProfit || 0,
        todayProfit: user.todayProfit || 0,

        tokenProfit: user.tokenProfit || 0,

        tokenTodayProfit: user.tokenTodayProfit || 0,
       status: user.status
      }
    });

  } catch (error) {
    res.json({
      success: false,
      message: "Failed to load user"
    });
  }
});




app.post("/api/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.json({
        success: false,
        message: "Please fill in all fields."
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.json({
        success: false,
        message: "Email already registered."
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const lastUser = await User.findOne().sort({ uid: -1 });

    const nextUid =
      lastUser && lastUser.uid
        ? lastUser.uid + 1
        : 20160;

    const newUser = await User.create({
      uid: nextUid,
      name: username,
      email,
      password: hashedPassword,
      asset: 0,
      balance: 0,
      vipAsset: 0,
      totalProfit: 0,
      status: "active",
      kyc: "未审核",
      records: []
    });

    res.json({
      success: true,
      message: "Registration successful.",
      user: {
        id: newUser._id,
        uid: newUser.uid,
        name: newUser.name,
        email: newUser.email,
        balance: newUser.asset || 0,
        status: newUser.status
      }
    });

  } catch (error) {
    console.log(error);

    res.json({
      success: false,
      message: "Registration failed."
    });
  }
});


app.put("/api/users/:id/restore", verifyAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId);
        if (!user) return res.json({ success:false, message:"User not found" });

        user.status = "active";  
        await user.save();

        res.json({ success:true, message:"User restored successfully" });
    } catch(err){
        console.log(err);
        res.json({ success:false, message:"Restore failed" });
    }
});


app.put(
  "/api/users/:id/restore",
  verifyAdmin,
  async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "用户不存在"
    });
  }

  user.status = "active";

  if (!user.records) {
    user.records = [];
  }

  user.records.push("账户恢复正常");

  await user.save();

  res.json({
    success: true,
    data: user
  });
});

app.post("/api/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.json({
                success: false,
                message: "Please enter email and password."
            });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.json({
                success: false,
                message: "User not found."
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.json({
                success: false,
                message: "Wrong password."
            });
        }

        res.json({
    success: true,
    message: "Login successful.",
    user: {
        id: user._id,
        uid: user.uid,
        name: user.username || user.name,
        email: user.email,
        balance: user.asset || user.balance || 0,
        status: user.status
    }
});

    } catch (error) {
        console.log(error);

        res.json({
            success: false,
            message: "Login failed."
        });
    }
});

const kycStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },

  filename: function (req, file, cb) {

    const uniqueName =
      Date.now() + "-" + file.originalname;

    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: kycStorage

});

app.post("/api/chat/upload", upload.single("image"), (req, res) => {
  res.json({
    success: true,
    url: "/uploads/" + req.file.filename
  });
});

let kycSubmissions = [];

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});



app.get("/api/kyc/list", (req, res) => {
  res.json(kycSubmissions);
});

app.use("/uploads", express.static("uploads"));

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname, {
  fallthrough: true
}));

mongoose.connect(
  "mongodb+srv://lizhijie9413_db_user:7IosWudKAGOOqhLq@cluster0.4yivc9k.mongodb.net/ai_trading_admin?retryWrites=true&w=majority&appName=Cluster0&authSource=admin"
)
.then(() => console.log("MongoDB connected"))
.catch(err => console.log("MongoDB error:", err));

const UserSchema = new mongoose.Schema({

  uid: Number,

  name: String,

  email: String,

  password: String,

  asset: {
    type: Number,
    default: 0
  },

  balance: {
    type: Number,
    default: 0
  },

  totalProfit: {
    type: Number,
    default: 0
  },

  lockedAsset: {
    type: Number,
    default: 0
  },

  tokenLocked: {
    type: Number,
    default: 0
  },

  tokenProfit: {
    type: Number,
    default: 0
  },

  tokenTodayProfit: {
    type: Number,
    default: 0
  },

  todayProfit: {
    type: Number,
    default: 0
  },

  status: {
    type: String,
    default: "active"
  },

  kyc: {
    type: String,
    default: "未审核"
  },

  records: {
    type: Array,
    default: []
  },

  vipAsset: {
  type: Number,
  default: 0
},

  createdAt: {
    type: Date,
    default: Date.now
  }

});

const User = mongoose.model("User", UserSchema);

const KYC = mongoose.model("KYC", new mongoose.Schema({
  userId: String,
  uid: String,
  name: String,
  email: String,
  frontImage: String,
  backImage: String,
  status: {
    type: String,
    default: "未审核"
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}));
  



const Order = mongoose.model("Order", new mongoose.Schema({
  id: String,
  user: String,
  type: String,
  coin: String,
  amount: Number,
  profit: Number,
  status: String,
  time: String,
  remark: String
}));

const Trade = mongoose.model("Trade", new mongoose.Schema({
  id: String,

  strategy: String,

  pair: String,

  direction: String,

  entryPrice: Number,

  currentPrice: Number,

  amount: Number,

  profit: Number,

  status: String,

  time: String
}));

const Withdrawal = mongoose.model("Withdrawal", new mongoose.Schema({
  userId: String,
  uid: String,
  email: String,
  address: String,
  amount: Number,
  network: String,
  time: String,
  status: {
    type: String,
    default: "Pending"
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}));

const ChatMessage = mongoose.model("ChatMessage", new mongoose.Schema({
  user: String,
  username: String,
  uid: String,
  serviceId: String,
  sender: String,
  type: String,
  message: String,
  imageUrl: String,
  time: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
}));

let stats = {
  todayRecharge: 0,
  monthRecharge: 0,
  todayWithdraw: 0,
  monthWithdraw: 0
};

let tickets = [
  {
    id: "TCK1001",
    user: "Alice",
    email: "alice@example.com",
    type: "充值问题",
    priority: "高",
    status: "待处理",
    message: "充值 5000 USDT 后未到账",
    reply: "",
    time: "2026-05-21 14:20"
  }
];

let withdrawals = [];

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* 用户 */
app.get("/api/users", async (req, res) => {
  const users = await User.find();
  res.json({ success: true, data: users, stats });
});

app.post("/api/users", async (req, res) => {
  const user = await User.create({
    ...req.body,
    asset: Number(req.body.asset || 0),
    register: new Date().toISOString().slice(0, 10),
    ip: "192.168.1." + Math.floor(Math.random() * 200),
    records: ["创建用户"]
  });

  res.json({ success: true, data: user });
});

app.get("/api/chat/history/:userId", async (req, res) => {

  try {

    const list = await ChatMessage.find({
      user: req.params.userId
    }).sort({ createdAt: 1 });

    res.json({
      success: true,
      data: list
    });

  } catch (err) {

    res.json({
      success: false,
      message: "Failed to load chat history"
    });
  }
});

// 修复：添加金额验证
app.put("/api/users/:id/recharge", async (req, res) => {
  const amount = Number(req.body.amount);

  // 修复：金额验证
  if (amount <= 0 || amount > 1000000) {
    return res.status(400).json({
      success: false,
      message: "Invalid amount"
    });
  }

  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "用户不存在"
    });
  }

  user.asset = Number(user.asset || 0) + amount;
  user.balance = user.asset;

  const totalAsset =
    Number(user.asset || 0) +
    Number(user.lockedAsset || 0);

  if (totalAsset > Number(user.vipAsset || 0)) {
    user.vipAsset = totalAsset;
  }

  user.records.push(`充值 ${amount} USDT`);

  stats.todayRecharge += amount;
  stats.monthRecharge += amount;

  await user.save();

  res.json({
    success: true,
    data: user,
    stats
  });
});

app.put("/api/users/:id/profile", async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.json({
        success: false,
        message: "User not found"
      });
    }

    user.name = name || user.name;
    user.email = email || user.email;
    user.phone = phone || user.phone;

    await user.save();

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        balance: user.asset || 0,
        uid: user.uid || ""
      }
    });

  } catch (err) {
    console.log(err);
    res.json({
      success: false,
      message: "Update profile failed"
    });
  }
});

app.put("/api/users/:id/withdraw", async (req, res) => {
  const amount = Number(req.body.amount);
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({ success: false, message: "用户不存在" });
  }

  if (amount > user.asset) {
    return res.status(400).json({ success: false, message: "余额不足" });
  }

  user.asset -= amount;
  user.records.push(`提现 ${amount} USDT`);

  stats.todayWithdraw += amount;
  stats.monthWithdraw += amount;

  await user.save();
  res.json({ success: true, data: user, stats });
});

 app.put(
  "/api/users/:id/freeze",
  verifyAdmin,
  async (req, res) => {

  const user =
  await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({ success: false, message: "用户不存在" });
  }

  user.status = user.status === "冻结" ? "正常" : "冻结";
  user.records.push(user.status === "冻结" ? "账户冻结" : "账户解冻");

  await user.save();
  res.json({ success: true, data: user });
});

app.put(
  "/api/users/:id/blacklist",
  verifyAdmin,
  async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({ success: false, message: "用户不存在" });
  }

  user.status = "拉黑";
  user.records.push("账户拉黑");

  await user.save();
  res.json({ success: true, data: user });
});

/* KYC */
app.get("/api/kyc", async (req, res) => {
  const list = await KYC.find();
  res.json({ success: true, data: list });
});

app.put("/api/kyc/:id/approve", async (req, res) => {
  const item = await KYC.findByIdAndUpdate(
    req.params.id,
    { status: "已通过" },
    { new: true }
  );

  res.json({ success: true, data: item });
});

app.put("/api/kyc/:id/reject", async (req, res) => {
  const item = await KYC.findByIdAndUpdate(
    req.params.id,
    { status: "已驳回" },
    { new: true }
  );

  res.json({ success: true, data: item });
});

/* 订单 */
app.get("/api/orders", async (req, res) => {
  const orders = await Order.find();
  res.json({ success: true, data: orders });
});

app.put("/api/orders/:id/complete", async (req, res) => {
  const order = await Order.findOneAndUpdate(
    { id: req.params.id },
    { status: "已完成", remark: "订单已完成" },
    { new: true }
  );

  res.json({ success: true, data: order });
});

app.put("/api/orders/:id/cancel", async (req, res) => {
  const order = await Order.findOneAndUpdate(
    { id: req.params.id },
    { status: "已取消", remark: "订单已取消" },
    { new: true }
  );

  res.json({ success: true, data: order });
});


/* AI Quant 订单模型 */

const AIQuantOrder = mongoose.model("AIQuantOrder", new mongoose.Schema({
  userId: String,
  username: String,
  market: String,
  product: String,
  level: String,
  assistantType: String,
  strategy: String,
  amount: Number,
  profitRate: Number,
  profit: Number,
  finalRate: Number,

  subTrades: {
  type: Array,
  default: []
},
  status: String,
  startTime: Date,
  endTime: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
}));

const TokenYieldOrder = mongoose.model("TokenYieldOrder", new mongoose.Schema({

  userId: String,

  planName: String,

  amount: Number,

  days: Number,

  rate: Number,

  profit: Number,

  status: String,

  startTime: Date,

  endTime: Date,

  createdAt: {
    type: Date,
    default: Date.now
  }

}));

/* 后台订单接口 */

app.get("/api/admin/trade-orders", async (req, res) => {

  try {

    const aiOrders =
    await AIQuantOrder.find()
    .sort({ createdAt: -1 });

    const tokenOrders =
    await TokenYieldOrder.find()
    .sort({ createdAt: -1 });

    const users = await User.find();

    const userMap = {};

    users.forEach(user => {
      userMap[user._id.toString()] = user;
    });

    const aiList = aiOrders.map(order => {

      const user =
      userMap[order.userId] || {};

      return {

        id: order._id,

        userId: order.userId,

        uid: user.uid || "",

        user:
        user.name ||
        order.username ||
        user.email ||
        "Unknown",

        email: user.email || "",

        type:
        order.assistantType === "AI Assistant"
        ? "AI Assistant"
       : "AI Quant",

        coin:
         order.strategy ||
         order.product ||
         "",

        amount: order.amount || 0,

        profit: order.profit || 0,

        rate: order.profitRate || 0,

        status: order.status || "",

        time:
        new Date(order.createdAt)
        .toLocaleString(),

        remark:
        (order.market || "") +
        " / " +
        (order.level || "")
      };
    });

    const tokenList =
    tokenOrders.map(order => {

      const user =
      userMap[order.userId] || {};

      return {

        id: order._id,

        userId: order.userId,

        uid: user.uid || "",

        user:
        user.name ||
        user.email ||
        "Unknown",

        email: user.email || "",

        type: "Token Yield",

        coin: order.planName || "",

        amount: order.amount || 0,

        profit: order.profit || 0,

        rate: order.rate || 0,

        status: order.status || "",

        time:
        new Date(order.createdAt)
        .toLocaleString(),

        remark:
        (order.days || 0) +
        " days"
      };
    });

    res.json({
      success: true,
      data: [...aiList, ...tokenList]
    });

  } catch (err) {

    console.log(err);

    res.json({
      success: false,
      message: "Failed to load trade orders"
    });

  }

});

/* AI Quant 收益配置 */

const aiQuantRates = {
  "Basic Quant": {
    week1: { min: 8, max: 10 },
    afterWeek1: { min: 3, max: 5 },
    weeklyLimit: 2,
    minBalance: 100,
    maxBalance: 9999
  },

  "Advanced Quant": {
    week1: { min: 8, max: 10 },
    afterWeek1: { min: 4, max: 6 },
    weeklyLimit: 3,
    minBalance: 10000,
    maxBalance: 49999
  },

  "Quantum Quant": {
    week1: { min: 8, max: 10 },
    afterWeek1: { min: 5, max: 7 },
    weeklyLimit: 4,
    minBalance: 50000,
    maxBalance: 99999
  },

  "Pro Quant": {
    week1: { min: 8, max: 10 },
    afterWeek1: { min: 6, max: 8 },
    weeklyLimit: 20,
    minBalance: 100000,
    maxBalance: 299999
  },

  "Institutional Quant": {
    week1: { min: 8, max: 10 },
    afterWeek1: { min: 7, max: 9 },
    weeklyLimit: 25,
    minBalance: 300000,
    maxBalance: 799999
  },

  "Elite Quant": {
    week1: { min: 8, max: 10 },
    afterWeek1: { min: 8, max: 10 },
    weeklyLimit: 30,
    minBalance: 800000,
    maxBalance: 999999
  },

  "Daily Quant": {
    week1: { min: 8, max: 10 },
    afterWeek1: { min: 8, max: 10 },
    weeklyLimit: 7,   // 或者按天1次也可改逻辑
    minBalance: 1000000,
    maxBalance: Infinity
  }
};


const aiMarkets = [
  { market: "Crypto", product: "BTC/USDT" },
  { market: "Crypto", product: "ETH/USDT" },
  { market: "Stock", product: "NVDA" },
  { market: "Stock", product: "TSLA" },
  { market: "Fund", product: "AI Tech Fund" },
  { market: "Futures", product: "Gold Futures" }
];

/* 管理员权限验证 */
function verifyAdmin(req, res, next){

  const token =
  req.headers["admin-token"];

  if(token !== ADMIN_TOKEN){

    return res.status(403).json({
      success:false,
      message:"Unauthorized Admin Access"
    });
  }

  next();
}

function getUserLevel(asset) {
  if (asset >= 1000000) return "Daily Quant";
  if (asset >= 800000) return "Elite Quant";
  if (asset >= 300000) return "Institutional Quant";
  if (asset >= 100000) return "Pro Quant";
  if (asset >= 50000) return "Quantum Quant";
  if (asset >= 10000) return "Advanced Quant";
  return "Basic Quant";
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;

}

function getAITradeCount(planName){

  if(planName === "Short-Term AI Quant"){
    return Math.floor(Math.random() * 3) + 4;
  }

  if(planName === "Mid-Term Smart Growth"){
    return Math.floor(Math.random() * 6) + 10;
  }

  if(planName === "Long-Term AI Wealth Plan"){
    return 30;
  }

  return Math.floor(Math.random() * 3) + 4;
}

function generateSubTrades(finalRate, strategy) {

  let count = 5;

if(strategy === "Short-Term AI Quant"){
  count =
  Math.floor(Math.random() * 3) + 4;
}

if(strategy === "Mid-Term Smart Growth"){
  count =
  Math.floor(Math.random() * 6) + 10;
}

if(strategy === "Long-Term AI Wealth Plan"){
  count = 30;
}

  const list = [];

  let total = 0;

  for (let i = 0; i < count - 1; i++) {

    const market =
    aiMarkets[
      Math.floor(Math.random() * aiMarkets.length)
    ];

    const rate =
    Number(
      randomBetween(-2.5, 4.5).toFixed(2)
    );

    total += rate;

    list.push({

      no: i + 1,

      market: market.market,

      product: market.product,

      direction:
      rate >= 0
      ? "Up"
      : "Down",

      rate: rate,

      result:
      rate >= 0
      ? "Profit"
      : "Loss"
    });
  }

  const lastMarket =
  aiMarkets[
    Math.floor(Math.random() * aiMarkets.length)
  ];

  const lastRate =
  Number(
    (finalRate - total).toFixed(2)
  );

  list.push({

    no: count,

    market: lastMarket.market,

    product: lastMarket.product,

    direction:
    lastRate >= 0
    ? "Up"
    : "Down",

    rate: lastRate,

    result:
    lastRate >= 0
    ? "Profit"
    : "Loss"
  });

  return list;
}

/* AI Assistant 方案交易 */

// 修复：添加用户认证
app.post("/api/ai/assistant/start", authenticateUser, async (req, res) => {

  try {

    const {
      amount,
      strategy
    } = req.body;

    const user = req.user;

    if (!user) {

      return res.json({
        success:false,
        message:"User not found"
      });
    }

    const asset =
    Number(user.asset || 0);

    const tradeAmount =
    Number(amount || 0);

    if (tradeAmount <= 0) {

      return res.json({
        success:false,
        message:"Please enter amount"
      });
    }

    if (tradeAmount > asset) {

      return res.json({
        success:false,
        message:"Insufficient balance"
      });
    }

    const now = new Date();
    const totalAsset =
Number(user.asset || 0)
+
Number(user.lockedAsset || 0);

const levelAsset =
Math.max(
  totalAsset,
  Number(user.vipAsset || 0)
);

const level =
getUserLevel(levelAsset);

const setting = aiQuantRates[level];

    /* 只有方案1限制次数 */

if(strategy === "Short-Term AI Quant"){

  const weekStart = new Date();

  weekStart.setDate(
    now.getDate() - now.getDay()
  );

  weekStart.setHours(0,0,0,0);

 const weeklyCount =
await AIQuantOrder.countDocuments({

  userId: user._id,

  strategy: "Short-Term AI Quant",

  level: level,

  assistantType: "AI Assistant",

  createdAt: {
    $gte: weekStart
  }

});

  if(weeklyCount >= setting.weeklyLimit){

    return res.json({
      success:false,
      message:
      "Weekly Short-Term AI Quant limit reached"
    });
  }
}

const firstOrder = await AIQuantOrder.findOne({
  userId: user._id,
  strategy: "Short-Term AI Quant",
  level: level,
assistantType: "AI Assistant"
}).sort({ createdAt: 1 });

let rateRange = setting.week1;

if(firstOrder){

  const firstTime = new Date(firstOrder.createdAt);

  const daysPassed =
  (now - firstTime) / (1000 * 60 * 60 * 24);

  if(daysPassed >= 7){
    rateRange = setting.afterWeek1;
  }
}

   let profitRate = 0;

if(strategy === "Short-Term AI Quant"){

  profitRate =
  Number(
    randomBetween(
      rateRange.min,
      rateRange.max
    ).toFixed(2)
  );
}

if(strategy === "Mid-Term Smart Growth"){

  profitRate =
  Number(
    randomBetween(12, 18).toFixed(2)
  );
}

if(strategy === "Long-Term AI Wealth Plan"){

  profitRate =
  Number(
    randomBetween(25, 40).toFixed(2)
  );
}

    const profit =
    Number(
      (
        tradeAmount *
        profitRate / 100
      ).toFixed(2)
    );

    let durationMinutes = 120;

if(strategy === "Short-Term AI Quant"){

  durationMinutes =
  Math.floor(Math.random() * 61) + 60;
}

if(strategy === "Mid-Term Smart Growth"){

  durationMinutes =
  Math.floor(Math.random() * 4321) + 10080;
}

if(strategy === "Long-Term AI Wealth Plan"){

  durationMinutes = 43200;
}

    const endTime =
    new Date(
      now.getTime() +
      durationMinutes * 60 * 1000
    );

    const subTrades =
generateSubTrades(
  profitRate,
  strategy
);

subTrades.forEach(item => {

  item.showAfterMinutes =
  Math.floor(
    Math.random() * (durationMinutes - 10)
  ) + 5;

  item.showTime =
  new Date(
    now.getTime() +
    item.showAfterMinutes * 60 * 1000
  );

});

subTrades.sort((a,b)=>{
  return new Date(a.showTime)
  - new Date(b.showTime);
});

const hour = new Date().getHours();

let availableMarkets = aiMarkets;

/* 晚上不交易股票和基金 */

if(hour >= 18 || hour < 9){

  availableMarkets =
  aiMarkets.filter(item =>

    item.market === "Crypto" ||

    item.market === "Futures"
  );
}
const selected =
availableMarkets[
  Math.floor(Math.random() * availableMarkets.length)
];


    const order =
    await AIQuantOrder.create({

      userId: user._id,

      username:
      user.name ||
      user.email,

      market:
      selected.market,

      product:
      selected.product,

      level: level,
       assistantType: "AI Assistant",

      strategy,

      amount:
      tradeAmount,

      profitRate,

      profit,

      finalRate:
      profitRate,

       subTrades,

      status:
      "Running",

      startTime:
      now,

      endTime
    });

    // 修复：正确锁定资金（从asset扣除，增加到lockedAsset）
    user.asset = asset - tradeAmount;
    user.balance = user.asset;
    user.lockedAsset = (user.lockedAsset || 0) + tradeAmount;

    if(!user.records){
      user.records = [];
    }

   user.records.push(
  `AI Assistant started: ${strategy}, locked ${tradeAmount} USDT`
);

    await user.save();

    res.json({
  success:true,
  message:"AI Assistant started",
  order,
  balance: user.asset
  });

  } catch(err){

    console.log(err);

    res.json({
      success:false,
      message:"AI Assistant failed"
    });
  }

});

/* 开始 AI Quant 交易 */

// 修复：添加用户认证
app.post("/api/ai/quant/start", authenticateUser, async (req, res) => {
  try {
    const { amount } = req.body;
    const user = req.user;

    if (!user) {
      return res.json({
        success: false,
        message: "User not found"
      });
    }

    const asset = Number(user.asset || 0);
    const tradeAmount = Number(amount || 0);

    if (tradeAmount <= 0) {
      return res.json({
        success: false,
        message: "Please enter trade amount"
      });
    }

    if (tradeAmount > asset) {
      return res.json({
        success: false,
        message: "Insufficient balance"
      });
    }

   const totalAsset =
  Number(user.asset || 0)
  +
  Number(user.lockedAsset || 0);

const levelAsset =
  Math.max(
    totalAsset,
    Number(user.vipAsset || 0)
  );

const level =
  getUserLevel(levelAsset);

const setting =
  aiQuantRates[level];

const now = new Date();

const weekStart = new Date();

weekStart.setDate(
  now.getDate() - now.getDay()
);

weekStart.setHours(0, 0, 0, 0);

const weeklyCount =
await AIQuantOrder.countDocuments({

  userId: user._id,

  level: { $ne: "AI Assistant" },

  createdAt: {
    $gte: weekStart
  }

});

if (
  weeklyCount >=
  setting.weeklyLimit
) {

  return res.json({
    success: false,
    message:
    "Weekly AI Quant trade limit reached"
  });

}

    const userFirstOrder = await AIQuantOrder.findOne({
    userId: user._id,
  level: level
   }).sort({ createdAt: 1 });
    let rateRange = setting.week1;

    if (userFirstOrder) {
      const firstTime = new Date(userFirstOrder.createdAt);
      const daysPassed = (now - firstTime) / (1000 * 60 * 60 * 24);

      if (daysPassed >= 7) {
        rateRange = setting.afterWeek1;
      }
    }

   const profitRate =
Number(
  randomBetween(
    rateRange.min,
    rateRange.max
  ).toFixed(2)
);

const subTrades =
generateSubTrades(profitRate);

const profit =
Number(
  (tradeAmount * profitRate / 100)
  .toFixed(2)
);

   const hour = new Date().getHours();

let availableMarkets = aiMarkets;

/* 晚上不交易股票和基金 */

if(hour >= 18 || hour < 9){

  availableMarkets =
  aiMarkets.filter(item =>

    item.market === "Crypto" ||

    item.market === "Futures"
  );
}

const selected =
availableMarkets[
  Math.floor(Math.random() * availableMarkets.length)
];


    const durationMinutes =
Math.floor(Math.random() * 61) + 60;

const endTime =
new Date(
  now.getTime() +
  durationMinutes * 60 * 1000
);

subTrades.forEach(item => {
  item.showAfterMinutes =
  Math.floor(
    Math.random() * (durationMinutes - 10)
  ) + 5;

  item.showTime =
  new Date(
    now.getTime() +
    item.showAfterMinutes * 60 * 1000
  );
});

subTrades.sort((a, b) => {
  return new Date(a.showTime) - new Date(b.showTime);
});

    const order = await AIQuantOrder.create({
      userId: user._id,
      username: user.name || user.username || user.email,
      market: selected.market,
      product: selected.product,
      level,
      amount: tradeAmount,
      profitRate,
       profit,

       finalRate: profitRate,

      subTrades,
      status: "Running",
      startTime: now,
      endTime
    });



// 修复：正确锁定资金（从asset扣除，增加到lockedAsset）
user.asset = asset - tradeAmount;
user.balance = user.asset;
user.lockedAsset = (user.lockedAsset || 0) + tradeAmount;

if(!user.records){
  user.records = [];
}

user.records.push(
  `AI Quant locked ${tradeAmount} USDT for trading`
);

await user.save();

res.json({
  success: true,
  message: "AI Quant trade started",
  order
});

  } catch (error) {
    console.log(error);

    res.json({
      success: false,
      message: "AI Quant trade failed"
    });
  }
});

/* 结算 AI Quant 交易 */

app.post("/api/ai/quant/settle/:id", authenticateUser, async (req, res) => {
  try {
    const order = await AIQuantOrder.findById(req.params.id);

    if (!order) {
      return res.json({
        success: false,
        message: "Order not found"
      });
    }

    if (order.userId.toString() !== req.userId) {
      return res.json({
        success: false,
        message: "Not your order"
      });
    }

    if (order.status === "Completed") {
      return res.json({
        success: false,
        message: "Order already completed"
      });
    }

    const now = new Date();

    if (now < new Date(order.endTime)) {
      return res.json({
        success: false,
        message: "Trade is still running"
      });
    }

    const user = req.user;

    if (!user) {
      return res.json({
        success: false,
        message: "User not found"
      });
    }

    // 修复：正确结算（解锁本金并返还利润）
    const amount = order.amount;
    const profit = order.profit;
    user.lockedAsset = Math.max(0, (user.lockedAsset || 0) - amount);
    user.asset = Number(user.asset || 0) + amount + profit;
    user.balance = user.asset;

    user.records.push(
      `AI Quant completed: +${profit.toFixed(2)} USDT`
    );

    order.status = "Completed";


    await user.save();
    await order.save();

    res.json({
      success: true,
      message: "AI Quant trade completed",
      order,
      balance: user.asset
    });

  } catch (error) {
    console.log(error);

    res.json({
      success: false,
      message: "Settlement failed"
    });
  }
});

/* 修改 AI 收益率 */

app.post("/api/admin/ai-quant/set-rate/:id", async (req, res) => {

  try {

    const { rate } = req.body;

    const order =
    await AIQuantOrder.findById(
      req.params.id
    );

    if (!order) {

      return res.json({
        success:false,
        message:"Order not found"
      });
    }

    if (order.status !== "Running") {

      return res.json({
        success:false,
        message:"Only running orders can be edited"
      });
    }

    const finalRate =
    Number(rate || 0);

    const profit =
    Number(
      (
        Number(order.amount || 0)
        *
        finalRate
        / 100
      ).toFixed(2)
    );

    order.profitRate =
    finalRate;

    order.finalRate =
    finalRate;

    order.profit =
    profit;

    order.subTrades =
generateSubTrades(
  finalRate,
  order.strategy
);

    await order.save();

    res.json({
      success:true,
      order
    });

  } catch(err) {

    console.log(err);

    res.json({
      success:false,
      message:"Set rate failed"
    });
  }

});

/* 获取 AI Quant 订单 */

app.get("/api/ai/quant/orders/:userId", authenticateUser, async (req, res) => {
  if (req.params.userId !== req.userId) {
    return res.json({
      success: false,
      message: "Access denied"
    });
  }
  const orders = await AIQuantOrder.find({
    userId: req.params.userId
  }).sort({ createdAt: -1 });

  res.json({
    success: true,
    data: orders
  });
});

/* 交易 */
app.get("/api/trades", async (req, res) => {
  const trades = await Trade.find();
  res.json({ success: true, data: trades });
});

app.put("/api/trades/:id/start", async (req, res) => {
  const trade = await Trade.findOneAndUpdate(
    { id: req.params.id },
    { status: "运行中" },
    { new: true }
  );

  res.json({ success: true, data: trade });
});

app.put("/api/trades/:id/pause", async (req, res) => {
  const trade = await Trade.findOneAndUpdate(
    { id: req.params.id },
    { status: "暂停" },
    { new: true }
  );

  res.json({ success: true, data: trade });
});

app.put("/api/trades/:id/close", async (req, res) => {
  const trade = await Trade.findOneAndUpdate(
    { id: req.params.id },
    { status: "已结束" },
    { new: true }
  );

  res.json({ success: true, data: trade });
});

/* 客服工单 */
app.get("/api/tickets", (req, res) => {
  res.json({
    success: true,
    data: tickets
  });
});

app.post("/api/tickets", (req, res) => {
  const { user, email, type, priority, message } = req.body;

  const newTicket = {
    id: "TCK" + Date.now(),
    user,
    email,
    type,
    priority,
    status: "待处理",
    message,
    reply: "",
    time: new Date().toLocaleString()
  };

  tickets.push(newTicket);

  res.json({
    success: true,
    data: newTicket
  });
});

app.post("/api/token-yield/start", authenticateUser, async (req, res) => {

  try{

    const { planName, amount, days, rate } = req.body;
    const user = req.user;

    if(!user){
      return res.json({
        success:false,
        message:"User not found"
      });
    }

    const asset = Number(user.asset || 0);
    const investAmount = Number(amount || 0);

    if(!investAmount || investAmount <= 0){
      return res.json({
        success:false,
        message:"Please enter amount"
      });
    }

    if(investAmount > asset){
      return res.json({
        success:false,
        message:"Insufficient balance"
      });
    }

    // 修复：正确锁定资金
    user.asset = asset - investAmount;
    user.balance = user.asset;
    user.lockedAsset = (user.lockedAsset || 0) + investAmount;
    user.tokenLocked = (user.tokenLocked || 0) + investAmount;

    const profit =
    investAmount * (Number(rate || 0) / 100);

    const now = new Date();

    const endTime = new Date(
      now.getTime() +
      Number(days || 7) * 24 * 60 * 60 * 1000
    );

    const order = await TokenYieldOrder.create({
      userId: user._id,
      planName,
      amount: investAmount,
      days: Number(days || 7),
      rate: Number(rate || 0),
      profit,
      status: "Running",
      startTime: now,
      endTime
    });

    if(!user.records){
      user.records = [];
    }

    user.records.push(
      `Token Yield Locked ${investAmount} USDT`
    );

    await user.save();

    res.json({
      success:true,
      order,
      balance: user.asset
    });

  }catch(err){

    console.log(err);

    res.json({
      success:false,
      message:"Server error"
    });
  }

});

/* 提现申请：提交后立即扣除余额 */
// 修复：添加用户认证
app.post("/api/withdraw", authenticateUser, async (req, res) => {
  try {

    console.log("Withdraw body:", req.body);
    const { address, amount, network } = req.body;
    const user = req.user;

    const withdrawAmount = Number(amount || 0);

    if (!user) {
      return res.json({
        success: false,
        message: "User not found"
      });
    }

    if (withdrawAmount <= 0) {
      return res.json({
        success: false,
        message: "Invalid amount"
      });
    }

    if (withdrawAmount > Number(user.asset || 0)) {
      return res.json({
        success: false,
        message: "Insufficient balance"
      });
    }

    user.asset = Number(user.asset || 0) - withdrawAmount;
    user.balance = user.asset;

    if (!user.records) {
      user.records = [];
    }

    user.records.push(
      `Withdrawal submitted -${withdrawAmount} USDT`
    );

    await user.save();

    const withdraw = {
      id: Date.now(),
      userId: user._id,
      uid: user.uid,
      email: user.email,
      address,
      amount: withdrawAmount,
      network,
      time: new Date().toLocaleString(),
      status: "Pending"
    };

    await Withdrawal.create(withdraw);

    res.json({
      success: true,
      data: withdraw,
      balance: user.asset
    });

  } catch (err) {
    console.log(err);

    res.json({
      success: false,
      message: "Withdrawal failed"
    });
  }
});

/* 获取提现列表 */
app.get("/api/withdrawals", async (req, res) => {

  const list =
    await Withdrawal.find()
    .sort({ createdAt: -1 });

  res.json(list);

});

/* 更新提现状态：拒绝时自动退款 */
app.post(
  "/api/withdraw/status",
  verifyAdmin,
  async (req, res) => {
  try {

    const { id, status } = req.body;

    const item =
    await Withdrawal.findById(id);

    if (!item) {

      return res.json({
        success: false,
        message: "提现记录不存在"
      });
    }

    if (
      item.status === "Approved" ||
      item.status === "Rejected"
    ) {

      return res.json({
        success: false,
        message: "该提现已审核"
      });
    }

    /* 如果拒绝提现 -> 自动退款 */

    if (status === "Rejected") {

      const user =
      await User.findById(item.userId);

      if (user) {

        const refundAmount =
        Number(item.amount || 0);

        user.asset =
        Number(user.asset || 0)
        + refundAmount;

        user.balance =
        user.asset;

        if (!user.records) {
          user.records = [];
        }

        user.records.push(
          `Withdrawal rejected, refunded +${refundAmount} USDT`
        );

        await user.save();
      }
    }

    /* 更新状态 */

    item.status = status;

    await item.save();

    res.json({
      success: true,
      data: item
    });

  } catch (err) {

    console.log(err);

    res.json({
      success: false,
      message: "更新提现状态失败"
    });
  }
});

// ==================== 忘记密码功能 ====================
const crypto = require('crypto');

// 存储重置令牌（生产环境建议使用Redis或数据库）
const resetTokens = new Map();

// 清理过期令牌的定时任务（每小时执行一次）
setInterval(() => {
    const now = Date.now();
    for (const [token, data] of resetTokens.entries()) {
        if (now > data.expiresAt) {
            resetTokens.delete(token);
        }
    }
}, 3600000);

// 发送重置链接
app.post("/api/forgot-password", async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.json({ success: false, message: "Email is required" });
        }
        
        // 简单的邮箱格式验证
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.json({ success: false, message: "Please enter a valid email address" });
        }
        
        const user = await User.findOne({ email });
        
        // 为了安全，即使用户不存在也返回成功（防止邮箱枚举攻击）
        if (!user) {
            return res.json({ 
                success: true, 
                message: "If the email exists, a reset link has been sent" 
            });
        }
        
        // 生成重置令牌
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = Date.now() + 3600000; // 1小时后过期
        
        resetTokens.set(token, {
            userId: user._id,
            email: user.email,
            expiresAt: expiresAt
        });
        
        // 构建重置链接
        const resetUrl = `${req.protocol}://${req.get('host')}/reset_password.html?token=${token}`;
        
        // 开发环境打印日志，生产环境应发送邮件
        console.log(`========== 密码重置请求 ==========`);
        console.log(`用户邮箱: ${email}`);
        console.log(`重置令牌: ${token}`);
        console.log(`重置链接: ${resetUrl}`);
        console.log(`令牌有效期: 1小时`);
        console.log(`==================================`);
        
        // TODO: 生产环境需要配置邮件服务发送邮件
        // 例如使用 nodemailer 发送邮件
        
        res.json({ 
            success: true, 
            message: "If the email exists, a reset link has been sent",
            // 开发环境返回token方便测试，生产环境请删除这一行
            devToken: token
        });
        
    } catch (error) {
        console.error("Forgot password error:", error);
        res.json({ success: false, message: "Server error, please try again later" });
    }
});

// 验证重置令牌
app.get("/api/verify-reset-token", async (req, res) => {
    try {
        const { token } = req.query;
        
        if (!token) {
            return res.json({ success: false, message: "Token is required" });
        }
        
        const tokenData = resetTokens.get(token);
        
        if (!tokenData) {
            return res.json({ success: false, message: "Invalid or expired token" });
        }
        
        if (Date.now() > tokenData.expiresAt) {
            resetTokens.delete(token);
            return res.json({ success: false, message: "Token has expired" });
        }
        
        res.json({ 
            success: true, 
            message: "Token is valid",
            email: tokenData.email
        });
        
    } catch (error) {
        console.error("Verify token error:", error);
        res.json({ success: false, message: "Server error" });
    }
});

// 管理员登录接口
app.post("/api/admin/login", async (req, res) => {
    const { username, password } = req.body;
    
    // 验证用户名和密码
    if (username === "admin" && password === "Admin123456") {
        res.json({
            success: true,
            message: "Login successful",
            token: "admin_" + Date.now()
        });
    } else {
        res.status(401).json({
            success: false,
            message: "Invalid username or password"
        });
    }
});

// 重置密码
app.post("/api/reset-password", async (req, res) => {
    try {
        const { token, newPassword, confirmPassword } = req.body;
        
        if (!token || !newPassword) {
            return res.json({ success: false, message: "Token and new password are required" });
        }
        
        if (newPassword.length < 6) {
            return res.json({ success: false, message: "Password must be at least 6 characters" });
        }
        
        if (newPassword !== confirmPassword) {
            return res.json({ success: false, message: "Passwords do not match" });
        }
        
        const tokenData = resetTokens.get(token);
        
        if (!tokenData) {
            return res.json({ success: false, message: "Invalid or expired token" });
        }
        
        if (Date.now() > tokenData.expiresAt) {
            resetTokens.delete(token);
            return res.json({ success: false, message: "Token has expired" });
        }
        
        const user = await User.findById(tokenData.userId);
        if (!user) {
            return res.json({ success: false, message: "User not found" });
        }
        
        // 更新密码
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();
        
        // 删除已使用的令牌
        resetTokens.delete(token);
        
        // 添加记录
        user.records.push({ 
            message: "Password reset successfully", 
            timestamp: new Date() 
        });
        await user.save();
        
        res.json({ success: true, message: "Password has been reset successfully" });
        
    } catch (error) {
        console.error("Reset password error:", error);
        res.json({ success: false, message: "Server error, please try again later" });
    }
});

/* Socket 客服 */

let aiSupportEnabled = true;
let serviceOnline = false;

async function getAIReply(message) {

  return "Hello, AI support has received your message. A customer service agent will assist you shortly.";
}

io.on("connection", (socket) => {

  console.log("客服系统用户已连接");

  socket.on("service_online", () => {

    serviceOnline = true;

    console.log("人工客服在线");
  });

  socket.on("service_offline", () => {

    serviceOnline = false;

    console.log("人工客服离线");
  });

  socket.on("set_ai_support", (value) => {

    aiSupportEnabled = value;

    console.log("AI客服状态:", aiSupportEnabled);
  });

  socket.on("send_message", async (data) => {

    console.log("收到消息:", data);

    /* 保存用户消息 */

    const savedMessage =
    await ChatMessage.create({

      user: data.user,

      username:
      data.username ||
      data.userName ||
      "",

      uid:
      data.uid || "",

      serviceId:
      data.serviceId || "",

      sender:
      data.sender,

      type:
      data.type || "text",

      message:
      data.message || "",

      imageUrl:
      data.imageUrl || "",

      time:
     new Date().toLocaleTimeString()
    });

    /* 广播用户消息 */

    io.emit("receive_message", {

      id: savedMessage._id,

      user: savedMessage.user,

      sender: savedMessage.sender,

      type: savedMessage.type,

      message: savedMessage.message,

      imageUrl: savedMessage.imageUrl,

      username: savedMessage.username,

      uid: savedMessage.uid,

      serviceId: savedMessage.serviceId,

      time: savedMessage.time

    });

    /* AI 自动回复 */

    if (

      data.sender === "user" &&

      aiSupportEnabled === true &&

      serviceOnline === false

    ) {

      setTimeout(async () => {

        const aiReply =
        await getAIReply(data.message);

        /* 保存AI回复 */

        const savedAIMessage =
        await ChatMessage.create({

          user: data.user,

          username:
          data.username ||
          data.userName ||
          "",

          uid:
          data.uid || "",

          serviceId: "",

          sender: "service",

          type: "text",

          message: aiReply,

          imageUrl: "",

          time:
          data.time ||
          new Date().toLocaleTimeString()
        });

        /* 广播AI回复 */

        io.emit("receive_message", {

          id: savedAIMessage._id,

          user: savedAIMessage.user,

          sender: savedAIMessage.sender,

          type: savedAIMessage.type,

          message: savedAIMessage.message,

          imageUrl: savedAIMessage.imageUrl,

          username: savedAIMessage.username,

          uid: savedAIMessage.uid,

          serviceId: savedAIMessage.serviceId,

          time: savedAIMessage.time

        });

      }, 800);
    }
  });

  socket.on("disconnect", () => {

    console.log("客服系统用户已断开");
  });

});

async function settleExpiredTokenYieldOrders(){

  try{

    const now = new Date();

    const orders = await TokenYieldOrder.find({
      status: "Running",
      endTime: { $lte: now }
    });

    for(const order of orders){

      const user = await User.findById(order.userId);

      if(!user) continue;

      const amount = Number(order.amount || 0);
      const profit = Number(order.profit || 0);

      // 修复：正确结算
      user.lockedAsset = Math.max(0, (user.lockedAsset || 0) - amount);
      user.asset = Number(user.asset || 0) + amount + profit;
      user.balance = user.asset;

      user.tokenLocked = Number(user.tokenLocked || 0) - amount;

      user.totalProfit = Number(user.totalProfit || 0) + profit;
      user.tokenProfit = Number(user.tokenProfit || 0) + profit;
      user.tokenTodayProfit = Number(user.tokenTodayProfit || 0) + profit;

      if(!user.records){
        user.records = [];
      }

      user.records.push(
        `Token Yield completed +${profit.toFixed(2)} USDT`
      );

      order.status = "Completed";

      await user.save();
      await order.save();
    }

  }catch(err){
    console.log("Settle Token Yield error:", err);
  }
}

async function settleExpiredAIQuantOrders(){

  try{

    const now = new Date();

    const orders = await AIQuantOrder.find({
      status: "Running",
      endTime: { $lte: now }
    });

    for(const order of orders){

      const user = await User.findById(order.userId);

      if(!user) continue;

      const amount = Number(order.amount || 0);
      const profit = Number(order.profit || 0);

      // 修复：正确结算
      user.lockedAsset = Math.max(0, (user.lockedAsset || 0) - amount);
      user.asset = Number(user.asset || 0) + amount + profit;
      user.balance = user.asset;

      user.totalProfit = Number(user.totalProfit || 0) + profit;

      if(!user.records){
        user.records = [];
      }

      user.records.push(
  order.assistantType === "AI Assistant"
? `AI Assistant completed +${profit.toFixed(2)} USDT`
: `AI Quant completed +${profit.toFixed(2)} USDT`

);
      order.status = "Completed";

      await user.save();
      await order.save();
    }

  }catch(err){
    console.log("Settle AI Quant error:", err);
  }
}

settleExpiredAIQuantOrders();

setInterval(
  settleExpiredAIQuantOrders,
  60000
);

settleExpiredTokenYieldOrders();

setInterval(
  settleExpiredTokenYieldOrders,
  60000
);


server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});