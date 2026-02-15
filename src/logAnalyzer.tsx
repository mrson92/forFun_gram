import React, { useState, useMemo, useCallback } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, AreaChart, Area
} from 'recharts';
import { 
  Upload, FileText, Activity, Users, Globe, AlertTriangle, 
  BarChart3, Clock, Search, Timer, ZapOff, Server, Layout, Coffee, Database,
  ChevronUp, ChevronDown, Table as TableIcon, Download, Info, Trash2
} from 'lucide-react';

// --- Constants & Helpers ---
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f43f5e', '#84cc16', '#eab308'];
const SLOW_THRESHOLD = 0.2; // 200ms

const BUCKET_CONFIG = [
  { key: 'b10ms', label: '< 10ms', color: 'bg-emerald-50 text-emerald-700' },
  { key: 'b100ms', label: '10-100ms', color: 'bg-blue-50 text-blue-700' },
  { key: 'b500ms', label: '100-500ms', color: 'bg-indigo-50 text-indigo-700' },
  { key: 'b1000ms', label: '500-1000ms', color: 'bg-amber-50 text-amber-700 font-semibold' },
  { key: 'b5s', label: '1-5s', color: 'bg-orange-100 text-orange-800 font-bold' },
  { key: 'b10s', label: '5-10s', color: 'bg-red-100 text-red-800 font-bold' },
  { key: 'bOver10s', label: '> 10s', color: 'bg-rose-500 text-white font-black' },
];

const REGEX = {
  access: /^(\S+)(?:\s+\S+\s+\S+)?\s+\[(.*?)\]\s+"(\S+)\s+(\S+).*?"\s+(\d+)\s+(\d+|-)(?:\s+(\d+\.?\d*))?/,
  sql: /\[SQL_END\]\s+\[(.*?)\]\s+\[(\d+)ms\]/,
  sqlTime: /\[(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})/
};

const getRespBucket = (timeInSec) => {
  const ms = timeInSec * 1000;
  if (ms < 10) return 'b10ms';
  if (ms < 100) return 'b100ms';
  if (ms < 500) return 'b500ms';
  if (ms < 1000) return 'b1000ms';
  if (ms < 5000) return 'b5s';
  if (ms < 10000) return 'b10s';
  return 'bOver10s';
};

const get5MinKey = (rawTime, type) => {
  try {
    if (type === 'sql_logback') {
      const [date, time] = rawTime.split(' ');
      const [h, m] = time.split(':');
      const bucketM = Math.floor(parseInt(m) / 5) * 5;
      return `${date} ${h}:${bucketM.toString().padStart(2, '0')}`;
    } else {
      const parts = rawTime.split(':');
      const h = parts[1];
      const m = parts[2];
      const bucketM = Math.floor(parseInt(m) / 5) * 5;
      return `${parts[0]} ${h}:${bucketM.toString().padStart(2, '0')}`;
    }
  } catch (e) { return "Unknown"; }
};

const parseLogLine = (line, type) => {
  if (type === 'sql_logback') {
    const sqlMatch = line.match(REGEX.sql);
    if (!sqlMatch) return null;
    const timeMatch = line.match(REGEX.sqlTime);
    const durationMs = parseInt(sqlMatch[2]);
    return {
      ip: "System",
      rawTimestamp: timeMatch ? timeMatch[1] : "Unknown",
      method: "SQL",
      url: sqlMatch[1].split('.').pop(),
      status: 200,
      responseTime: durationMs / 1000
    };
  } else {
    const match = line.match(REGEX.access);
    if (!match) return null;
    const [_, ip, timestamp, method, url, status, size, respTime] = match;
    let finalRespTime = respTime ? parseFloat(respTime) : null;
    if ((type === 'tomcat' || type === 'logback') && finalRespTime !== null && finalRespTime > 100) {
      finalRespTime = finalRespTime / 1000;
    }
    return {
      ip,
      rawTimestamp: timestamp,
      method,
      url: url.split('?')[0],
      status: parseInt(status),
      responseTime: finalRespTime
    };
  }
};

const CustomChartTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white p-4 border border-slate-200 shadow-2xl rounded-xl text-xs min-w-[200px]">
        <p className="font-bold mb-3 text-slate-800 border-b border-slate-100 pb-2 break-all">{label}</p>
        <div className="space-y-2">
          <div className="flex justify-between items-center gap-4">
            <span className="text-slate-500 font-medium italic">Count:</span>
            <span className="font-bold text-slate-900">{data.count?.toLocaleString()}회</span>
          </div>
          <div className="flex justify-between items-center gap-4">
            <span className="text-slate-500 font-medium italic">Avg Response:</span>
            <span className="font-bold text-blue-600">{(data.avgTime * 1000).toFixed(2)}ms</span>
          </div>
          <div className="flex justify-between items-center gap-4">
            <span className="text-slate-500 font-medium italic">Total Time:</span>
            <span className="font-bold text-orange-600 font-mono">{data.total?.toFixed(3)}s</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

const App = () => {
  const [logs, setLogs] = useState([]); 
  const [summaryStats, setSummaryStats] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logType, setLogType] = useState('sql_logback'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'responseTime', direction: 'desc' });

  const resetState = () => {
    setLogs([]);
    setSummaryStats(null);
    setProgress(0);
    setSearchTerm('');
  };

  const downloadCSV = useCallback(() => {
    if (!logs.length) return;
    const headers = ["No", "Timestamp", "Method", "Target (URL/SQL)", "ResponseTime(ms)"];
    const rows = logs.map((l, i) => [
      i + 1,
      l.rawTimestamp,
      l.method,
      l.url,
      (l.responseTime * 1000).toFixed(2)
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `slow_logs_over_200ms_${logType}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [logs, logType]);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsProcessing(true);
    setProgress(0);
    
    const ipMap = {};
    const apiMap = {};
    const tpsMap = {};
    const apiPerfMap = {};
    const distributionMap = {}; 
    
    let errorCount = 0;
    let totalRequests = 0;
    let totalResponseTime = 0;
    let responseTimeCount = 0;
    
    let filteredLogs = [];

    const chunkSize = 1024 * 1024 * 4; // 4MB chunks
    let offset = 0;
    let leftover = ""; 
    const decoder = new TextDecoder();

    while (offset < file.size) {
      const slice = file.slice(offset, offset + chunkSize);
      const buffer = await slice.arrayBuffer();
      const chunk = leftover + decoder.decode(buffer, { stream: true });
      const lines = chunk.split(/\r?\n/);
      leftover = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        const parsed = parseLogLine(line, logType);
        if (!parsed) continue;

        totalRequests++;
        const { ip, rawTimestamp, url, status, responseTime } = parsed;

        if (ip !== "System") ipMap[ip] = (ipMap[ip] || 0) + 1;
        apiMap[url] = (apiMap[url] || 0) + 1;
        
        const tpsKey = logType === 'sql_logback' ? rawTimestamp : rawTimestamp.split(' ')[0];
        tpsMap[tpsKey] = (tpsMap[tpsKey] || 0) + 1;
        
        if (status >= 400) errorCount++;

        if (responseTime !== null) {
          const timeBucketKey = get5MinKey(rawTimestamp, logType);
          const respBucket = getRespBucket(responseTime);

          if (!distributionMap[timeBucketKey]) {
            distributionMap[timeBucketKey] = { b10ms: 0, b100ms: 0, b500ms: 0, b1000ms: 0, b5s: 0, b10s: 0, bOver10s: 0 };
          }
          distributionMap[timeBucketKey][respBucket]++;

          if (!apiPerfMap[url]) apiPerfMap[url] = { total: 0, count: 0 };
          apiPerfMap[url].total += responseTime;
          apiPerfMap[url].count += 1;
          
          totalResponseTime += responseTime;
          responseTimeCount++;

          // 200ms(0.2s) 이상인 것만 상세 목록용으로 수집
          if (responseTime >= SLOW_THRESHOLD) {
            filteredLogs.push({ id: totalRequests, ...parsed });
          }
        }
      }
      offset += chunkSize;
      setProgress(Math.round((offset / file.size) * 100));
    }

    const sortedFilteredLogs = [...filteredLogs].sort((a, b) => b.responseTime - a.responseTime);
    const topIps = Object.entries(ipMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));
    const topApis = Object.entries(apiMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => {
      const perf = apiPerfMap[name] || { total: 0, count: 0 };
      return { name, count, total: perf.total, avgTime: perf.count > 0 ? perf.total / perf.count : 0 };
    });
    const topSlowApis = Object.entries(apiPerfMap).map(([name, data]) => ({ 
      name, avgTime: data.total / data.count, count: data.count, total: data.total 
    })).sort((a, b) => b.avgTime - a.avgTime).slice(0, 20);

    const tpsData = Object.entries(tpsMap).sort((a, b) => a[0].localeCompare(b[0])).map(([time, count]) => ({ 
      time: time.includes(' ') ? time.split(/\s+/).pop() : time, tps: count 
    }));

    const distributionStats = Object.entries(distributionMap).sort((a, b) => a[0].localeCompare(b[0])).map(([time, buckets]) => ({ 
      time, ...buckets 
    }));

    setLogs(sortedFilteredLogs);
    setSummaryStats({
      totalRequests,
      uniqueIps: Object.keys(ipMap).length,
      uniqueApis: Object.keys(apiMap).length,
      errorRate: totalRequests > 0 ? ((errorCount / totalRequests) * 100).toFixed(2) : 0,
      avgResponseTime: responseTimeCount > 0 ? (totalResponseTime / responseTimeCount).toFixed(3) : "N/A",
      topIps, topApis, topSlowApis, tpsData, distributionStats,
      maxTps: tpsData.length > 0 ? Math.max(...tpsData.map(d => d.tps)) : 0
    });
    setIsProcessing(false);
  };

  const handleSort = (key) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };

  const sortedAndFilteredLogs = useMemo(() => {
    let result = [...logs];
    if (searchTerm) result = result.filter(l => l.url.toLowerCase().includes(searchTerm.toLowerCase()));
    result.sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [logs, searchTerm, sortConfig]);

  const getIntensityColor = (val, max) => {
    if (!val || val === 0) return 'text-slate-200';
    const ratio = val / max;
    if (ratio < 0.05) return 'bg-slate-50 text-slate-400';
    if (ratio < 0.2) return 'bg-blue-50 text-blue-600';
    if (ratio < 0.5) return 'bg-blue-100 text-blue-800 font-semibold';
    return 'bg-blue-500 text-white font-bold';
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <header className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-200">
            <Activity className="text-white" size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
              Log Analyzer <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-sm font-bold uppercase tracking-wider">Pro 2.0</span>
            </h1>
            <p className="text-slate-500 text-sm font-medium italic">High-Performance Log Processing & Insights</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            {[
              { id: 'sql_logback', label: 'MyBatis', icon: <Database size={14}/> },
              { id: 'nginx', label: 'Nginx', icon: <Server size={14}/> },
              { id: 'tomcat', label: 'Tomcat', icon: <Layout size={14}/> },
              { id: 'logback', label: 'Logback', icon: <Coffee size={14}/> }
            ].map(type => (
              <button 
                key={type.id}
                onClick={() => { setLogType(type.id); resetState(); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${logType === type.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {type.icon} {type.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 bg-slate-900 hover:bg-black text-white px-5 py-2.5 rounded-xl cursor-pointer transition-all shadow-md font-bold active:scale-95 group">
            <Upload size={18} className="group-hover:translate-y-[-2px] transition-transform" />
            <span>파일 업로드</span>
            <input type="file" className="hidden" onChange={handleFileUpload} accept=".log,.txt" />
          </label>
        </div>
      </header>

      {isProcessing && (
        <div className="flex flex-col justify-center items-center py-20 bg-white rounded-3xl shadow-sm border border-slate-100 max-w-7xl mx-auto">
          <div className="relative w-28 h-28 mb-8">
             <div className="absolute inset-0 rounded-full border-4 border-slate-100"></div>
             <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
             <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-black text-blue-600">{progress}%</span>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Parsing</span>
             </div>
          </div>
          <h2 className="text-xl text-slate-800 font-black mb-2">대용량 스트리밍 분석 중...</h2>
          <p className="text-slate-400 text-sm max-w-md text-center">200ms 이상 지연 건을 선별하고 있습니다. 잠시만 기다려 주세요.</p>
        </div>
      )}

      {summaryStats && !isProcessing && (
        <main className="max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Top Stats */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={<FileText className="text-blue-500" />} label={logType === 'sql_logback' ? "쿼리 실행" : "전체 요청"} value={summaryStats.totalRequests.toLocaleString()} />
            <StatCard icon={<Timer className="text-orange-500" />} label="평균 응답시간" value={summaryStats.avgResponseTime + "s"} />
            <StatCard icon={<Globe className="text-indigo-500" />} label={logType === 'sql_logback' ? "유니크 쿼리" : "유니크 경로"} value={summaryStats.uniqueApis.toLocaleString()} />
            <StatCard icon={<Activity className="text-emerald-500" />} label="최고 부하 (Peak)" value={summaryStats.maxTps + (logType === 'sql_logback' ? " QPS" : " TPS")} />
          </section>

          {/* TPS Chart */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-bold flex items-center gap-2">
                 <Clock className="text-blue-500" />
                 시간대별 트래픽 추이 ({logType === 'sql_logback' ? 'QPS' : 'TPS'})
               </h3>
               <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 border border-slate-100 px-3 py-1 rounded-full uppercase">
                 <Info size={12}/> {summaryStats.tpsData.length} Data Points
               </div>
            </div>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={summaryStats.tpsData}>
                  <defs>
                    <linearGradient id="colorTps" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="time" hide={summaryStats.tpsData.length > 200} tick={{fontSize: 10}} />
                  <YAxis tick={{fontSize: 10}} />
                  <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }} />
                  <Area type="monotone" dataKey="tps" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorTps)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Distribution Heatmap Table */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
             <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                   <TableIcon className="text-blue-600" size={20} />
                   <h3 className="text-lg font-bold">5분 주기 응답 시간 분포 (히트맵)</h3>
                </div>
                <div className="text-[10px] text-slate-400 font-mono italic">Percentage of interval total</div>
             </div>
             <div className="overflow-x-auto">
                <table className="w-full text-center text-[11px] border-collapse min-w-[800px]">
                   <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider">
                         <th className="px-6 py-4 text-left w-48">Interval</th>
                         {BUCKET_CONFIG.map(b => (
                           <th key={b.key} className="px-2 py-4 border-l border-slate-100">{b.label}</th>
                         ))}
                         <th className="px-4 py-4 border-l border-slate-100 bg-slate-100/50">Total</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                      {summaryStats.distributionStats.map((row, idx) => {
                        const rowTotal = BUCKET_CONFIG.reduce((acc, b) => acc + row[b.key], 0);
                        return (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-6 py-3 text-left font-mono font-bold text-slate-600 bg-slate-50/30 group-hover:bg-slate-100 transition-colors">{row.time}</td>
                            {BUCKET_CONFIG.map(b => {
                              const val = row[b.key];
                              const pct = rowTotal > 0 ? Math.round((val / rowTotal) * 100) : 0;
                              return (
                                <td key={b.key} className={`px-2 py-3 border-l border-slate-50 ${getIntensityColor(val, rowTotal)}`}>
                                   <div className="flex flex-col">
                                      <span className="text-sm">{val.toLocaleString()}</span>
                                      <span className="text-[9px] opacity-60 font-medium">({pct}%)</span>
                                   </div>
                                </td>
                              );
                            })}
                            <td className="px-4 py-3 border-l border-slate-50 bg-slate-50 font-black text-slate-800">
                              {rowTotal.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                   </tbody>
                </table>
             </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Slow APIs Bar Chart */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                <ZapOff className="text-red-500" />
                지연 시간 상위 API (Avg Response)
              </h3>
              <div className="h-[450px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summaryStats.topSlowApis} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{fontSize: 10}} />
                    <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 9, fontWeight: 'bold' }} />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Bar dataKey="avgTime" radius={[0, 4, 4, 0]} barSize={16}>
                      {summaryStats.topSlowApis.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index < 3 ? '#ef4444' : '#fca5a5'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Most Frequent APIs */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                <BarChart3 className="text-emerald-500" />
                호출 빈도 상위 10건
              </h3>
              <div className="h-[450px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summaryStats.topApis} layout="vertical" margin={{ left: 20 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 9, fontWeight: 'bold' }} />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} barSize={16}>
                       {summaryStats.topApis.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Details Table */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
             <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 rounded-lg"><ZapOff className="text-red-600" size={18} /></div>
                  <div>
                    <h3 className="font-bold text-slate-800">지연 시간 상세 (Duration 200ms 이상)</h3>
                    <p className="text-[10px] text-slate-500 font-medium">총 {logs.length.toLocaleString()}건이 발견되었습니다.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input 
                      type="text" placeholder="쿼리/API 검색..." 
                      className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
                      value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <button 
                    onClick={downloadCSV}
                    className="p-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-all shadow-sm active:scale-95"
                    title="CSV로 내보내기"
                  >
                    <Download size={18} />
                  </button>
                </div>
             </div>
             <div className="overflow-x-auto max-h-[600px] border-t border-slate-100">
               <table className="w-full text-left text-sm border-separate border-spacing-0">
                  <thead className="bg-slate-50 sticky top-0 shadow-sm z-10">
                    <tr className="text-slate-500 font-bold text-xs uppercase tracking-tighter">
                      <th className="px-6 py-4 border-b border-slate-100">No</th>
                      <th className="px-6 py-4 border-b border-slate-100 cursor-pointer hover:text-blue-600" onClick={() => handleSort('rawTimestamp')}>
                        Timestamp {sortConfig.key === 'rawTimestamp' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-6 py-4 border-b border-slate-100 cursor-pointer hover:text-blue-600" onClick={() => handleSort('url')}>
                        Target (API/SQL) {sortConfig.key === 'url' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-6 py-4 border-b border-slate-100 text-right cursor-pointer hover:text-blue-600" onClick={() => handleSort('responseTime')}>
                        Duration {sortConfig.key === 'responseTime' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {sortedAndFilteredLogs.map((log, index) => (
                      <tr key={`${log.id}-${index}`} className="hover:bg-blue-50/30 transition-colors group">
                        <td className="px-6 py-3 text-slate-400 font-black text-xs">
                          {index + 1}
                        </td>
                        <td className="px-6 py-3 text-slate-500 text-[11px] font-mono whitespace-nowrap">{log.rawTimestamp}</td>
                        <td className="px-6 py-3">
                          <div className="font-bold text-slate-700 truncate max-w-[500px] group-hover:text-blue-700 transition-colors" title={log.url}>
                            {log.url}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">{log.method} • {log.ip}</div>
                        </td>
                        <td className="px-6 py-3 text-right">
                           <span className={`inline-block font-mono font-bold px-3 py-1 rounded-full text-xs shadow-sm ${log.responseTime > 5 ? 'bg-rose-500 text-white' : log.responseTime > 1 ? 'bg-orange-100 text-orange-700' : 'bg-blue-50 text-blue-700'}`}>
                            {(log.responseTime * 1000).toLocaleString(undefined, {minimumFractionDigits: 1})}ms
                           </span>
                        </td>
                      </tr>
                    ))}
                    {sortedAndFilteredLogs.length === 0 && (
                      <tr>
                        <td colSpan="4" className="px-6 py-20 text-center">
                          <div className="flex flex-col items-center gap-3 text-slate-300">
                             <Search size={48} />
                             <p className="text-slate-400 italic text-sm font-medium">200ms 이상 지연된 건이 없거나 로그가 로드되지 않았습니다.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
               </table>
             </div>
          </div>
        </main>
      )}

      {/* Landing / Empty State */}
      {!summaryStats && !isProcessing && (
        <div className="max-w-4xl mx-auto mt-16 text-center animate-in zoom-in-95 duration-700">
          <div className="bg-white p-16 border-2 border-dashed border-slate-200 rounded-[3rem] shadow-2xl shadow-slate-200/50 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
               <Database size={240} />
            </div>
            
            <div className="bg-blue-600 w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-10 shadow-xl shadow-blue-200 rotate-3 group-hover:rotate-0 transition-transform">
              <Activity className="text-white" size={48} />
            </div>
            
            <h2 className="text-4xl font-black mb-6 text-slate-900 tracking-tight">Performance Analytics Dashboard</h2>
            <p className="text-slate-500 mb-12 leading-relaxed text-lg max-w-2xl mx-auto font-medium">
              로그 파일을 업로드하여 초당 트래픽(TPS/QPS), 응답 시간 분포 히트맵, <br/>
              그리고 <span className="text-red-500 font-black">200ms 이상 지연된 모든 내역</span>을 즉시 분석하세요.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <label className="inline-flex items-center gap-3 bg-slate-900 hover:bg-black text-white px-10 py-5 rounded-2xl cursor-pointer shadow-2xl font-black text-xl transition-all hover:scale-105 active:scale-95">
                <Upload size={24} />
                분석 시작하기
                <input type="file" className="hidden" onChange={handleFileUpload} accept=".log,.txt" />
              </label>
              <button 
                onClick={() => { setLogType('sql_logback'); resetState(); }} 
                className="inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-500 px-8 py-5 rounded-2xl font-bold hover:bg-slate-50 transition-all active:scale-95"
              >
                <Trash2 size={20} />
                초기화
              </button>
            </div>
          </div>
        </div>
      )}
      
      <footer className="max-w-7xl mx-auto mt-12 pb-12 text-center">
         <p className="text-slate-400 text-[11px] font-bold uppercase tracking-[0.2em]">Stream Processing • Local Privacy • Real-time Insights</p>
      </footer>
    </div>
  );
};

const StatCard = ({ icon, label, value }) => (
  <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex items-center gap-5 hover:border-blue-300 transition-all hover:shadow-md group">
    <div className="p-4 bg-slate-50 rounded-2xl group-hover:scale-110 transition-transform">{icon}</div>
    <div>
      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">{label}</p>
      <p className="text-2xl font-black text-slate-800 tracking-tighter">{value}</p>
    </div>
  </div>
);

export default App;