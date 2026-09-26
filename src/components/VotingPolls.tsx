import React, { useState } from 'react';
import { 
  Vote, 
  Plus, 
  Trash2, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Lock, 
  Unlock,
  Users, 
  Calendar,
  FileCheck2,
  Edit3,
  Search,
  Filter,
  ShieldCheck,
  Building2,
  Tag,
  Scale,
  Share2
} from 'lucide-react';
import { Poll, PollOption, AdminDecision, UserRole } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { CommunityHeader, CommunityServiceId, CommunityCounts } from './CommunityHeader';

interface VotingPollsProps {
  polls: Poll[];
  decisions?: AdminDecision[];
  role: UserRole;
  userEmail: string;
  defaultSubTab?: 'polls' | 'decisions';
  onAddPoll: (poll: Poll) => void;
  onVote: (pollId: string, optionId: string, userEmail: string) => void;
  onClosePoll: (pollId: string) => void;
  onReopenPoll?: (pollId: string) => void;
  onDeletePoll: (pollId: string) => void;
  onAddDecision?: (decision: AdminDecision) => void;
  onEditDecision?: (decision: AdminDecision) => void;
  onDeleteDecision?: (decisionId: string) => void;
  onNavigateCommunity?: (serviceId: string) => void;
  communityCounts?: CommunityCounts;
}

export const VotingPolls: React.FC<VotingPollsProps> = ({
  polls,
  decisions = [],
  role,
  userEmail,
  defaultSubTab = 'polls',
  onAddPoll,
  onVote,
  onClosePoll,
  onReopenPoll,
  onDeletePoll,
  onAddDecision,
  onEditDecision,
  onDeleteDecision,
  onNavigateCommunity,
  communityCounts,
}) => {
  // Main section tabs: 'polls' | 'decisions'
  const [activeTab, setActiveTab] = useState<'polls' | 'decisions'>(defaultSubTab);

  React.useEffect(() => {
    if (defaultSubTab) {
      setActiveTab(defaultSubTab);
    }
  }, [defaultSubTab]);

  const handleNavigateService = (srv: CommunityServiceId) => {
    if (srv === 'polls') {
      setActiveTab('polls');
    } else if (srv === 'decisions') {
      setActiveTab('decisions');
    } else if (onNavigateCommunity) {
      onNavigateCommunity(srv);
    }
  };

  // --- POLLS STATE ---
  const [showAddPollForm, setShowAddPollForm] = useState(false);
  const [pollTitle, setPollTitle] = useState('');
  const [pollDesc, setPollDesc] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollDays, setPollDays] = useState<number>(7);
  const [pollAudience, setPollAudience] = useState<'ALL' | 'RESIDENTS' | 'ASSISTANTS'>('ALL');

  // --- DECISIONS STATE ---
  const [showAddDecisionForm, setShowAddDecisionForm] = useState(false);
  const [editingDecision, setEditingDecision] = useState<AdminDecision | null>(null);
  const [decisionTitle, setDecisionTitle] = useState('');
  const [decisionNumber, setDecisionNumber] = useState('');
  const [decisionDesc, setDecisionDesc] = useState('');
  const [decisionCategory, setDecisionCategory] = useState<AdminDecision['category']>('تنظيمي');
  const [decisionDate, setDecisionDate] = useState(new Date().toISOString().split('T')[0]);
  const [decisionEffectiveDate, setDecisionEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [decisionIssuedBy, setDecisionIssuedBy] = useState('مجلس إدارة اتحاد الملاك');
  const [decisionNotes, setDecisionNotes] = useState('');
  
  // Search & Filter for Decisions
  const [decisionSearch, setDecisionSearch] = useState('');
  const [decisionFilterCategory, setDecisionFilterCategory] = useState<string>('all');

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
    confirmLabel?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    isDestructive: true,
  });

  const openConfirm = (title: string, message: string, onConfirm: () => void, isDestructive = true, confirmLabel = 'نعم، تأكيد الحذف') => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      },
      isDestructive,
      confirmLabel,
    });
  };

  // Poll Form Handlers
  const handleAddOption = () => {
    setPollOptions([...pollOptions, '']);
  };

  const handleRemoveOption = (index: number) => {
    if (pollOptions.length <= 2) return;
    setPollOptions(pollOptions.filter((_, idx) => idx !== index));
  };

  const handleOptionChange = (index: number, val: string) => {
    const updated = [...pollOptions];
    updated[index] = val;
    setPollOptions(updated);
  };

  const handlePollSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pollTitle.trim() || !pollDesc.trim()) return;

    const validOptions = pollOptions
      .map(opt => opt.trim())
      .filter(opt => opt !== '');

    if (validOptions.length < 2) {
      alert('يجب إضافة خيارين للتصويت على الأقل.');
      return;
    }

    const createdOptions: PollOption[] = validOptions.map((opt, idx) => ({
      id: `opt_${idx}_${Date.now()}`,
      text: opt,
      votes: 0
    }));

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + pollDays);

    const newPoll: Poll = {
      id: `poll_${Date.now()}`,
      title: pollTitle.trim(),
      description: pollDesc.trim(),
      options: createdOptions,
      userVotes: {},
      createdAt: new Date().toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      status: 'ACTIVE',
      targetAudience: pollAudience,
    };

    onAddPoll(newPoll);
    setPollTitle('');
    setPollDesc('');
    setPollOptions(['', '']);
    setPollDays(7);
    setPollAudience('ALL');
    setShowAddPollForm(false);
  };

  const getVotePercentages = (poll: Poll) => {
    const totalVotes = Object.keys(poll.userVotes || {}).length;
    return poll.options.map(opt => {
      const percentage = totalVotes === 0 ? 0 : Math.round((opt.votes / totalVotes) * 100);
      return {
        ...opt,
        percentage
      };
    });
  };

  // Decision Form Handlers
  const resetDecisionForm = () => {
    setDecisionTitle('');
    setDecisionNumber(`ق-${new Date().getFullYear()}/${(decisions.length + 1).toString().padStart(2, '0')}`);
    setDecisionDesc('');
    setDecisionCategory('تنظيمي');
    setDecisionDate(new Date().toISOString().split('T')[0]);
    setDecisionEffectiveDate(new Date().toISOString().split('T')[0]);
    setDecisionIssuedBy('مجلس إدارة اتحاد الملاك');
    setDecisionNotes('');
    setEditingDecision(null);
    setShowAddDecisionForm(false);
  };

  const startEditDecision = (d: AdminDecision) => {
    setEditingDecision(d);
    setDecisionTitle(d.title);
    setDecisionNumber(d.decisionNumber || '');
    setDecisionDesc(d.description);
    setDecisionCategory(d.category);
    setDecisionDate(d.date);
    setDecisionEffectiveDate(d.effectiveDate || d.date);
    setDecisionIssuedBy(d.issuedBy);
    setDecisionNotes(d.notes || '');
    setShowAddDecisionForm(true);
  };

  const handleDecisionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!decisionTitle.trim() || !decisionDesc.trim()) return;

    if (editingDecision && onEditDecision) {
      const updated: AdminDecision = {
        ...editingDecision,
        decisionNumber: decisionNumber.trim() || editingDecision.decisionNumber,
        title: decisionTitle.trim(),
        description: decisionDesc.trim(),
        category: decisionCategory,
        date: decisionDate,
        effectiveDate: decisionEffectiveDate,
        issuedBy: decisionIssuedBy.trim() || 'مجلس إدارة اتحاد الملاك',
        notes: decisionNotes.trim() || undefined,
      };
      onEditDecision(updated);
    } else if (onAddDecision) {
      const newD: AdminDecision = {
        id: `dec_${Date.now()}`,
        decisionNumber: decisionNumber.trim() || `ق-${new Date().getFullYear()}/${(decisions.length + 1).toString().padStart(2, '0')}`,
        title: decisionTitle.trim(),
        description: decisionDesc.trim(),
        category: decisionCategory,
        date: decisionDate,
        effectiveDate: decisionEffectiveDate,
        issuedBy: decisionIssuedBy.trim() || 'مجلس إدارة اتحاد الملاك',
        status: 'ACTIVE',
        notes: decisionNotes.trim() || undefined,
      };
      onAddDecision(newD);
    }

    resetDecisionForm();
  };

  const handleSharePollWhatsApp = (poll: Poll) => {
    let msg = `🗳️ *استبيان وتصويت جديد من اتحاد ملاك عمارة بيراميدز فيو ١* 🗳️\n\n`;
    msg += `📌 *الموضوع:* ${poll.title}\n`;
    msg += `📝 *الوصف:* ${poll.description}\n`;
    msg += `📅 *تاريخ الإغلاق:* ${poll.endDate}\n\n`;
    msg += `📊 *خيارات التصويت المتاحة:* \n`;
    poll.options.forEach((opt, idx) => {
      msg += `${idx + 1}. ${opt.text}\n`;
    });
    msg += `\n🔗 يرجى الدخول للتطبيق والمشاركة في التصويت لإبداء رأيكم واتخاذ القرار المشترك المعتمد.\n`;
    msg += `إدارة اتحاد ملاك بيراميدز فيو ١`;

    const shareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(shareUrl, '_blank');
  };

  const handleShareDecisionWhatsApp = (d: AdminDecision) => {
    let msg = `📜 *قرار إداري وتنظيمي رسمي معتمد* 📜\n`;
    msg += `-----------------------------------\n`;
    msg += `🔢 *رقم القرار:* ${d.decisionNumber || 'إداري / تنظيمى'}\n`;
    msg += `🏷️ *التصنيف:* ${d.category}\n`;
    msg += `📅 *تاريخ الإصدار:* ${d.date}\n`;
    if (d.effectiveDate) {
      msg += `📌 *تاريخ السريان:* ${d.effectiveDate}\n`;
    }
    msg += `-----------------------------------\n\n`;
    msg += `🏛️ *موضوع القرار:* *${d.title}*\n\n`;
    msg += `📝 *نص القرار ومواده:* \n${d.description}\n\n`;
    if (d.notes) {
      msg += `💡 *ملاحظة:* ${d.notes}\n\n`;
    }
    msg += `✍️ *صادر عن:* ${d.issuedBy}\n`;
    msg += `اتحاد ملاك عمارة بيراميدز فيو ١`;

    const shareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(shareUrl, '_blank');
  };

  // Filtered Polls based on role and targetAudience
  const visiblePolls = polls.filter(poll => {
    if (role === 'ADMIN') return true;
    const aud = poll.targetAudience || 'ALL';
    if (aud === 'ALL') return true;
    if (role === 'RESIDENT' && aud === 'RESIDENTS') return true;
    if (role === 'ASSISTANT' && aud === 'ASSISTANTS') return true;
    return false;
  });

  // Filtered Decisions
  const filteredDecisions = decisions.filter(d => {
    const matchesCategory = decisionFilterCategory === 'all' || d.category === decisionFilterCategory;
    const matchesSearch = decisionSearch === '' || 
      d.title.toLowerCase().includes(decisionSearch.toLowerCase()) ||
      d.description.toLowerCase().includes(decisionSearch.toLowerCase()) ||
      (d.decisionNumber && d.decisionNumber.toLowerCase().includes(decisionSearch.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="w-full space-y-2.5 text-right animate-fade-in" id="polls-panel" dir="rtl">
      {/* 1. Unified Community Hub Header */}
      <CommunityHeader
        activeService={activeTab}
        onNavigateService={handleNavigateService}
        title={activeTab === 'polls' ? 'نظام التصويت واستبيان الملاك' : 'سجل القرارات واللوائح الإدارية'}
        description={
          activeTab === 'polls'
            ? 'شارك برأيك في استبيانات ومقترحات عمارة بيراميدز فيو ١ بشفافية وديمقراطية لاتخاذ القرارات المشتركة.'
            : 'القرارات الرسمية المعتمدة الصادرة عن اتحاد الملاك والإدارة لتنظيم شؤون العمارة وحقوق وواجبات السكان.'
        }
        icon={activeTab === 'polls' ? <Vote className="w-4 h-4" /> : <Scale className="w-4 h-4" />}
        badge={activeTab === 'polls' ? `${visiblePolls.length} استبيان` : `${decisions.length} قرار`}
        counts={communityCounts || {
          polls: visiblePolls.length,
          decisions: decisions.length,
        }}
        actionButton={
          activeTab === 'polls' && role === 'ADMIN' ? (
            <button
              type="button"
              onClick={() => setShowAddPollForm(!showAddPollForm)}
              className="px-2.5 py-1 sm:px-3 sm:py-1.5 bg-blue-900 hover:bg-blue-950 text-white rounded-lg text-[11px] sm:text-xs font-black transition shadow-2xs flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showAddPollForm ? 'إلغاء' : 'طرح استبيان'}</span>
            </button>
          ) : activeTab === 'decisions' && role === 'ADMIN' && onAddDecision ? (
            <button
              type="button"
              onClick={() => {
                if (showAddDecisionForm) {
                  resetDecisionForm();
                } else {
                  resetDecisionForm();
                  setShowAddDecisionForm(true);
                }
              }}
              className="px-2.5 py-1 sm:px-3 sm:py-1.5 bg-blue-900 hover:bg-blue-950 text-white rounded-lg text-[11px] sm:text-xs font-black transition shadow-2xs flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showAddDecisionForm ? 'إلغاء' : 'إصدار قرار'}</span>
            </button>
          ) : undefined
        }
      />

      {/* 2. Subtabs Switcher (Polls vs Decisions) */}
      <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/80 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('polls')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
            activeTab === 'polls'
              ? 'bg-blue-900 text-white shadow-2xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700/50'
          }`}
        >
          <Vote className="w-3.5 h-3.5" />
          <span>استبيان وتصويت الملاك</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${activeTab === 'polls' ? 'bg-blue-800 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
            {visiblePolls.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('decisions')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
            activeTab === 'decisions'
              ? 'bg-blue-900 text-white shadow-2xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700/50'
          }`}
        >
          <Scale className="w-3.5 h-3.5" />
          <span>سجل القرارات واللوائح</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${activeTab === 'decisions' ? 'bg-blue-800 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
            {decisions.length}
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 1. SECTION: POLLS & VOTING */}
      {/* ========================================================================= */}
      {activeTab === 'polls' && (
        <div className="space-y-3">

          {/* Add Poll Form (Admins / Managers only) */}
          {showAddPollForm && role === 'ADMIN' && (
            <form onSubmit={handlePollSubmit} className="bg-white dark:bg-[#111a2e] border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 rounded-2xl shadow-xs space-y-4 animate-scale-up">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Vote className="w-4 h-4 text-blue-900 dark:text-blue-400" />
                  <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100">طرح موضوع تصويت جديد للملاك وسكان العمارة</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddPollForm(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold"
                >
                  إلغاء
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">عنوان التصويت / القرار المقترح <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="مثال: تركيب كاميرات مراقبة حديثة للمصاعد والمدخل"
                  value={pollTitle}
                  onChange={(e) => setPollTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">تفاصيل وشرح أسباب طرح التصويت <span className="text-red-500">*</span></label>
                <textarea
                  placeholder="اكتب هنا شرحاً كافياً ليكون الملاك على دراية بكامل التفاصيل (التكاليف، الشركات المقترحة، مدة التنفيذ)..."
                  value={pollDesc}
                  onChange={(e) => setPollDesc(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">خيارات التصويت المتاحة للملاك <span className="text-red-500">*</span></label>
                <div className="space-y-2">
                  {pollOptions.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      {pollOptions.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(idx)}
                          className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <input
                        type="text"
                        placeholder={`الخيار رقم ${idx + 1}...`}
                        value={opt}
                        onChange={(e) => handleOptionChange(idx, e.target.value)}
                        className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
                        required
                      />
                    </div>
                  ))}
                  
                  {pollOptions.length < 6 && (
                    <button
                      type="button"
                      onClick={handleAddOption}
                      className="text-xs text-blue-900 dark:text-blue-400 hover:underline font-black flex items-center gap-1 mt-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة خيار آخر</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">الفئة المستهدفة بالاستبيان <span className="text-red-500">*</span></label>
                  <select
                    value={pollAudience}
                    onChange={(e) => setPollAudience(e.target.value as 'ALL' | 'RESIDENTS' | 'ASSISTANTS')}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none cursor-pointer"
                  >
                    <option value="ALL">الجميع (سكان العمارة والمساعدين الفنيين)</option>
                    <option value="RESIDENTS">السكان والملاك فقط</option>
                    <option value="ASSISTANTS">المساعدين الفنيين فقط</option>
                  </select>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-1.5 block leading-relaxed">
                    حدد من يمكنه رؤية هذا الاستبيان والتصويت عليه.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">مدة التصويت المفتوحة</label>
                  <select
                    value={pollDays}
                    onChange={(e) => setPollDays(parseInt(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none cursor-pointer"
                  >
                    <option value={3}>3 أيام فقط (عاجل)</option>
                    <option value={7}>أسبوع كامل (7 أيام)</option>
                    <option value={14}>أسبوعين (14 يوم)</option>
                    <option value={30}>شهر كامل (30 يوم)</option>
                  </select>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-1.5 block leading-relaxed">
                    يتم غلق التصويت تلقائياً بعد مرور هذه المدة لفرز وحسم النتيجة النهائية.
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddPollForm(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-900 hover:bg-blue-950 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer transition"
                >
                  طرح ونشر الاستبيان الآن
                </button>
              </div>
            </form>
          )}

          {/* Polls list rendering */}
          {visiblePolls.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-[#111a2e]">
              <AlertCircle className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2 stroke-[1.5]" />
              <h4 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200">لا توجد استبيانات أو مواضيع تصويت مخصصة لك حالياً</h4>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 font-bold">يمكن لرئيس الاتحاد إضافة تصويت جديد في أي وقت.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visiblePolls.map((poll) => {
                const optionsWithPercentages = getVotePercentages(poll);
                const totalVotesCount = Object.keys(poll.userVotes || {}).length;
                const voterEmail = userEmail || (role === 'ASSISTANT' ? 'assistant@pyramids.com' : 'resident@pyramids.com');
                const hasVoted = !!(poll.userVotes && (poll.userVotes[voterEmail] || (userEmail && poll.userVotes[userEmail])));
                const votedOptionId = poll.userVotes ? (poll.userVotes[voterEmail] || (userEmail ? poll.userVotes[userEmail] : undefined)) : undefined;
                const isActive = poll.status === 'ACTIVE';

                return (
                  <div 
                    key={poll.id} 
                    className={`bg-white dark:bg-[#111a2e] border rounded-2xl p-4 sm:p-5 transition flex flex-col md:flex-row justify-between gap-4 ${
                      isActive 
                        ? 'border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md' 
                        : 'border-slate-200/60 dark:border-slate-800/60 opacity-90'
                    }`}
                  >
                    {/* Left Section (Details & interactive Options) */}
                    <div className="flex-1 space-y-3">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          {isActive ? (
                            <span className="px-2.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60 text-[9.5px] font-black rounded-lg flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>التصويت جاري ومتاح الآن</span>
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200/60 dark:border-red-800/60 text-[9.5px] font-black rounded-lg flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              <span>تم إغلاق التصويت (مؤرشف)</span>
                            </span>
                          )}

                          {/* Target Audience Badge */}
                          {poll.targetAudience === 'RESIDENTS' && (
                            <span className="px-2.5 py-0.5 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60 text-[9.5px] font-black rounded-lg flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              <span>للسكان والملاك فقط</span>
                            </span>
                          )}
                          {poll.targetAudience === 'ASSISTANTS' && (
                            <span className="px-2.5 py-0.5 bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60 text-[9.5px] font-black rounded-lg flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              <span>للمساعدين الفنيين فقط</span>
                            </span>
                          )}
                          {(!poll.targetAudience || poll.targetAudience === 'ALL') && role === 'ADMIN' && (
                            <span className="px-2.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700 text-[9.5px] font-black rounded-lg flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              <span>ظاهر للجميع</span>
                            </span>
                          )}
                          
                          <span className="text-[9.5px] text-slate-400 dark:text-slate-500 font-bold flex items-center gap-1 bg-slate-50 dark:bg-slate-800/60 px-2 py-0.5 rounded-lg border border-slate-100 dark:border-slate-700/60">
                            <Calendar className="w-3 h-3" />
                            <span>تاريخ الإغلاق: {poll.endDate}</span>
                          </span>
                        </div>

                        <h4 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 mb-1">{poll.title}</h4>
                        <p className="text-xs text-slate-600 dark:text-slate-300 font-bold leading-relaxed">{poll.description}</p>
                      </div>

                      {/* Options render list */}
                      <div className="space-y-2">
                        {optionsWithPercentages.map((opt) => {
                          const isOptionSelected = votedOptionId === opt.id;
                          
                          return (
                            <div key={opt.id} className="relative">
                              {/* Vote Option Button or Progress */}
                              {hasVoted || !isActive ? (
                                <div className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/80 rounded-xl p-2.5 sm:p-3 overflow-hidden relative">
                                  {/* Background fill */}
                                  <div 
                                    className={`absolute inset-y-0 right-0 transition-all duration-500 ${
                                      isOptionSelected 
                                        ? 'bg-blue-900/15 dark:bg-blue-500/25' 
                                        : 'bg-slate-200/50 dark:bg-slate-700/40'
                                    }`}
                                    style={{ width: `${opt.percentage}%` }}
                                  />
                                  
                                  <div className="relative z-10 flex items-center justify-between font-bold text-xs">
                                    <div className="flex items-center gap-1.5">
                                      {isOptionSelected && (
                                        <span className="w-2 h-2 bg-blue-900 dark:bg-blue-400 rounded-full" />
                                      )}
                                      <span className={isOptionSelected ? 'text-blue-950 dark:text-blue-200 font-black' : 'text-slate-800 dark:text-slate-200'}>
                                        {opt.text}
                                      </span>
                                    </div>
                                    <span className={isOptionSelected ? 'text-blue-950 dark:text-blue-200 font-black' : 'text-slate-600 dark:text-slate-400'}>
                                      {opt.percentage}% ({opt.votes} صوت)
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onVote(poll.id, opt.id, voterEmail)}
                                  className="w-full text-right bg-white dark:bg-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-900/40 p-2.5 sm:p-3 rounded-xl text-xs font-black text-slate-700 dark:text-slate-200 active:scale-[0.99] transition cursor-pointer flex items-center justify-between shadow-xs"
                                >
                                  <span>{opt.text}</span>
                                  <span className="text-[10px] text-blue-900 dark:text-blue-300 font-bold bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded-md border border-blue-100 dark:border-blue-900/50">اضغط للتصويت</span>
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Right Section (Summary metrics & Admin actions) */}
                    <div className="md:w-44 flex flex-col justify-between items-end border-t md:border-t-0 md:border-r border-slate-100 dark:border-slate-800 pt-3 md:pt-0 md:pr-4 shrink-0 text-right">
                      <div className="space-y-2 w-full">
                        <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 sm:p-3 rounded-xl space-y-1 border border-slate-100 dark:border-slate-700/80">
                          <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-400 font-bold">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            <span>إجمالي المصوتين</span>
                          </div>
                          <div className="text-xl font-black text-slate-900 dark:text-slate-100">
                            {totalVotesCount} <span className="text-xs font-bold text-slate-500">صوت</span>
                          </div>
                        </div>

                        {hasVoted && (
                          <div className="flex items-center gap-1 text-[11px] font-black text-emerald-600 dark:text-emerald-400 justify-end bg-emerald-50/60 dark:bg-emerald-950/30 p-2 rounded-lg border border-emerald-100 dark:border-emerald-900/50">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>تم تسجيل صوتك</span>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => handleSharePollWhatsApp(poll)}
                          className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs active:scale-[0.98] mt-2"
                        >
                          <Share2 className="w-3.5 h-3.5 text-emerald-100 shrink-0" />
                          <span>مشاركة الاستبيان</span>
                        </button>
                      </div>

                      {/* Admin Controls */}
                      {role === 'ADMIN' && (
                        <div className="mt-2.5 flex flex-col gap-1.5 w-full border-t border-slate-100 dark:border-slate-800 pt-2.5">
                          {isActive ? (
                            <button
                              type="button"
                              onClick={() => {
                                openConfirm(
                                  'إغلاق الاستبيان',
                                  `هل تريد بالتأكيد إغلاق التصويت على: "${poll.title}"؟ لن يتمكن الملاك من الإدلاء بأصوات جديدة وستُعتمد النتيجة الحالية.`,
                                  () => onClosePoll(poll.id),
                                  false,
                                  'تأكيد إغلاق التصويت'
                                );
                              }}
                              className="w-full py-1.5 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 font-black text-xs rounded-lg transition cursor-pointer flex items-center justify-center gap-1 border border-amber-200/50 dark:border-amber-800/50"
                            >
                              <Lock className="w-3 h-3" />
                              <span>إغلاق الاستبيان</span>
                            </button>
                          ) : onReopenPoll && (
                            <button
                              type="button"
                              onClick={() => {
                                openConfirm(
                                  'إعادة فتح الاستبيان',
                                  `هل تريد إعادة فتح التصويت على: "${poll.title}"؟`,
                                  () => onReopenPoll(poll.id),
                                  false,
                                  'إعادة فتح التصويت'
                                );
                              }}
                              className="w-full py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 font-black text-xs rounded-lg transition cursor-pointer flex items-center justify-center gap-1 border border-emerald-200/50 dark:border-emerald-800/50"
                            >
                              <Unlock className="w-3 h-3" />
                              <span>إعادة فتح التصويت</span>
                            </button>
                          )}
                          
                          <button
                            type="button"
                            onClick={() => {
                              openConfirm(
                                'حذف الاستبيان نهائياً',
                                `هل تريد بالتأكيد إزالة الاستبيان "${poll.title}" من النظام بالكامل؟ لا يمكن التراجع عن هذا الإجراء.`,
                                () => onDeletePoll(poll.id),
                                true,
                                'تأكيد الحذف'
                              );
                            }}
                            className="w-full py-1.5 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 font-black text-xs rounded-lg transition cursor-pointer flex items-center justify-center gap-1 border border-red-200/50 dark:border-red-800/50"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>إزالة الاستبيان</span>
                          </button>
                        </div>
                      )}

                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SECTION: ADMINISTRATIVE DECISIONS */}
      {/* ========================================================================= */}
      {activeTab === 'decisions' && (
        <div className="space-y-3">
          {/* Action Bar & Filters */}
          <div className="flex flex-col sm:flex-row gap-2.5 justify-between items-stretch sm:items-center bg-white dark:bg-[#111a2e] p-3 sm:p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="بحث في القرارات الإدارية..."
                  value={decisionSearch}
                  onChange={(e) => setDecisionSearch(e.target.value)}
                  className="w-full pl-3 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute top-2.5 right-2.5" />
              </div>

              <select
                value={decisionFilterCategory}
                onChange={(e) => setDecisionFilterCategory(e.target.value)}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none cursor-pointer"
              >
                <option value="all">كل التصنيفات</option>
                <option value="تنظيمي">تنظيمي</option>
                <option value="مالي">مالي</option>
                <option value="إداري">إداري</option>
                <option value="صيانة وتشغيل">صيانة وتشغيل</option>
                <option value="أمن وحراسة">أمن وحراسة</option>
                <option value="أخرى">أخرى</option>
              </select>
            </div>
          </div>

          {/* Add / Edit Decision Form */}
          {showAddDecisionForm && role !== 'RESIDENT' && role !== 'ASSISTANT' && (
            <form onSubmit={handleDecisionSubmit} className="bg-white dark:bg-[#111a2e] border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 rounded-2xl shadow-xs space-y-4 animate-scale-up">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-blue-900 dark:text-blue-400" />
                  <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100">
                    {editingDecision ? 'تعديل بيانات القرار الإداري' : 'إصدار قرار إداري / تنظيمي رسمي جديد'}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={resetDecisionForm}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold"
                >
                  إغلاق
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">عنوان القرار الإداري <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    placeholder="مثال: تنظيم مواعيد استخدام المصاعد ورفع الأثاث والعفش"
                    value={decisionTitle}
                    onChange={(e) => setDecisionTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">رقم القرار المرجعي</label>
                  <input
                    type="text"
                    placeholder="مثال: ق-2026/05"
                    value={decisionNumber}
                    onChange={(e) => setDecisionNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20 text-left font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">نص القرار وحيثياته ومواده <span className="text-red-500">*</span></label>
                <textarea
                  placeholder="اكتب هنا بنود القرار بالتفصيل وما تم الاتفاق عليه بين أعضاء مجلس الإدارة أو الملاك، مع ذكر الشروط والضوابط..."
                  value={decisionDesc}
                  onChange={(e) => setDecisionDesc(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20 leading-relaxed"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">تصنيف القرار</label>
                  <select
                    value={decisionCategory}
                    onChange={(e) => setDecisionCategory(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none cursor-pointer"
                  >
                    <option value="تنظيمي">تنظيمي</option>
                    <option value="مالي">مالي</option>
                    <option value="إداري">إداري</option>
                    <option value="صيانة وتشغيل">صيانة وتشغيل</option>
                    <option value="أمن وحراسة">أمن وحراسة</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">تاريخ الصدور</label>
                  <input
                    type="date"
                    value={decisionDate}
                    onChange={(e) => setDecisionDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none cursor-pointer"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">تاريخ السريان والتنفيذ</label>
                  <input
                    type="date"
                    value={decisionEffectiveDate}
                    onChange={(e) => setDecisionEffectiveDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">الجهة المصدرة</label>
                  <input
                    type="text"
                    value={decisionIssuedBy}
                    onChange={(e) => setDecisionIssuedBy(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none"
                    placeholder="مجلس إدارة اتحاد الملاك"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">ملاحظات أو تعليمات إضافية (اختياري)</label>
                <input
                  type="text"
                  placeholder="أي ملاحظات تتعلق بآلية التنفيذ أو العقوبات في حال المخالفة..."
                  value={decisionNotes}
                  onChange={(e) => setDecisionNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={resetDecisionForm}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-900 hover:bg-blue-950 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer transition"
                >
                  {editingDecision ? 'حفظ التعديلات' : 'اعتماد ونشر القرار'}
                </button>
              </div>
            </form>
          )}

          {/* Decisions List */}
          {filteredDecisions.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-[#111a2e]">
              <FileCheck2 className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2 stroke-[1.5]" />
              <h4 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200">لا توجد قرارات إدارية مسجلة</h4>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 font-bold">تظهر هنا القرارات الإدارية والتنظيمية المعتمدة لعمارة بيراميدز فيو ١.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDecisions.map((d) => (
                <div
                  key={d.id}
                  className="bg-white dark:bg-[#111a2e] rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-xs hover:shadow-md transition space-y-3 relative overflow-hidden"
                >
                  {/* Top Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 bg-blue-900 text-white text-[10px] font-black rounded-lg shadow-xs font-mono">
                        {d.decisionNumber || 'قرار إداري'}
                      </span>
                      
                      <span className="px-2.5 py-0.5 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60 text-[9.5px] font-black rounded-lg">
                        {d.category}
                      </span>

                      <span className="px-2.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60 text-[9.5px] font-black rounded-lg flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        <span>ساري المفعول</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 text-[11px] text-slate-400 dark:text-slate-400 font-bold">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>تاريخ الصدور: {d.date}</span>
                      </span>
                      {d.effectiveDate && d.effectiveDate !== d.date && (
                        <span className="text-blue-900 dark:text-blue-400 font-extrabold">
                          (ساري من: {d.effectiveDate})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title & Body */}
                  <div className="space-y-2">
                    <h4 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">{d.title}</h4>
                    <p className="text-xs text-slate-700 dark:text-slate-300 font-bold leading-relaxed whitespace-pre-line bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-100 dark:border-slate-700/60">
                      {d.description}
                    </p>
                  </div>

                  {d.notes && (
                    <div className="text-[11px] font-bold text-amber-800 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/40 p-2.5 rounded-xl border border-amber-200/50 dark:border-amber-900/50">
                      <span className="font-black">ملاحظة: </span>{d.notes}
                    </div>
                  )}

                  {/* Footer (Issuer & Action Buttons) */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 text-xs font-bold border-t border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-sans">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-blue-900 dark:text-blue-400 font-sans" />
                      <span>صادر عن: <strong className="text-slate-800 dark:text-slate-200">{d.issuedBy}</strong></span>
                    </div>

                    <div className="flex items-center gap-1.5 justify-end flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleShareDecisionWhatsApp(d)}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-lg transition cursor-pointer flex items-center gap-1 shadow-2xs"
                        title="مشاركة القرار الإداري عبر واتساب"
                      >
                        <Share2 className="w-3.5 h-3.5 text-emerald-100 shrink-0" />
                        <span>مشاركة عبر الواتساب</span>
                      </button>

                      {role !== 'RESIDENT' && role !== 'ASSISTANT' && (
                        <>
                          {onEditDecision && (
                            <button
                              type="button"
                              onClick={() => startEditDecision(d)}
                              className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-black text-xs rounded-lg transition cursor-pointer flex items-center gap-1 border border-slate-200 dark:border-slate-700"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>تعديل</span>
                            </button>
                          )}
                          {onDeleteDecision && (
                            <button
                              type="button"
                              onClick={() => {
                                openConfirm(
                                  'حذف القرار الإداري',
                                  `هل تريد بالتأكيد إزالة القرار الإداري "${d.title}" (${d.decisionNumber})؟ لا يمكن التراجع عن هذا الإجراء.`,
                                  () => onDeleteDecision(d.id),
                                  true,
                                  'تأكيد حذف القرار'
                                );
                              }}
                              className="px-2.5 py-1 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 text-red-600 dark:text-red-400 font-black text-xs rounded-lg transition cursor-pointer flex items-center gap-1 border border-red-200/50 dark:border-red-800/50"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>حذف</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      )}

      {/* Reusable In-App Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        isDestructive={confirmModal.isDestructive}
        confirmLabel={confirmModal.confirmLabel}
      />

    </div>
  );
};
