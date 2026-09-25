import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, PublicComplaint, ComplaintComment, UserRole } from '../types';
import { 
  MessageSquare, 
  Send, 
  User, 
  Plus, 
  MessageCircle, 
  AlertTriangle, 
  Trash2, 
  Home, 
  Calendar,
  Image as ImageIcon,
  Camera,
  X,
  Eye,
  UserX,
  ShieldCheck,
  CheckCircle2,
  Edit,
  Check,
  Shield,
  Wrench,
  Users,
  PhoneCall,
  Crown,
  Share2
} from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { CommunityHeader, CommunityCounts, CommunityServiceId } from './CommunityHeader';
import { compressImageFile } from '../utils/imageCompressor';

interface ChatProps {
  messages: ChatMessage[];
  complaints: PublicComplaint[];
  role: UserRole;
  flatNumber?: number | string;
  userName: string;
  defaultSubTab?: 'room' | 'complaints';
  onSubTabChange?: (tab: 'room' | 'complaints') => void;
  onSendMessage: (text: string, imageUrl?: string, channel?: 'all' | 'admin' | 'assistant') => void;
  onAddComplaint: (title: string, description: string, isAnonymous?: boolean, imageUrl?: string) => void;
  onAddComment: (complaintId: string, text: string) => void;
  onEditComment?: (complaintId: string, commentId: string, text: string) => void;
  onDeleteComment?: (complaintId: string, commentId: string) => void;
  onDeleteComplaint?: (complaintId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newText: string) => void;
  onAddMessageReply?: (messageId: string, text: string) => void;
  onEditMessageReply?: (messageId: string, replyId: string, text: string) => void;
  onDeleteMessageReply?: (messageId: string, replyId: string) => void;
  onPreviewImage?: (url: string) => void;
  onNavigateCommunity?: (serviceId: string) => void;
  communityCounts?: CommunityCounts;
}

export const Chat: React.FC<ChatProps> = ({
  messages,
  complaints,
  role,
  flatNumber,
  userName,
  defaultSubTab = 'room',
  onSubTabChange,
  onSendMessage,
  onAddComplaint,
  onAddComment,
  onEditComment,
  onDeleteComment,
  onDeleteComplaint,
  onDeleteMessage,
  onEditMessage,
  onAddMessageReply,
  onEditMessageReply,
  onDeleteMessageReply,
  onPreviewImage,
  onNavigateCommunity,
  communityCounts,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'room' | 'complaints'>(defaultSubTab);

  useEffect(() => {
    if (defaultSubTab) {
      setActiveSubTab(defaultSubTab);
    }
  }, [defaultSubTab]);

  const handleSelectSubTab = (tab: 'room' | 'complaints') => {
    setActiveSubTab(tab);
    if (onSubTabChange) {
      onSubTabChange(tab);
    }
  };
  
  // Chat Room states
  const [messageText, setMessageText] = useState('');
  const [chatImageFile, setChatImageFile] = useState<string | null>(null);
  const [chatChannelFilter, setChatChannelFilter] = useState<'all' | 'admin' | 'assistant'>('all');
  const [sendTargetChannel, setSendTargetChannel] = useState<'all' | 'admin' | 'assistant'>('all');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);

  // Editing message states
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState('');

  const startEditingMessage = (msgId: string, currentText: string) => {
    setEditingMessageId(msgId);
    setEditingMessageText(currentText || '');
  };

  const handleSaveEditedMessage = (msgId: string) => {
    if (!editingMessageText.trim()) return;
    if (onEditMessage) {
      onEditMessage(msgId, editingMessageText.trim());
    }
    setEditingMessageId(null);
    setEditingMessageText('');
  };

  const handleShareComplaintWhatsApp = (comp: PublicComplaint) => {
    let msg = `⚠️ *شكوى وموضوع نقاش عام جديد من السكان* ⚠️\n`;
    msg += `-----------------------------------\n`;
    msg += `🚪 *الوحدة:* ${comp.flatNumber ? `وحدة ${comp.flatNumber}` : 'مجهول'}\n`;
    msg += `👤 *الناشر:* ${comp.residentName}\n`;
    msg += `📅 *تاريخ النشر:* ${comp.date}\n`;
    msg += `-----------------------------------\n\n`;
    msg += `📌 *موضوع الشكوى:* *${comp.title}*\n\n`;
    msg += `📝 *التفاصيل:* \n${comp.description}\n\n`;
    msg += `💬 يرجى الدخول للتطبيق والمناقشة أو اقتراح حلول لمساعدة الجيران.\n`;
    msg += `إدارة اتحاد ملاك بيراميدز فيو ١`;

    const shareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(shareUrl, '_blank');
  };

  // Message reply states
  const [replyingToMessageId, setReplyingToMessageId] = useState<string | null>(null);
  const [replyTextMap, setReplyTextMap] = useState<{ [messageId: string]: string }>({});

  // Editing reply states
  const [editingReplyKey, setEditingReplyKey] = useState<{ messageId: string; replyId: string } | null>(null);
  const [editingReplyText, setEditingReplyText] = useState('');

  const handleSendReply = (messageId: string) => {
    const text = replyTextMap[messageId];
    if (!text || !text.trim()) return;
    if (onAddMessageReply) {
      onAddMessageReply(messageId, text.trim());
    }
    setReplyTextMap(prev => ({ ...prev, [messageId]: '' }));
    setReplyingToMessageId(null);
  };

  const startEditingReply = (messageId: string, replyId: string, currentText: string) => {
    setEditingReplyKey({ messageId, replyId });
    setEditingReplyText(currentText);
  };

  const handleSaveEditedReply = (messageId: string, replyId: string) => {
    if (!editingReplyText.trim()) return;
    if (onEditMessageReply) {
      onEditMessageReply(messageId, replyId, editingReplyText.trim());
    }
    setEditingReplyKey(null);
    setEditingReplyText('');
  };

  const handleDeleteReply = (messageId: string, replyId: string) => {
    openConfirm(
      'حذف الرد',
      'هل تريد بالتأكيد حذف هذا الرد؟',
      () => {
        if (onDeleteMessageReply) {
          onDeleteMessageReply(messageId, replyId);
        }
      }
    );
  };

  // Complaints Board states
  const [showAddForm, setShowAddForm] = useState(false);
  const [complaintTitle, setComplaintTitle] = useState('');
  const [complaintDesc, setComplaintDesc] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [complaintImageFile, setComplaintImageFile] = useState<string | null>(null);
  const complaintFileInputRef = useRef<HTMLInputElement>(null);
  const [expandedComplaintId, setExpandedComplaintId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState<{ [key: string]: string }>({});

  // Editing comment states
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  const startEditingComment = (commentId: string, currentText: string) => {
    setEditingCommentId(commentId);
    setEditingCommentText(currentText);
  };

  const handleSaveEditedComment = (complaintId: string, commentId: string) => {
    if (!editingCommentText.trim()) return;
    if (onEditComment) {
      onEditComment(complaintId, commentId, editingCommentText.trim());
    }
    setEditingCommentId(null);
    setEditingCommentText('');
  };

  const handleDeleteCommentClick = (complaintId: string, commentId: string) => {
    openConfirm(
      'حذف التعليق',
      'هل أنت متأكد من رغبتك في حذف هذا التعليق؟',
      () => {
        if (onDeleteComment) {
          onDeleteComment(complaintId, commentId);
        }
      }
    );
  };

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const openConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (activeSubTab === 'room') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeSubTab]);

  // Handle Image Selection for Chat with auto-compression
  const handleChatImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressedDataUrl = await compressImageFile(file, { maxWidth: 1024, maxHeight: 1024, quality: 0.72 });
      setChatImageFile(compressedDataUrl);
    } catch {
      // Fallback
      const reader = new FileReader();
      reader.onload = () => {
        setChatImageFile(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle Image Selection for Complaints with auto-compression
  const handleComplaintImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressedDataUrl = await compressImageFile(file, { maxWidth: 1024, maxHeight: 1024, quality: 0.72 });
      setComplaintImageFile(compressedDataUrl);
    } catch {
      // Fallback
      const reader = new FileReader();
      reader.onload = () => {
        setComplaintImageFile(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() && !chatImageFile) return;
    onSendMessage(messageText.trim(), chatImageFile || undefined, sendTargetChannel);
    setMessageText('');
    setChatImageFile(null);
    if (chatFileInputRef.current) {
      chatFileInputRef.current.value = '';
    }
  };

  const handlePostComplaint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!complaintTitle.trim() || !complaintDesc.trim()) return;
    onAddComplaint(
      complaintTitle.trim(), 
      complaintDesc.trim(), 
      isAnonymous, 
      complaintImageFile || undefined
    );
    setComplaintTitle('');
    setComplaintDesc('');
    setIsAnonymous(false);
    setComplaintImageFile(null);
    if (complaintFileInputRef.current) {
      complaintFileInputRef.current.value = '';
    }
    setShowAddForm(false);
  };

  const handlePostComment = (complaintId: string) => {
    const text = commentText[complaintId];
    if (!text || !text.trim()) return;
    onAddComment(complaintId, text.trim());
    setCommentText(prev => ({ ...prev, [complaintId]: '' }));
  };

  const handleNavigateService = (srv: CommunityServiceId) => {
    if (srv === 'chat-room') {
      handleSelectSubTab('room');
    } else if (srv === 'chat-complaints') {
      handleSelectSubTab('complaints');
    } else if (onNavigateCommunity) {
      onNavigateCommunity(srv);
    }
  };

  const filteredMessages = messages.filter((msg) => {
    if (chatChannelFilter === 'all') return true;
    if (chatChannelFilter === 'admin') {
      return (
        msg.channel === 'admin' ||
        msg.senderRole === 'ADMIN' ||
        (msg.senderName && (msg.senderName.includes('وحيد سماحة') || msg.senderName.includes('رئيس الاتحاد'))) ||
        msg.flatNumber === 'إدارة الاتحاد'
      );
    }
    if (chatChannelFilter === 'assistant') {
      return (
        msg.channel === 'assistant' ||
        msg.senderRole === 'ASSISTANT' ||
        (msg.senderName && msg.senderName.includes('المساعد الفني')) ||
        msg.flatNumber === 'فني الصيانة'
      );
    }
    return true;
  });

  return (
    <div className="w-full space-y-2 text-right animate-fade-in flex flex-col" dir="rtl">
      {/* 1. Unified Community Hub Header & Subtabs (Sticky Top after Main Fixed Header) */}
      <div className="sticky top-16 z-20 bg-slate-100/95 dark:bg-[#0b1329]/95 backdrop-blur-md pt-1 pb-2 space-y-2">
        <CommunityHeader
          activeService={activeSubTab === 'room' ? 'chat-room' : 'chat-complaints'}
          onNavigateService={handleNavigateService}
          title={activeSubTab === 'room' ? 'غرفة دردشة ونقاشات السكان' : 'صندوق الشكاوى والمقترحات'}
          description={
            activeSubTab === 'room'
              ? 'مساحة تفاعلية فورية ومباشرة لتبادل الأحاديث وإرسال الرسائل والصور بين سكان وملاك العمارة.'
              : 'طرح الشكاوى والمقترحات والتعليقات الإنشائية للمناقشة مع اتحاد الملاك مع إمكانية سرية الهوية.'
          }
          icon={activeSubTab === 'room' ? <MessageSquare className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          badge={activeSubTab === 'room' ? `${messages.length} رسالة` : `${complaints.length} شكوى`}
          counts={communityCounts || {
            messages: messages.length,
            complaints: complaints.length,
          }}
          actionButton={
            activeSubTab === 'complaints' ? (
              <button
                type="button"
                onClick={() => setShowAddForm(!showAddForm)}
                className="px-3 py-1.5 bg-blue-900 hover:bg-blue-950 text-white rounded-lg text-xs font-bold transition shadow-2xs flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{showAddForm ? 'إلغاء النموذج' : 'تقديم شكوى / مقترح'}</span>
              </button>
            ) : undefined
          }
        />

        {/* 2. Subtabs Switcher (Chat vs Complaints) */}
        <div className="flex items-center gap-1 p-0.5 bg-white/80 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/80 rounded-lg w-fit shadow-2xs">
          <button
            type="button"
            onClick={() => handleSelectSubTab('room')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
              activeSubTab === 'room'
                ? 'bg-blue-900 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700/50'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>دردشة السكان المباشرة</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${activeSubTab === 'room' ? 'bg-blue-800 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
              {messages.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectSubTab('complaints')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
              activeSubTab === 'complaints'
                ? 'bg-blue-900 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700/50'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>صندوق الشكاوى والمقترحات</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${activeSubTab === 'complaints' ? 'bg-blue-800 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
              {complaints.length}
            </span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. CHAT ROOM SUBTAB */}
      {/* ========================================================================= */}
      {activeSubTab === 'room' && (
        <div className="bg-white dark:bg-[#111a2e] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col h-[calc(100dvh-190px)] sm:h-[calc(100dvh-200px)] min-h-[480px]">
          {/* Channel Filter & Direct Contacts Top Bar */}
          <div className="p-2 sm:p-2.5 bg-slate-100/90 dark:bg-slate-800/80 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1 overflow-x-auto">
              <button
                type="button"
                onClick={() => setChatChannelFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                  chatChannelFilter === 'all'
                    ? 'bg-blue-900 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>الكل ({messages.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setChatChannelFilter('admin')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                  chatChannelFilter === 'admin'
                    ? 'bg-amber-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                <Crown className="w-3.5 h-3.5 text-amber-300" />
                <span>مجلس إدارة الاتحاد 👑</span>
              </button>
              <button
                type="button"
                onClick={() => setChatChannelFilter('assistant')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                  chatChannelFilter === 'assistant'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                <Wrench className="w-3.5 h-3.5 text-indigo-300" />
                <span>المساعد الفني 🔧</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                دردشة فورية ومباشرة
              </span>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-2.5 sm:p-3.5 space-y-2 sm:space-y-2.5 bg-slate-50/50 dark:bg-slate-900/30 overscroll-contain">
            {filteredMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3 py-12">
                <MessageCircle className="w-14 h-14 stroke-[1.5] text-slate-300 dark:text-slate-600" />
                <p className="text-sm font-black text-slate-600 dark:text-slate-300">
                  {chatChannelFilter === 'all' 
                    ? 'لا توجد رسائل سابقة في الدردشة.' 
                    : chatChannelFilter === 'admin'
                    ? 'لا توجد رسائل موجهة لمجلس الإدارة حالياً.'
                    : 'لا توجد رسائل موجهة للمساعد الفني حالياً.'}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 font-bold">كن أول من يرسل رسالة في هذه القناة!</p>
              </div>
            ) : (
              filteredMessages.map((msg) => {
                const isMe = Boolean(
                  (msg.senderName && userName && msg.senderName.trim().toLowerCase() === userName.trim().toLowerCase()) ||
                  (msg.flatNumber && flatNumber && String(msg.flatNumber).trim() === String(flatNumber).trim()) ||
                  (role === 'ASSISTANT' && (msg.senderName === 'المساعد الفني' || msg.flatNumber === 'فني الصيانة'))
                );
                const canModify = isMe || role === 'ADMIN';
                const isEditing = editingMessageId === msg.id;

                return (
                  <div
                    key={msg.id}
                    className={`w-full rounded-2xl p-2.5 sm:p-3 border transition text-right space-y-1.5 sm:space-y-2 shadow-2xs ${
                      isMe
                        ? 'bg-blue-900 text-white border-blue-800'
                        : 'bg-white dark:bg-[#1a2336] text-slate-800 dark:text-slate-100 border-slate-200/90 dark:border-slate-800'
                    }`}
                  >
                    {/* Header with Mini Edit/Delete buttons on the Right, Mini Sender Name & Unit, and Timestamp on the Left */}
                    <div className="flex items-center justify-between pb-1 flex-wrap gap-1.5 border-b border-black/5 dark:border-white/5">
                      {/* Right side (Start in RTL): Mini Edit & Delete buttons + Mini Sender Name + Unit Number */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Mini Actions: Edit & Delete buttons on the right */}
                        {canModify && !isEditing && (
                          <div className="flex items-center gap-1 pl-1.5 border-l border-black/10 dark:border-white/10 ml-0.5">
                            {/* Edit button (beside delete button) */}
                            {onEditMessage && (
                              <button
                                type="button"
                                onClick={() => startEditingMessage(msg.id, msg.text || '')}
                                className={`p-1.5 rounded-lg transition cursor-pointer flex items-center justify-center ${
                                  isMe
                                    ? 'bg-blue-800/90 hover:bg-blue-700 text-blue-100 hover:text-white border border-blue-600/50 shadow-2xs'
                                    : 'bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/50 shadow-2xs'
                                }`}
                                title="تعديل الرسالة"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Delete button */}
                            {onDeleteMessage && (
                              <button
                                type="button"
                                onClick={() => {
                                  openConfirm(
                                    'حذف الرسالة',
                                    'هل تريد بالتأكيد حذف هذه الرسالة من غرفة الدردشة؟',
                                    () => onDeleteMessage(msg.id)
                                  );
                                }}
                                className={`p-1.5 rounded-lg transition cursor-pointer flex items-center justify-center ${
                                  isMe
                                    ? 'bg-red-500/25 hover:bg-red-500/50 text-red-100 hover:text-white border border-red-400/40 shadow-2xs'
                                    : 'bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 border border-red-200/80 dark:border-red-900/50 shadow-2xs'
                                }`}
                                title="حذف الرسالة"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}

                        {/* Mini Name & Unit */}
                        <span className={`font-black text-[11px] sm:text-xs ${isMe ? 'text-blue-100' : 'text-slate-900 dark:text-slate-100'}`}>
                          {msg.senderName}
                        </span>
                        {msg.flatNumber && 
                         msg.flatNumber !== 'إدارة الاتحاد' && 
                         msg.flatNumber !== 'فني الصيانة' && 
                         !String(msg.flatNumber).includes('ساكن') && 
                         !String(msg.flatNumber).includes('الساكن') && (
                          <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-black ${
                            isMe ? 'bg-blue-800/80 text-white' : 'bg-blue-50 dark:bg-blue-900/40 text-blue-900 dark:text-blue-300'
                          }`}>
                            {`وحدة ${String(msg.flatNumber).replace(/^شقة\s*/, '').replace(/^وحدة\s*/, '')}`}
                          </span>
                        )}
                        {/* Sender Role Badge */}
                        {(msg.senderRole === 'ADMIN' || msg.senderName?.includes('وحيد سماحة') || msg.flatNumber === 'إدارة الاتحاد') && (
                          <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-400/40 rounded text-[9.5px] font-black flex items-center gap-0.5">
                            <Crown className="w-2.5 h-2.5 text-amber-300" />
                            <span>رئيس الاتحاد</span>
                          </span>
                        )}
                        {(msg.senderRole === 'ASSISTANT' || msg.senderName?.includes('المساعد الفني') || msg.flatNumber === 'فني الصيانة') && (
                          <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-400/40 rounded text-[9.5px] font-black flex items-center gap-0.5">
                            <Wrench className="w-2.5 h-2.5 text-indigo-300" />
                            <span>المساعد الفني</span>
                          </span>
                        )}
                        {/* Target Channel Badge */}
                        {msg.channel === 'admin' && (
                          <span className="px-1.5 py-0.5 bg-amber-500/25 text-amber-200 border border-amber-300/40 rounded text-[9px] font-bold">
                            موجهة للإدارة 👑
                          </span>
                        )}
                        {msg.channel === 'assistant' && (
                          <span className="px-1.5 py-0.5 bg-indigo-500/25 text-indigo-200 border border-indigo-300/40 rounded text-[9px] font-bold">
                            موجهة للمساعد 🔧
                          </span>
                        )}
                        {isMe && (
                          <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 dark:text-emerald-400 rounded text-[9px] font-black border border-emerald-400/30">
                            رسالتك
                          </span>
                        )}
                      </div>

                      {/* Left side (End in RTL): Compact Timestamp */}
                      <span className={`text-[9.5px] font-bold ${isMe ? 'text-blue-200/80' : 'text-slate-400 dark:text-slate-500'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Image Attachment inside Card */}
                    {msg.imageUrl && (
                      <div className="rounded-xl overflow-hidden border border-black/10 dark:border-white/10 relative group/img cursor-pointer max-w-2xl">
                        <img
                          src={msg.imageUrl}
                          alt="مرفق صورة"
                          className="max-h-80 w-full object-cover rounded-xl hover:scale-[1.01] transition duration-300"
                          onClick={() => onPreviewImage && onPreviewImage(msg.imageUrl!)}
                        />
                        <button
                          type="button"
                          onClick={() => onPreviewImage && onPreviewImage(msg.imageUrl!)}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition flex items-center justify-center text-white text-xs font-black gap-1.5"
                        >
                          <Eye className="w-4 h-4" />
                          <span>عرض وتكبير الصورة</span>
                        </button>
                      </div>
                    )}

                    {/* Text or Inline Editing */}
                    {isEditing ? (
                      <div className="space-y-2 pt-1">
                        <textarea
                          value={editingMessageText}
                          onChange={(e) => setEditingMessageText(e.target.value)}
                          className="w-full p-2.5 text-xs font-bold bg-white text-slate-900 rounded-xl border border-blue-400 outline-none focus:ring-2 focus:ring-blue-500/30 text-right leading-relaxed"
                          rows={2}
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingMessageId(null)}
                            className="px-3 py-1.5 text-xs font-bold bg-white/20 hover:bg-white/30 text-white rounded-lg transition cursor-pointer"
                          >
                            إلغاء
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveEditedMessage(msg.id)}
                            className="px-3 py-1.5 text-xs font-black bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition cursor-pointer flex items-center gap-1 shadow-2xs"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>حفظ التعديل</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      msg.text && (
                        <p className="whitespace-pre-line text-xs font-bold leading-relaxed pt-0.5">
                          {msg.text}
                        </p>
                      )
                    )}

                    {/* Replies & Threading Section */}
                    <div className="pt-2 mt-2 border-t border-black/5 dark:border-white/5 space-y-2">
                      {/* Replies List */}
                      {msg.replies && msg.replies.length > 0 && (
                        <div className="space-y-2 pr-4 border-r-2 border-blue-500/30">
                          {msg.replies.map((reply) => {
                            const isReplyMe = Boolean(
                              (reply.senderName && userName && reply.senderName.trim().toLowerCase() === userName.trim().toLowerCase()) ||
                              (reply.flatNumber && flatNumber && String(reply.flatNumber).trim() === String(flatNumber).trim()) ||
                              (role === 'ASSISTANT' && (reply.senderName === 'المساعد الفني' || reply.flatNumber === 'فني الصيانة'))
                            );
                            const canModifyReply = isReplyMe || role === 'ADMIN';
                            const isEditingReply = editingReplyKey?.messageId === msg.id && editingReplyKey?.replyId === reply.id;

                            return (
                              <div 
                                key={reply.id} 
                                className={`rounded-xl p-2 text-xs leading-relaxed space-y-1 shadow-3xs ${
                                  isReplyMe 
                                    ? 'bg-blue-800/40 text-blue-50 border border-blue-700/30' 
                                    : 'bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-800/40'
                                }`}
                              >
                                {/* Reply Header */}
                                <div className="flex items-center justify-between pb-1 border-b border-black/5 dark:border-white/5 text-[10px] font-black flex-wrap gap-1">
                                  <div className="flex items-center gap-1">
                                    <span className={isReplyMe ? 'text-blue-200' : 'text-slate-900 dark:text-slate-100'}>
                                      {reply.senderName}
                                    </span>
                                    {reply.flatNumber && 
                                     reply.flatNumber !== 'إدارة الاتحاد' && 
                                     reply.flatNumber !== 'فني الصيانة' && (
                                      <span className="px-1 py-0.1 bg-black/10 dark:bg-white/10 rounded text-[8.5px]">
                                        وحدة {reply.flatNumber}
                                      </span>
                                    )}
                                    {reply.senderRole === 'ADMIN' && (
                                      <span className="text-[8.5px] text-amber-500 dark:text-amber-400 font-bold">
                                        (رئيس الاتحاد 👑)
                                      </span>
                                    )}
                                    {reply.senderRole === 'ASSISTANT' && (
                                      <span className="text-[8.5px] text-indigo-500 dark:text-indigo-400 font-bold">
                                        (المساعد 🔧)
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[9px] text-slate-400">
                                    {new Date(reply.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>

                                {/* Reply Body */}
                                {isEditingReply ? (
                                  <div className="space-y-1.5 pt-1">
                                    <input 
                                      type="text"
                                      value={editingReplyText}
                                      onChange={(e) => setEditingReplyText(e.target.value)}
                                      className="w-full p-2 text-xs font-bold bg-white text-slate-900 border border-blue-400 rounded-lg outline-none"
                                    />
                                    <div className="flex justify-end gap-1.5">
                                      <button 
                                        type="button"
                                        onClick={() => setEditingReplyKey(null)}
                                        className="px-2 py-1 text-[10px] font-bold bg-slate-300 dark:bg-slate-750 text-slate-700 dark:text-slate-250 rounded"
                                      >
                                        إلغاء
                                      </button>
                                      <button 
                                        type="button"
                                        onClick={() => handleSaveEditedReply(msg.id, reply.id)}
                                        className="px-2 py-1 text-[10px] font-black bg-emerald-600 text-white rounded"
                                      >
                                        حفظ
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-start justify-between gap-2 pt-0.5">
                                    <p className="font-bold flex-1">{reply.text}</p>
                                    
                                    {/* Action Buttons for Reply (Only if canModifyReply) */}
                                    {canModifyReply && (
                                      <div className="flex items-center gap-1 shrink-0">
                                        <button 
                                          type="button"
                                          onClick={() => startEditingReply(msg.id, reply.id, reply.text)}
                                          className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition text-blue-500 hover:text-blue-400"
                                          title="تعديل الرد"
                                        >
                                          <Edit className="w-3 h-3" />
                                        </button>
                                        <button 
                                          type="button"
                                          onClick={() => handleDeleteReply(msg.id, reply.id)}
                                          className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition text-red-500 hover:text-red-400"
                                          title="حذف الرد"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Reply Input Form & Trigger Button */}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        {replyingToMessageId === msg.id ? (
                          <div className="flex items-center gap-1.5 w-full">
                            <input 
                              type="text"
                              placeholder="اكتب ردك هنا..."
                              value={replyTextMap[msg.id] || ''}
                              onChange={(e) => setReplyTextMap(prev => ({ ...prev, [msg.id]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSendReply(msg.id);
                                }
                              }}
                              className={`flex-1 px-3 py-1.5 text-xs font-bold rounded-xl outline-none border focus:ring-2 focus:ring-blue-500/20 transition text-right ${
                                isMe 
                                  ? 'bg-blue-800 border-blue-700 focus:bg-blue-800 text-white placeholder-blue-300/60' 
                                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400'
                              }`}
                            />
                            <button 
                              type="button"
                              onClick={() => handleSendReply(msg.id)}
                              disabled={!(replyTextMap[msg.id] || '').trim()}
                              className={`p-2 rounded-xl transition cursor-pointer active:scale-95 shrink-0 ${
                                isMe 
                                  ? 'bg-blue-100 hover:bg-blue-50 text-blue-900 disabled:opacity-40' 
                                  : 'bg-blue-900 hover:bg-blue-950 text-white disabled:opacity-40'
                              }`}
                            >
                              <Send className="w-3.5 h-3.5 transform rotate-180" />
                            </button>
                            <button 
                              type="button"
                              onClick={() => setReplyingToMessageId(null)}
                              className="px-2.5 py-1.5 text-[10px] font-black border border-black/10 dark:border-white/10 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 shrink-0"
                            >
                              إلغاء
                            </button>
                          </div>
                        ) : (
                          <button 
                            type="button"
                            onClick={() => setReplyingToMessageId(msg.id)}
                            className={`flex items-center gap-1.5 px-3 py-1 text-[10.5px] font-black rounded-xl transition-all cursor-pointer shadow-3xs border ${
                              isMe 
                                ? 'bg-blue-800 border-blue-700 hover:bg-blue-750 text-blue-100 hover:text-white' 
                                : 'bg-slate-50 dark:bg-slate-800 border-slate-200/80 dark:border-slate-750 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>إضافة رد مالي / استفسار 💬</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Attached Image Preview above input */}
          {chatImageFile && (
            <div className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <img 
                  src={chatImageFile} 
                  alt="معاينة الصورة" 
                  className="w-11 h-11 object-cover rounded-xl border border-slate-300 dark:border-slate-600 shadow-2xs" 
                />
                <div className="text-right">
                  <span className="text-xs font-black text-slate-800 dark:text-slate-200 block leading-tight">تم اختيار صورة جاهزة للإرسال</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-400 font-bold">اضغط إرسال لنشرها في المحادثة</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setChatImageFile(null);
                  if (chatFileInputRef.current) chatFileInputRef.current.value = '';
                }}
                className="p-1.5 text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition cursor-pointer"
                title="إلغاء الصورة"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Input Area (Sticky / Docked at Bottom) */}
          <div className="sticky bottom-0 z-10 bg-white dark:bg-[#111a2e] border-t border-slate-200/80 dark:border-slate-800 shrink-0">
            {/* Recipient Channel Selector */}
            <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between flex-wrap gap-1 text-[11px]">
              <span className="font-bold text-slate-500 dark:text-slate-400">
                توجيه الرسالة:
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSendTargetChannel('all')}
                  className={`px-2.5 py-0.5 rounded-lg font-black transition cursor-pointer ${
                    sendTargetChannel === 'all'
                      ? 'bg-blue-900 text-white shadow-2xs'
                      : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300/80'
                  }`}
                >
                  الجميع 👥
                </button>
                <button
                  type="button"
                  onClick={() => setSendTargetChannel('admin')}
                  className={`px-2.5 py-0.5 rounded-lg font-black transition cursor-pointer ${
                    sendTargetChannel === 'admin'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300/80'
                  }`}
                >
                  إدارة الاتحاد 👑
                </button>
                <button
                  type="button"
                  onClick={() => setSendTargetChannel('assistant')}
                  className={`px-2.5 py-0.5 rounded-lg font-black transition cursor-pointer ${
                    sendTargetChannel === 'assistant'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300/80'
                  }`}
                >
                  المساعد الفني 🔧
                </button>
              </div>
            </div>

            <form onSubmit={handleSendChat} className="p-2.5 sm:p-3 flex items-center gap-1.5 sm:gap-2">
              {/* Hidden File Input */}
              <input
                type="file"
                ref={chatFileInputRef}
                onChange={handleChatImageSelect}
                accept="image/*"
                className="hidden"
              />

              {/* Photo Attach Button */}
              <button
                type="button"
                onClick={() => chatFileInputRef.current?.click()}
                className="p-2 sm:p-2.5 text-slate-500 dark:text-slate-400 hover:text-blue-900 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 bg-slate-100 dark:bg-slate-800 rounded-xl transition cursor-pointer shrink-0 flex items-center justify-center shadow-2xs"
                title="إرفاق صورة أو التقاط بالكاميرا"
              >
                <Camera className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              {/* Message Text Input */}
              <input
                type="text"
                placeholder="اكتب رسالتك هنا للترحيب بالجيران أو إرسال استفسار..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                className="flex-1 px-3.5 py-2 sm:py-2.5 bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500/20 outline-none text-right font-bold transition placeholder:text-slate-400"
              />

              {/* Send Button */}
              <button
                type="submit"
                disabled={!messageText.trim() && !chatImageFile}
                className="px-3.5 sm:px-4 py-2 sm:py-2.5 bg-blue-900 hover:bg-blue-950 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl font-black text-xs sm:text-sm transition flex items-center justify-center gap-1 cursor-pointer active:scale-95 shrink-0 shadow-2xs"
              >
                <Send className="w-3.5 h-3.5 transform rotate-180" />
                <span>إرسال</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. COMPLAINTS & DISCUSSIONS SUBTAB */}
      {/* ========================================================================= */}
      {activeSubTab === 'complaints' && (
        <div className="space-y-3.5">
          {/* Form to submit complaint */}
          {showAddForm && (
            <div className="bg-white dark:bg-[#111a2e] rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-md text-right animate-scale-up space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-blue-900 dark:text-blue-300" />
                  <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100">كتابة شكوى أو مقترح للمناقشة مع اتحاد الملاك</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold cursor-pointer"
                >
                  إغلاق
                </button>
              </div>

              <form onSubmit={handlePostComplaint} className="space-y-3.5">
                {/* Anonymous Toggle */}
                <div className="bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/60 p-3 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserX className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                    <div>
                      <h4 className="text-xs font-black text-amber-950 dark:text-amber-200">إرسال كشكوى مجهولة المصدر (بدون اسم)</h4>
                      <p className="text-[10px] text-amber-800/80 dark:text-amber-400/80 font-bold">
                        سيتم إخفاء اسمك ورقم شقتك بالكامل وسيظهر التقرير تحت اسم "فاعل خير (مجهول)" لضمان الخصوصية.
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    id="anonymousCheck"
                    checked={isAnonymous}
                    onChange={(e) => setIsAnonymous(e.target.checked)}
                    className="w-4 h-4 accent-amber-600 rounded-lg cursor-pointer shrink-0"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">عنوان الشكوى / الموضوع الرئيسي <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    placeholder="مثال: صوت مزعج صادر من موتور المياه ليلاً / تسرب مياه في مدخل العمارة"
                    value={complaintTitle}
                    onChange={(e) => setComplaintTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/20 transition text-right"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">التفاصيل والحلول المقترحة <span className="text-red-500">*</span></label>
                  <textarea
                    rows={3}
                    placeholder="يرجى كتابة التفاصيل والملاحظات بدقة لنتمكن جميعاً كجيران ورئيس اتحاد من التعاون على حل المشكلة..."
                    value={complaintDesc}
                    onChange={(e) => setComplaintDesc(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/20 transition text-right leading-relaxed"
                    required
                  />
                </div>

                {/* Photo Upload for Complaint */}
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">إرفاق صورة أو مستند للشكوى (اختياري)</label>
                  <input
                    type="file"
                    ref={complaintFileInputRef}
                    onChange={handleComplaintImageSelect}
                    accept="image/*"
                    className="hidden"
                  />

                  {complaintImageFile ? (
                    <div className="flex items-center gap-3 p-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl w-fit">
                      <img 
                        src={complaintImageFile} 
                        alt="صورة الشكوى المرفقة" 
                        className="w-14 h-14 object-cover rounded-lg border border-slate-200 dark:border-slate-700" 
                      />
                      <div className="space-y-1">
                        <span className="text-xs font-black text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>تم إرفاق الصورة بنجاح</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setComplaintImageFile(null);
                            if (complaintFileInputRef.current) complaintFileInputRef.current.value = '';
                          }}
                          className="text-[10px] text-red-600 hover:underline font-bold block cursor-pointer"
                        >
                          إزالة الصورة
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => complaintFileInputRef.current?.click()}
                      className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-2 border border-slate-200 dark:border-slate-700"
                    >
                      <Camera className="w-4 h-4 text-slate-500" />
                      <span>اختيار صورة أو التقاط بالكاميرا</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-900 hover:bg-blue-950 text-white rounded-xl text-xs font-black transition cursor-pointer shadow-xs"
                  >
                    نشر الشكوى الآن
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Complaints list */}
          {complaints.length === 0 ? (
            <div className="bg-white dark:bg-[#111a2e] rounded-2xl py-12 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 gap-2 border border-slate-200/80 dark:border-slate-800 shadow-xs">
              <AlertTriangle className="w-10 h-10 stroke-[1.5] text-amber-500" />
              <p className="text-xs sm:text-sm font-black text-slate-700 dark:text-slate-300">لا توجد شكاوى أو مواضيع عامة مسجلة حالياً.</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 font-bold">استخدم الزر بالأعلى لنشر موضوع جديد للنقاش مع اتحاد الملاك.</p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {complaints.map((comp) => {
                const isExpanded = expandedComplaintId === comp.id;
                const totalComments = comp.comments ? comp.comments.length : 0;
                const isAnonymousComplaint = comp.isAnonymous || comp.residentName.includes('مجهول') || comp.residentName.includes('فاعل خير');

                return (
                  <div
                    key={comp.id}
                    className="bg-white dark:bg-[#111a2e] rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-xs hover:border-blue-200 dark:hover:border-blue-800/60 transition text-right space-y-3"
                  >
                    {/* Header */}
                    <div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5 mb-2.5">
                        <div className="flex items-center gap-2 self-start sm:self-auto text-xs font-bold text-slate-400 flex-wrap">
                          {isAnonymousComplaint ? (
                            <span className="px-2 py-0.5 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800 rounded-md flex items-center gap-1 font-black text-[10px]">
                              <UserX className="w-3 h-3 text-amber-600" />
                              <span>فاعل خير (مجهول الهوية)</span>
                            </span>
                          ) : (
                            <>
                              {comp.flatNumber ? (
                                <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-300 rounded-md flex items-center gap-1 font-black text-[10px]">
                                  <Home className="w-3 h-3" />
                                  <span>وحدة {comp.flatNumber}</span>
                                </span>
                              ) : null}
                              <span className="text-slate-800 dark:text-slate-200 font-black text-xs">{comp.residentName}</span>
                            </>
                          )}
                          <span>•</span>
                          <span className="text-slate-400 text-[11px] flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span>{comp.date}</span>
                          </span>
                        </div>
                        
                        <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 flex-1 text-right sm:pr-3">{comp.title}</h4>
                      </div>

                      <p className="text-xs font-medium text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line mb-2">
                        {comp.description}
                      </p>

                      {/* Image Attachment in Complaint */}
                      {comp.imageUrl && (
                        <div className="mb-4">
                          <div 
                            onClick={() => onPreviewImage && onPreviewImage(comp.imageUrl!)}
                            className="w-fit max-w-sm rounded-2xl overflow-hidden border border-slate-200 relative group cursor-pointer shadow-xs"
                          >
                            <img
                              src={comp.imageUrl}
                              alt="صورة مرفقة بالشكوى"
                              className="max-h-60 w-auto object-cover rounded-2xl hover:scale-102 transition duration-300"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-black gap-1">
                              <Eye className="w-4 h-4" />
                              <span>عرض وتكبير الصورة</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Controls */}
                      {(() => {
                        const isMyComplaint = (Boolean(userName) && Boolean(comp.residentName) && comp.residentName.trim().toLowerCase() === userName.trim().toLowerCase()) ||
                          (flatNumber !== undefined && comp.flatNumber !== undefined && comp.flatNumber === flatNumber) ||
                          (role === 'ASSISTANT' && Boolean(comp.residentName) && (comp.residentName.includes('المساعد الفني') || comp.residentName.includes('فني الصيانة')));
                        const canDeleteComplaint = role === 'ADMIN' || isMyComplaint;

                        return (
                          <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 dark:border-slate-800 flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              {onDeleteComplaint && canDeleteComplaint && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    openConfirm(
                                      'حذف الشكوى',
                                      `هل تريد بالتأكيد إزالة الشكوى "${comp.title}"؟`,
                                      () => onDeleteComplaint(comp.id)
                                    );
                                  }}
                                  className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1"
                                  title="حذف الشكوى"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>حذف الشكوى</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleShareComplaintWhatsApp(comp)}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1 border border-emerald-100"
                                title="مشاركة الشكوى عبر واتساب"
                              >
                                <Share2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>مشاركة الشكوى</span>
                              </button>
                            </div>
                            
                            <button
                              type="button"
                              onClick={() => setExpandedComplaintId(isExpanded ? null : comp.id)}
                              className={`px-3.5 py-1.5 border rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer ml-auto ${
                                isExpanded 
                                  ? 'bg-blue-900 text-white border-blue-900 shadow-xs' 
                                  : 'bg-slate-50 dark:bg-slate-800/80 text-blue-900 dark:text-blue-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                              }`}
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>التعليقات والمناقشة ({totalComments})</span>
                            </button>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Comments section (expanded) */}
                    {isExpanded && (
                      <div className="bg-slate-50/70 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-800 p-4 rounded-xl space-y-3">
                        <h5 className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5 justify-end">
                          <span>التعليقات والردود الواردة</span>
                          <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                        </h5>

                        {/* Comments list */}
                        {(!comp.comments || comp.comments.length === 0) ? (
                          <p className="text-center py-4 text-xs text-slate-400 dark:text-slate-500 font-bold">
                            لا توجد ردود حالياً على هذه الشكوى. أضف تعليقك الآن للمساعدة في الحل!
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {comp.comments.map((comment) => (
                              <div
                                key={comment.id}
                                className="bg-white dark:bg-[#111a2e] rounded-xl p-3 border border-slate-200/80 dark:border-slate-750 shadow-xs flex flex-col space-y-1 text-right max-w-2xl ml-auto w-full"
                              >
                                <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-1">
                                  <span>{new Date(comment.timestamp).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</span>
                                  <span className="text-slate-700 dark:text-slate-300 font-black">{comment.senderName}</span>
                                </div>
                                {editingCommentId === comment.id ? (
                                  <div className="space-y-2 mt-1">
                                    <textarea
                                      value={editingCommentText}
                                      onChange={(e) => setEditingCommentText(e.target.value)}
                                      className="w-full p-2 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 text-right text-slate-900 dark:text-slate-100"
                                      rows={2}
                                    />
                                    <div className="flex justify-end gap-1.5">
                                      <button
                                        onClick={() => setEditingCommentId(null)}
                                        className="px-2.5 py-1 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 rounded-md transition cursor-pointer"
                                      >
                                        إلغاء
                                      </button>
                                      <button
                                        onClick={() => handleSaveEditedComment(comp.id, comment.id)}
                                        className="px-2.5 py-1 text-[10px] font-black bg-blue-900 text-white rounded-md transition cursor-pointer flex items-center gap-1"
                                      >
                                        <Check className="w-3 h-3" />
                                        <span>حفظ التعديل</span>
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <p className="text-xs text-slate-800 dark:text-slate-200 font-bold leading-relaxed">{comment.text}</p>
                                    
                                    {/* Edit / Delete actions for comment owner or union president */}
                                    {(() => {
                                      const isMyComment = comment.senderName === userName || (role === 'ASSISTANT' && comment.senderName === 'المساعد الفني');
                                      return (role === 'ADMIN' || isMyComment) && (
                                        <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-50 dark:border-slate-800 mt-1.5">
                                          {isMyComment && (
                                            <button
                                              onClick={() => startEditingComment(comment.id, comment.text)}
                                              className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5 cursor-pointer"
                                              title="تعديل التعليق"
                                            >
                                              <Edit className="w-2.5 h-2.5" />
                                              <span>تعديل</span>
                                            </button>
                                          )}
                                          <button
                                            onClick={() => handleDeleteCommentClick(comp.id, comment.id)}
                                            className="text-[10px] text-red-500 hover:underline flex items-center gap-0.5 cursor-pointer"
                                            title="حذف التعليق"
                                          >
                                            <Trash2 className="w-2.5 h-2.5" />
                                            <span>حذف</span>
                                          </button>
                                        </div>
                                      );
                                    })()}
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add Comment input form */}
                        <div className="flex gap-2 pt-1 max-w-2xl ml-auto">
                          <input
                            type="text"
                            placeholder="اكتب ردك أو تعليقك لمساعدة الجيران أو رئيس الاتحاد..."
                            value={commentText[comp.id] || ''}
                            onChange={(e) => setCommentText(prev => ({ ...prev, [comp.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handlePostComment(comp.id);
                              }
                            }}
                            className="flex-1 px-3.5 py-2 bg-white dark:bg-[#111a2e] border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 outline-none text-right font-bold text-slate-900 dark:text-slate-100 transition"
                          />
                          <button
                            type="button"
                            onClick={() => handlePostComment(comp.id)}
                            className="px-4 py-2 bg-blue-900 hover:bg-blue-950 text-white text-xs font-black rounded-xl transition cursor-pointer active:scale-95"
                          >
                            تعليق
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* In-App Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
