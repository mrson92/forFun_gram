import React from 'react';

interface CustomChartTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

export const CustomChartTooltip: React.FC<CustomChartTooltipProps> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const isLogcat = data.level !== undefined || (data.count !== undefined && !data.avgTime);

    return (
      <div className="bg-slate-900 p-4 border border-slate-800 shadow-2xl rounded-2xl text-xs min-w-[200px] text-slate-200">
        <p className="font-bold mb-3 text-slate-100 border-b border-slate-800 pb-2 break-all font-mono">{label}</p>
        <div className="space-y-2">
          <div className="flex justify-between items-center gap-4">
            <span className="text-slate-400 font-medium italic">Count:</span>
            <span className="font-bold text-slate-100">{(data.count || data.tps || 0).toLocaleString()}회</span>
          </div>
          {!isLogcat && (
            <>
              <div className="flex justify-between items-center gap-4">
                <span className="text-slate-400 font-medium italic">Avg Response:</span>
                <span className="font-bold text-blue-400">{((data.avgTime || 0) * 1000).toFixed(2)}ms</span>
              </div>
              <div className="flex justify-between items-center gap-4">
                <span className="text-slate-400 font-medium italic">Total Time:</span>
                <span className="font-bold text-orange-400 font-mono">{(data.total || 0).toFixed(3)}s</span>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }
  return null;
};
