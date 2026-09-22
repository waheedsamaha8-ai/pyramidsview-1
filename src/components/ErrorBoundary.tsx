import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetCache = () => {
    try {
      localStorage.removeItem('custom_user_session');
      localStorage.removeItem('google_access_token');
      // keep essential cached data like residents or clear corrupted keys
      window.location.href = '/';
    } catch {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center" dir="rtl">
          <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-3xl p-8 shadow-2xl">
            <div className="w-16 h-16 bg-red-500/20 text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-red-500/30">
              <AlertTriangle className="w-8 h-8" />
            </div>
            
            <h1 className="text-2xl font-bold text-slate-100 mb-2">حدث خطأ غير متوقع في التشغيل</h1>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              حدث استثناء أثناء عرض واجهة نظام بيراميدز فيو ١. يمكنك إعادة تحميل الصفحة أو إعادة ضبط الجلسة لاستئناف العمل فوراً.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleReload}
                className="w-full py-3 px-5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/30"
              >
                <RefreshCw className="w-5 h-5" />
                إعادة تحميل التطبيق
              </button>

              <button
                onClick={this.handleResetCache}
                className="w-full py-3 px-5 bg-slate-700/80 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl flex items-center justify-center gap-2 transition-all border border-slate-600"
              >
                <Trash2 className="w-5 h-5 text-slate-400" />
                مسح الجلسة والبدء من جديد
              </button>
            </div>

            {this.state.error && (
              <details className="mt-6 text-xs text-slate-500 text-right bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                <summary className="cursor-pointer font-mono text-slate-400 select-none">تفاصيل الخطأ الفني</summary>
                <p className="mt-2 text-red-300 font-mono break-all">{this.state.error.toString()}</p>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
