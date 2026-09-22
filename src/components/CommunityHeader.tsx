import React from 'react';

export type CommunityServiceId = 
  | 'chat-room'
  | 'maintenance-requests'
  | 'maintenance-directory'
  | 'chat-complaints'
  | 'polls'
  | 'decisions'
  | 'calendar';

export interface CommunityCounts {
  messages?: number;
  requests?: number;
  craftsmen?: number;
  complaints?: number;
  polls?: number;
  decisions?: number;
  events?: number;
}

interface CommunityHeaderProps {
  activeService?: CommunityServiceId;
  onNavigateService?: (service: CommunityServiceId) => void;
  title: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
  counts?: CommunityCounts;
  actionButton?: React.ReactNode;
}

export const CommunityHeader: React.FC<CommunityHeaderProps> = ({
  title,
  description,
  icon,
  badge,
  actionButton,
}) => {
  return (
    <div className="w-full" dir="rtl">
      {/* Unified Page Header Banner */}
      <div className="bg-white dark:bg-[#111a2e] rounded-xl px-3 py-2 sm:px-3.5 sm:py-2 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-right">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-300 flex items-center justify-center shrink-0 shadow-2xs">
            {icon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 leading-tight">
                {title}
              </h2>
              {badge && (
                <span className="text-[10px] font-black px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 border border-blue-200/60 dark:border-blue-800 rounded-md">
                  {badge}
                </span>
              )}
            </div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1 sm:line-clamp-none">
              {description}
            </p>
          </div>
        </div>

        {actionButton && (
          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            {actionButton}
          </div>
        )}
      </div>
    </div>
  );
};
