var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
var import_dotenv = __toESM(require("dotenv"), 1);
import_dotenv.default.config();
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json({ limit: "10mb" }));
  app.use((req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    if (req.path.endsWith(".ts") || req.path.endsWith(".tsx")) {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    }
    next();
  });
  const JOIN_REQUESTS_FILE = import_path.default.join(process.cwd(), "join_requests.json");
  const ADMINS_FILE = import_path.default.join(process.cwd(), "admins.json");
  const CONFIG_FILE = import_path.default.join(process.cwd(), "app_config.json");
  const CHAT_MESSAGES_FILE = import_path.default.join(process.cwd(), "chat_messages.json");
  const COMPLAINTS_FILE = import_path.default.join(process.cwd(), "public_complaints.json");
  const getChatMessages = async () => {
    try {
      if (!import_fs.default.existsSync(CHAT_MESSAGES_FILE)) return [];
      const data = await import_fs.default.promises.readFile(CHAT_MESSAGES_FILE, "utf8");
      return JSON.parse(data);
    } catch (err) {
      console.error("Error reading chat messages:", err);
      return [];
    }
  };
  const saveChatMessages = async (msgs) => {
    try {
      await import_fs.default.promises.writeFile(CHAT_MESSAGES_FILE, JSON.stringify(msgs, null, 2), "utf8");
    } catch (err) {
      console.error("Error writing chat messages:", err);
    }
  };
  const getComplaints = async () => {
    try {
      if (!import_fs.default.existsSync(COMPLAINTS_FILE)) return [];
      const data = await import_fs.default.promises.readFile(COMPLAINTS_FILE, "utf8");
      return JSON.parse(data);
    } catch (err) {
      console.error("Error reading complaints:", err);
      return [];
    }
  };
  const saveComplaints = async (complaints) => {
    try {
      await import_fs.default.promises.writeFile(COMPLAINTS_FILE, JSON.stringify(complaints, null, 2), "utf8");
    } catch (err) {
      console.error("Error writing complaints:", err);
    }
  };
  const getConfig = async () => {
    try {
      if (!import_fs.default.existsSync(CONFIG_FILE)) {
        return null;
      }
      const data = await import_fs.default.promises.readFile(CONFIG_FILE, "utf8");
      return JSON.parse(data);
    } catch (err) {
      console.error("Error reading config in server:", err);
      return null;
    }
  };
  const getAdmins = async () => {
    try {
      if (!import_fs.default.existsSync(ADMINS_FILE)) {
        const defaultAdmins = [
          {
            email: "waheedsamaha8@gmail.com",
            password: "admin123",
            name: "\u0648\u062D\u064A\u062F \u0633\u0645\u0627\u062D\u0629 (\u0631\u0626\u064A\u0633 \u0627\u0644\u0627\u062A\u062D\u0627\u062F)",
            phone: "",
            role: "ADMIN",
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          }
        ];
        await import_fs.default.promises.writeFile(ADMINS_FILE, JSON.stringify(defaultAdmins, null, 2), "utf8");
        return defaultAdmins;
      }
      const data = await import_fs.default.promises.readFile(ADMINS_FILE, "utf8");
      const parsed = JSON.parse(data);
      if (!parsed.some((a) => a.email.toLowerCase().trim() === "waheedsamaha8@gmail.com")) {
        parsed.unshift({
          email: "waheedsamaha8@gmail.com",
          password: "admin123",
          name: "\u0648\u062D\u064A\u062F \u0633\u0645\u0627\u062D\u0629 (\u0631\u0626\u064A\u0633 \u0627\u0644\u0627\u062A\u062D\u0627\u062F)",
          phone: "",
          role: "ADMIN",
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        await import_fs.default.promises.writeFile(ADMINS_FILE, JSON.stringify(parsed, null, 2), "utf8");
      }
      return parsed;
    } catch (err) {
      console.error("Error reading admins:", err);
      return [
        {
          email: "waheedsamaha8@gmail.com",
          password: "admin123",
          name: "\u0648\u062D\u064A\u062F \u0633\u0645\u0627\u062D\u0629 (\u0631\u0626\u064A\u0633 \u0627\u0644\u0627\u062A\u062D\u0627\u062F)",
          phone: "",
          role: "ADMIN"
        }
      ];
    }
  };
  const saveAdmins = async (adminsList) => {
    try {
      await import_fs.default.promises.writeFile(ADMINS_FILE, JSON.stringify(adminsList, null, 2), "utf8");
    } catch (err) {
      console.error("Error writing admins:", err);
    }
  };
  const getJoinRequests = async () => {
    try {
      if (!import_fs.default.existsSync(JOIN_REQUESTS_FILE)) {
        return [];
      }
      const data = await import_fs.default.promises.readFile(JOIN_REQUESTS_FILE, "utf8");
      return JSON.parse(data);
    } catch (err) {
      console.error("Error reading join requests:", err);
      return [];
    }
  };
  const saveJoinRequests = async (requests) => {
    try {
      await import_fs.default.promises.writeFile(JOIN_REQUESTS_FILE, JSON.stringify(requests, null, 2), "utf8");
    } catch (err) {
      console.error("Error writing join requests:", err);
    }
  };
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: (/* @__PURE__ */ new Date()).toISOString() });
  });
  app.get("/api/config", async (req, res) => {
    try {
      const config = await getConfig();
      res.json(config || {});
    } catch (err) {
      res.status(500).json({ error: "Failed to read config" });
    }
  });
  app.post("/api/config", async (req, res) => {
    try {
      const config = req.body;
      await import_fs.default.promises.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
      res.json({ success: true, message: "Config saved successfully" });
    } catch (err) {
      console.error("Error saving config in server:", err);
      res.status(500).json({ error: "Failed to save config" });
    }
  });
  app.get("/api/chat", async (req, res) => {
    try {
      const msgs = await getChatMessages();
      res.json(msgs);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/chat", async (req, res) => {
    try {
      const { message } = req.body;
      if (!message || !message.id) {
        return res.status(400).json({ error: "Message object required" });
      }
      const msgs = await getChatMessages();
      const filtered = msgs.filter((m) => m.id !== message.id);
      filtered.push(message);
      await saveChatMessages(filtered);
      res.json({ success: true, messages: filtered });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/chat/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const msgs = await getChatMessages();
      const filtered = msgs.filter((m) => m.id !== id);
      await saveChatMessages(filtered);
      res.json({ success: true, messages: filtered });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/chat/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { text } = req.body;
      const msgs = await getChatMessages();
      const updated = msgs.map((m) => m.id === id ? { ...m, text } : m);
      await saveChatMessages(updated);
      res.json({ success: true, messages: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/complaints", async (req, res) => {
    try {
      const list = await getComplaints();
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/complaints", async (req, res) => {
    try {
      const { complaint } = req.body;
      if (!complaint || !complaint.id) {
        return res.status(400).json({ error: "Complaint object required" });
      }
      const list = await getComplaints();
      const filtered = list.filter((c) => c.id !== complaint.id);
      filtered.unshift(complaint);
      await saveComplaints(filtered);
      res.json({ success: true, complaints: filtered });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/complaints/:id/comments", async (req, res) => {
    try {
      const { id } = req.params;
      const { comment } = req.body;
      const list = await getComplaints();
      const updated = list.map((c) => {
        if (c.id === id) {
          const comments = c.comments || [];
          return { ...c, comments: [...comments, comment] };
        }
        return c;
      });
      await saveComplaints(updated);
      res.json({ success: true, complaints: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/complaints/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const list = await getComplaints();
      const filtered = list.filter((c) => c.id !== id);
      await saveComplaints(filtered);
      res.json({ success: true, complaints: filtered });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/join-requests", async (req, res) => {
    try {
      const { flatNumber, residentType, ownerName, ownerPhone, tenantName, tenantPhone, email, password } = req.body;
      if (!flatNumber || !residentType || !email || !password) {
        return res.status(400).json({ error: "\u0627\u0644\u0631\u062C\u0627\u0621 \u0645\u0644\u0621 \u0643\u0627\u0641\u0629 \u0627\u0644\u062D\u0642\u0648\u0644 \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629." });
      }
      const requests = await getJoinRequests();
      if (requests.some((r) => r.email.toLowerCase().trim() === email.toLowerCase().trim())) {
        return res.status(400).json({ error: "\u0647\u0630\u0627 \u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0645\u0633\u062C\u0644 \u0628\u0627\u0644\u0641\u0639\u0644 \u0623\u0648 \u0644\u062F\u064A\u0647 \u0637\u0644\u0628 \u0627\u0646\u0636\u0645\u0627\u0645 \u0642\u0627\u0626\u0645." });
      }
      const newRequest = {
        id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        flatNumber: parseInt(flatNumber),
        residentType,
        ownerName: ownerName || "",
        ownerPhone: ownerPhone || "",
        tenantName: tenantName || "",
        tenantPhone: tenantPhone || "",
        email: email.toLowerCase().trim(),
        password,
        status: "PENDING",
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      requests.push(newRequest);
      await saveJoinRequests(requests);
      res.json({ success: true, message: "\u062A\u0645 \u0625\u0631\u0633\u0627\u0644 \u0637\u0644\u0628 \u0627\u0644\u0627\u0646\u0636\u0645\u0627\u0645 \u0628\u0646\u062C\u0627\u062D \u0648\u0647\u0648 \u0642\u064A\u062F \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0648\u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F \u062D\u0627\u0644\u064A\u0627\u064B \u0645\u0646 \u0642\u0628\u0644 \u0631\u0626\u064A\u0633 \u0627\u0644\u0627\u062A\u062D\u0627\u062F." });
    } catch (err) {
      console.error("Error in POST /api/join-requests:", err);
      res.status(500).json({ error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u062F\u0627\u062E\u0644\u064A \u0641\u064A \u0627\u0644\u062E\u0627\u062F\u0645 \u0623\u062B\u0646\u0627\u0621 \u0625\u0631\u0633\u0627\u0644 \u0637\u0644\u0628 \u0627\u0644\u0627\u0646\u0636\u0645\u0627\u0645." });
    }
  });
  app.get("/api/join-requests", async (req, res) => {
    try {
      const requests = await getJoinRequests();
      res.json(requests);
    } catch (err) {
      console.error("Error in GET /api/join-requests:", err);
      res.status(500).json({ error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u0623\u062B\u0646\u0627\u0621 \u062A\u062D\u0645\u064A\u0644 \u0637\u0644\u0628\u0627\u062A \u0627\u0644\u0627\u0646\u0636\u0645\u0627\u0645." });
    }
  });
  app.post("/api/join-requests/approve", async (req, res) => {
    try {
      const { id, status } = req.body;
      if (!id || !["APPROVED", "DECLINED"].includes(status)) {
        return res.status(400).json({ error: "\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629 \u0644\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0623\u0648 \u0627\u0644\u0631\u0641\u0636." });
      }
      const requests = await getJoinRequests();
      const requestIndex = requests.findIndex((r) => r.id === id);
      if (requestIndex === -1) {
        return res.status(404).json({ error: "\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0637\u0644\u0628 \u0627\u0644\u0627\u0646\u0636\u0645\u0627\u0645 \u0627\u0644\u0645\u062D\u062F\u062F." });
      }
      requests[requestIndex].status = status;
      await saveJoinRequests(requests);
      res.json({ success: true, message: status === "APPROVED" ? "\u062A\u0645\u062A \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0639\u0644\u0649 \u0627\u0644\u0637\u0644\u0628 \u0628\u0646\u062C\u0627\u062D \u0648\u064A\u0645\u0643\u0646 \u0644\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0627\u0644\u0622\u0646." : "\u062A\u0645 \u0631\u0641\u0636 \u0637\u0644\u0628 \u0627\u0644\u0627\u0646\u0636\u0645\u0627\u0645." });
    } catch (err) {
      console.error("Error in POST /api/join-requests/approve:", err);
      res.status(500).json({ error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u062F\u0627\u062E\u0644\u064A \u0623\u062B\u0646\u0627\u0621 \u062A\u062D\u062F\u064A\u062B \u062D\u0627\u0644\u0629 \u0627\u0644\u0637\u0644\u0628." });
    }
  });
  app.delete("/api/join-requests/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: "\u0645\u0637\u0644\u0648\u0628 \u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0637\u0644\u0628 \u0644\u062D\u0630\u0641\u0647." });
      }
      const requests = await getJoinRequests();
      const updated = requests.filter((r) => r.id !== id);
      if (updated.length === requests.length) {
        return res.status(404).json({ error: "\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0627\u0644\u0637\u0644\u0628 \u0644\u062D\u0630\u0641\u0647." });
      }
      await saveJoinRequests(updated);
      res.json({ success: true, message: "\u062A\u0645 \u062D\u0630\u0641 \u0637\u0644\u0628 \u0627\u0644\u0627\u0646\u0636\u0645\u0627\u0645 \u0648\u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062E\u0627\u0635\u0629 \u0628\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0646\u0647\u0627\u0626\u064A\u0627\u064B \u0645\u0646 \u0627\u0644\u0646\u0638\u0627\u0645." });
    } catch (err) {
      console.error("Error in DELETE /api/join-requests/:id:", err);
      res.status(500).json({ error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u062F\u0627\u062E\u0644\u064A \u0623\u062B\u0646\u0627\u0621 \u062D\u0630\u0641 \u0627\u0644\u0637\u0644\u0628." });
    }
  });
  app.post("/api/register-admin", async (req, res) => {
    try {
      const { name, phone, email, password, securityKey } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ error: "\u0627\u0644\u0631\u062C\u0627\u0621 \u0645\u0644\u0621 \u0643\u0627\u0641\u0629 \u0628\u064A\u0627\u0646\u0627\u062A \u0631\u0626\u064A\u0633 \u0627\u0644\u0627\u062A\u062D\u0627\u062F \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629." });
      }
      const validKeys = ["admin123", "PYRAMIDS-ADMIN-2026", "pyramids123", "123456"];
      if (!securityKey || !validKeys.includes(securityKey.trim())) {
        return res.status(403).json({
          error: "\u0631\u0645\u0632 \u0627\u0644\u062A\u062D\u0642\u0642 \u0627\u0644\u0625\u062F\u0627\u0631\u064A \u063A\u064A\u0631 \u0635\u062D\u064A\u062D. \u0647\u0630\u0627 \u0627\u0644\u0631\u0645\u0632 \u0645\u062E\u0635\u0635 \u062D\u0635\u0631\u0627\u064B \u0644\u0631\u0626\u064A\u0633 \u0648\u0623\u0639\u0636\u0627\u0621 \u0645\u062C\u0644\u0633 \u0625\u062F\u0627\u0631\u0629 \u0627\u062A\u062D\u0627\u062F \u0627\u0644\u0645\u0644\u0627\u0643 (\u0627\u0644\u0631\u0645\u0632 \u0627\u0644\u0645\u0639\u062A\u0645\u062F \u0647\u0648: admin123)."
        });
      }
      const lowerEmail = email.toLowerCase().trim();
      const admins = await getAdmins();
      const existing = admins.find((a) => a.email.toLowerCase().trim() === lowerEmail);
      if (existing) {
        existing.name = name;
        existing.phone = phone || existing.phone;
        existing.password = password;
        await saveAdmins(admins);
        return res.json({
          success: true,
          message: "\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0628\u064A\u0627\u0646\u0627\u062A \u062D\u0633\u0627\u0628 \u0631\u0626\u064A\u0633 \u0627\u0644\u0627\u062A\u062D\u0627\u062F \u0628\u0646\u062C\u0627\u062D!",
          role: "ADMIN",
          email: lowerEmail,
          name
        });
      }
      const newAdmin = {
        id: `admin_${Date.now()}`,
        name,
        phone: phone || "",
        email: lowerEmail,
        password,
        role: "ADMIN",
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      admins.push(newAdmin);
      await saveAdmins(admins);
      res.json({
        success: true,
        message: "\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u0648\u062A\u0641\u0639\u064A\u0644 \u062D\u0633\u0627\u0628 \u0631\u0626\u064A\u0633 \u0627\u0644\u0627\u062A\u062D\u0627\u062F \u0628\u0646\u062C\u0627\u062D!",
        role: "ADMIN",
        email: lowerEmail,
        name
      });
    } catch (err) {
      console.error("Error in POST /api/register-admin:", err);
      res.status(500).json({ error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u062F\u0627\u062E\u0644\u064A \u0623\u062B\u0646\u0627\u0621 \u062A\u0633\u062C\u064A\u0644 \u062D\u0633\u0627\u0628 \u0631\u0626\u064A\u0633 \u0627\u0644\u0627\u062A\u062D\u0627\u062F." });
    }
  });
  app.post("/api/residents/sync", async (req, res) => {
    try {
      const { residents } = req.body;
      if (Array.isArray(residents)) {
        const RESIDENTS_FILE = import_path.default.join(process.cwd(), "residents.json");
        await import_fs.default.promises.writeFile(RESIDENTS_FILE, JSON.stringify(residents, null, 2), "utf8");
      }
      res.json({ success: true });
    } catch (err) {
      console.error("Error syncing residents on server:", err);
      res.status(500).json({ error: "\u0641\u0634\u0644 \u0645\u0632\u0627\u0645\u0646\u0629 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0633\u0643\u0627\u0646 \u0639\u0644\u0649 \u0627\u0644\u062E\u0627\u062F\u0645." });
    }
  });
  app.post("/api/login-email", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "\u0627\u0644\u0631\u062C\u0627\u0621 \u0625\u062F\u062E\u0627\u0644 \u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0648\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631." });
      }
      const lowerEmail = email.toLowerCase().trim();
      const admins = await getAdmins();
      const adminMatch = admins.find((a) => a.email.toLowerCase().trim() === lowerEmail && a.password === password);
      if (adminMatch) {
        return res.json({
          success: true,
          role: "ADMIN",
          email: adminMatch.email,
          name: adminMatch.name || "\u0648\u062D\u064A\u062F \u0633\u0645\u0627\u062D\u0629 (\u0631\u0626\u064A\u0633 \u0627\u0644\u0627\u062A\u062D\u0627\u062F)"
        });
      }
      const config = await getConfig();
      const configuredAssistantEmail = config?.assistantConfig?.email?.toLowerCase().trim();
      const configuredAssistantPassword = config?.assistantConfig?.password;
      const configuredAssistantName = config?.assistantConfig?.name || "\u0627\u0644\u0645\u0633\u0627\u0639\u062F \u0627\u0644\u0641\u0646\u064A";
      const defaultAssistantEmails = ["assistant@pyramids.com", "assistant", "assistant@pyramids.com"];
      const defaultAssistantPasswords = ["assistant123", "123456", "123", "assistant"];
      const isAssistantEmailMatch = configuredAssistantEmail && configuredAssistantEmail === lowerEmail || defaultAssistantEmails.includes(lowerEmail);
      if (isAssistantEmailMatch) {
        const isPasswordCorrect = configuredAssistantPassword && password === configuredAssistantPassword || defaultAssistantPasswords.includes(password);
        if (isPasswordCorrect) {
          return res.json({
            success: true,
            role: "ASSISTANT",
            email: configuredAssistantEmail || "assistant@pyramids.com",
            name: configuredAssistantName
          });
        } else {
          return res.status(401).json({ error: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062E\u0627\u0635\u0629 \u0628\u0627\u0644\u0645\u0633\u0627\u0639\u062F \u0627\u0644\u0641\u0646\u064A \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629." });
        }
      }
      if (lowerEmail === "resident@pyramids.com" && password === "resident123" || lowerEmail === "resident" && password === "123") {
        return res.json({
          success: true,
          role: "RESIDENT",
          flatNumber: 101,
          email: "resident@pyramids.com",
          name: "\u0633\u0627\u0643\u0646 \u062A\u062C\u0631\u064A\u0628\u064A (\u0648\u062D\u062F\u0629 101)",
          residentType: "OWNER"
        });
      }
      try {
        const RESIDENTS_FILE = import_path.default.join(process.cwd(), "residents.json");
        if (import_fs.default.existsSync(RESIDENTS_FILE)) {
          const raw = await import_fs.default.promises.readFile(RESIDENTS_FILE, "utf8");
          const residentsList = JSON.parse(raw);
          for (const r of residentsList) {
            const ownerEmailMatch = r.email && r.email.toLowerCase().trim() === lowerEmail || `flat${r.flatNumber}@pyramids.com` === lowerEmail;
            const ownerPassMatch = r.password && r.password === password || `pyr${r.flatNumber}#2026` === password || `flat${r.flatNumber}123` === password;
            if (ownerEmailMatch && ownerPassMatch) {
              if (r.accountStatus === "REVOKED") {
                return res.status(403).json({ error: "\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u0639\u0636\u0648\u064A\u0629 \u0647\u0630\u0627 \u0627\u0644\u062D\u0633\u0627\u0628 \u0645\u0646 \u0642\u0628\u0644 \u0631\u0626\u064A\u0633 \u0627\u0644\u0627\u062A\u062D\u0627\u062F. \u064A\u0631\u062C\u0649 \u0627\u0644\u062A\u0648\u0627\u0635\u0644 \u0645\u0639 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0644\u0627\u0643." });
              }
              return res.json({
                success: true,
                role: "RESIDENT",
                flatNumber: r.flatNumber,
                email: r.email || `flat${r.flatNumber}@pyramids.com`,
                name: r.name || `\u0633\u0627\u0643\u0646 \u0648\u062D\u062F\u0629 ${r.flatNumber}`,
                residentType: "OWNER"
              });
            }
            const tenantEmailMatch = r.tenantEmail && r.tenantEmail.toLowerCase().trim() === lowerEmail || `tenant${r.flatNumber}@pyramids.com` === lowerEmail;
            const tenantPassMatch = r.tenantPassword && r.tenantPassword === password || `pyr${r.flatNumber}#2026` === password || `flat${r.flatNumber}123` === password;
            if (tenantEmailMatch && tenantPassMatch) {
              if (r.tenantAccountStatus === "REVOKED") {
                return res.status(403).json({ error: "\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u0639\u0636\u0648\u064A\u0629 \u0647\u0630\u0627 \u0627\u0644\u062D\u0633\u0627\u0628 \u0645\u0646 \u0642\u0628\u0644 \u0631\u0626\u064A\u0633 \u0627\u0644\u0627\u062A\u062D\u0627\u062F. \u064A\u0631\u062C\u0649 \u0627\u0644\u062A\u0648\u0627\u0635\u0644 \u0645\u0639 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0644\u0627\u0643." });
              }
              return res.json({
                success: true,
                role: "RESIDENT",
                flatNumber: r.flatNumber,
                email: r.tenantEmail || `tenant${r.flatNumber}@pyramids.com`,
                name: r.tenantName || r.name || `\u0645\u0633\u062A\u0623\u062C\u0631 \u0648\u062D\u062F\u0629 ${r.flatNumber}`,
                residentType: "TENANT"
              });
            }
          }
        }
      } catch (resErr) {
        console.error("Error reading residents.json in server login:", resErr);
      }
      const requests = await getJoinRequests();
      const match = requests.find((r) => r.email.toLowerCase().trim() === lowerEmail && r.password === password);
      if (!match) {
        return res.status(401).json({ error: "\u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0623\u0648 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629." });
      }
      if (match.status === "PENDING") {
        return res.status(403).json({ error: "\u0637\u0644\u0628 \u0627\u0644\u0627\u0646\u0636\u0645\u0627\u0645 \u0627\u0644\u062E\u0627\u0635 \u0628\u0643 \u0642\u064A\u062F \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u062D\u0627\u0644\u064A\u0627\u064B \u0645\u0646 \u0642\u0628\u0644 \u0631\u0626\u064A\u0633 \u0627\u0644\u0627\u062A\u062D\u0627\u062F. \u064A\u0631\u062C\u0649 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0644\u0627\u062D\u0642\u0627\u064B \u0628\u0645\u062C\u0631\u062F \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629." });
      }
      if (match.status === "DECLINED") {
        return res.status(403).json({ error: "\u0645\u0639\u0630\u0631\u0629\u064B\u060C \u0644\u0642\u062F \u062A\u0645 \u0631\u0641\u0636 \u0637\u0644\u0628 \u0627\u0644\u0627\u0646\u0636\u0645\u0627\u0645 \u0627\u0644\u062E\u0627\u0635 \u0628\u0643. \u064A\u0631\u062C\u0649 \u0627\u0644\u062A\u0648\u0627\u0635\u0644 \u0645\u0639 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0644\u0627\u0643." });
      }
      res.json({
        success: true,
        role: "RESIDENT",
        flatNumber: match.flatNumber,
        email: match.email,
        name: match.residentType === "OWNER" ? match.ownerName : match.tenantName,
        residentType: match.residentType
      });
    } catch (err) {
      console.error("Error in POST /api/login-email:", err);
      res.status(500).json({ error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u062F\u0627\u062E\u0644\u064A \u0641\u064A \u0627\u0644\u062E\u0627\u062F\u0645 \u0623\u062B\u0646\u0627\u0621 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644." });
    }
  });
  app.post("/api/ai-suggest", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          error: "\u0644\u0645 \u064A\u062A\u0645 \u062A\u0643\u0648\u064A\u0646 \u0645\u0641\u062A\u0627\u062D GEMINI_API_KEY \u0641\u064A \u0644\u0648\u062D\u0629 \u0627\u0644\u062A\u062D\u0643\u0645 \u0627\u0644\u062E\u0627\u0635\u0629 \u0628\u0627\u0644\u0645\u0637\u0648\u0631."
        });
      }
      const { residents, payments, expenses, year } = req.body;
      if (!residents || !payments || !expenses) {
        return res.status(400).json({ error: "\u0627\u0644\u0631\u062C\u0627\u0621 \u062A\u0648\u0641\u064A\u0631 \u062C\u0645\u064A\u0639 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0627\u0644\u064A\u0629 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 \u0644\u0644\u062A\u062D\u0644\u064A\u0644." });
      }
      const ai = new import_genai.GoogleGenAI({ apiKey });
      const prompt = `
\u0623\u0646\u062A \u0645\u0633\u062A\u0634\u0627\u0631 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0639\u0642\u0627\u0631\u0627\u062A \u0648\u0627\u062A\u062D\u0627\u062F\u0627\u062A \u0627\u0644\u0645\u0644\u0627\u0643 \u0648\u062E\u0628\u064A\u0631 \u0645\u0627\u0644\u064A \u0630\u0643\u064A. \u0628\u0635\u0641\u062A\u0643 \u0645\u0633\u062A\u0634\u0627\u0631 "\u0628\u064A\u0631\u0627\u0645\u064A\u062F\u0632 \u0641\u064A\u0648 \u0661"\u060C \u0642\u0645 \u0628\u062A\u062D\u0644\u064A\u0644 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0627\u0644\u064A\u0629 \u0648\u0627\u0644\u062A\u0634\u063A\u064A\u0644\u064A\u0629 \u0627\u0644\u062A\u0627\u0644\u064A\u0629 \u0648\u0642\u062F\u0645 \u062A\u0642\u0631\u064A\u0631\u0627\u064B \u0634\u0627\u0645\u0644\u0627\u064B\u060C \u0627\u0642\u062A\u0631\u0627\u062D\u0627\u062A \u062A\u0634\u063A\u064A\u0644\u064A\u0629 \u0630\u0643\u064A\u0629\u060C \u0648\u062A\u0646\u0628\u0624\u0627\u062A \u0628\u0627\u0644\u0645\u064A\u0632\u0627\u0646\u064A\u0629 \u0627\u0644\u0645\u0633\u062A\u0642\u0628\u0644\u064A\u0629 \u0628\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0628\u0623\u0633\u0644\u0648\u0628 \u0631\u0627\u0642\u064D \u0648\u0645\u062D\u062F\u062F:

\u0627\u0644\u0633\u0646\u0629 \u0627\u0644\u0645\u0627\u0644\u064A\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629: ${year || (/* @__PURE__ */ new Date()).getFullYear()}

\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0633\u0643\u0627\u0646 (\u0627\u0644\u0633\u0643\u0627\u0646 \u0648\u0627\u0644\u0646\u0634\u0627\u0637):
${JSON.stringify(residents, null, 2)}

\u0633\u062C\u0644 \u0627\u0644\u062A\u062D\u0635\u064A\u0644\u0627\u062A (\u0627\u0644\u0645\u062F\u0641\u0648\u0639\u0627\u062A \u0627\u0644\u0645\u0633\u062A\u0644\u0645\u0629):
${JSON.stringify(payments, null, 2)}

\u0633\u062C\u0644 \u0627\u0644\u0645\u0635\u0631\u0648\u0641\u0627\u062A (\u0627\u0644\u0646\u0641\u0642\u0627\u062A):
${JSON.stringify(expenses, null, 2)}

\u064A\u0631\u062C\u0649 \u0647\u064A\u0643\u0644\u0629 \u0627\u0644\u062A\u0642\u0631\u064A\u0631 \u0641\u064A \u0627\u0644\u0623\u0642\u0633\u0627\u0645 \u0627\u0644\u062A\u0627\u0644\u064A\u0629 \u0628\u0623\u0633\u0644\u0648\u0628 \u0645\u0627\u0631\u0643 \u062F\u0627\u0648\u0646 (Markdown):
1. **\u0627\u0644\u0648\u0636\u0639 \u0627\u0644\u0645\u0627\u0644\u064A \u0627\u0644\u0639\u0627\u0645 (\u0646\u0638\u0631\u0629 \u0633\u0631\u064A\u0639\u0629)**:
   - \u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u062A\u062D\u0635\u064A\u0644\u0627\u062A \u0627\u0644\u0643\u0644\u064A\u0629 \u0648\u0627\u0644\u0646\u0633\u0628\u0629 \u0627\u0644\u0645\u0626\u0648\u064A\u0629 \u0644\u0644\u062A\u062D\u0635\u064A\u0644 \u0645\u0646 \u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A \u0627\u0644\u0645\u0641\u062A\u0631\u0636\u0629.
   - \u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0635\u0631\u0648\u0641\u0627\u062A \u0648\u0635\u0627\u0641\u064A \u0627\u0644\u0641\u0627\u0626\u0636 \u0623\u0648 \u0627\u0644\u0639\u062C\u0632 \u0627\u0644\u0645\u0627\u0644\u064A.
   - \u0643\u0641\u0627\u0621\u0629 \u062A\u062D\u0635\u064A\u0644 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A (\u0639\u062F\u062F \u0627\u0644\u0633\u0643\u0627\u0646 \u0627\u0644\u0645\u0644\u062A\u0632\u0645\u064A\u0646 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0645\u0645\u062A\u0646\u0639\u064A\u0646 \u0623\u0648 \u0627\u0644\u0645\u062A\u0623\u062E\u0631\u064A\u0646).

2. **\u062A\u062D\u0644\u064A\u0644 \u0627\u0644\u0645\u0635\u0631\u0648\u0641\u0627\u062A \u0627\u0644\u0643\u0628\u0631\u0649**:
   - \u0623\u0643\u0628\u0631 \u062B\u0644\u0627\u062B \u0641\u0626\u0627\u062A \u0644\u0644\u0645\u0635\u0631\u0648\u0641\u0627\u062A \u0648\u0646\u0633\u0628\u062A\u0647\u0627 \u0645\u0646 \u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0635\u0627\u0631\u064A\u0641.
   - \u062A\u0642\u064A\u064A\u0645 \u0645\u0627 \u0625\u0630\u0627 \u0643\u0627\u0646\u062A \u0647\u0630\u0647 \u0627\u0644\u0645\u0635\u0627\u0631\u064A\u0641 \u0645\u0639\u0642\u0648\u0644\u0629 \u0623\u0648 \u062A\u062D\u062A\u0627\u062C \u0625\u0644\u0649 \u062A\u0631\u0634\u064A\u062F.

3. **\u0627\u0642\u062A\u0631\u0627\u062D\u0627\u062A \u062A\u0631\u0634\u064A\u062F \u0627\u0644\u0625\u0646\u0641\u0627\u0642 \u0648\u0632\u064A\u0627\u062F\u0629 \u0627\u0644\u0645\u0648\u0627\u0631\u062F (\u062A\u0648\u0635\u064A\u0627\u062A \u0630\u0643\u064A\u0629)**:
   - \u062A\u0642\u062F\u064A\u0645 3 \u062A\u0648\u0635\u064A\u0627\u062A \u0630\u0643\u064A\u0629 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 \u0644\u062E\u0641\u0636 \u0627\u0644\u0645\u0635\u0631\u0648\u0641\u0627\u062A (\u0645\u062B\u0644 \u062A\u0648\u0641\u064A\u0631 \u0627\u0644\u0637\u0627\u0642\u0629\u060C \u0627\u0644\u062A\u0639\u0627\u0642\u062F \u0645\u0639 \u0634\u0631\u0643\u0627\u062A \u0635\u064A\u0627\u0646\u0629 \u0627\u0644\u0645\u0635\u0627\u0639\u062F\u060C \u0623\u0648 \u0635\u064A\u0627\u0646\u0629 \u0645\u064A\u0627\u0647 \u0627\u0644\u062E\u0632\u0627\u0646 \u0628\u0623\u0633\u0627\u0644\u064A\u0628 \u0623\u0648\u0641\u0631).
   - \u062A\u0642\u062F\u064A\u0645 \u0641\u0643\u0631\u062A\u064A\u0646 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 \u0644\u0632\u064A\u0627\u062F\u0629 \u0627\u0644\u0625\u064A\u0631\u0627\u062F\u0627\u062A (\u0645\u062B\u0644 \u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A \u0645\u0624\u0642\u062A\u0629\u060C \u0631\u0633\u0648\u0645 \u062A\u0634\u063A\u064A\u0644 \u0644\u0644\u0645\u062D\u0644\u0627\u062A \u0627\u0644\u062A\u062C\u0627\u0631\u064A\u0629 \u0623\u0648 \u0627\u0644\u0623\u0646\u0634\u0637\u0629 \u0627\u0644\u0645\u0641\u0631\u0648\u0634\u0629 \u0625\u0646 \u0648\u062C\u062F\u062A).

4. **\u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0627\u0644\u0633\u0643\u0627\u0646 \u0627\u0644\u0645\u062A\u0623\u062E\u0631\u064A\u0646 \u0648\u0627\u0644\u0645\u062A\u0627\u0628\u0639\u0629**:
   - \u0642\u0627\u0626\u0645\u0629 \u0628\u0623\u0631\u0642\u0627\u0645 \u0627\u0644\u0634\u0642\u0642 \u0648\u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0633\u0643\u0627\u0646 \u0627\u0644\u0645\u062A\u0623\u062E\u0631\u064A\u0646 \u0641\u064A \u0627\u0644\u062F\u0641\u0639 (\u0623\u0648 \u0645\u0645\u062A\u0646\u0639\u064A\u0646) \u0645\u0639 \u0645\u0628\u0627\u0644\u063A \u0627\u0644\u062A\u0623\u062E\u064A\u0631 \u0627\u0644\u062A\u0642\u0631\u064A\u0628\u064A\u0629.
   - \u0635\u064A\u0627\u063A\u0629 \u0645\u0642\u062A\u0631\u062D\u0629 \u0644\u0631\u0633\u0627\u0644\u0629 \u0645\u062A\u0627\u0628\u0639\u0629 \u0628\u0631\u0641\u0642 \u0648\u0644\u0637\u0641 \u0644\u062D\u062B\u0647\u0645 \u0639\u0644\u0649 \u0627\u0644\u0633\u062F\u0627\u062F \u062F\u0648\u0646 \u0625\u062D\u0631\u0627\u062C.

5. **\u062A\u0648\u0642\u0639\u0627\u062A \u0627\u0644\u0634\u0647\u0631 \u0627\u0644\u0642\u0627\u062F\u0645 \u0648\u0627\u0644\u0645\u064A\u0632\u0627\u0646\u064A\u0629 \u0627\u0644\u062A\u0642\u062F\u064A\u0631\u064A\u0629**:
   - \u0627\u0644\u062A\u0646\u0628\u0624 \u0628\u0627\u0644\u0645\u0635\u0631\u0648\u0641\u0627\u062A \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 \u0644\u0644\u0634\u0647\u0631 \u0627\u0644\u0642\u0627\u062F\u0645 \u0628\u0646\u0627\u0621\u064B \u0639\u0644\u0649 \u0627\u0644\u0623\u0646\u0645\u0627\u0637 \u0627\u0644\u0633\u0627\u0628\u0642\u0629 \u0648\u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0628\u0646\u0648\u062F \u0627\u0644\u0637\u0627\u0631\u0626\u0629.

\u062A\u0623\u0643\u062F \u0645\u0646 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0627\u0644\u062A\u0642\u0631\u064A\u0631 \u0628\u0644\u0647\u062C\u0629 \u0645\u0647\u0646\u064A\u0629 \u0645\u062D\u0641\u0632\u0629\u060C \u0648\u0623\u0646 \u064A\u062A\u0636\u0645\u0646 \u0646\u0635\u0627\u0626\u062D \u0648\u0627\u0636\u062D\u0629 \u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u062A\u0637\u0628\u064A\u0642 \u0641\u0648\u0631\u0627\u064B \u0644\u0627\u062A\u062D\u0627\u062F \u0627\u0644\u0645\u0644\u0627\u0643.
`;
      let reportText = "";
      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.0-flash",
          contents: prompt
        });
        reportText = response.text || "";
      } catch (geminiError) {
        console.warn("Primary model gemini-2.0-flash is experiencing issues, trying gemini-1.5-flash...", geminiError.message || geminiError);
        try {
          const response = await ai.models.generateContent({
            model: "gemini-1.5-flash",
            contents: prompt
          });
          reportText = response.text || "";
        } catch (fallbackError) {
          console.error("All Gemini models failed:", fallbackError);
          throw new Error("\u0641\u0634\u0644 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u062E\u062F\u0645\u0629 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A \u062D\u0627\u0644\u064A\u0627\u064B.");
        }
      }
      res.json({ result: reportText || "\u0639\u0630\u0631\u0627\u064B\u060C \u0644\u0645 \u0646\u062A\u0645\u0643\u0646 \u0645\u0646 \u062A\u0648\u0644\u064A\u062F \u0627\u0644\u062A\u062D\u0644\u064A\u0644 \u0641\u064A \u0627\u0644\u0648\u0642\u062A \u0627\u0644\u062D\u0627\u0644\u064A." });
    } catch (error) {
      console.error("Error in /api/ai-suggest:", error);
      res.status(500).json({ error: error.message || "\u062D\u062F\u062B \u062E\u0637\u0623 \u0623\u062B\u0646\u0627\u0621 \u0645\u0639\u0627\u0644\u062C\u0629 \u0627\u0644\u062A\u062D\u0644\u064A\u0644 \u0627\u0644\u0630\u0643\u064A." });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true, hmr: false },
      appType: "spa"
    });
    app.use(vite.middlewares);
    console.log("Vite middleware mounted in development mode.");
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
    console.log("Serving production static build from dist/.");
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT} (0.0.0.0:3000)`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
