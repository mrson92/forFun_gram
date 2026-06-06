import React, { useState, useMemo, useCallback } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, AreaChart, Area
} from 'recharts';
import { 
  Upload, FileText, Activity, Users, Globe, AlertTriangle, 
  BarChart3, Clock, Search, Timer, ZapOff, Server, Layout, Coffee, Database,
  ChevronUp, ChevronDown, Table as TableIcon, Download, Info, Trash2, Smartphone, Filter
} from 'lucide-react';

// --- Constants & Helpers ---
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f43f5e', '#84cc16', '#eab308'];
const SLOW_THRESHOLD = 0.2; // 200ms

const BUCKET_CONFIG = [
  { key: 'b10ms', label: '< 10ms', color: 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/40' },
  { key: 'b100ms', label: '10-100ms', color: 'bg-blue-950/80 text-blue-400 border border-blue-800/40' },
  { key: 'b500ms', label: '100-500ms', color: 'bg-indigo-950/80 text-indigo-400 border border-indigo-800/40' },
  { key: 'b1000ms', label: '500-1000ms', color: 'bg-amber-950/80 text-amber-400 border border-amber-800/40 font-semibold' },
  { key: 'b5s', label: '1-5s', color: 'bg-orange-950/80 text-orange-400 border border-orange-850/40 font-bold' },
  { key: 'b10s', label: '5-10s', color: 'bg-red-950/80 text-red-400 border border-red-800/40 font-bold' },
  { key: 'bOver10s', label: '> 10s', color: 'bg-rose-600 text-white font-black border border-rose-500' },
];

const LOGCAT_LEVEL_CONFIG = [
  { key: 'V', label: 'Verbose', color: 'bg-slate-800/60 text-slate-400 border border-slate-700/50' },
  { key: 'D', label: 'Debug', color: 'bg-blue-950/60 text-blue-400 border border-blue-900/50' },
  { key: 'I', label: 'Info', color: 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/50' },
  { key: 'W', label: 'Warn', color: 'bg-amber-950/60 text-amber-400 border border-amber-900/50 font-semibold' },
  { key: 'E', label: 'Error', color: 'bg-rose-950/80 text-rose-400 border border-rose-900/60 font-bold' },
  { key: 'F', label: 'Fatal', color: 'bg-red-600 text-white font-black border border-red-500' },
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
    } else if (type === 'android_logcat') {
      // "05-28 23:15:30.123"
      const parts = rawTime.trim().split(/\s+/);
      const date = parts[0];
      const time = parts[1];
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

const parseLogcatLine = (line) => {
  // 1. Threadtime 포맷: "05-28 23:15:30.123  1234  5678 D TagName: Message"
  const threadtimeMatch = line.match(/^(\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+([^:]+?):\s+(.*)$/);
  if (threadtimeMatch) {
    return {
      ip: `PID: ${threadtimeMatch[2]} / TID: ${threadtimeMatch[3]}`,
      rawTimestamp: threadtimeMatch[1],
      method: threadtimeMatch[4],
      url: threadtimeMatch[5].trim(),
      status: threadtimeMatch[4] === 'E' || threadtimeMatch[4] === 'F' ? 500 : 200,
      responseTime: null,
      level: threadtimeMatch[4],
      tag: threadtimeMatch[5].trim(),
      message: threadtimeMatch[6]
    };
  }

  // 2. Brief/Standard 포맷: "D/TagName( 1234): Message"
  const briefMatch = line.match(/^([VDIWEF])\/([^(\s]+)(?:\(\s*(\d+)\))?:\s+(.*)$/);
  if (briefMatch) {
    const today = new Date();
    const dateStr = `${(today.getMonth()+1).toString().padStart(2,'0')}-${today.getDate().toString().padStart(2,'0')} ${today.getHours().toString().padStart(2,'0')}:${today.getMinutes().toString().padStart(2,'0')}:${today.getSeconds().toString().padStart(2,'0')}.000`;
    return {
      ip: `PID: ${briefMatch[3] || 'Unknown'}`,
      rawTimestamp: dateStr,
      method: briefMatch[1],
      url: briefMatch[2].trim(),
      status: briefMatch[1] === 'E' || briefMatch[1] === 'F' ? 500 : 200,
      responseTime: null,
      level: briefMatch[1],
      tag: briefMatch[2].trim(),
      message: briefMatch[4]
    };
  }

  // 3. Time 포맷: "05-28 23:15:30.123 D/TagName( 1234): Message"
  const timeMatch = line.match(/^(\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3})\s+([VDIWEF])\/([^(\s]+)(?:\(\s*(\d+)\))?:\s+(.*)$/);
  if (timeMatch) {
    return {
      ip: `PID: ${timeMatch[4] || 'Unknown'}`,
      rawTimestamp: timeMatch[1],
      method: timeMatch[2],
      url: timeMatch[3].trim(),
      status: timeMatch[2] === 'E' || timeMatch[2] === 'F' ? 500 : 200,
      responseTime: null,
      level: timeMatch[2],
      tag: timeMatch[3].trim(),
      message: timeMatch[5]
    };
  }

  return null;
};

const parseLogLine = (line, type) => {
  if (type === 'android_logcat') {
    return parseLogcatLine(line);
  } else if (type === 'sql_logback') {
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
    const isLogcat = data.level !== undefined || data.count !== undefined && !data.avgTime;

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

const App = () => {
  const [logs, setLogs] = useState([]); 
  const [summaryStats, setSummaryStats] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logType, setLogType] = useState('android_logcat'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLevelFilter, setSelectedLevelFilter] = useState('ALL');
  const [sortConfig, setSortConfig] = useState({ key: 'rawTimestamp', direction: 'desc' });

  const resetState = () => {
    setLogs([]);
    setSummaryStats(null);
    setProgress(0);
    setSearchTerm('');
    setSelectedLevelFilter('ALL');
  };

  const downloadCSV = useCallback(() => {
    if (!logs.length) return;
    
    let headers, rows;
    if (logType === 'android_logcat') {
      headers = ["No", "Timestamp", "Level", "Tag", "Message", "PID/TID"];
      rows = logs.map((l, i) => [
        i + 1,
        l.rawTimestamp,
        l.level,
        l.tag,
        `"${l.message.replace(/"/g, '""')}"`,
        l.ip
      ]);
    } else {
      headers = ["No", "Timestamp", "Method", "Target (URL/SQL)", "ResponseTime(ms)"];
      rows = logs.map((l, i) => [
        i + 1,
        l.rawTimestamp,
        l.method,
        l.url,
        (l.responseTime * 1000).toFixed(2)
      ]);
    }
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${logType}_logs_${new Date().toISOString().split('T')[0]}.csv`);
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
    
    // Logcat 용 변수들
    const logcatLevelMap = { V: 0, D: 0, I: 0, W: 0, E: 0, F: 0 };
    const logcatTagMap = {};
    
    let errorCount = 0;
    let warnCount = 0;
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

        if (logType === 'android_logcat') {
          const { rawTimestamp, level, tag, ip } = parsed;
          
          logcatTagMap[tag] = (logcatTagMap[tag] || 0) + 1;
          if (logcatLevelMap[level] !== undefined) {
            logcatLevelMap[level]++;
          }
          
          if (level === 'E' || level === 'F') errorCount++;
          if (level === 'W') warnCount++;

          // 시간별 추이 (초 단위 발생 건수)
          const timeKey = rawTimestamp.split('.')[0] || rawTimestamp;
          tpsMap[timeKey] = (tpsMap[timeKey] || 0) + 1;

          // 5분 주기 로그 레벨 분포
          const timeBucketKey = get5MinKey(rawTimestamp, logType);
          if (!distributionMap[timeBucketKey]) {
            distributionMap[timeBucketKey] = { V: 0, D: 0, I: 0, W: 0, E: 0, F: 0 };
          }
          if (distributionMap[timeBucketKey][level] !== undefined) {
            distributionMap[timeBucketKey][level]++;
          }

          // 메모리 제한을 위해 최대 10,000건 저장
          if (filteredLogs.length < 10000) {
            filteredLogs.push({ id: totalRequests, ...parsed });
          }
        } else {
          // 기존 서버 로그 가공 로직
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

            // 200ms 이상만 목록 수집
            if (responseTime >= SLOW_THRESHOLD) {
              filteredLogs.push({ id: totalRequests, ...parsed });
            }
          }
        }
      }
      offset += chunkSize;
      setProgress(Math.round((offset / file.size) * 100));
    }

    if (logType === 'android_logcat') {
      const topTags = Object.entries(logcatTagMap).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, count]) => ({ name, count }));
      const levelStats = Object.entries(logcatLevelMap).map(([name, count]) => ({ name, count }));
      
      const tpsData = Object.entries(tpsMap).sort((a, b) => a[0].localeCompare(b[0])).map(([time, count]) => ({ 
        time: time.includes(' ') ? time.split(/\s+/).pop() : time, tps: count 
      })).slice(-100); // 차트 가독성을 위해 최근 100개 포인트로 제한

      const distributionStats = Object.entries(distributionMap).sort((a, b) => a[0].localeCompare(b[0])).map(([time, buckets]) => ({ 
        time, ...buckets 
      }));

      setLogs(filteredLogs);
      setSummaryStats({
        totalRequests,
        errorCount,
        warnCount,
        uniqueTags: Object.keys(logcatTagMap).length,
        topTags,
        levelStats,
        tpsData,
        distributionStats,
        maxTps: tpsData.length > 0 ? Math.max(...tpsData.map(d => d.tps)) : 0
      });
    } else {
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
    }
    
    setIsProcessing(false);
  };

  const handleSort = (key) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };

  const sortedAndFilteredLogs = useMemo(() => {
    let result = [...logs];
    
    // 텍스트 검색 (URL 또는 Android Tag/Message)
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(l => 
        (l.url && l.url.toLowerCase().includes(term)) || 
        (l.message && l.message.toLowerCase().includes(term))
      );
    }
    
    // Android Logcat 레벨 필터링
    if (logType === 'android_logcat' && selectedLevelFilter !== 'ALL') {
      result = result.filter(l => l.level === selectedLevelFilter);
    }

    result.sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    
    return result;
  }, [logs, searchTerm, selectedLevelFilter, sortConfig, logType]);

  const getIntensityColor = (val, max) => {
    if (!val || val === 0) return 'text-slate-600 bg-transparent';
    const ratio = val / max;
    if (ratio < 0.05) return 'bg-slate-900/60 text-slate-400 border border-slate-800/40';
    if (ratio < 0.2) return 'bg-blue-950/40 text-blue-400 border border-blue-900/30';
    if (ratio < 0.5) return 'bg-blue-900/40 text-blue-300 border border-blue-800/40 font-semibold';
    return 'bg-blue-600/90 text-white font-bold border border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.3)]';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 md:p-8">
      {/* Header */}
      <header className="max-w-7xl mx-auto mb-8 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl shadow-xl shadow-blue-900/30 animate-pulse">
            <Activity className="text-white animate-bounce-slow" size={28} />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-100 tracking-tight flex items-center gap-2">
              Log Analyzer <span className="text-xs font-extrabold bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2.5 py-1 rounded-full uppercase tracking-wider">Pro 3.0</span>
            </h1>
            <p className="text-slate-400 text-sm font-medium">Android Logcat & Server Performance Analyzer</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-slate-900/80 p-2.5 rounded-2xl border border-slate-800/80 backdrop-blur-xl">
          <div className="flex flex-wrap bg-slate-950/60 p-1 rounded-xl border border-slate-800/40">
            {[
              { id: 'android_logcat', label: 'Android Logcat', icon: <Smartphone size={14}/> },
              { id: 'sql_logback', label: 'MyBatis (SQL)', icon: <Database size={14}/> },
              { id: 'nginx', label: 'Nginx', icon: <Server size={14}/> },
              { id: 'tomcat', label: 'Tomcat', icon: <Layout size={14}/> },
              { id: 'logback', label: 'Logback', icon: <Coffee size={14}/> }
            ].map(type => (
              <button 
                key={type.id}
                onClick={() => { setLogType(type.id); resetState(); }}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-bold transition-all ${logType === type.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {type.icon} {type.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl cursor-pointer transition-all shadow-md font-bold active:scale-95 group">
            <Upload size={18} className="group-hover:-translate-y-0.5 transition-transform" />
            <span>로그 파일 분석</span>
            <input type="file" className="hidden" onChange={handleFileUpload} accept=".log,.txt" />
          </label>
        </div>
      </header>

      {/* Loading Overlay */}
      {isProcessing && (
        <div className="flex flex-col justify-center items-center py-24 bg-slate-900/50 backdrop-blur-xl rounded-3xl border border-slate-800/80 max-w-7xl mx-auto shadow-2xl">
          <div className="relative w-32 h-32 mb-8">
             <div className="absolute inset-0 rounded-full border-4 border-slate-800"></div>
             <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
             <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-blue-400">{progress}%</span>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Parsing</span>
             </div>
          </div>
          <h2 className="text-xl text-slate-200 font-black mb-2">대용량 로그 파일 분석 중...</h2>
          <p className="text-slate-400 text-sm max-w-md text-center">스트리밍 파서가 실시간으로 로그 파일을 파싱하여 분석 정보를 수집하고 있습니다.</p>
        </div>
      )}

      {/* Analytics Dashboard */}
      {summaryStats && !isProcessing && (
        <main className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
          {/* Summary Stats Cards */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {logType === 'android_logcat' ? (
              <>
                <StatCard icon={<FileText className="text-blue-400" />} label="전체 로그 라인" value={summaryStats.totalRequests.toLocaleString()} />
                <StatCard icon={<AlertTriangle className="text-rose-400" />} label="에러 로그 (E/F)" value={summaryStats.errorCount.toLocaleString()} badgeColor="bg-rose-950 text-rose-400 border-rose-800/50" />
                <StatCard icon={<AlertTriangle className="text-amber-400" />} label="경고 로그 (W)" value={summaryStats.warnCount.toLocaleString()} badgeColor="bg-amber-950 text-amber-400 border-amber-800/50" />
                <StatCard icon={<Globe className="text-emerald-400" />} label="유니크 태그" value={summaryStats.uniqueTags.toLocaleString()} />
              </>
            ) : (
              <>
                <StatCard icon={<FileText className="text-blue-400" />} label={logType === 'sql_logback' ? "쿼리 실행 건수" : "전체 요청"} value={summaryStats.totalRequests.toLocaleString()} />
                <StatCard icon={<Timer className="text-orange-400" />} label="평균 응답시간" value={summaryStats.avgResponseTime + "s"} />
                <StatCard icon={<Globe className="text-indigo-400" />} label={logType === 'sql_logback' ? "유니크 쿼리" : "유니크 경로"} value={summaryStats.uniqueApis.toLocaleString()} />
                <StatCard icon={<Activity className="text-emerald-400" />} label="최고 부하 (Peak)" value={summaryStats.maxTps + (logType === 'sql_logback' ? " QPS" : " TPS")} />
              </>
            )}
          </section>

          {/* Time Series Chart */}
          <div className="bg-slate-900/60 backdrop-blur-xl p-6 rounded-3xl border border-slate-800/80 shadow-lg">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-bold flex items-center gap-2 text-slate-200">
                 <Clock className="text-blue-400 animate-pulse" />
                 시간대별 발생 추이 ({logType === 'android_logcat' ? 'Lines/sec' : logType === 'sql_logback' ? 'QPS' : 'TPS'})
               </h3>
               <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 border border-slate-800 px-3 py-1 rounded-full uppercase">
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
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                  <XAxis dataKey="time" hide={summaryStats.tpsData.length > 200} tick={{fontSize: 10, fill: '#94a3b8'}} />
                  <YAxis tick={{fontSize: 10, fill: '#94a3b8'}} />
                  <Tooltip content={<CustomChartTooltip />} />
                  <Area type="monotone" dataKey="tps" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorTps)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Heatmap Section */}
          <div className="bg-slate-900/60 backdrop-blur-xl p-6 rounded-3xl border border-slate-800/80 shadow-lg overflow-hidden">
             <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                   <TableIcon className="text-blue-400" size={20} />
                   <h3 className="text-lg font-bold text-slate-200">
                     {logType === 'android_logcat' ? "5분 주기 로그 레벨 분포 (히트맵)" : "5분 주기 응답 시간 분포 (히트맵)"}
                   </h3>
                </div>
                <div className="text-[10px] text-slate-500 font-mono italic">Percentage of interval total</div>
             </div>
             <div className="overflow-x-auto relative">
                <table className="w-full text-center text-[11px] border-collapse min-w-[800px]">
                   <thead>
                      <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                         <th className="px-6 py-4 text-left w-48 sticky left-0 bg-slate-900/90 z-20">Interval</th>
                         {logType === 'android_logcat' ? (
                           LOGCAT_LEVEL_CONFIG.map(b => (
                             <th key={b.key} className="px-2 py-4 border-l border-slate-800">{b.label}</th>
                           ))
                         ) : (
                           BUCKET_CONFIG.map(b => (
                             <th key={b.key} className="px-2 py-4 border-l border-slate-800">{b.label}</th>
                           ))
                         )}
                         <th className="px-4 py-4 border-l border-slate-800 bg-slate-950/80 sticky right-0 z-20">Total</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-800">
                      {summaryStats.distributionStats.map((row, idx) => {
                        const activeConfig = logType === 'android_logcat' ? LOGCAT_LEVEL_CONFIG : BUCKET_CONFIG;
                        const rowTotal = activeConfig.reduce((acc, b) => acc + (row[b.key] || 0), 0);
                        
                        return (
                          <tr key={idx} className="hover:bg-slate-800/40 transition-colors group">
                            <td className="px-6 py-3 text-left font-mono font-bold text-slate-400 bg-slate-900/60 sticky left-0 group-hover:bg-slate-800/80 transition-colors z-10 border-r border-slate-800">{row.time}</td>
                            {activeConfig.map(b => {
                              const val = row[b.key] || 0;
                              const pct = rowTotal > 0 ? Math.round((val / rowTotal) * 100) : 0;
                              return (
                                <td key={b.key} className={`px-2 py-3 border-l border-slate-800 ${getIntensityColor(val, rowTotal)}`}>
                                   <div className="flex flex-col">
                                      <span className="text-sm font-semibold">{val.toLocaleString()}</span>
                                      <span className="text-[9px] opacity-60 font-medium">({pct}%)</span>
                                   </div>
                                </td>
                              );
                            })}
                            <td className="px-4 py-3 border-l border-slate-800 bg-slate-950/80 font-black text-slate-300 sticky right-0 z-10">
                              {rowTotal.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                   </tbody>
                </table>
             </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {logType === 'android_logcat' ? (
              <>
                {/* Logcat Top Tags */}
                <div className="bg-slate-900/60 backdrop-blur-xl p-6 rounded-3xl border border-slate-800/80 shadow-lg">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-200">
                    <ZapOff className="text-blue-400" />
                    가장 빈번한 로그 태그 (Top 15 Tags)
                  </h3>
                  <div className="h-[450px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summaryStats.topTags} layout="vertical" margin={{ left: 10, right: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#1e293b" />
                        <XAxis type="number" tick={{fontSize: 10, fill: '#94a3b8'}} />
                        <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 9, fontWeight: 'bold', fill: '#94a3b8' }} />
                        <Tooltip content={<CustomChartTooltip />} />
                        <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={16}>
                          {summaryStats.topTags.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Logcat Log Level Stats */}
                <div className="bg-slate-900/60 backdrop-blur-xl p-6 rounded-3xl border border-slate-800/80 shadow-lg">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-200">
                    <BarChart3 className="text-emerald-400" />
                    로그 레벨 분포
                  </h3>
                  <div className="h-[450px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summaryStats.levelStats}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                        <XAxis dataKey="name" tick={{fontSize: 10, fill: '#94a3b8'}} />
                        <YAxis tick={{fontSize: 10, fill: '#94a3b8'}} />
                        <Tooltip content={<CustomChartTooltip />} />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={40}>
                           {summaryStats.levelStats.map((entry, index) => {
                             let fill = '#64748b'; // V
                             if (entry.name === 'D') fill = '#3b82f6';
                             if (entry.name === 'I') fill = '#10b981';
                             if (entry.name === 'W') fill = '#f59e0b';
                             if (entry.name === 'E') fill = '#ef4444';
                             if (entry.name === 'F') fill = '#e11d48';
                             return <Cell key={`cell-${index}`} fill={fill} />;
                           })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Slow APIs Bar Chart */}
                <div className="bg-slate-900/60 backdrop-blur-xl p-6 rounded-3xl border border-slate-800/80 shadow-lg">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-200">
                    <ZapOff className="text-rose-400" />
                    지연 시간 상위 API (Avg Response)
                  </h3>
                  <div className="h-[450px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summaryStats.topSlowApis} layout="vertical" margin={{ left: 10, right: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#1e293b" />
                        <XAxis type="number" tick={{fontSize: 10, fill: '#94a3b8'}} />
                        <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 9, fontWeight: 'bold', fill: '#94a3b8' }} />
                        <Tooltip content={<CustomChartTooltip />} />
                        <Bar dataKey="avgTime" radius={[0, 4, 4, 0]} barSize={16}>
                          {summaryStats.topSlowApis.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index < 3 ? '#f43f5e' : '#fda4af'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Most Frequent APIs */}
                <div className="bg-slate-900/60 backdrop-blur-xl p-6 rounded-3xl border border-slate-800/80 shadow-lg">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-200">
                    <BarChart3 className="text-emerald-400" />
                    호출 빈도 상위 10건
                  </h3>
                  <div className="h-[450px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summaryStats.topApis} layout="vertical" margin={{ left: 10, right: 10 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 9, fontWeight: 'bold', fill: '#94a3b8' }} />
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
              </>
            )}
          </div>

          {/* Details Log Table */}
          <div className="bg-slate-900/60 backdrop-blur-xl rounded-3xl border border-slate-800/80 shadow-lg overflow-hidden">
             <div className="p-6 border-b border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/40">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-slate-800 border border-slate-700/60 rounded-xl"><FileText className="text-blue-400" size={18} /></div>
                  <div>
                    <h3 className="font-bold text-slate-200">
                      {logType === 'android_logcat' ? "Android Logcat 내역" : "지연 시간 상세 (Duration 200ms 이상)"}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-medium">총 {sortedAndFilteredLogs.length.toLocaleString()}건의 매칭 로그가 조회되었습니다.</p>
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                  {logType === 'android_logcat' && (
                    <div className="relative flex-1 md:flex-none">
                      <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                      <select 
                        className="pl-9 pr-8 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all appearance-none cursor-pointer w-full md:w-36 font-semibold"
                        value={selectedLevelFilter}
                        onChange={(e) => setSelectedLevelFilter(e.target.value)}
                      >
                        <option value="ALL">전체 레벨 (ALL)</option>
                        <option value="V">Verbose (V)</option>
                        <option value="D">Debug (D)</option>
                        <option value="I">Info (I)</option>
                        <option value="W">Warn (W)</option>
                        <option value="E">Error (E)</option>
                        <option value="F">Fatal (F)</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={12} />
                    </div>
                  )}

                  <div className="relative flex-1 md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                    <input 
                      type="text" 
                      placeholder={logType === 'android_logcat' ? "태그/메시지 실시간 검색..." : "쿼리/API 검색..."} 
                      className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-inner"
                      value={searchTerm} 
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  
                  <button 
                    onClick={downloadCSV}
                    className="p-2.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center"
                    title="CSV로 내보내기"
                  >
                    <Download size={18} />
                  </button>
                </div>
             </div>

             <div className="overflow-x-auto max-h-[600px] border-t border-slate-850">
               <table className="w-full text-left text-xs border-separate border-spacing-0">
                  <thead className="bg-slate-950 sticky top-0 shadow-sm z-10">
                    <tr className="text-slate-400 font-bold uppercase tracking-wider">
                      <th className="px-6 py-4 border-b border-slate-850 w-16">No</th>
                      <th className="px-6 py-4 border-b border-slate-850 cursor-pointer hover:text-blue-400 w-44" onClick={() => handleSort('rawTimestamp')}>
                        Timestamp {sortConfig.key === 'rawTimestamp' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                      {logType === 'android_logcat' ? (
                        <>
                          <th className="px-6 py-4 border-b border-slate-850 cursor-pointer hover:text-blue-400 w-24" onClick={() => handleSort('level')}>
                            Level {sortConfig.key === 'level' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                          </th>
                          <th className="px-6 py-4 border-b border-slate-850 cursor-pointer hover:text-blue-400 w-48" onClick={() => handleSort('tag')}>
                            Tag {sortConfig.key === 'tag' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                          </th>
                          <th className="px-6 py-4 border-b border-slate-850">Message</th>
                        </>
                      ) : (
                        <>
                          <th className="px-6 py-4 border-b border-slate-850 cursor-pointer hover:text-blue-400" onClick={() => handleSort('url')}>
                            Target (API/SQL) {sortConfig.key === 'url' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                          </th>
                          <th className="px-6 py-4 border-b border-slate-850 text-right cursor-pointer hover:text-blue-400 w-36" onClick={() => handleSort('responseTime')}>
                            Duration {sortConfig.key === 'responseTime' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850 bg-slate-900/20 font-mono">
                    {sortedAndFilteredLogs.map((log, index) => {
                      const isLogcat = logType === 'android_logcat';
                      
                      return (
                        <tr key={`${log.id}-${index}`} className="hover:bg-slate-800/30 transition-colors group">
                          <td className="px-6 py-3.5 text-slate-500 font-extrabold text-[10px]">
                            {index + 1}
                          </td>
                          <td className="px-6 py-3.5 text-slate-400 text-[11px] whitespace-nowrap">{log.rawTimestamp}</td>
                          
                          {isLogcat ? (
                            <>
                              <td className="px-6 py-3.5 whitespace-nowrap">
                                <span className={`inline-block text-[9px] font-black px-2.5 py-1 rounded-md border text-center w-16 tracking-wider ${
                                  log.level === 'F' ? 'bg-red-500 text-white border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.2)]' :
                                  log.level === 'E' ? 'bg-rose-950/70 text-rose-400 border-rose-900/60 shadow-[0_0_6px_rgba(244,63,94,0.15)] animate-pulse' :
                                  log.level === 'W' ? 'bg-amber-950/70 text-amber-400 border-amber-900/50' :
                                  log.level === 'I' ? 'bg-emerald-950/60 text-emerald-400 border-emerald-900/50' :
                                  log.level === 'D' ? 'bg-blue-950/60 text-blue-400 border-blue-900/50' :
                                  'bg-slate-850 text-slate-400 border-slate-700/50'
                                }`}>
                                  {log.level === 'F' ? 'FATAL' :
                                   log.level === 'E' ? 'ERROR' :
                                   log.level === 'W' ? 'WARN' :
                                   log.level === 'I' ? 'INFO' :
                                   log.level === 'D' ? 'DEBUG' :
                                   'VERBOSE'}
                                </span>
                              </td>
                              <td className="px-6 py-3.5 font-bold text-slate-300 whitespace-nowrap max-w-[190px] truncate" title={log.tag}>
                                {log.tag}
                              </td>
                              <td className="px-6 py-3.5 text-slate-300 break-all select-all font-mono text-[11px] leading-relaxed pr-8 min-w-[350px]">
                                {log.message}
                                <div className="text-[9px] text-slate-500 font-medium tracking-tight mt-0.5 font-sans">{log.ip}</div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-6 py-3.5 pr-8">
                                <div className="font-bold text-slate-300 truncate max-w-[500px] group-hover:text-blue-400 transition-colors" title={log.url}>
                                  {log.url}
                                </div>
                                <div className="text-[9px] text-slate-500 font-sans mt-0.5">{log.method} • {log.ip}</div>
                              </td>
                              <td className="px-6 py-3.5 text-right whitespace-nowrap">
                                 <span className={`inline-block px-3 py-1.5 rounded-full text-[10px] font-black border ${
                                   log.responseTime > 5 ? 'bg-rose-950 text-rose-400 border-rose-900 shadow-[0_0_12px_rgba(244,63,94,0.3)] animate-pulse' : 
                                   log.responseTime > 1 ? 'bg-orange-950 text-orange-400 border-orange-900' : 
                                   'bg-blue-950 text-blue-400 border-blue-900'
                                 }`}>
                                  {(log.responseTime * 1000).toLocaleString(undefined, {minimumFractionDigits: 1})}ms
                                 </span>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                    {sortedAndFilteredLogs.length === 0 && (
                      <tr>
                        <td colSpan={isLogcat ? 5 : 4} className="px-6 py-24 text-center">
                          <div className="flex flex-col items-center gap-3 text-slate-600">
                             <Search size={48} className="stroke-[1.5]" />
                             <p className="text-slate-500 italic text-xs font-semibold">검색 조건에 맞는 로그 정보가 존재하지 않거나 데이터가 업로드되지 않았습니다.</p>
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

      {/* Landing State */}
      {!summaryStats && !isProcessing && (
        <div className="max-w-4xl mx-auto mt-16 text-center animate-in zoom-in-95 duration-500">
          <div className="bg-slate-900/40 border border-slate-800 rounded-[3rem] p-16 shadow-2xl relative overflow-hidden group backdrop-blur-xl">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
               <Database size={240} className="text-slate-50" />
            </div>
            
            <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-10 shadow-xl shadow-blue-900/20 rotate-3 group-hover:rotate-0 transition-transform duration-300">
              <Smartphone className="text-white" size={48} />
            </div>
            
            <h2 className="text-3xl md:text-4xl font-black mb-6 text-slate-100 tracking-tight">Performance & Log Analytics Dashboard</h2>
            <p className="text-slate-400 mb-12 leading-relaxed text-sm md:text-base max-w-2xl mx-auto font-medium">
              안드로이드 디바이스의 <span className="text-blue-400 font-bold">Logcat 로그</span> 분석은 물론, 서버 사이드(MyBatis SQL, Nginx, Tomcat, Logback) 로그까지 <br/>
              로컬 브라우저 환경에서 보안 유출 걱정 없이 고성능 실시간 스트리밍 방식으로 분석하세요.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <label className="inline-flex items-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-10 py-5 rounded-2xl cursor-pointer shadow-2xl font-black text-lg transition-all hover:scale-105 active:scale-95">
                <Upload size={22} />
                로그 분석 시작하기
                <input type="file" className="hidden" onChange={handleFileUpload} accept=".log,.txt" />
              </label>
              <button 
                onClick={() => { setLogType('android_logcat'); resetState(); }} 
                className="inline-flex items-center gap-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 px-8 py-5 rounded-2xl font-bold transition-all active:scale-95"
              >
                <Trash2 size={20} />
                초기화
              </button>
            </div>
          </div>
        </div>
      )}
      
      <footer className="max-w-7xl mx-auto mt-16 pb-12 text-center border-t border-slate-900 pt-8">
         <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.25em]">Stream Processing • Local Privacy • Real-time Android & Web Insights</p>
      </footer>
    </div>
  );
};

const StatCard = ({ icon, label, value, badgeColor }) => (
  <div className="bg-slate-900/60 backdrop-blur-xl p-6 rounded-3xl border border-slate-800/80 flex items-center gap-5 hover:border-slate-700 transition-all hover:shadow-lg group">
    <div className={`p-4 rounded-2xl bg-slate-950 border border-slate-800 group-hover:scale-105 transition-transform ${badgeColor || ''}`}>{icon}</div>
    <div>
      <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-black text-slate-200 tracking-tight font-mono">{value}</p>
    </div>
  </div>
);

export default App;