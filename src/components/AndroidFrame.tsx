import React from 'react';
import { Wifi, Battery, Smartphone, Monitor } from 'lucide-react';

interface AndroidFrameProps {
  isFrameEnabled: boolean;
  onToggleFrame: () => void;
  children: React.ReactNode;
}

export const AndroidFrame: React.FC<AndroidFrameProps> = ({
  isFrameEnabled,
  onToggleFrame,
  children,
}) => {
  // Current time for Android status bar
  const currentTime = new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

  if (!isFrameEnabled) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#121316] text-slate-900 dark:text-slate-100 transition-colors">
        <div className="max-w-4xl mx-auto min-h-screen flex flex-col relative shadow-2xl bg-white dark:bg-[#1a1c20] border-x border-slate-200 dark:border-slate-800">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-[#161b22] to-slate-950 flex flex-col items-center justify-center p-2 sm:p-6 text-slate-100">
      {/* Frame Switcher Bar */}
      <div className="w-full max-w-[420px] mb-3 flex items-center justify-between px-2 text-xs text-slate-400">
        <div className="flex items-center gap-1.5 font-medium">
          <Smartphone className="w-3.5 h-3.5 text-indigo-400" />
          <span>Widok: Smartfon Android (Material 3)</span>
        </div>
        <button
          onClick={onToggleFrame}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer text-xs"
          title="Przełącz na widok pełnoekranowy"
        >
          <Monitor className="w-3 h-3" />
          <span>Pełny ekran</span>
        </button>
      </div>

      {/* Realistic Android Phone Chassis */}
      <div className="w-full max-w-[400px] h-[844px] bg-[#0c0d0f] rounded-[48px] p-3 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] border-4 border-slate-700/80 relative flex flex-col overflow-hidden">
        {/* Dynamic Island / Camera Punch Hole */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-4 h-4 bg-black rounded-full z-50 ring-2 ring-slate-800/60 pointer-events-none" />

        {/* Screen Bezel Area */}
        <div className="w-full h-full bg-white dark:bg-[#121316] text-slate-900 dark:text-slate-100 rounded-[38px] overflow-hidden flex flex-col relative">
          {/* Android Status Bar */}
          <div className="h-10 pt-1.5 px-6 flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300 z-40 select-none bg-transparent">
            <span>{currentTime}</span>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[10px] font-semibold px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800">5G</span>
              <Wifi className="w-3.5 h-3.5" />
              <Battery className="w-4 h-4" />
            </div>
          </div>

          {/* Screen Content */}
          <div className="flex-1 flex flex-col overflow-hidden relative">
            {children}
          </div>

          {/* Android Gesture Bar */}
          <div className="h-4 w-full flex items-center justify-center pb-1 bg-white dark:bg-[#121316] select-none pointer-events-none z-40">
            <div className="w-32 h-1 bg-slate-400 dark:bg-slate-600 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
};
