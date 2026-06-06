export const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f43f5e', '#84cc16', '#eab308'];
export const SLOW_THRESHOLD = 0.2; // 200ms

export const BUCKET_CONFIG = [
  { key: 'b10ms', label: '< 10ms', color: 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/40' },
  { key: 'b100ms', label: '10-100ms', color: 'bg-blue-950/80 text-blue-400 border border-blue-800/40' },
  { key: 'b500ms', label: '100-500ms', color: 'bg-indigo-950/80 text-indigo-400 border border-indigo-800/40' },
  { key: 'b1000ms', label: '500-1000ms', color: 'bg-amber-950/80 text-amber-400 border border-amber-800/40 font-semibold' },
  { key: 'b5s', label: '1-5s', color: 'bg-orange-950/80 text-orange-400 border border-orange-850/40 font-bold' },
  { key: 'b10s', label: '5-10s', color: 'bg-red-950/80 text-red-400 border border-red-800/40 font-bold' },
  { key: 'bOver10s', label: '> 10s', color: 'bg-rose-600 text-white font-black border border-rose-500' },
];

export const LOGCAT_LEVEL_CONFIG = [
  { key: 'V', label: 'Verbose', color: 'bg-slate-800/60 text-slate-400 border border-slate-700/50' },
  { key: 'D', label: 'Debug', color: 'bg-blue-950/60 text-blue-400 border border-blue-900/50' },
  { key: 'I', label: 'Info', color: 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/50' },
  { key: 'W', label: 'Warn', color: 'bg-amber-950/60 text-amber-400 border border-amber-900/50 font-semibold' },
  { key: 'E', label: 'Error', color: 'bg-rose-950/80 text-rose-400 border border-rose-900/60 font-bold' },
  { key: 'F', label: 'Fatal', color: 'bg-red-600 text-white font-black border border-red-500' },
];

export const REGEX = {
  access: /^(\S+)(?:\s+\S+\s+\S+)?\s+\[(.*?)\]\s+"(\S+)\s+(\S+).*?"\s+(\d+)\s+(\d+|-)(?:\s+(\d+\.?\d*))?/,
  sql: /\[SQL_END\]\s+\[(.*?)\]\s+\[(\d+)ms\]/,
  sqlTime: /\[(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})/
};
