import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Support JSON bodies up to 10MB (for data sync)
  app.use(express.json({ limit: '10mb' }));

  // Set correct MIME type for TS/TSX files to satisfy strict browser MIME checking
  app.use((req, res, next) => {
    if (req.path.endsWith('.ts') || req.path.endsWith('.tsx')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
    next();
  });

  const JOIN_REQUESTS_FILE = path.join(process.cwd(), 'join_requests.json');
  const ADMINS_FILE = path.join(process.cwd(), 'admins.json');
  const CONFIG_FILE = path.join(process.cwd(), 'app_config.json');
  const CHAT_MESSAGES_FILE = path.join(process.cwd(), 'chat_messages.json');
  const COMPLAINTS_FILE = path.join(process.cwd(), 'public_complaints.json');

  const getChatMessages = async () => {
    try {
      if (!fs.existsSync(CHAT_MESSAGES_FILE)) return [];
      const data = await fs.promises.readFile(CHAT_MESSAGES_FILE, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.error('Error reading chat messages:', err);
      return [];
    }
  };

  const saveChatMessages = async (msgs: any[]) => {
    try {
      await fs.promises.writeFile(CHAT_MESSAGES_FILE, JSON.stringify(msgs, null, 2), 'utf8');
    } catch (err) {
      console.error('Error writing chat messages:', err);
    }
  };

  const getComplaints = async () => {
    try {
      if (!fs.existsSync(COMPLAINTS_FILE)) return [];
      const data = await fs.promises.readFile(COMPLAINTS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.error('Error reading complaints:', err);
      return [];
    }
  };

  const saveComplaints = async (complaints: any[]) => {
    try {
      await fs.promises.writeFile(COMPLAINTS_FILE, JSON.stringify(complaints, null, 2), 'utf8');
    } catch (err) {
      console.error('Error writing complaints:', err);
    }
  };

  const getConfig = async () => {
    try {
      if (!fs.existsSync(CONFIG_FILE)) {
        return null;
      }
      const data = await fs.promises.readFile(CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.error('Error reading config in server:', err);
      return null;
    }
  };

  const getAdmins = async () => {
    try {
      if (!fs.existsSync(ADMINS_FILE)) {
        const defaultAdmins = [
          {
            email: 'waheedsamaha8@gmail.com',
            password: 'admin123',
            name: 'وحيد سماحة (رئيس الاتحاد)',
            phone: '',
            role: 'ADMIN',
            createdAt: new Date().toISOString()
          }
        ];
        await fs.promises.writeFile(ADMINS_FILE, JSON.stringify(defaultAdmins, null, 2), 'utf8');
        return defaultAdmins;
      }
      const data = await fs.promises.readFile(ADMINS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (!parsed.some((a: any) => a.email.toLowerCase().trim() === 'waheedsamaha8@gmail.com')) {
        parsed.unshift({
          email: 'waheedsamaha8@gmail.com',
          password: 'admin123',
          name: 'وحيد سماحة (رئيس الاتحاد)',
          phone: '',
          role: 'ADMIN',
          createdAt: new Date().toISOString()
        });
        await fs.promises.writeFile(ADMINS_FILE, JSON.stringify(parsed, null, 2), 'utf8');
      }
      return parsed;
    } catch (err) {
      console.error('Error reading admins:', err);
      return [
        {
          email: 'waheedsamaha8@gmail.com',
          password: 'admin123',
          name: 'وحيد سماحة (رئيس الاتحاد)',
          phone: '',
          role: 'ADMIN'
        }
      ];
    }
  };

  const saveAdmins = async (adminsList: any[]) => {
    try {
      await fs.promises.writeFile(ADMINS_FILE, JSON.stringify(adminsList, null, 2), 'utf8');
    } catch (err) {
      console.error('Error writing admins:', err);
    }
  };

  const getJoinRequests = async () => {
    try {
      if (!fs.existsSync(JOIN_REQUESTS_FILE)) {
        return [];
      }
      const data = await fs.promises.readFile(JOIN_REQUESTS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.error('Error reading join requests:', err);
      return [];
    }
  };

  const saveJoinRequests = async (requests: any[]) => {
    try {
      await fs.promises.writeFile(JOIN_REQUESTS_FILE, JSON.stringify(requests, null, 2), 'utf8');
    } catch (err) {
      console.error('Error writing join requests:', err);
    }
  };

  // API Health Check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Config endpoints (for storing assistant credentials and custom settings)
  app.get('/api/config', async (req, res) => {
    try {
      const config = await getConfig();
      res.json(config || {});
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to read config' });
    }
  });

  app.post('/api/config', async (req, res) => {
    try {
      const config = req.body;
      await fs.promises.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
      res.json({ success: true, message: 'Config saved successfully' });
    } catch (err: any) {
      console.error('Error saving config in server:', err);
      res.status(500).json({ error: 'Failed to save config' });
    }
  });

  // Chat API Endpoints for real-time multi-user chat
  app.get('/api/chat', async (req, res) => {
    try {
      const msgs = await getChatMessages();
      res.json(msgs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const { message } = req.body;
      if (!message || !message.id) {
        return res.status(400).json({ error: 'Message object required' });
      }
      const msgs = await getChatMessages();
      const filtered = msgs.filter((m: any) => m.id !== message.id);
      filtered.push(message);
      await saveChatMessages(filtered);
      res.json({ success: true, messages: filtered });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/chat/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const msgs = await getChatMessages();
      const filtered = msgs.filter((m: any) => m.id !== id);
      await saveChatMessages(filtered);
      res.json({ success: true, messages: filtered });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/chat/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { text } = req.body;
      const msgs = await getChatMessages();
      const updated = msgs.map((m: any) => m.id === id ? { ...m, text } : m);
      await saveChatMessages(updated);
      res.json({ success: true, messages: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Complaints & Proposals API Endpoints
  app.get('/api/complaints', async (req, res) => {
    try {
      const list = await getComplaints();
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/complaints', async (req, res) => {
    try {
      const { complaint } = req.body;
      if (!complaint || !complaint.id) {
        return res.status(400).json({ error: 'Complaint object required' });
      }
      const list = await getComplaints();
      const filtered = list.filter((c: any) => c.id !== complaint.id);
      filtered.unshift(complaint);
      await saveComplaints(filtered);
      res.json({ success: true, complaints: filtered });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/complaints/:id/comments', async (req, res) => {
    try {
      const { id } = req.params;
      const { comment } = req.body;
      const list = await getComplaints();
      const updated = list.map((c: any) => {
        if (c.id === id) {
          const comments = c.comments || [];
          return { ...c, comments: [...comments, comment] };
        }
        return c;
      });
      await saveComplaints(updated);
      res.json({ success: true, complaints: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/complaints/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const list = await getComplaints();
      const filtered = list.filter((c: any) => c.id !== id);
      await saveComplaints(filtered);
      res.json({ success: true, complaints: filtered });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 1. Submit Join Request
  app.post('/api/join-requests', async (req, res) => {
    try {
      const { flatNumber, residentType, ownerName, ownerPhone, tenantName, tenantPhone, email, password } = req.body;
      if (!flatNumber || !residentType || !email || !password) {
        return res.status(400).json({ error: 'الرجاء ملء كافة الحقول الأساسية المطلوبة.' });
      }

      const requests = await getJoinRequests();
      
      // Check if email already registered
      if (requests.some((r: any) => r.email.toLowerCase().trim() === email.toLowerCase().trim())) {
        return res.status(400).json({ error: 'هذا البريد الإلكتروني مسجل بالفعل أو لديه طلب انضمام قائم.' });
      }

      const newRequest = {
        id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        flatNumber: parseInt(flatNumber),
        residentType,
        ownerName: ownerName || '',
        ownerPhone: ownerPhone || '',
        tenantName: tenantName || '',
        tenantPhone: tenantPhone || '',
        email: email.toLowerCase().trim(),
        password,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      };

      requests.push(newRequest);
      await saveJoinRequests(requests);

      res.json({ success: true, message: 'تم إرسال طلب الانضمام بنجاح وهو قيد المراجعة والاعتماد حالياً من قبل رئيس الاتحاد.' });
    } catch (err: any) {
      console.error('Error in POST /api/join-requests:', err);
      res.status(500).json({ error: 'حدث خطأ داخلي في الخادم أثناء إرسال طلب الانضمام.' });
    }
  });

  // 2. Fetch Join Requests
  app.get('/api/join-requests', async (req, res) => {
    try {
      const requests = await getJoinRequests();
      res.json(requests);
    } catch (err: any) {
      console.error('Error in GET /api/join-requests:', err);
      res.status(500).json({ error: 'حدث خطأ أثناء تحميل طلبات الانضمام.' });
    }
  });

  // 3. Approve or Decline Join Request
  app.post('/api/join-requests/approve', async (req, res) => {
    try {
      const { id, status } = req.body;
      if (!id || !['APPROVED', 'DECLINED'].includes(status)) {
        return res.status(400).json({ error: 'بيانات غير مكتملة للموافقة أو الرفض.' });
      }

      const requests = await getJoinRequests();
      const requestIndex = requests.findIndex((r: any) => r.id === id);
      if (requestIndex === -1) {
        return res.status(404).json({ error: 'لم يتم العثور على طلب الانضمام المحدد.' });
      }

      requests[requestIndex].status = status;
      await saveJoinRequests(requests);

      res.json({ success: true, message: status === 'APPROVED' ? 'تمت الموافقة على الطلب بنجاح ويمكن للمستخدم تسجيل الدخول الآن.' : 'تم رفض طلب الانضمام.' });
    } catch (err: any) {
      console.error('Error in POST /api/join-requests/approve:', err);
      res.status(500).json({ error: 'حدث خطأ داخلي أثناء تحديث حالة الطلب.' });
    }
  });

  // 3.5. Delete Join Request entirely
  app.delete('/api/join-requests/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: 'مطلوب معرّف الطلب لحذفه.' });
      }

      const requests = await getJoinRequests();
      const updated = requests.filter((r: any) => r.id !== id);
      if (updated.length === requests.length) {
        return res.status(404).json({ error: 'لم يتم العثور على الطلب لحذفه.' });
      }

      await saveJoinRequests(updated);
      res.json({ success: true, message: 'تم حذف طلب الانضمام والبيانات الخاصة بالمستخدم نهائياً من النظام.' });
    } catch (err: any) {
      console.error('Error in DELETE /api/join-requests/:id:', err);
      res.status(500).json({ error: 'حدث خطأ داخلي أثناء حذف الطلب.' });
    }
  });

  // 3.8. Register / Set Union President (Admin) Account
  app.post('/api/register-admin', async (req, res) => {
    try {
      const { name, phone, email, password, securityKey } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ error: 'الرجاء ملء كافة بيانات رئيس الاتحاد الأساسية.' });
      }

      // Valid security keys for President of Union verification
      const validKeys = ['admin123', 'PYRAMIDS-ADMIN-2026', 'pyramids123', '123456'];
      if (!securityKey || !validKeys.includes(securityKey.trim())) {
        return res.status(403).json({ 
          error: 'رمز التحقق الإداري غير صحيح. هذا الرمز مخصص حصراً لرئيس وأعضاء مجلس إدارة اتحاد الملاك (الرمز المعتمد هو: admin123).' 
        });
      }

      const lowerEmail = email.toLowerCase().trim();
      const admins = await getAdmins();
      const existing = admins.find((a: any) => a.email.toLowerCase().trim() === lowerEmail);

      if (existing) {
        existing.name = name;
        existing.phone = phone || existing.phone;
        existing.password = password;
        await saveAdmins(admins);
        return res.json({
          success: true,
          message: 'تم تحديث بيانات حساب رئيس الاتحاد بنجاح!',
          role: 'ADMIN',
          email: lowerEmail,
          name: name
        });
      }

      const newAdmin = {
        id: `admin_${Date.now()}`,
        name,
        phone: phone || '',
        email: lowerEmail,
        password,
        role: 'ADMIN',
        createdAt: new Date().toISOString()
      };
      admins.push(newAdmin);
      await saveAdmins(admins);

      res.json({
        success: true,
        message: 'تم تسجيل وتفعيل حساب رئيس الاتحاد بنجاح!',
        role: 'ADMIN',
        email: lowerEmail,
        name: name
      });
    } catch (err: any) {
      console.error('Error in POST /api/register-admin:', err);
      res.status(500).json({ error: 'حدث خطأ داخلي أثناء تسجيل حساب رئيس الاتحاد.' });
    }
  });

  // Sync Residents List to Server
  app.post('/api/residents/sync', async (req, res) => {
    try {
      const { residents } = req.body;
      if (Array.isArray(residents)) {
        const RESIDENTS_FILE = path.join(process.cwd(), 'residents.json');
        await fs.promises.writeFile(RESIDENTS_FILE, JSON.stringify(residents, null, 2), 'utf8');
      }
      res.json({ success: true });
    } catch (err) {
      console.error('Error syncing residents on server:', err);
      res.status(500).json({ error: 'فشل مزامنة بيانات السكان على الخادم.' });
    }
  });

  // 4. Custom Login with Email & Password
  app.post('/api/login-email', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'الرجاء إدخال البريد الإلكتروني وكلمة المرور.' });
      }

      const lowerEmail = email.toLowerCase().trim();

      // Check Admins list (including master admin waheedsamaha8@gmail.com)
      const admins = await getAdmins();
      const adminMatch = admins.find((a: any) => a.email.toLowerCase().trim() === lowerEmail && a.password === password);
      if (adminMatch) {
        return res.json({
          success: true,
          role: 'ADMIN',
          email: adminMatch.email,
          name: adminMatch.name || 'وحيد سماحة (رئيس الاتحاد)',
        });
      }

      // Check Assistant Delegation Config
      const config = await getConfig();
      const configuredAssistantEmail = config?.assistantConfig?.email?.toLowerCase().trim();
      const configuredAssistantPassword = config?.assistantConfig?.password;
      const configuredAssistantName = config?.assistantConfig?.name || 'المساعد الفني';

      const defaultAssistantEmails = ['assistant@pyramids.com', 'assistant', 'assistant@pyramids.com'];
      const defaultAssistantPasswords = ['assistant123', '123456', '123', 'assistant'];

      const isAssistantEmailMatch =
        (configuredAssistantEmail && configuredAssistantEmail === lowerEmail) ||
        defaultAssistantEmails.includes(lowerEmail);

      if (isAssistantEmailMatch) {
        const isPasswordCorrect =
          (configuredAssistantPassword && password === configuredAssistantPassword) ||
          defaultAssistantPasswords.includes(password);

        if (isPasswordCorrect) {
          return res.json({
            success: true,
            role: 'ASSISTANT',
            email: configuredAssistantEmail || 'assistant@pyramids.com',
            name: configuredAssistantName,
          });
        } else {
          return res.status(401).json({ error: 'كلمة المرور الخاصة بالمساعد الفني غير صحيحة.' });
        }
      }

      // Check Demo Resident account for instant testing
      if ((lowerEmail === 'resident@pyramids.com' && password === 'resident123') || (lowerEmail === 'resident' && password === '123')) {
        return res.json({
          success: true,
          role: 'RESIDENT',
          flatNumber: 101,
          email: 'resident@pyramids.com',
          name: 'ساكن تجريبي (وحدة 101)',
          residentType: 'OWNER',
        });
      }

      // Check residents list (assigned credentials)
      try {
        const RESIDENTS_FILE = path.join(process.cwd(), 'residents.json');
        if (fs.existsSync(RESIDENTS_FILE)) {
          const raw = await fs.promises.readFile(RESIDENTS_FILE, 'utf8');
          const residentsList = JSON.parse(raw);
          for (const r of residentsList) {
            const ownerEmailMatch = (r.email && r.email.toLowerCase().trim() === lowerEmail) || `flat${r.flatNumber}@pyramids.com` === lowerEmail;
            const ownerPassMatch = (r.password && r.password === password) || `pyr${r.flatNumber}#2026` === password || `flat${r.flatNumber}123` === password;
            if (ownerEmailMatch && ownerPassMatch) {
              if (r.accountStatus === 'REVOKED') {
                return res.status(403).json({ error: 'تم إلغاء عضوية هذا الحساب من قبل رئيس الاتحاد. يرجى التواصل مع إدارة الملاك.' });
              }
              return res.json({
                success: true,
                role: 'RESIDENT',
                flatNumber: r.flatNumber,
                email: r.email || `flat${r.flatNumber}@pyramids.com`,
                name: r.name || `ساكن وحدة ${r.flatNumber}`,
                residentType: 'OWNER',
              });
            }

            const tenantEmailMatch = (r.tenantEmail && r.tenantEmail.toLowerCase().trim() === lowerEmail) || `tenant${r.flatNumber}@pyramids.com` === lowerEmail;
            const tenantPassMatch = (r.tenantPassword && r.tenantPassword === password) || `pyr${r.flatNumber}#2026` === password || `flat${r.flatNumber}123` === password;
            if (tenantEmailMatch && tenantPassMatch) {
              if (r.tenantAccountStatus === 'REVOKED') {
                return res.status(403).json({ error: 'تم إلغاء عضوية هذا الحساب من قبل رئيس الاتحاد. يرجى التواصل مع إدارة الملاك.' });
              }
              return res.json({
                success: true,
                role: 'RESIDENT',
                flatNumber: r.flatNumber,
                email: r.tenantEmail || `tenant${r.flatNumber}@pyramids.com`,
                name: r.tenantName || r.name || `مستأجر وحدة ${r.flatNumber}`,
                residentType: 'TENANT',
              });
            }
          }
        }
      } catch (resErr) {
        console.error('Error reading residents.json in server login:', resErr);
      }

      const requests = await getJoinRequests();
      const match = requests.find((r: any) => r.email.toLowerCase().trim() === lowerEmail && r.password === password);

      if (!match) {
        return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
      }

      if (match.status === 'PENDING') {
        return res.status(403).json({ error: 'طلب الانضمام الخاص بك قيد المراجعة حالياً من قبل رئيس الاتحاد. يرجى المحاولة لاحقاً بمجرد الموافقة.' });
      }

      if (match.status === 'DECLINED') {
        return res.status(403).json({ error: 'معذرةً، لقد تم رفض طلب الانضمام الخاص بك. يرجى التواصل مع إدارة الملاك.' });
      }

      // Approved! Return credentials
      res.json({
        success: true,
        role: 'RESIDENT',
        flatNumber: match.flatNumber,
        email: match.email,
        name: match.residentType === 'OWNER' ? match.ownerName : match.tenantName,
        residentType: match.residentType,
      });
    } catch (err: any) {
      console.error('Error in POST /api/login-email:', err);
      res.status(500).json({ error: 'حدث خطأ داخلي في الخادم أثناء التحقق من بيانات الدخول.' });
    }
  });

  // API Route for secure Gemini AI analysis and suggestions
  app.post('/api/ai-suggest', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ 
          error: 'لم يتم تكوين مفتاح GEMINI_API_KEY في لوحة التحكم الخاصة بالمطور.' 
        });
      }

      const { residents, payments, expenses, year } = req.body;

      if (!residents || !payments || !expenses) {
        return res.status(400).json({ error: 'الرجاء توفير جميع البيانات المالية المطلوبة للتحليل.' });
      }

      // Initialize Gemini AI Client
      const ai = new GoogleGenAI({ apiKey });

      // Construct Prompt
      const prompt = `
أنت مستشار إدارة العقارات واتحادات الملاك وخبير مالي ذكي. بصفتك مستشار "بيراميدز فيو ١"، قم بتحليل البيانات المالية والتشغيلية التالية وقدم تقريراً شاملاً، اقتراحات تشغيلية ذكية، وتنبؤات بالميزانية المستقبلية باللغة العربية بأسلوب راقٍ ومحدد:

السنة المالية الحالية: ${year || new Date().getFullYear()}

بيانات السكان (السكان والنشاط):
${JSON.stringify(residents, null, 2)}

سجل التحصيلات (المدفوعات المستلمة):
${JSON.stringify(payments, null, 2)}

سجل المصروفات (النفقات):
${JSON.stringify(expenses, null, 2)}

يرجى هيكلة التقرير في الأقسام التالية بأسلوب مارك داون (Markdown):
1. **الوضع المالي العام (نظرة سريعة)**:
   - إجمالي التحصيلات الكلية والنسبة المئوية للتحصيل من إجمالي الاشتراكات المفترضة.
   - إجمالي المصروفات وصافي الفائض أو العجز المالي.
   - كفاءة تحصيل الاشتراكات (عدد السكان الملتزمين مقابل الممتنعين أو المتأخرين).

2. **تحليل المصروفات الكبرى**:
   - أكبر ثلاث فئات للمصروفات ونسبتها من إجمالي المصاريف.
   - تقييم ما إذا كانت هذه المصاريف معقولة أو تحتاج إلى ترشيد.

3. **اقتراحات ترشيد الإنفاق وزيادة الموارد (توصيات ذكية)**:
   - تقديم 3 توصيات ذكية على الأقل لخفض المصروفات (مثل توفير الطاقة، التعاقد مع شركات صيانة المصاعد، أو صيانة مياه الخزان بأساليب أوفر).
   - تقديم فكرتين على الأقل لزيادة الإيرادات (مثل اشتراكات مؤقتة، رسوم تشغيل للمحلات التجارية أو الأنشطة المفروشة إن وجدت).

4. **تنبيهات السكان المتأخرين والمتابعة**:
   - قائمة بأرقام الشقق وأسماء السكان المتأخرين في الدفع (أو ممتنعين) مع مبالغ التأخير التقريبية.
   - صياغة مقترحة لرسالة متابعة برفق ولطف لحثهم على السداد دون إحراج.

5. **توقعات الشهر القادم والميزانية التقديرية**:
   - التنبؤ بالمصروفات المطلوبة للشهر القادم بناءً على الأنماط السابقة وتحديد البنود الطارئة.

تأكد من أن يكون التقرير بلهجة مهنية محفزة، وأن يتضمن نصائح واضحة قابلة للتطبيق فوراً لاتحاد الملاك.
`;

      let reportText = '';
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: prompt,
        });
        reportText = response.text || '';
      } catch (geminiError: any) {
        console.warn('Primary model gemini-2.0-flash is experiencing issues, trying gemini-1.5-flash...', geminiError.message || geminiError);
        try {
          const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: prompt,
          });
          reportText = response.text || '';
        } catch (fallbackError: any) {
          console.error('All Gemini models failed:', fallbackError);
          throw new Error('فشل الاتصال بخدمة الذكاء الاصطناعي حالياً.');
        }
      }

      res.json({ result: reportText || 'عذراً، لم نتمكن من توليد التحليل في الوقت الحالي.' });

    } catch (error: any) {
      console.error('Error in /api/ai-suggest:', error);
      res.status(500).json({ error: error.message || 'حدث خطأ أثناء معالجة التحليل الذكي.' });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite middleware mounted in development mode.');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('Serving production static build from dist/.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} (0.0.0.0:3000)`);
  });
}

startServer();
