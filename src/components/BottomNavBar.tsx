import React from 'react';
import { 
  LayoutDashboard, 
  ReceiptText, 
  TrendingUp, 
  SlidersHorizontal 
} from 'lucide-react';

export type ActiveTab = 'dashboard' | 'transactions' | 'forecast' | 'rules_b2b';

interface BottomNavBarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  alertCount: number;
  transactionCount: number;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  onTabChange,
  alertCount,
  transactionCount,
}) => {
  const tabs: Array<{
    id: ActiveTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number | string;
    badgeColor?: string;
  }> = [
    {
      id: 'dashboard',
      label: 'Pulpit',
      icon: LayoutDashboard,
      badge: alertCount > 0 ? alertCount : undefined,
      badgeColor: 'bg-red-500 text-white',
    },
    {
      id: 'transactions',
      label: 'Transakcje',
      icon: ReceiptText,
      badge: transactionCount > 0 ? transactionCount : undefined,
      badgeColor: 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
    },
    {
      id: 'forecast',
      label: 'Prognoza',
      icon: TrendingUp,
    },
    {
      id: 'rules_b2b',
      label: 'Reguły i B2B',
      icon: SlidersHorizontal,
    },
  ];

  return (
    <nav 
      aria-label="Nawigacja główna aplikacji" 
      className="bg-white/95 dark:bg-[#16181d]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800/80 px-2 py-1.5 flex items-center justify-around z-30 select-none"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="flex-1 flex flex-col items-center justify-center py-1 group cursor-pointer focus:outline-none"
            aria-selected={isActive}
            role="tab"
          >
            {/* Material 3 Active Indicator Pill */}
            <div
              className={`relative px-4 py-1 rounded-full transition-all duration-200 flex items-center justify-center ${
                isActive
                  ? 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300'
                  : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200'
              }`}
            >
              <Icon className="w-5 h-5 transition-transform duration-200 group-hover:scale-105" />
              {tab.badge !== undefined && (
                <span
                  className={`absolute -top-1 -right-1 text-[10px] font-bold px-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full ${
                    tab.badgeColor || 'bg-red-500 text-white'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </div>
            {/* Label */}
            <span
              className={`text-[11px] mt-1 font-medium tracking-tight transition-colors ${
                isActive
                  ? 'text-indigo-600 dark:text-indigo-300 font-semibold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
