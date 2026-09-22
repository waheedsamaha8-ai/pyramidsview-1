import React, { useState } from 'react';
import { 
  Calendar as CalendarIcon, 
  Plus, 
  Trash2, 
  Clock, 
  Users, 
  CheckCircle2, 
  AlertTriangle,
  XCircle,
  Megaphone,
  Briefcase,
  Layers,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { BuildingEvent, UserRole } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { CommunityHeader, CommunityServiceId, CommunityCounts } from './CommunityHeader';

interface EventsCalendarProps {
  events: BuildingEvent[];
  role: UserRole;
  onAddEvent: (event: BuildingEvent) => void;
  onUpdateEvent: (id: string, updates: Partial<BuildingEvent>) => void;
  onDeleteEvent: (id: string) => void;
  onNavigateCommunity?: (serviceId: string) => void;
  communityCounts?: CommunityCounts;
}

export const EventsCalendar: React.FC<EventsCalendarProps> = ({
  events,
  role,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  onNavigateCommunity,
  communityCounts,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  
  // New event form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [type, setType] = useState<BuildingEvent['type']>('MAINTENANCE');
  const [targetAudience, setTargetAudience] = useState<BuildingEvent['targetAudience']>('ALL');

  // Simple calendar navigation helper (current view month)
  const [currentDate, setCurrentDate] = useState(new Date());

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !date) return;

    const newEvent: BuildingEvent = {
      id: `ev_${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      date,
      time: time || undefined,
      type,
      targetAudience,
      status: 'SCHEDULED'
    };

    onAddEvent(newEvent);
    setTitle('');
    setDescription('');
    setDate('');
    setTime('');
    setType('MAINTENANCE');
    setTargetAudience('ALL');
    setShowAddForm(false);
  };

  // Get days of the month for visual calendar grid
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay(); // Sunday: 0, Monday: 1...
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayIndex = getFirstDayOfMonth(year, month);

  const monthNamesArabic = [
    'يناير (كانون الثاني)', 'فبراير (شباط)', 'مارس (آذار)', 'أبريل (نيسان)',
    'مايو (أيار)', 'يونيو (حزيران)', 'يوليو (تموز)', 'أغسطس (آب)',
    'سبتمبر (أيلول)', 'أكتوبر (تشرين الأول)', 'نوفمبر (تشرين الثاني)', 'ديسمبر (كانون الأول)'
  ];

  // Helper to find events on a specific day
  const getEventsForDay = (day: number) => {
    const formattedDayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.filter(e => e.date === formattedDayStr);
  };

  const getEventColorClass = (type: BuildingEvent['type']) => {
    switch (type) {
      case 'MAINTENANCE':
        return 'bg-amber-500 text-white';
      case 'MEETING':
        return 'bg-blue-600 text-white';
      case 'SOCIAL':
        return 'bg-emerald-600 text-white';
      case 'OTHER':
        return 'bg-purple-600 text-white';
    }
  };

  const getEventLabel = (type: BuildingEvent['type']) => {
    switch (type) {
      case 'MAINTENANCE': return 'صيانة دورية 🛠️';
      case 'MEETING': return 'اجتماع اتحاد ملاك 👥';
      case 'SOCIAL': return 'نشاط مجتمعي 🎉';
      case 'OTHER': return 'حدث آخر 📋';
    }
  };

  // Filter events list for the agenda view
  const filteredEvents = events
    .filter(e => {
      if (filterType !== 'ALL' && e.type !== filterType) return false;
      return true;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="w-full space-y-2.5 text-right animate-fade-in" id="events-panel" dir="rtl">
      {/* 1. Unified Community Hub Header */}
      <CommunityHeader
        activeService="calendar"
        onNavigateService={(srv) => {
          if (onNavigateCommunity) {
            onNavigateCommunity(srv);
          }
        }}
        title="تقويم الأحداث وجدول المواعيد"
        description="مواعيد الاجتماعات الدورية، خطط الصيانة، غسيل الخزانات، ومتابعة الفعاليات العامة لعمارة بيراميدز فيو ١."
        icon={<CalendarIcon className="w-4 h-4" />}
        badge={`${events.length} فعالية`}
        counts={communityCounts || {
          events: events.length,
        }}
        actionButton={
          role === 'ADMIN' || role === 'MANAGER' ? (
            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-3 py-1.5 bg-blue-900 hover:bg-blue-950 text-white rounded-lg text-xs font-bold transition shadow-2xs flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showAddForm ? 'إلغاء النموذج' : 'إضافة حدث'}</span>
            </button>
          ) : undefined
        }
      />

      {/* Add Event Form (Managers/Admins only) */}
      {showAddForm && (role === 'ADMIN' || role === 'MANAGER') && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-[#111a2e] border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 rounded-2xl shadow-xs space-y-4 animate-scale-up">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-blue-900 dark:text-blue-400" />
              <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100">جدولة وتثبيت حدث جديد في التقويم</h4>
            </div>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold"
            >
              إلغاء
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">عنوان الفعالية أو الحدث <span className="text-red-500">*</span></label>
              <input
                type="text"
                placeholder="مثال: غسيل خزانات المياه الرئيسية وتطهيرها"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">نوع الحدث</label>
                <select
                  value={type}
                  onChange={(e: any) => setType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none cursor-pointer"
                >
                  <option value="MAINTENANCE">صيانة دورية 🛠️</option>
                  <option value="MEETING">اجتماع ملاك 👥</option>
                  <option value="SOCIAL">نشاط اجتماعي 🎉</option>
                  <option value="OTHER">أخرى 📋</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">المستهدفون بالحضور</label>
                <select
                  value={targetAudience}
                  onChange={(e: any) => setTargetAudience(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none cursor-pointer"
                >
                  <option value="ALL">الجميع (ملاك وسكان)</option>
                  <option value="RESIDENTS">السكان فقط</option>
                  <option value="MANAGERS">أعضاء مجلس الإدارة</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">تاريخ الحدث <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">التوقيت (اختياري)</label>
              <input
                type="text"
                placeholder="مثال: الساعة 5:00 مساءً"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">تفاصيل وملاحظات إضافية للحدث <span className="text-red-500">*</span></label>
            <textarea
              placeholder="اكتب هنا الإرشادات أو التنويهات الخاصة بالحدث (مثال: يرجى ترشيد استخدام المياه في فترات الغسيل، أو جدول الأعمال)..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20 leading-relaxed"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs rounded-xl transition cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-900 hover:bg-blue-950 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer transition"
            >
              حفظ وتثبيت الحدث
            </button>
          </div>
        </form>
      )}

      {/* Main Grid View: Monthly Visual Grid & Agenda */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        
        {/* Visual Monthly Calendar Grid (Left 2 Columns on desktop) */}
        <div className="lg:col-span-2 bg-white dark:bg-[#111a2e] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-700/80">
            <button 
              type="button"
              onClick={handlePrevMonth} 
              className="p-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            
            <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100">
              {monthNamesArabic[month]} {year}
            </span>

            <button 
              type="button"
              onClick={handleNextMonth} 
              className="p-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday Titles (Arabic) */}
          <div className="grid grid-cols-7 gap-1.5 text-center text-[10.5px] font-black text-slate-400 dark:text-slate-500 select-none pb-1">
            <span>الأحد</span>
            <span>الاثنين</span>
            <span>الثلاثاء</span>
            <span>الأربعاء</span>
            <span>الخميس</span>
            <span>الجمعة</span>
            <span>السبت</span>
          </div>

          {/* Grid Days */}
          <div className="grid grid-cols-7 gap-1.5 text-right">
            {/* Blank offset cells */}
            {Array.from({ length: firstDayIndex }).map((_, idx) => (
              <div key={`blank-${idx}`} className="aspect-square bg-slate-50/40 dark:bg-slate-850/20 rounded-xl border border-transparent" />
            ))}

            {/* Monthly day cells */}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const day = idx + 1;
              const dayEvents = getEventsForDay(day);
              const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;

              return (
                <div 
                  key={`day-${day}`} 
                  className={`aspect-square p-2 border rounded-xl flex flex-col justify-between transition-all duration-300 group relative ${
                    isToday 
                      ? 'bg-blue-900/10 dark:bg-blue-500/15 border-blue-900 dark:border-blue-400 shadow-xs' 
                      : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/70 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <span className={`text-[11px] font-extrabold ${isToday ? 'text-blue-900 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300'}`}>
                    {day}
                  </span>

                  {/* Little Dot Markers for events */}
                  <div className="flex gap-1 flex-wrap justify-end">
                    {dayEvents.map(e => (
                      <span 
                        key={e.id} 
                        className={`w-1.5 h-1.5 rounded-full ${getEventColorClass(e.type).split(' ')[0]}`}
                        title={e.title}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Key Legend */}
          <div className="flex flex-wrap items-center justify-start gap-4 text-[10px] font-bold text-slate-500 dark:text-slate-400 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-amber-500 rounded-full" />
              <span>صيانة دورية</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-blue-600 rounded-full" />
              <span>اجتماع اتحاد الملاك</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-emerald-600 rounded-full" />
              <span>أنشطة عامة واجتماعية</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-purple-600 rounded-full" />
              <span>أحداث أخرى طارئة</span>
            </div>
          </div>
        </div>

        {/* Agenda Events Feed List (Right 1 Column on desktop) */}
        <div className="bg-white dark:bg-[#111a2e] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100">الأجندة والمواعيد القادمة</h4>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg text-[10px] font-bold cursor-pointer outline-none"
            >
              <option value="ALL">جميع الأحداث</option>
              <option value="MAINTENANCE">صيانة فقط</option>
              <option value="MEETING">اجتماعات فقط</option>
              <option value="SOCIAL">أنشطة فقط</option>
            </select>
          </div>

          {filteredEvents.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/30 dark:bg-slate-800/20">
              <Clock className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <h5 className="text-[11px] font-bold text-slate-700 dark:text-slate-300">لا توجد فعاليات مجدولة</h5>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">تظهر هنا كشوف الأحداث الزمنية القادمة للعمارة.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {filteredEvents.map(ev => {
                const isPassed = new Date(ev.date).getTime() < new Date().setHours(0,0,0,0);
                
                return (
                  <div 
                    key={ev.id} 
                    className={`p-3.5 border rounded-2xl transition hover:shadow-md flex flex-col justify-between space-y-2.5 ${
                      isPassed 
                        ? 'opacity-65 bg-slate-50/50 dark:bg-slate-800/30 border-slate-200/60 dark:border-slate-800/60' 
                        : 'bg-white dark:bg-[#111a2e] border-slate-200/80 dark:border-slate-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`px-2 py-0.5 rounded-md text-[9.5px] font-black ${getEventColorClass(ev.type)}`}>
                          {getEventLabel(ev.type)}
                        </span>
                        
                        <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-slate-400 dark:text-slate-500">
                          <span>{ev.date}</span>
                          {ev.time && <span>• {ev.time}</span>}
                        </div>
                      </div>

                      <h5 className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100 mb-1">{ev.title}</h5>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed font-bold">{ev.description}</p>
                    </div>

                    <div className="border-t border-slate-100 dark:border-slate-800 pt-2 flex items-center justify-between text-[10px] font-bold">
                      <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500">
                        <Users className="w-3.5 h-3.5" />
                        <span>الجمهور: {ev.targetAudience === 'ALL' ? 'الجميع' : ev.targetAudience === 'MANAGERS' ? 'مجلس الإدارة' : 'السكان'}</span>
                      </div>

                      {/* Status controller for Managers */}
                      {role === 'ADMIN' || role === 'MANAGER' ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onUpdateEvent(ev.id, { status: ev.status === 'DONE' ? 'SCHEDULED' : 'DONE' })}
                            className={`p-1.5 rounded-lg transition cursor-pointer border ${
                              ev.status === 'DONE' 
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' 
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                            }`}
                            title={ev.status === 'DONE' ? 'تغيير لمجدول' : 'تغيير لمنفذ/تم'}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(ev.id)}
                            className="p-1.5 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 border border-red-200/60 dark:border-red-800/60 rounded-lg transition cursor-pointer"
                            title="حذف الحدث"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        ev.status === 'DONE' && (
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-black">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>تم الإنجاز</span>
                          </span>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>

      </div>

      {/* Delete Event Confirmation Modal */}
      <ConfirmModal 
        isOpen={!!confirmDeleteId}
        title="حذف موعد من التقويم"
        message="هل أنت متأكد من رغبتك في حذف هذا الحدث/الموعد من تقويم وأجندة العمارة؟"
        onConfirm={() => {
          if (confirmDeleteId) {
            onDeleteEvent(confirmDeleteId);
            setConfirmDeleteId(null);
          }
        }}
        onCancel={() => setConfirmDeleteId(null)}
        confirmLabel="نعم، احذف الحدث"
      />

    </div>
  );
};
