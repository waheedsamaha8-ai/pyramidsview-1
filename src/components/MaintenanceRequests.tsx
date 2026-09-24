import React, { useState } from 'react';
import { MaintenanceRequest, UserRole, Craftsman, CraftsmanComment } from '../types';
import { 
  Wrench, 
  Plus, 
  Clock, 
  Play, 
  CheckCircle, 
  AlertCircle, 
  Trash2, 
  Filter, 
  Calendar, 
  User, 
  Home, 
  Building,
  MessageSquare,
  Phone,
  HardHat,
  Users,
  Pencil,
  Star,
  X,
  MessageCircle,
  ExternalLink,
  Check,
  Share2,
  Contact
} from 'lucide-react';
import { CommunityHeader, CommunityCounts, CommunityServiceId } from './CommunityHeader';
import { formatMobileNumber, formatPhoneForDisplay, normalizePhoneInput, toWhatsAppNumber, pickContactFromDevice } from '../utils/phoneUtils';

const specialtyLabels: Record<string, string> = {
  'سباكة': 'سباكة 💧',
  'كهرباء': 'كهرباء ⚡',
  'مصاعد': 'مصاعد 🛗',
  'تكييف': 'تكييف ❄️',
  'نجارة': 'نجارة 🪚',
  'نقاشة': 'نقاشة 🎨',
  'ألوميتال': 'ألوميتال 🚪',
  'نظافة': 'نظافة 🧹',
  'أخرى': 'أخرى 🛠️'
};

interface MaintenanceRequestsProps {
  requests: MaintenanceRequest[];
  craftsmen: Craftsman[];
  role: UserRole;
  flatNumber?: number | string;
  userName: string;
  defaultSubTab?: 'requests' | 'directory';
  onAddRequest: (req: MaintenanceRequest) => void;
  onUpdateRequest: (id: string, updates: Partial<MaintenanceRequest>) => void;
  onDeleteRequest: (id: string) => void;
  onAddCraftsman: (craftsman: Craftsman) => void;
  onEditCraftsman: (craftsman: Craftsman) => void;
  onDeleteCraftsman: (id: string) => void;
  onAddCraftsmanComment: (craftsmanId: string, comment: CraftsmanComment) => void;
  onNavigateCommunity?: (serviceId: string) => void;
  communityCounts?: CommunityCounts;
}

export const MaintenanceRequests: React.FC<MaintenanceRequestsProps> = ({
  requests,
  craftsmen,
  role,
  flatNumber,
  userName,
  defaultSubTab = 'requests',
  onAddRequest,
  onUpdateRequest,
  onDeleteRequest,
  onAddCraftsman,
  onEditCraftsman,
  onDeleteCraftsman,
  onAddCraftsmanComment,
  onNavigateCommunity,
  communityCounts,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'requests' | 'directory'>(defaultSubTab);

  React.useEffect(() => {
    if (defaultSubTab) {
      setActiveSubTab(defaultSubTab);
    }
  }, [defaultSubTab]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddCraftsmanForm, setShowAddCraftsmanForm] = useState(false);
  const [filterScope, setFilterScope] = useState<'ALL' | 'MY_UNIT'>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterPriority, setFilterPriority] = useState<string>('ALL');
  const [filterSpecialty, setFilterSpecialty] = useState<string>('ALL');

  // Confirmation state for in-UI delete (avoiding iframe window.confirm blocking)
  const [confirmDeleteReqId, setConfirmDeleteReqId] = useState<string | null>(null);
  const [confirmDeleteCraftsmanId, setConfirmDeleteCraftsmanId] = useState<string | null>(null);

  // Edit Craftsman Modal State
  const [editingCraftsman, setEditingCraftsman] = useState<Craftsman | null>(null);
  const [editName, setEditName] = useState('');
  const [editSpecialty, setEditSpecialty] = useState('');
  const [customEditSpecialty, setCustomEditSpecialty] = useState('');
  const [isCustomEditSpecialty, setIsCustomEditSpecialty] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [editPhones, setEditPhones] = useState<string[]>(['']);
  const [editNotes, setEditNotes] = useState('');

  // Craftsman Comments Modal State
  const [selectedCraftsmanForComments, setSelectedCraftsmanForComments] = useState<Craftsman | null>(null);
  const [newCommentText, setNewCommentText] = useState('');
  const [newCommentRating, setNewCommentRating] = useState<number>(5);
  const [newCommentAuthor, setNewCommentAuthor] = useState(userName);
  const [newCommentFlat, setNewCommentFlat] = useState<string>(flatNumber ? String(flatNumber) : '');

  // Form states for new maintenance request
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'سباكة' | 'كهرباء' | 'مصاعد' | 'نظافة' | 'أخرى'>('أخرى');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [formFlatNumber, setFormFlatNumber] = useState<string>(flatNumber ? String(flatNumber) : '');
  const [formResidentName, setFormResidentName] = useState<string>(role === 'RESIDENT' ? userName : '');
  const [managerNotes, setManagerNotes] = useState<{ [id: string]: string }>({});

  // Form states for new craftsman
  const [craftsmanName, setCraftsmanName] = useState('');
  const [craftsmanSpecialty, setCraftsmanSpecialty] = useState('سباكة');
  const [customSpecialty, setCustomSpecialty] = useState('');
  const [isCustomSpecialty, setIsCustomSpecialty] = useState(false);
  const [craftsmanPhone, setCraftsmanPhone] = useState('');
  const [craftsmanPhones, setCraftsmanPhones] = useState<string[]>(['']);
  const [craftsmanNotes, setCraftsmanNotes] = useState('');

  const handlePickContactForCraftsman = async (index: number) => {
    const res = await pickContactFromDevice();
    if (res && res.supported === false) {
      alert('خاصية استيراد الأرقام من جهات الاتصال مدعومة على متصفحات الهواتف المحمولة (مثل Google Chrome على Android).');
      return;
    }
    if (res && res.tel) {
      const updated = [...craftsmanPhones];
      updated[index] = res.tel;
      setCraftsmanPhones(updated);
      if (!craftsmanName.trim() && res.name) {
        setCraftsmanName(res.name);
      }
    }
  };

  const handlePickContactForEditCraftsman = async (index: number) => {
    const res = await pickContactFromDevice();
    if (res && res.supported === false) {
      alert('خاصية استيراد الأرقام من جهات الاتصال مدعومة على متصفحات الهواتف المحمولة (مثل Google Chrome على Android).');
      return;
    }
    if (res && res.tel) {
      const updated = [...editPhones];
      updated[index] = res.tel;
      setEditPhones(updated);
      if (!editName.trim() && res.name) {
        setEditName(res.name);
      }
    }
  };

  // WhatsApp Link Formatter
  const formatWhatsAppLink = (phone: string, specialty: string, name: string) => {
    const waNumber = toWhatsAppNumber(phone);
    const msg = `السلام عليكم أستاذ ${name}، أتواصل معك بخصوص أعمال ${specialty} في عمارة بيراميدز فيو ١.`;
    return `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`;
  };

  // Helper to calculate average rating
  const getAverageRating = (comments?: CraftsmanComment[]) => {
    if (!comments || comments.length === 0) return null;
    const rated = comments.filter(c => typeof c.rating === 'number' && c.rating > 0);
    if (rated.length === 0) return null;
    const sum = rated.reduce((acc, c) => acc + (c.rating || 0), 0);
    return (sum / rated.length).toFixed(1);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    const parsedFlat = parseInt(formFlatNumber);
    if (isNaN(parsedFlat)) return;

    const newRequest: MaintenanceRequest = {
      id: `req_${Date.now()}`,
      flatNumber: parsedFlat,
      residentName: formResidentName || 'ساكن مجهول',
      title: title.trim(),
      description: description.trim(),
      category,
      status: 'PENDING',
      priority,
      date: new Date().toISOString().split('T')[0],
    };

    onAddRequest(newRequest);
    setTitle('');
    setDescription('');
    setCategory('أخرى');
    setPriority('MEDIUM');
    setShowAddForm(false);
  };

  const handleCraftsmanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalSpecialty = isCustomSpecialty ? customSpecialty.trim() : craftsmanSpecialty;
    const finalPhone = craftsmanPhones.map(p => formatMobileNumber(p.trim())).filter(Boolean).join(', ');
    if (!craftsmanName.trim() || !finalSpecialty || !finalPhone) return;

    const newCraftsman: Craftsman = {
      id: `cft_${Date.now()}`,
      name: craftsmanName.trim(),
      specialty: finalSpecialty,
      phone: finalPhone,
      notes: craftsmanNotes.trim(),
      addedBy: role === 'RESIDENT' ? (userName ? `${userName} (وحدة ${flatNumber || '?'})` : `وحدة ${flatNumber || 'ساكن'}`) : 'إدارة الاتحاد',
      comments: [],
    };

    onAddCraftsman(newCraftsman);
    setCraftsmanName('');
    setCraftsmanSpecialty('سباكة');
    setCustomSpecialty('');
    setIsCustomSpecialty(false);
    setCraftsmanPhone('');
    setCraftsmanPhones(['']);
    setCraftsmanNotes('');
    setShowAddCraftsmanForm(false);
  };

  const handleOpenEditCraftsman = (c: Craftsman) => {
    setEditingCraftsman(c);
    setEditName(c.name);
    const standardSpecialties = ['سباكة', 'كهرباء', 'مصاعد', 'تكييف', 'نجارة', 'نقاشة', 'ألوميتال', 'نظافة'];
    if (standardSpecialties.includes(c.specialty)) {
      setEditSpecialty(c.specialty);
      setIsCustomEditSpecialty(false);
      setCustomEditSpecialty('');
    } else {
      setEditSpecialty('أخرى');
      setIsCustomEditSpecialty(true);
      setCustomEditSpecialty(c.specialty);
    }
    setEditPhone(formatMobileNumber(c.phone));
    
    const parts = (c.phone || '').split(/[,/;|\n]+/).map(p => p.trim()).filter(Boolean);
    setEditPhones(parts.length > 0 ? parts : ['']);

    setEditNotes(c.notes || '');
  };

  const handleSaveEditedCraftsman = (e: React.FormEvent) => {
    e.preventDefault();
    const finalSpecialty = isCustomEditSpecialty ? customEditSpecialty.trim() : editSpecialty;
    const finalPhone = editPhones.map(p => formatMobileNumber(p.trim())).filter(Boolean).join(', ');
    if (!editingCraftsman || !editName.trim() || !finalSpecialty || !finalPhone) return;

    const updated: Craftsman = {
      ...editingCraftsman,
      name: editName.trim(),
      specialty: finalSpecialty,
      phone: finalPhone,
      notes: editNotes.trim(),
    };

    onEditCraftsman(updated);
    setEditingCraftsman(null);
  };

  const handleAddCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCraftsmanForComments || !newCommentText.trim()) return;

    const comment: CraftsmanComment = {
      id: `cmt_${Date.now()}`,
      senderName: newCommentAuthor.trim() || userName || 'ساكن',
      flatNumber: newCommentFlat ? parseInt(newCommentFlat) : flatNumber,
      text: newCommentText.trim(),
      rating: newCommentRating,
      timestamp: new Date().toISOString(),
    };

    onAddCraftsmanComment(selectedCraftsmanForComments.id, comment);

    // Update local modal state immediately
    const updatedComments = [...(selectedCraftsmanForComments.comments || []), comment];
    setSelectedCraftsmanForComments({
      ...selectedCraftsmanForComments,
      comments: updatedComments
    });

    setNewCommentText('');
    setNewCommentRating(5);
  };

  const handleShareCraftsmanWhatsApp = (c: Craftsman) => {
    const commentsText = c.comments && c.comments.length > 0
      ? c.comments.map(cmt => `• [شقة ${cmt.flatNumber || '?'}] ${cmt.senderName}: "${cmt.text}" (${'★'.repeat(cmt.rating || 5)}${'☆'.repeat(5 - (cmt.rating || 5))})`).join('\n')
      : 'لا توجد آراء مسجلة بعد.';

    const message = `*بطاقة فني من دليل صنايعية العمارة* 🛠️\n\n` +
      `👤 *الاسم:* ${c.name}\n` +
      `🔧 *التخصص:* ${c.specialty}\n` +
      `📞 *رقم الهاتف:* ${c.phone}\n\n` +
      `⭐️ *التقييمات وتعليقات السكان:*\n${commentsText}\n\n` +
      `تمت المشاركة من تطبيق إدارة العمارة السحابي 🏢`;

    const shareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(shareUrl, '_blank');
  };

  const handleShareRequestWhatsApp = (req: MaintenanceRequest) => {
    const statusLabel = req.status === 'PENDING' ? 'قيد الانتظار ⏳' : req.status === 'IN_PROGRESS' ? 'جاري العمل 🛠️' : 'تم الإنجاز ✓';
    const priorityLabel = req.priority === 'LOW' ? 'عادية' : req.priority === 'MEDIUM' ? 'متوسطة' : 'عاجلة جداً طارئة 🚨';
    
    const message = `*بلاغ صيانة - عمارة بيراميدز فيو ١* 🛠️\n\n` +
      `📍 *رقم الوحدة:* شقة ${req.flatNumber}\n` +
      `👤 *مقدم الطلب:* ${req.residentName}\n` +
      `📋 *العنوان:* ${req.title}\n` +
      `💬 *الوصف:* ${req.description}\n` +
      `📁 *الفئة:* ${req.category}\n` +
      `⚠️ *الأولوية:* ${priorityLabel}\n` +
      `📅 *التاريخ:* ${req.date}\n` +
      `⚡ *الحالة:* ${statusLabel}\n\n` +
      `تمت المشاركة من تطبيق إدارة العمارة السحابي 🏢`;

    const shareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(shareUrl, '_blank');
  };

  // Filter requests based on scope, status, and priority
  const filteredRequests = requests.filter(req => {
    if (filterScope === 'MY_UNIT' && flatNumber && req.flatNumber !== flatNumber) {
      return false;
    }
    if (filterStatus !== 'ALL' && req.status !== filterStatus) return false;
    if (filterPriority !== 'ALL' && req.priority !== filterPriority) return false;
    return true;
  });

  // Filter craftsmen
  const filteredCraftsmen = craftsmen.filter(c => {
    if (filterSpecialty === 'ALL') return true;
    if (filterSpecialty === 'أخرى') {
      const standards = ['سباكة', 'كهرباء', 'مصاعد', 'تكييف', 'نجارة', 'نقاشة', 'ألوميتال', 'نظافة'];
      return !standards.some(std => c.specialty.includes(std));
    }
    return c.specialty.includes(filterSpecialty);
  });

  const getStatusBadge = (status: MaintenanceRequest['status']) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200/60 rounded-full text-xs font-bold flex items-center gap-1 w-fit">
            <Clock className="w-3.5 h-3.5" />
            <span>قيد الانتظار</span>
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200/60 rounded-full text-xs font-bold flex items-center gap-1 w-fit">
            <Play className="w-3.5 h-3.5" />
            <span>جاري العمل</span>
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-full text-xs font-bold flex items-center gap-1 w-fit">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>تم الإنجاز</span>
          </span>
        );
    }
  };

  const getPriorityBadge = (prio: MaintenanceRequest['priority']) => {
    switch (prio) {
      case 'LOW':
        return <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold">عادية</span>;
      case 'MEDIUM':
        return <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold">متوسطة</span>;
      case 'HIGH':
        return <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-bold">عاجلة جداً</span>;
    }
  };

  const handleNavigateService = (srv: CommunityServiceId) => {
    if (srv === 'maintenance-requests') {
      setActiveSubTab('requests');
    } else if (srv === 'maintenance-directory') {
      setActiveSubTab('directory');
    } else if (onNavigateCommunity) {
      onNavigateCommunity(srv);
    }
  };

  return (
    <div className="w-full space-y-2.5 text-right animate-fade-in" id="maintenance-panel" dir="rtl">
      {/* 1. Unified Community Hub Header */}
      <CommunityHeader
        activeService={activeSubTab === 'requests' ? 'maintenance-requests' : 'maintenance-directory'}
        onNavigateService={handleNavigateService}
        title={activeSubTab === 'requests' ? 'طلبات وبلاغات الصيانة' : 'دليل الفنيين والصنايعية'}
        description={
          activeSubTab === 'requests' 
            ? 'متابعة بلاغات وإصلاحات مرافق وأعطال العمارة والوحدات السكنية.'
            : 'دليل شامل وموثوق لأرقام وهواتف أمهر الحرفيين المعتمدين مع تقييمات وتجارب السكان.'
        }
        icon={activeSubTab === 'requests' ? <Wrench className="w-4 h-4" /> : <HardHat className="w-4 h-4" />}
        badge={activeSubTab === 'requests' ? `${requests.length} بلاغ` : `${craftsmen.length} فني`}
        counts={communityCounts || {
          requests: requests.filter(r => r.status !== 'COMPLETED').length || requests.length,
          craftsmen: craftsmen.length,
        }}
        actionButton={
          role === 'ASSISTANT' ? undefined : (
            activeSubTab === 'requests' ? (
              <button
                type="button"
                onClick={() => setShowAddForm(!showAddForm)}
                className="px-3 py-1.5 bg-blue-900 hover:bg-blue-950 text-white rounded-lg text-xs font-bold transition shadow-2xs flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{showAddForm ? 'إلغاء النموذج' : 'طلب صيانة جديد'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddCraftsmanForm(!showAddCraftsmanForm)}
                className="px-3 py-1.5 bg-blue-900 hover:bg-blue-950 text-white rounded-lg text-xs font-bold transition shadow-2xs flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{showAddCraftsmanForm ? 'إلغاء النموذج' : 'إضافة فني جديد'}</span>
              </button>
            )
          )
        }
      />

      {/* 2. Subtabs Switcher (Requests vs Directory) */}
      <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/80 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setActiveSubTab('requests')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
            activeSubTab === 'requests'
              ? 'bg-blue-900 text-white shadow-2xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700/50'
          }`}
        >
          <Wrench className="w-3.5 h-3.5" />
          <span>بلاغات وطلبات الصيانة</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${activeSubTab === 'requests' ? 'bg-blue-800 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
            {requests.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('directory')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
            activeSubTab === 'directory'
              ? 'bg-blue-900 text-white shadow-2xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700/50'
          }`}
        >
          <HardHat className="w-3.5 h-3.5" />
          <span>دليل الفنيين والصنايعية</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${activeSubTab === 'directory' ? 'bg-blue-800 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
            {craftsmen.length}
          </span>
        </button>
      </div>

      {activeSubTab === 'requests' ? (
        <div className="space-y-3.5">
          {/* Add Request Form */}
          {showAddForm && role !== 'ASSISTANT' && (
            <form onSubmit={handleSubmit} className="bg-white dark:bg-[#111a2e] border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 rounded-2xl space-y-3.5 shadow-md animate-scale-up">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-blue-900 dark:text-blue-300" />
                  <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100">تفاصيل البلاغ أو الطلب الجديد</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">عنوان الطلب أو المشكلة</label>
                  <input
                    type="text"
                    placeholder="مثال: عطل في إنارة السلم أو تسريب مياه في المنور"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-xs outline-none font-bold transition"
                    required
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">نوع المشكلة (الفئة)</label>
                    <select
                      value={category}
                      onChange={(e: any) => setCategory(e.target.value)}
                      className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none cursor-pointer"
                    >
                      <option value="سباكة">سباكة 💧</option>
                      <option value="كهرباء">كهرباء ⚡</option>
                      <option value="مصاعد">مصاعد 🛗</option>
                      <option value="نظافة">نظافة 🧹</option>
                      <option value="أخرى">أخرى 🛠️</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">الأولوية والسرعة</label>
                    <select
                      value={priority}
                      onChange={(e: any) => setPriority(e.target.value)}
                      className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none cursor-pointer"
                    >
                      <option value="LOW">عادية (منخفضة)</option>
                      <option value="MEDIUM">متوسطة الأهمية</option>
                      <option value="HIGH">عاجلة جداً طارئة</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">رقم الوحدة المصدر</label>
                  <input
                    type="number"
                    placeholder="رقم الوحدة"
                    value={formFlatNumber}
                    onChange={(e) => setFormFlatNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
                    disabled={role === 'RESIDENT' && !!flatNumber}
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">اسم مقدم الطلب</label>
                  <input
                    type="text"
                    placeholder="الاسم الثلاثي لساكن الوحدة"
                    value={formResidentName}
                    onChange={(e) => setFormResidentName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
                    disabled={role === 'RESIDENT'}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">شرح ووصف تفصيلي للأعطال</label>
                <textarea
                  placeholder="اكتب هنا كافة تفاصيل المشكلة ومكان تواجد العطل وموعد تكراره..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none transition"
                  required
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/10 cursor-pointer transition"
                >
                  إرسال وتسجيل الطلب
                </button>
              </div>
            </form>
          )}

          {/* Scope Selector for Building vs My Unit */}
          {flatNumber && (
            <div className="flex items-center gap-2 bg-white dark:bg-[#111a2e] p-2 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-extrabold text-[11px] pr-1 whitespace-nowrap">عرض البلاغات:</span>
              <div className="flex items-center gap-1.5 flex-1">
                <button
                  type="button"
                  onClick={() => setFilterScope('ALL')}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    filterScope === 'ALL'
                      ? 'bg-blue-900 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <Building className="w-3.5 h-3.5" />
                  <span>جميع بلاغات العمارة ({requests.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilterScope('MY_UNIT')}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    filterScope === 'MY_UNIT'
                      ? 'bg-blue-900 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <Home className="w-3.5 h-3.5" />
                  <span>بلاغات وحدتي ({requests.filter(r => r.flatNumber === flatNumber).length})</span>
                </button>
              </div>
            </div>
          )}

          {/* Filters: Priority & Status on Single Row */}
          <div className="grid grid-cols-2 gap-2 bg-white dark:bg-[#111a2e] p-2.5 sm:p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 dark:text-slate-400 font-bold whitespace-nowrap text-[11px]">حالة الطلب:</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="flex-1 min-w-0 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg font-bold text-xs outline-none cursor-pointer"
              >
                <option value="ALL">جميع الحالات</option>
                <option value="PENDING">قيد الانتظار</option>
                <option value="IN_PROGRESS">جاري العمل</option>
                <option value="COMPLETED">تم الإنجاز</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 dark:text-slate-400 font-bold whitespace-nowrap text-[11px]">الأولوية:</span>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="flex-1 min-w-0 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg font-bold text-xs outline-none cursor-pointer"
              >
                <option value="ALL">جميع المستويات</option>
                <option value="LOW">عادية</option>
                <option value="MEDIUM">متوسطة</option>
                <option value="HIGH">عاجلة جداً</option>
              </select>
            </div>
          </div>

          {/* Requests List */}
          {filteredRequests.length === 0 ? (
            <div className="bg-white dark:bg-[#111a2e] py-12 text-center rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
              <AlertCircle className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2 stroke-[1.5]" />
              <h4 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200">لا توجد طلبات مسجلة مطابقة</h4>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 font-bold mt-0.5">تظهر هنا كشوف الصيانة والأعطال الجارية في العمارة.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredRequests.map((req) => (
                <div key={req.id} className="bg-white dark:bg-[#111a2e] border border-slate-200/80 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-800/60 rounded-2xl p-4 sm:p-5 shadow-xs transition flex flex-col justify-between relative">
                  
                  <div>
                    {/* Header inside card */}
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {getPriorityBadge(req.priority)}
                        {getStatusBadge(req.status)}
                        {flatNumber && req.flatNumber === flatNumber && (
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200/70 rounded-full text-[10px] font-black flex items-center gap-1">
                            <Home className="w-2.5 h-2.5" />
                            <span>خاص بوحدتي</span>
                          </span>
                        )}
                      </div>
                      
                      <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-black rounded text-[10px]">
                        {req.category}
                      </span>
                    </div>

                    <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 mb-1">{req.title}</h4>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300 leading-relaxed mb-2.5">{req.description}</p>
                    
                    {/* Meta details */}
                    <div className="grid grid-cols-2 gap-1.5 text-[10px] text-slate-400 dark:text-slate-500 border-t border-b border-slate-100 dark:border-slate-800 py-2 mb-2 font-bold">
                      <div className="flex items-center gap-1">
                        <Home className="w-3 h-3 text-slate-400" />
                        <span>وحدة: {req.flatNumber}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-400" />
                        <span>المُبلغ: {req.residentName}</span>
                      </div>
                      <div className="flex items-center gap-1 col-span-2">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>تاريخ البلاغ: {req.date}</span>
                      </div>
                    </div>

                    {/* Manager comments / actions notes */}
                    {req.notes && (
                      <div className="bg-blue-50/50 rounded-xl p-2.5 mb-2 text-xs font-semibold text-blue-900 border border-blue-100/50 flex gap-2">
                        <MessageSquare className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                        <div>
                          <span className="font-extrabold block mb-0.5">ملاحظات الإدارة:</span>
                          <span>{req.notes}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions & Delete Confirmation */}
                  <div className="mt-1 border-t border-slate-100 pt-2">
                    {/* Inline Delete Confirmation View */}
                    {confirmDeleteReqId === req.id ? (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 text-center animate-fade-in">
                        <p className="text-xs font-bold text-red-800 mb-1.5">هل أنت متأكد من رغبتك في حذف هذا البلاغ نهائياً؟</p>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              onDeleteRequest(req.id);
                              setConfirmDeleteReqId(null);
                            }}
                            className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg transition cursor-pointer flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>نعم، احذف البلاغ</span>
                          </button>
                          <button
                            onClick={() => setConfirmDeleteReqId(null)}
                            className="px-2.5 py-1 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs rounded-lg transition cursor-pointer"
                          >
                            إلغاء
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {role !== 'RESIDENT' && role !== 'ASSISTANT' ? (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-[10px] text-slate-400 font-extrabold whitespace-nowrap">الحالة:</span>
                              <button
                                onClick={() => onUpdateRequest(req.id, { status: 'PENDING' })}
                                className={`px-2 py-0.5 text-[10px] font-bold rounded-lg border transition cursor-pointer ${req.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-300 shadow-xs' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                              >
                                قيد الانتظار
                              </button>
                              <button
                                onClick={() => onUpdateRequest(req.id, { status: 'IN_PROGRESS' })}
                                className={`px-2 py-0.5 text-[10px] font-bold rounded-lg border transition cursor-pointer ${req.status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-xs' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                              >
                                جاري العمل
                              </button>
                              <button
                                onClick={() => onUpdateRequest(req.id, { status: 'COMPLETED' })}
                                className={`px-2 py-0.5 text-[10px] font-bold rounded-lg border transition cursor-pointer ${req.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-xs' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                              >
                                تم الإنجاز
                              </button>
                            </div>

                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                placeholder="أضف ملاحظات أو توجيه للإدارة..."
                                value={managerNotes[req.id] || ''}
                                onChange={(e) => setManagerNotes({ ...managerNotes, [req.id]: e.target.value })}
                                className="flex-1 px-2.5 py-1 bg-slate-50 border border-slate-200 focus:bg-white rounded-lg text-[11px] outline-none transition"
                              />
                              <button
                                onClick={() => {
                                  if (managerNotes[req.id]?.trim()) {
                                    onUpdateRequest(req.id, { notes: managerNotes[req.id].trim() });
                                    setManagerNotes({ ...managerNotes, [req.id]: '' });
                                  }
                                }}
                                className="px-2.5 py-1 bg-blue-900 text-white text-[11px] font-bold rounded-lg hover:bg-blue-950 transition cursor-pointer"
                              >
                                حفظ
                              </button>
                            </div>

                            <div className="flex justify-between items-center pt-1 border-t border-slate-100 dark:border-slate-800 mt-1">
                              <button
                                onClick={() => handleShareRequestWhatsApp(req)}
                                className="text-emerald-600 hover:text-emerald-700 flex items-center gap-1 text-[11px] font-bold hover:bg-emerald-50 px-2 py-1 rounded-lg transition border border-emerald-100 cursor-pointer"
                              >
                                <Share2 className="w-3 h-3" />
                                <span>مشاركة البلاغ</span>
                              </button>

                              <button
                                onClick={() => setConfirmDeleteReqId(req.id)}
                                className="text-red-500 hover:text-red-700 flex items-center gap-1 text-[11px] font-bold hover:bg-red-50 px-2 py-1 rounded-lg transition border border-red-100 cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>إزالة البلاغ نهائياً</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-between items-center pt-1.5 border-t border-slate-50 mt-1.5 flex-wrap gap-2">
                            <span className="text-[10px] text-slate-400 font-semibold">
                              {req.status === 'PENDING' ? 'بانتظار مراجعة الاتحاد' : req.status === 'IN_PROGRESS' ? 'جاري متابعة الصيانة' : 'تم إنهاء الطلب'}
                            </span>
                            
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleShareRequestWhatsApp(req)}
                                className="text-emerald-600 hover:text-emerald-700 flex items-center gap-1 text-[11px] font-bold hover:bg-emerald-50 px-2 py-1 rounded-lg transition border border-emerald-100 cursor-pointer"
                              >
                                <Share2 className="w-3 h-3" />
                                <span>مشاركة</span>
                              </button>

                              {((flatNumber !== undefined && req.flatNumber === flatNumber) ||
                                (Boolean(userName) && Boolean(req.residentName) && req.residentName.trim().toLowerCase() === userName.trim().toLowerCase())) ? (
                                <button
                                  onClick={() => setConfirmDeleteReqId(req.id)}
                                  className="text-red-500 hover:text-red-700 flex items-center gap-1 text-[11px] font-bold hover:bg-red-50 px-2 py-1 rounded-lg transition border border-red-100 cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>إلغاء البلاغ</span>
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-400 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded font-bold">
                                  مقدم من الجيران
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Craftsmen Directory Section */
        <div className="space-y-3.5 animate-fade-in">
          {/* Specialty Filter in a Dropdown */}
          <div className="flex items-center gap-2 bg-white dark:bg-[#111a2e] p-2.5 sm:p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap">تصفية التخصص:</span>
            <select
              value={filterSpecialty}
              onChange={(e) => setFilterSpecialty(e.target.value)}
              className="flex-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg text-xs font-bold outline-none cursor-pointer"
            >
              <option value="ALL">جميع التخصصات المتاحة 🛠️</option>
              <option value="سباكة">سباكة 💧</option>
              <option value="كهرباء">كهرباء ⚡</option>
              <option value="مصاعد">مصاعد 🛗</option>
              <option value="تكييف">تكييف ❄️</option>
              <option value="نجارة">نجارة 🪚</option>
              <option value="نقاشة">نقاشة 🎨</option>
              <option value="ألوميتال">ألوميتال 🚪</option>
              <option value="نظافة">نظافة 🧹</option>
              <option value="أخرى">أخرى 🛠️</option>
            </select>
          </div>

          {/* Add Craftsman Form */}
          {showAddCraftsmanForm && (
            <form onSubmit={handleCraftsmanSubmit} className="bg-white dark:bg-[#111a2e] border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 rounded-2xl space-y-3.5 shadow-md animate-scale-up">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <HardHat className="w-4 h-4 text-blue-900 dark:text-blue-300" />
                  <h5 className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100">بيانات الفني أو الصنايعي الجديد</h5>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddCraftsmanForm(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">اسم الفني / الصنايعي</label>
                  <input
                    type="text"
                    placeholder="مثال: الأسطى أحمد السباك"
                    value={craftsmanName}
                    onChange={(e) => setCraftsmanName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none focus:border-blue-500 transition"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">التخصص</label>
                  <select
                    value={craftsmanSpecialty}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCraftsmanSpecialty(val);
                      setIsCustomSpecialty(val === 'أخرى');
                    }}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none focus:border-blue-500 transition cursor-pointer"
                  >
                    <option value="سباكة">سباكة 💧</option>
                    <option value="كهرباء">كهرباء ⚡</option>
                    <option value="مصاعد">مصاعد 🛗</option>
                    <option value="تكييف">تكييف ❄️</option>
                    <option value="نجارة">نجارة 🪚</option>
                    <option value="نقاشة">نقاشة 🎨</option>
                    <option value="ألوميتال">ألوميتال 🚪</option>
                    <option value="نظافة">نظافة 🧹</option>
                    <option value="أخرى">أخرى 🛠️</option>
                  </select>
                  {isCustomSpecialty && (
                    <input
                      type="text"
                      placeholder="اكتب التخصص المخصص هنا..."
                      value={customSpecialty}
                      onChange={(e) => setCustomSpecialty(e.target.value)}
                      className="w-full mt-2 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none focus:border-blue-500 transition"
                      required
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">أرقام هواتف الصنايعي</label>
                  <div className="space-y-2">
                    {craftsmanPhones.map((num, index) => (
                      <div key={index} className="flex items-center gap-1.5">
                        <input
                          type="text"
                          placeholder="01xxxxxxxxx"
                          value={num}
                          onChange={(e) => {
                            const updated = [...craftsmanPhones];
                            updated[index] = normalizePhoneInput(e.target.value);
                            setCraftsmanPhones(updated);
                          }}
                          onBlur={() => {
                            const updated = [...craftsmanPhones];
                            updated[index] = formatMobileNumber(num);
                            setCraftsmanPhones(updated);
                          }}
                          dir="ltr"
                          className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-mono font-bold outline-none focus:border-blue-500 transition text-left"
                        />
                        <button
                          type="button"
                          onClick={() => handlePickContactForCraftsman(index)}
                          className="w-9 h-9 bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40 border border-amber-200/80 dark:border-amber-700/60 rounded-xl flex items-center justify-center transition shrink-0 cursor-pointer shadow-2xs"
                          title="استيراد الرقم من سجل جهات اتصال الهاتف"
                        >
                          <Contact className="w-4 h-4 stroke-[2]" />
                        </button>
                        {index === craftsmanPhones.length - 1 ? (
                          <button
                            type="button"
                            onClick={() => setCraftsmanPhones([...craftsmanPhones, ''])}
                            className="w-9 h-9 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center hover:bg-blue-100 dark:hover:bg-blue-900/40 transition shrink-0 cursor-pointer"
                            title="إضافة رقم آخر"
                          >
                            <Plus className="w-4 h-4 stroke-[2.5]" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = craftsmanPhones.filter((_, i) => i !== index);
                              setCraftsmanPhones(updated.length > 0 ? updated : ['']);
                            }}
                            className="w-9 h-9 bg-rose-50 dark:bg-rose-950/40 text-rose-500 dark:text-rose-400 rounded-xl flex items-center justify-center hover:bg-rose-100 dark:hover:bg-rose-900/40 transition shrink-0 cursor-pointer"
                            title="حذف الرقم"
                          >
                            <Trash2 className="w-4 h-4 stroke-[1.5]" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">ملاحظات أولية أو نبذة عن عمله</label>
                <textarea
                  placeholder="اكتب نبذة عن التزامه بالمواعيد وجودة المصنعية والأسعار..."
                  value={craftsmanNotes}
                  onChange={(e) => setCraftsmanNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none focus:border-blue-500 transition"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button 
                  type="submit" 
                  className="px-5 py-2 bg-blue-900 hover:bg-blue-950 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-900/10 cursor-pointer transition"
                >
                  حفظ في الدليل
                </button>
              </div>
            </form>
          )}

          {/* Craftsmen Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {filteredCraftsmen.length === 0 ? (
              <div className="col-span-full py-8 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
                <HardHat className="w-8 h-8 mx-auto mb-2 opacity-30 stroke-[1.5]" />
                <p className="text-xs font-bold">لا توجد بيانات مسجلة في هذا التخصص حالياً.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">يمكنك إضافة أرقام الصنايعية الموثوقين لمساعدة جيرانك.</p>
              </div>
            ) : (
              filteredCraftsmen.map((c) => {
                const avgRating = getAverageRating(c.comments);
                const commentsCount = c.comments ? c.comments.length : 0;
                const isMyCraftsman = role === 'ADMIN' || (
                  (Boolean(userName) && Boolean(c.addedBy) && c.addedBy.toLowerCase().includes(userName.toLowerCase().trim())) ||
                  (flatNumber !== undefined && Boolean(c.addedBy) && c.addedBy.includes(String(flatNumber))) ||
                  (role === 'ASSISTANT' && Boolean(c.addedBy) && (c.addedBy.includes('المساعد الفني') || c.addedBy.includes('فني الصيانة')))
                );

                return (
                  <div 
                    key={c.id} 
                    className="bg-white dark:bg-[#111a2e] border border-slate-200/80 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-800/60 rounded-2xl p-4 sm:p-5 shadow-xs transition flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Header */}
                      <div className="flex justify-between items-start mb-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 bg-blue-50 dark:bg-blue-900/40 text-blue-900 dark:text-blue-300 rounded-xl flex items-center justify-center shrink-0">
                            <HardHat className="w-5 h-5" />
                          </div>
                          <div>
                            <h5 className="text-sm font-black text-slate-900 dark:text-slate-100">{c.name}</h5>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              <span className="text-[10px] text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/40 px-2 py-0.5 rounded-md font-black inline-block">
                                {c.specialty}
                              </span>
                              {c.phone && (
                                <div className="flex flex-col text-[10px] text-slate-600 dark:text-slate-300 font-mono font-bold" dir="ltr">
                                  {c.phone.split(/[,/;|\n]+/).map((part, idx) => {
                                    const trimmedPart = part.trim();
                                    if (!trimmedPart) return null;
                                    return (
                                      <span key={idx} className="phone-number-display block">
                                        {formatPhoneForDisplay(trimmedPart)}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Edit & Delete Action Buttons */}
                        {isMyCraftsman ? (
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => handleOpenEditCraftsman(c)}
                              title="تعديل بيانات الفني"
                              className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            
                            <button 
                              onClick={() => setConfirmDeleteCraftsmanId(c.id)}
                              title="حذف الفني من الدليل"
                              className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition cursor-pointer border border-transparent hover:border-red-200 dark:hover:border-red-900"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-bold bg-slate-50 dark:bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-100 dark:border-slate-800">
                            معتمد بالدليل
                          </span>
                        )}
                      </div>

                      {/* Ratings Summary */}
                      <div className="flex items-center gap-1.5 mb-2.5 bg-amber-50/60 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 px-2.5 py-1.5 rounded-xl">
                        <div className="flex items-center text-amber-500">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        </div>
                        <span className="text-xs font-black text-amber-900 dark:text-amber-300">
                          {avgRating ? `${avgRating} / 5` : 'بدون تقييم بعد'}
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold mr-auto">
                          ({commentsCount} {commentsCount === 1 ? 'تقييم' : commentsCount === 2 ? 'تقييمان' : 'تقييمات'})
                        </span>
                      </div>

                      {/* Notes / Description */}
                      {c.notes && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 font-medium bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl leading-relaxed mb-2.5 border border-slate-100 dark:border-slate-800">
                          {c.notes}
                        </p>
                      )}
                    </div>

                    {/* Delete Confirmation In-Card */}
                    {confirmDeleteCraftsmanId === c.id ? (
                      <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl p-2.5 text-center animate-fade-in mt-1.5">
                        <p className="text-xs font-bold text-red-800 dark:text-red-300 mb-1.5">هل تريد حذف "{c.name}" من الدليل؟</p>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              onDeleteCraftsman(c.id);
                              setConfirmDeleteCraftsmanId(null);
                            }}
                            className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg transition cursor-pointer"
                          >
                            تأكيد الحذف
                          </button>
                          <button
                            onClick={() => setConfirmDeleteCraftsmanId(null)}
                            className="px-2.5 py-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-lg transition cursor-pointer"
                          >
                            إلغاء
                          </button>
                        </div>
                      </div>
                     ) : (
                      <div className="space-y-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        {/* Quick Contact Buttons (Call & WhatsApp) */}
                        <div className="space-y-2">
                          {c.phone.split(/[,/;|\n]+/).map((part, pIdx) => {
                            const singlePhone = part.trim();
                            if (!singlePhone) return null;
                            const cleanPhone = formatMobileNumber(singlePhone);
                            const waUrl = formatWhatsAppLink(cleanPhone, c.specialty, c.name);
                            return (
                              <div key={pIdx} className="grid grid-cols-2 gap-2">
                                <a 
                                  href={`tel:${cleanPhone}`} 
                                  className="flex items-center justify-center gap-1.5 text-xs font-black text-blue-900 dark:text-blue-200 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200/80 dark:border-blue-800/80 py-2 px-2 rounded-xl transition text-center"
                                  title={`اتصال هاتفياً بالفني برقم: ${singlePhone}`}
                                >
                                  <Phone className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400 shrink-0" />
                                  <span className="truncate">{formatPhoneForDisplay(singlePhone)}</span>
                                </a>

                                <a 
                                  href={waUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="flex items-center justify-center gap-1.5 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs py-2 px-2 rounded-xl transition text-center cursor-pointer"
                                  title={`مراسلة الفني عبر الواتساب برقم: ${singlePhone}`}
                                >
                                  <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span>واتساب</span>
                                </a>
                              </div>
                            );
                          })}
                        </div>

                        {/* Comments & Share Buttons */}
                        <div className="grid grid-cols-2 gap-2">
                          {/* Comments & Reviews Trigger */}
                          <button
                            onClick={() => setSelectedCraftsmanForComments(c)}
                            className="flex items-center justify-between text-[11px] font-black text-slate-700 dark:text-slate-200 hover:text-blue-900 dark:hover:text-blue-300 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 py-2 px-2 rounded-xl transition cursor-pointer"
                          >
                            <div className="flex items-center gap-1 min-w-0">
                              <MessageSquare className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              <span className="truncate">آراء الجيران</span>
                            </div>
                            <span className="px-1.5 py-0.5 bg-white dark:bg-slate-900 rounded-md text-[9px] text-blue-800 dark:text-blue-300 font-black border border-slate-200 dark:border-slate-800 shrink-0">
                              {commentsCount}
                            </span>
                          </button>

                          {/* WhatsApp Share Button */}
                          <button
                            onClick={() => handleShareCraftsmanWhatsApp(c)}
                            className="flex items-center justify-center gap-1.5 text-[11px] font-black text-slate-700 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-emerald-400 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 py-2 px-2 rounded-xl transition cursor-pointer"
                            title="مشاركة كارت الفني على الواتساب شامل الاسم والتلفون والتعليقات"
                          >
                            <Share2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>مشاركة الكارت</span>
                          </button>
                        </div>

                        <div className="flex justify-between items-center text-[10px] text-slate-400 dark:text-slate-500 font-bold pt-0.5">
                          <span>أضيف بواسطة: {c.addedBy}</span>
                        </div>
                      </div>
                    )}

                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Edit Craftsman Modal */}
      {editingCraftsman && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-[#111a2e] w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-200/80 dark:border-slate-800 text-right animate-scale-up">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
              <button 
                onClick={() => setEditingCraftsman(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2">
                <h4 className="text-base font-black text-slate-900 dark:text-slate-100">تعديل بيانات الفني</h4>
                <Pencil className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
            </div>

            <form onSubmit={handleSaveEditedCraftsman} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">اسم الفني / الصنايعي</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 transition"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">التخصص</label>
                  <select
                    value={editSpecialty}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditSpecialty(val);
                      setIsCustomEditSpecialty(val === 'أخرى');
                    }}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 transition cursor-pointer"
                  >
                    <option value="سباكة">سباكة 💧</option>
                    <option value="كهرباء">كهرباء ⚡</option>
                    <option value="مصاعد">مصاعد 🛗</option>
                    <option value="تكييف">تكييف ❄️</option>
                    <option value="نجارة">نجارة 🪚</option>
                    <option value="نقاشة">نقاشة 🎨</option>
                    <option value="ألوميتال">ألوميتال 🚪</option>
                    <option value="نظافة">نظافة 🧹</option>
                    <option value="أخرى">أخرى 🛠️</option>
                  </select>
                  {isCustomEditSpecialty && (
                    <input
                      type="text"
                      placeholder="اكتب التخصص المخصص هنا..."
                      value={customEditSpecialty}
                      onChange={(e) => setCustomEditSpecialty(e.target.value)}
                      className="w-full mt-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 transition"
                      required
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">أرقام هواتف الصنايعي</label>
                  <div className="space-y-2">
                    {editPhones.map((num, index) => (
                      <div key={index} className="flex items-center gap-1.5">
                        <input
                          type="text"
                          placeholder="01xxxxxxxxx"
                          value={num}
                          onChange={(e) => {
                            const updated = [...editPhones];
                            updated[index] = normalizePhoneInput(e.target.value);
                            setEditPhones(updated);
                          }}
                          onBlur={() => {
                            const updated = [...editPhones];
                            updated[index] = formatMobileNumber(num);
                            setEditPhones(updated);
                          }}
                          dir="ltr"
                          className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-mono font-bold outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 transition text-left"
                        />
                        <button
                          type="button"
                          onClick={() => handlePickContactForEditCraftsman(index)}
                          className="w-9 h-9 bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40 border border-amber-200/80 dark:border-amber-700/60 rounded-xl flex items-center justify-center transition shrink-0 cursor-pointer shadow-2xs"
                          title="استيراد الرقم من سجل جهات اتصال الهاتف"
                        >
                          <Contact className="w-4 h-4 stroke-[2]" />
                        </button>
                        {index === editPhones.length - 1 ? (
                          <button
                            type="button"
                            onClick={() => setEditPhones([...editPhones, ''])}
                            className="w-9 h-9 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center hover:bg-blue-100 dark:hover:bg-blue-900/40 transition shrink-0 cursor-pointer"
                            title="إضافة رقم آخر"
                          >
                            <Plus className="w-4 h-4 stroke-[2.5]" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = editPhones.filter((_, i) => i !== index);
                              setEditPhones(updated.length > 0 ? updated : ['']);
                            }}
                            className="w-9 h-9 bg-rose-50 dark:bg-rose-950/40 text-rose-500 dark:text-rose-400 rounded-xl flex items-center justify-center hover:bg-rose-100 dark:hover:bg-rose-900/40 transition shrink-0 cursor-pointer"
                            title="حذف الرقم"
                          >
                            <Trash2 className="w-4 h-4 stroke-[1.5]" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">ملاحظات وتفاصيل العمل</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 transition"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingCraftsman(null)}
                  className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-900 hover:bg-blue-950 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-900/10 transition cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>حفظ التعديلات</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Craftsman Comments & Reviews Modal */}
      {selectedCraftsmanForComments && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-[#111a2e] w-full max-w-xl rounded-3xl p-6 shadow-2xl border border-slate-200/80 dark:border-slate-800 text-right animate-scale-up max-h-[90vh] flex flex-col">
            
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
              <button 
                onClick={() => setSelectedCraftsmanForComments(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="text-right">
                <div className="flex items-center gap-2 justify-end">
                  <span className="text-[11px] text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/40 px-2 py-0.5 rounded font-extrabold">{selectedCraftsmanForComments.specialty}</span>
                  <h4 className="text-base font-black text-slate-900 dark:text-slate-100">تقييمات وتجارب: {selectedCraftsmanForComments.name}</h4>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-400 mt-0.5 font-semibold">شارك تجربتك مع هذا الفني لمساعدة سكان العمارة في اختيار الأفضل.</p>
              </div>
            </div>

            {/* Comments List (Scrollable) */}
            <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1 pl-1">
              {(!selectedCraftsmanForComments.comments || selectedCraftsmanForComments.comments.length === 0) ? (
                <div className="py-8 text-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl text-slate-400">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30 stroke-[1.5]" />
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300">لا توجد تعليقات أو تقييمات مسجلة بعد</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">كن أول من يكتب تقييماً عن جودة عمل هذا الفني!</p>
                </div>
              ) : (
                selectedCraftsmanForComments.comments.map((comment) => (
                  <div key={comment.id} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 p-3.5 rounded-2xl">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-1 text-amber-500">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star 
                            key={star} 
                            className={`w-3.5 h-3.5 ${star <= (comment.rating || 5) ? 'fill-amber-400 text-amber-400' : 'text-slate-200 dark:text-slate-700'}`} 
                          />
                        ))}
                      </div>

                      <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800 dark:text-slate-200">
                        <span>{comment.senderName}</span>
                        {comment.flatNumber && (
                          <span className="text-[10px] bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded font-bold">
                            شقة {comment.flatNumber}
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 font-semibold leading-relaxed mb-2">
                      {comment.text}
                    </p>

                    <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold text-left">
                      {new Date(comment.timestamp).toLocaleDateString('ar-EG', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add Comment Form */}
            <form onSubmit={handleAddCommentSubmit} className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">إضافة تقييم جديد:</span>
                
                {/* Interactive Star Rating */}
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 ml-1">التقييم:</span>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      type="button"
                      key={star}
                      onClick={() => setNewCommentRating(star)}
                      className="p-1 text-amber-400 hover:scale-110 transition cursor-pointer"
                    >
                      <Star className={`w-4 h-4 ${star <= newCommentRating ? 'fill-amber-400 text-amber-400' : 'text-slate-200 dark:text-slate-700'}`} />
                    </button>
                  ))}
                  <span className="text-xs font-black text-amber-900 dark:text-amber-300 mr-1">({newCommentRating}/5)</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="اسمك (كاتب التقييم)"
                  value={newCommentAuthor}
                  onChange={(e) => setNewCommentAuthor(e.target.value)}
                  className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none"
                  required
                />
                <input
                  type="number"
                  placeholder="رقم شقتك (اختياري)"
                  value={newCommentFlat}
                  onChange={(e) => setNewCommentFlat(e.target.value)}
                  className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none"
                />
              </div>

              <div>
                <textarea
                  placeholder="اكتب تجربتك مع الفني (الالتزام بالمواعيد، جودة الشغل، الأسعار، المعاملة)..."
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 transition"
                  required
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-600/10 transition cursor-pointer"
                >
                  نشر التقييم
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
};
