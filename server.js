require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const OpenAI = require("openai").default;
const bcrypt = require("bcryptjs");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");

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

  createdAt: {
    type: Date,
    default: Date.now
  }

});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/api/users/:id", async (req, res) => {
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

        const lastUser =
         await User.findOne().sort({ uid: -1 });

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


app.put("/api/users/:id/restore", async (req, res) => {
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

app.post("/api/kyc/upload", upload.single("file"), (req, res) => {

  const data = {
    id: Date.now(),
    type: req.body.type,
    username: req.body.username || "Marjorie AI",
    filename: req.file.filename,
    fileUrl: "/uploads/" + req.file.filename,
    status: "Pending",
    time: new Date().toLocaleString()
  };

  kycSubmissions.push(data);

  res.json({
    success: true,
    message: "KYC uploaded successfully",
    data
  });

});

app.get("/api/kyc/list", (req, res) => {
  res.json(kycSubmissions);
});

app.use("/uploads", express.static("uploads"));

const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

mongoose.connect("mongodb://127.0.0.1:27017/ai_trading_admin")
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log("MongoDB error:", err));

const User = mongoose.model("User", new mongoose.Schema({
  
  uid: Number, 
  name: String,
  wallet: String,
  asset: Number,
  status: { type: String, default: "正常" },
  email: String,
  password: String,
  phone: String,
  register: String,
  ip: String,
  kyc: { type: String, default: "未审核" },
  records: [String],

totalProfit: {
  type: Number,
  default: 0
},

lockedAsset: {
  type: Number,
  default: 0
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
  res.redirect("/user_management.html");
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

app.put("/api/users/:id/recharge", async (req, res) => {
  const amount = Number(req.body.amount);

  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({ success: false, message: "用户不存在" });
  }

  user.asset += amount;
  user.records.push(`充值 ${amount} USDT`);

  stats.todayRecharge += amount;
  stats.monthRecharge += amount;

  await user.save();
  res.json({ success: true, data: user, stats });
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

app.put("/api/users/:id/freeze", async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({ success: false, message: "用户不存在" });
  }

  user.status = user.status === "冻结" ? "正常" : "冻结";
  user.records.push(user.status === "冻结" ? "账户冻结" : "账户解冻");

  await user.save();
  res.json({ success: true, data: user });
});

app.put("/api/users/:id/blacklist", async (req, res) => {
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
  amount: Number,
  profitRate: Number,
  profit: Number,
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

/* AI Quant 收益配置 */

const aiQuantRates = {
  "Basic Quant": {
    week1: { min: 2, max: 5 },
    afterWeek1: { min: 0.5, max: 1.5 },
    weeklyLimit: 2,
    minBalance: 100,
    maxBalance: 9999
  },

  "Advanced Quant": {
    week1: { min: 3, max: 6 },
    afterWeek1: { min: 1, max: 2.5 },
    weeklyLimit: 3,
    minBalance: 10000,
    maxBalance: 49999
  },

  "Quantum Quant": {
    week1: { min: 4, max: 8 },
    afterWeek1: { min: 1.5, max: 3.5 },
    weeklyLimit: 4,
    minBalance: 50000,
    maxBalance: 99999
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

function getUserLevel(asset) {
  if (asset >= 50000) return "Quantum Quant";
  if (asset >= 10000) return "Advanced Quant";
  return "Basic Quant";
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

/* 开始 AI Quant 交易 */

app.post("/api/ai/quant/start", async (req, res) => {
  try {
    const { userId, amount } = req.body;

    const user = await User.findById(userId);

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

    const level = getUserLevel(asset);
    const setting = aiQuantRates[level];

    const now = new Date();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayOrder = await AIQuantOrder.findOne({
      userId,
      createdAt: { $gte: todayStart }
    });

    if (todayOrder) {
      return res.json({
        success: false,
        message: "You can trade again tomorrow"
      });
    }

    const weekStart = new Date();
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const weeklyCount = await AIQuantOrder.countDocuments({
      userId,
      createdAt: { $gte: weekStart }
    });

    if (weeklyCount >= setting.weeklyLimit) {
      return res.json({
        success: false,
        message: "Weekly AI Quant trade limit reached"
      });
    }

    const userFirstOrder = await AIQuantOrder.findOne({ userId }).sort({ createdAt: 1 });

    let rateRange = setting.week1;

    if (userFirstOrder) {
      const firstTime = new Date(userFirstOrder.createdAt);
      const daysPassed = (now - firstTime) / (1000 * 60 * 60 * 24);

      if (daysPassed >= 7) {
        rateRange = setting.afterWeek1;
      }
    }

    const profitRate = randomBetween(rateRange.min, rateRange.max);
    const profit = tradeAmount * profitRate / 100;

    const selected =
      aiMarkets[Math.floor(Math.random() * aiMarkets.length)];

    const endTime = new Date(now.getTime() + 30 * 60 * 1000);

    const order = await AIQuantOrder.create({
      userId,
      username: user.name || user.username || user.email,
      market: selected.market,
      product: selected.product,
      level,
      amount: tradeAmount,
      profitRate,
      profit,
      status: "Running",
      startTime: now,
      endTime
    });


// 扣除交易本金
user.asset = asset - tradeAmount;
user.balance = user.asset;

if(!user.records){
  user.records = [];
}

user.records.push(
  `AI Quant locked ${tradeAmount} USDT for trading`
);

await user.save();

    user.records.push(
      `AI Quant started: ${selected.product}, amount ${tradeAmount} USDT`
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

app.post("/api/ai/quant/settle/:id", async (req, res) => {
  try {
    const order = await AIQuantOrder.findById(req.params.id);

    if (!order) {
      return res.json({
        success: false,
        message: "Order not found"
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

    const user = await User.findById(order.userId);

    if (!user) {
      return res.json({
        success: false,
        message: "User not found"
      });
    }

    user.asset = Number(user.asset || 0) + Number(order.profit || 0);

    user.records.push(
      `AI Quant completed: +${order.profit.toFixed(2)} USDT`
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

/* 获取 AI Quant 订单 */

app.get("/api/ai/quant/orders/:userId", async (req, res) => {
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

app.post("/api/token-yield/start", async (req, res) => {

  try{

    const { userId, planName, amount, days, rate } = req.body;

    const user = await User.findById(userId);

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

    user.asset = asset - investAmount;
    user.balance = user.asset;

    user.lockedAsset =
    Number(user.lockedAsset || 0) + investAmount;

    user.tokenLocked =
    Number(user.tokenLocked || 0) + investAmount;

    const profit =
    investAmount * (Number(rate || 0) / 100);

    const now = new Date();

    const endTime = new Date(
      now.getTime() +
      Number(days || 7) * 24 * 60 * 60 * 1000
    );

    const order = await TokenYieldOrder.create({
      userId,
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
      order
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
app.post("/api/withdraw", async (req, res) => {
  try {

    console.log("Withdraw body:", req.body);
    const { userId, uid, email, address, amount, network } = req.body;

    const withdrawAmount = Number(amount || 0);

    if (!userId) {
      return res.json({
        success: false,
        message: "User ID missing"
      });
    }

    const user = await User.findById(userId);

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
      userId,
      uid,
      email,
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

/* 更新提现状态：MongoDB版，只改状态，不扣款 */
app.post("/api/withdraw/status", async (req, res) => {
  try {
    const { id, status } = req.body;

    const item = await Withdrawal.findById(id);

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


/* Socket 客服 */

let aiSupportEnabled = true;
let serviceOnline = false;

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

   io.emit("receive_message", {

     id: Date.now(),

     user: data.user,

     sender: data.sender,

     type: data.type || "text",

     message: data.message || "",

    imageUrl: data.imageUrl || "",

     username: data.username || "",

     uid: data.uid || "",

    serviceId: data.serviceId || "",

     time: data.time || new Date().toLocaleTimeString()

  });

    if (

      data.sender === "user" &&

      aiSupportEnabled === true &&

      serviceOnline === false

    ) {

      setTimeout(async () => {

        const aiReply =
        await getAIReply(data.message);

        io.emit("receive_message", {

          id: Date.now() + 1,

          user: data.user,

          sender: "service",

          message: aiReply,

          time: new Date().toLocaleTimeString()

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

      user.asset = Number(user.asset || 0) + amount + profit;
      user.balance = user.asset;

      user.lockedAsset = Number(user.lockedAsset || 0) - amount;
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

      user.asset = Number(user.asset || 0) + amount + profit;
      user.balance = user.asset;

      user.totalProfit = Number(user.totalProfit || 0) + profit;

      if(!user.records){
        user.records = [];
      }

      user.records.push(
        `AI Quant completed +${profit.toFixed(2)} USDT`
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


