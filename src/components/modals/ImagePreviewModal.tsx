import React, { useState, useRef, useEffect } from 'react';
import { Eye, ZoomIn, ZoomOut, RotateCw, Share2, X, RefreshCw } from 'lucide-react';

interface ImagePreviewModalProps {
  imageUrl: string | null;
  isLoading?: boolean;
  onClose: () => void;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  imageUrl,
  isLoading = false,
  onClose,
}) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Touch gesture & mouse dragging refs
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartZoomRef = useRef<number>(1);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const touchStartPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isPinchingRef = useRef<boolean>(false);
  const isMouseDownRef = useRef<boolean>(false);
  const mouseStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const mouseStartPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastTapRef = useRef<number>(0);

  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  }, [imageUrl]);

  if (!imageUrl) return null;

  const handleStageTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      isPinchingRef.current = true;
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistRef.current = dist;
      touchStartZoomRef.current = zoom;
    } else if (e.touches.length === 1) {
      isPinchingRef.current = false;
      touchStartPosRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
      touchStartPanRef.current = { ...pan };

      // Double-tap toggle zoom
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        if (zoom > 1) {
          setZoom(1);
          setPan({ x: 0, y: 0 });
        } else {
          setZoom(2.5);
        }
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
    }
  };

  const handleStageTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && touchStartDistRef.current !== null) {
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (touchStartDistRef.current > 0) {
        const ratio = currentDist / touchStartDistRef.current;
        const newZoom = Math.min(5, Math.max(0.5, touchStartZoomRef.current * ratio));
        setZoom(newZoom);
        if (newZoom <= 1) {
          setPan({ x: 0, y: 0 });
        }
      }
    } else if (
      e.touches.length === 1 &&
      !isPinchingRef.current &&
      touchStartPosRef.current &&
      zoom > 1
    ) {
      const dx = e.touches[0].clientX - touchStartPosRef.current.x;
      const dy = e.touches[0].clientY - touchStartPosRef.current.y;
      setPan({
        x: touchStartPanRef.current.x + dx,
        y: touchStartPanRef.current.y + dy,
      });
    }
  };

  const handleStageTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      touchStartDistRef.current = null;
    }
    if (e.touches.length === 0) {
      touchStartPosRef.current = null;
      isPinchingRef.current = false;
    }
  };

  const handleStageMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (zoom > 1) {
      isMouseDownRef.current = true;
      mouseStartPosRef.current = { x: e.clientX, y: e.clientY };
      mouseStartPanRef.current = { ...pan };
    }
  };

  const handleStageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isMouseDownRef.current && mouseStartPosRef.current && zoom > 1) {
      const dx = e.clientX - mouseStartPosRef.current.x;
      const dy = e.clientY - mouseStartPosRef.current.y;
      setPan({
        x: mouseStartPanRef.current.x + dx,
        y: mouseStartPanRef.current.y + dy,
      });
    }
  };

  const handleStageMouseUp = () => {
    isMouseDownRef.current = false;
    mouseStartPosRef.current = null;
  };

  const handleStageWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const delta = -e.deltaY;
    setZoom((prev) => {
      const next = Math.min(5, Math.max(0.5, prev + (delta > 0 ? 0.25 : -0.25)));
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const isActuallyLoading = isLoading || imageUrl === 'loading';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-2 sm:p-4 md:p-6" dir="rtl">
      <div className="w-full max-w-6xl md:max-w-7xl h-[92vh] max-h-[92vh] bg-slate-900 text-white rounded-3xl p-3 sm:p-5 relative flex flex-col shadow-2xl overflow-hidden border border-slate-800 animate-scale-up">
        {/* Header Toolbar */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 z-10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white leading-tight">معاينة صورة المستند / الإيصال</h3>
              <p className="text-[10px] text-slate-400 font-bold hidden sm:block">تكبير، تدوير ومراجعة تفاصيل الفواتير والتحصيلات بأكبر حجم ووضوح متاح</p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {!isActuallyLoading && (
              <>
                <button
                  type="button"
                  onClick={() => setZoom(prev => {
                    const next = Math.max(0.5, prev - 0.25);
                    if (next <= 1) setPan({ x: 0, y: 0 });
                    return next;
                  })}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition text-xs font-bold flex items-center gap-1 cursor-pointer"
                  title="تصغير (-)"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => { setZoom(1); setRotation(0); setPan({ x: 0, y: 0 }); }}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-xl transition text-xs font-black cursor-pointer min-w-[55px] text-center"
                  title="إعادة ضبط 100%"
                >
                  {Math.round(zoom * 100)}%
                </button>

                <button
                  type="button"
                  onClick={() => setZoom(prev => Math.min(5, prev + 0.25))}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition text-xs font-bold flex items-center gap-1 cursor-pointer"
                  title="تكبير (+)"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setRotation(prev => (prev + 90) % 360)}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition text-xs font-bold flex items-center gap-1 cursor-pointer"
                  title="تدوير 90 درجة"
                >
                  <RotateCw className="w-4 h-4" />
                </button>

                <a
                  href={imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition text-xs font-bold flex items-center gap-1.5 cursor-pointer hidden sm:flex"
                  title="فتح بالحجم الأصلي في تبويب جديد"
                >
                  <Share2 className="w-4 h-4" />
                  <span className="hidden md:inline">فتح بالأصل</span>
                </a>
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 hover:text-red-300 rounded-xl transition cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Canvas / Image Stage */}
        <div 
          className="flex-1 w-full h-full flex items-center justify-center bg-black/60 rounded-2xl overflow-hidden p-2 sm:p-4 my-2 relative select-none border border-slate-800/80 touch-none cursor-grab active:cursor-grabbing"
          onTouchStart={handleStageTouchStart}
          onTouchMove={handleStageTouchMove}
          onTouchEnd={handleStageTouchEnd}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onMouseLeave={handleStageMouseUp}
          onWheel={handleStageWheel}
        >
          {isActuallyLoading ? (
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="w-10 h-10 text-blue-500 animate-spin" />
              <span className="text-sm font-bold text-slate-300">جاري تحميل صورة المستند بأعلى دقة...</span>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center overflow-hidden p-2">
              <img
                src={imageUrl}
                alt="Receipt or Invoice document"
                referrerPolicy="no-referrer"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                  transition: (touchStartDistRef.current || touchStartPosRef.current || isMouseDownRef.current) ? 'none' : 'transform 0.15s ease-out'
                }}
                className="max-w-full max-h-[84vh] object-contain rounded-lg shadow-2xl origin-center pointer-events-auto"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-2 shrink-0 text-slate-400 text-xs font-semibold">
          <span className="text-[11px] text-slate-400">
            يمكنك التكبير والتصغير بالسحب بالإصبعين (Pinch to Zoom) أو النقر المزدوج على الموبايل، والسحب للتنقل
          </span>
          {!isActuallyLoading && (
            <a
              href={imageUrl}
              target="_blank"
              rel="noreferrer"
              className="sm:hidden flex items-center gap-1 text-xs font-bold text-blue-400 hover:underline"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>فتح بالأصل</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
