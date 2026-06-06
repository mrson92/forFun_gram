import React from 'react';

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  badgeColor?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ icon, label, value, badgeColor }) => (
  <div className="bg-slate-900/60 backdrop-blur-xl p-6 rounded-3xl border border-slate-800/80 flex items-center gap-5 hover:border-slate-700 transition-all hover:shadow-lg group">
    <div className={`p-4 rounded-2xl bg-slate-950 border border-slate-800 group-hover:scale-105 transition-transform ${badgeColor || ''}`}>{icon}</div>
    <div>
      <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-black text-slate-200 tracking-tight font-mono">{value}</p>
    </div>
  </div>
);
