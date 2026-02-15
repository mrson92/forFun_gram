import React, { useState, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts';
import { 
  Upload, FileText, Activity, Users, Globe, AlertTriangle, 
  BarChart3, Clock, Search, Timer, ZapOff, Server, Layout, Coffee, Database,
  ChevronUp, ChevronDown, Table as TableIcon
} from 'lucide-react';

// --- Constants & Helpers ---
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f43f5e', '#84cc16', '#eab308'];
const BUCKET_KEYS = ['b10ms', 'b100ms', 'b500ms', 'b1000ms', 'b5s', 'b10s', 'bOver10s'];

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
      ip: "N/A",
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

// Custom Tooltip for Charts to show multiple metrics
const CustomChartTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white p-3 border border-slate-200 shadow-xl rounded-lg text-xs">
        <p className="font-bold mb-2 text-slate-800 border-b border-slate-100 pb-1 truncate max-w-[250px]">{label}</p>
        <div className="space-y-1.5">
          <div className="flex justify-between gap-4">
            <span className="text-slate-500 font-medium">실행 횟수:</span>
            <span className="font-bold text-slate-900">{data.count?.toLocaleString()}회</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500 font-medium">평균 응답:</span>
            <span className="font-bold text-blue-600">{(data.avgTime * 1000).toFixed(2)}ms</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500 font-medium">총 응답시간:</span>
            <span className="font-bold text-orange-600">{data.total?.toFixed(3)}s</span>
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
  const [responseTimeThreshold, setResponseTimeThreshold] = useState(200); // Added state for response time threshold
  
  const [sortConfig, setSortConfig] = useState({ key: 'responseTime', direction: 'desc' });

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsProcessing(true);
    setProgress(0);
    setLogs([]);
    setSummaryStats(null);

    const ipMap = {};
    const apiMap = {};
    const tpsMap = {};
    const apiPerfMap = {};
    const distributionMap = {}; 
    
    let errorCount = 0;
    let totalRequests = 0;
    let totalResponseTime = 0;
    let responseTimeCount = 0;
    
    let slowSamples = [];
    let minTimeInSlowSamples = 0;

    const chunkSize = 1024 * 1024 * 2; 
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

        // Update Maps
        if (ip !== "N/A") ipMap[ip] = (ipMap[ip] || 0) + 1;
        apiMap[url] = (apiMap[url] || 0) + 1;
        
        const tpsKey = logType === 'sql_logback' ? rawTimestamp : rawTimestamp.split(' ')[0];
        tpsMap[tpsKey] = (tpsMap[tpsKey] || 0) + 1;
        
        if (status >= 400) errorCount++;

        if (responseTime !== null) {
          const timeBucketKey = get5MinKey(rawTimestamp, logType === 'sql_logback' ? 'sql_logback' : 'access');
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

          const parsedItem = {
            id: totalRequests,
            ...parsed
          };

          // Slow Samples Logic
          if (slowSamples.length < 1000) {
            slowSamples.push(parsedItem);
            if (slowSamples.length === 1000) {
              minTimeInSlowSamples = Math.min(...slowSamples.map(s => s.responseTime));
            }
          } else if (parsedItem.responseTime > minTimeInSlowSamples) {
            const minIndex = slowSamples.findIndex(s => s.responseTime === minTimeInSlowSamples);
            slowSamples[minIndex] = parsedItem;
            minTimeInSlowSamples = Math.min(...slowSamples.map(s => s.responseTime));
          }
        }
      }

      offset += chunkSize;
      setProgress(Math.round((offset / file.size) * 100));
    }

    const sortedSamples = [...slowSamples].sort((a, b) => b.responseTime - a.responseTime);

    const topIps = Object.entries(ipMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));
    
    // Updated: topApis including performance data for tooltips
    const topApis = Object.entries(apiMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => {
        const perf = apiPerfMap[name] || { total: 0, count: 0 };
        return { 
          name, 
          count,
          total: perf.total,
          avgTime: perf.count > 0 ? perf.total / perf.count : 0
        };
      });

    // Updated: topSlowApis including all necessary data for tooltips
    const topSlowApis = Object.entries(apiPerfMap)
      .map(([name, data]) => ({ 
        name, 
        avgTime: data.total / data.count, 
        count: data.count,
        total: data.total
      }))
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, 20);

    const tpsData = Object.entries(tpsMap).sort((a, b) => a[0].localeCompare(b[0])).map(([time, count]) => ({ time: time.includes(' ') ? time.split(' ')[1] : time, tps: count }));

    const distributionStats = Object.entries(distributionMap)
      .sort((a, b) => a[0].localeCompare(b[0]) || 0)
      .map(([time, buckets]) => ({ time, ...buckets }));

    setLogs(sortedSamples);
    setSummaryStats({
      totalRequests,
      uniqueIps: Object.keys(ipMap).length,
      uniqueApis: Object.keys(apiMap).length,
      errorRate: totalRequests > 0 ? ((errorCount / totalRequests) * 100).toFixed(2) : 0,
      avgResponseTime: responseTimeCount > 0 ? (totalResponseTime / responseTimeCount).toFixed(3) : "N/A",
      topIps,
      topApis,
      topSlowApis,
      tpsData,
      distributionStats,
      maxTps: tpsData.length > 0 ? Math.max(...tpsData.map(d => d.tps)) : 0
    });
    setIsProcessing(false);
    setSortConfig({ key: 'responseTime', direction: 'desc' });
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedAndFilteredLogs = useMemo(() => {
    let result = [...logs];
    if (searchTerm) result = result.filter(l => l.url.toLowerCase().includes(searchTerm.toLowerCase()));
    result = result.filter(log => (log.responseTime * 1000) > responseTimeThreshold); // Apply the threshold filter

    result.sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [logs, searchTerm, sortConfig, responseTimeThreshold]);

  const SortIndicator = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) return <div className="w-4 h-4 opacity-20"><ChevronUp size={14} /></div>;
    return sortConfig.direction === 'asc' ? <ChevronUp size={14} className="text-blue-600" /> : <ChevronDown size={14} className="text-blue-600" />;
  };

  const getCellColor = (val, max) => {
    if (!val) return 'text-slate-300';
    const intensity = Math.min(Math.round((val / max) * 100), 100);
    if (intensity < 5) return 'bg-blue-50 text-blue-800';
    if (intensity < 20) return 'bg-blue-100 text-blue-900';
    if (intensity < 50) return 'bg-blue-200 text-blue-950 font-bold';
    return 'bg-blue-400 text-white font-bold';
  };

  const renderCellWithPercentage = (val, total) => {
    const percentage = total > 0 ? Math.round((val / total) * 100) : 0;
    return (
      <div className="flex flex-col py-1">
        <span>{val.toLocaleString()}</span>
        <span className="text-[9px] opacity-70">({percentage}%)</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <header className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2 text-slate-800">
            <Activity className="text-blue-600" />
            Log Analyzer <span className="text-slate-400 font-normal text-lg tracking-tighter">v1.9</span>
          </h1>
          <p className="text-slate-500 font-medium">통합 성능 분석 및 SQL 모니터링 도구</p>
        </div>

        <div className="flex flex-wrap items-center gap-4 bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            {[
              { id: 'sql_logback', label: 'MyBatis SQL', icon: <Database size={14}/> },
              { id: 'nginx', label: 'Nginx', icon: <Server size={14}/> },
              { id: 'tomcat', label: 'Tomcat', icon: <Layout size={14}/> },
              { id: 'logback', label: 'Logback', icon: <Coffee size={14}/> }
            ].map(type => (
              <button 
                key={type.id}
                onClick={() => setLogType(type.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${logType === type.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {type.icon} {type.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl cursor-pointer transition-all shadow-md font-bold active:scale-95">
            <Upload size={18} />
            <span>파일 업로드</span>
            <input type="file" className="hidden" onChange={handleFileUpload} accept=".log,.txt" />
          </label>
        </div>
          <div className="flex items-center gap-2 bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
              <label htmlFor="responseTimeThreshold" className="text-sm font-medium text-slate-700">
                  지연 시간 임계값 (ms):
              </label>
              <input
                  type="number" id="responseTimeThreshold" className="w-20 px-3 py-2 border rounded-md shadow-sm focus:ring focus:ring-blue-200 focus:outline-none text-sm"
                  value={responseTimeThreshold}
                  onChange={(e) => setResponseTimeThreshold(Number(e.target.value))}
              />
          </div>
      </header>

      {isProcessing && (
        <div className="flex flex-col justify-center items-center py-24 bg-white rounded-3xl shadow-sm border border-slate-100 max-w-7xl mx-auto">
          <div className="relative w-24 h-24 mb-6">
             <div className="absolute inset-0 rounded-full border-4 border-slate-100"></div>
             <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
             <div className="absolute inset-0 flex items-center justify-center font-bold text-blue-600">
                {progress}%
             </div>
          </div>
          <span className="text-xl text-slate-700 font-black mb-2">{logType === 'sql_logback' ? 'MyBatis SQL' : '로그'} 데이터 스트리밍 분석 중...</span>
          <p className="text-slate-400 text-sm">대용량 파일 처리를 위해 메모리를 최적화하고 있습니다.</p>
        </div>
      )}

      {summaryStats && !isProcessing && (
        <main className="max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={<FileText className="text-blue-500" />} label={logType === 'sql_logback' ? "전체 쿼리 실행" : "전체 요청"} value={summaryStats.totalRequests.toLocaleString()} />
            <StatCard icon={<Timer className="text-orange-500" />} label="평균 응답시간" value={summaryStats.avgResponseTime + (summaryStats.avgResponseTime !== "N/A" ? "s" : "")} />
            <StatCard icon={<Globe className="text-purple-500" />} label={logType === 'sql_logback' ? "유니크 쿼리" : "유니크 API"} value={summaryStats.uniqueApis.toLocaleString()} />
            <StatCard 
              icon={<AlertTriangle className={summaryStats.errorRate > 5 ? 'text-red-500' : 'text-amber-500'} />} 
              label={logType === 'sql_logback' ? "처리 상태" : "에러율"} 
              value={logType === 'sql_logback' ? "Healthy" : `${summaryStats.errorRate}%`} 
            />
          </section>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
             <div className="flex items-center gap-2 mb-6">
                <TableIcon className="text-blue-600" size={20} />
                <h3 className="text-lg font-bold">5분 단위 응답시간 분포 (집계)</h3>
             </div>
             <div className="overflow-x-auto">
                <table className="w-full text-center text-[11px] border-collapse">
                   <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase">
                         <th className="px-4 py-3 text-left w-40">시간대 (5분 단위)</th>
                         <th className="px-2 py-3 border-l border-slate-100">&lt; 10ms</th>
                         <th className="px-2 py-3 border-l border-slate-100">10~100ms</th>
                         <th className="px-2 py-3 border-l border-slate-100">100~500ms</th>
                         <th className="px-2 py-3 border-l border-slate-100">500~1000ms</th>
                         <th className="px-2 py-3 border-l border-slate-100">1~5s</th>
                         <th className="px-2 py-3 border-l border-slate-100">5~10s</th>
                         <th className="px-2 py-3 border-l border-slate-100">&gt; 10s</th>
                         <th className="px-2 py-3 border-l border-slate-100 bg-slate-100/50">합계</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                      {summaryStats.distributionStats.map((row, idx) => {
                        const total = row.b10ms + row.b100ms + row.b500ms + row.b1000ms + row.b5s + row.b10s + row.bOver10s;
                        return (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-2 text-left font-mono font-bold text-slate-600 whitespace-nowrap">{row.time}</td>
                            <td className={`px-2 border-l border-slate-50 ${getCellColor(row.b10ms, total)}`}>
                              {renderCellWithPercentage(row.b10ms, total)}
                            </td>
                            <td className={`px-2 border-l border-slate-50 ${getCellColor(row.b100ms, total)}`}>
                              {renderCellWithPercentage(row.b100ms, total)}
                            </td>
                            <td className={`px-2 border-l border-slate-50 ${getCellColor(row.b500ms, total)}`}>
                              {renderCellWithPercentage(row.b500ms, total)}
                            </td>
                            <td className={`px-2 border-l border-slate-50 ${getCellColor(row.b1000ms, total)}`}>
                              {renderCellWithPercentage(row.b1000ms, total)}
                            </td>
                            <td className={`px-2 border-l border-slate-50 ${getCellColor(row.b5s, total)}`}>
                              {renderCellWithPercentage(row.b5s, total)}
                            </td>
                            <td className={`px-2 border-l border-slate-50 ${getCellColor(row.b10s, total)}`}>
                              {renderCellWithPercentage(row.b10s, total)}
                            </td>
                            <td className={`px-2 border-l border-slate-50 ${getCellColor(row.bOver10s, total)}`}>
                              {renderCellWithPercentage(row.bOver10s, total)}
                            </td>
                            {BUCKET_KEYS.map(key => (
                              <td key={key} className={`px-2 border-l border-slate-50 ${getCellColor(row[key], total)}`}>
                                {renderCellWithPercentage(row[key], total)}
                              </td>
                            ))}
                            <td className="px-2 border-l border-slate-50 bg-slate-50 font-bold text-slate-700">
                              <div className="flex flex-col py-1">
                                <span>{total.toLocaleString()}</span>
                                <span className="text-[9px] opacity-40">(100%)</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                   </tbody>
                </table>
             </div>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
              <Clock className="text-blue-500" />
              {logType === 'sql_logback' ? '초당 쿼리 실행 추이 (QPS)' : 'TPS 추이'}
            </h3>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={summaryStats.tpsData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="time" hide={summaryStats.tpsData.length > 200} tick={{fontSize: 10}} />
                  <YAxis tick={{fontSize: 10}} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Line type="monotone" dataKey="tps" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
              <ZapOff className="text-red-500" />
              {logType === 'sql_logback' ? '느린 SQL 쿼리 Top 20' : '응답 지연 API Top 20'}
            </h3>
            {summaryStats.topSlowApis.length > 0 ? (
              <div className="h-[450px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summaryStats.topSlowApis} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{fontSize: 10}} />
                    <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Bar dataKey="avgTime" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={14}>
                      {summaryStats.topSlowApis.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index < 3 ? '#ef4444' : '#f87171'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[150px] flex items-center justify-center text-slate-400 border border-dashed rounded-2xl text-sm italic">분석된 실행 시간 데이터가 없습니다.</div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                <BarChart3 className="text-emerald-500" />
                {logType === 'sql_logback' ? '최다 실행 SQL' : '호출 빈도 Top 10'}
              </h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summaryStats.topApis} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} barSize={18}>
                       {summaryStats.topApis.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                <Users className="text-purple-500" />
                {logType === 'sql_logback' ? '시스템 정보' : '접속 IP Top 10'}
              </h3>
              <div className="space-y-4">
                {logType === 'sql_logback' ? (
                  <div className="p-4 bg-slate-50 rounded-2xl space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">분석 모드</span>
                      <span className="font-bold text-blue-600 uppercase">MyBatis SQL SQL_END Mode</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">통계 단위</span>
                      <span className="font-bold">5-Min Intervals</span>
                    </div>
                  </div>
                ) : (
                  summaryStats.topIps.map((ip, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 border-b border-slate-50">
                      <span className="text-sm font-mono text-slate-600">{ip.name}</span>
                      <span className="text-sm font-bold text-slate-800">{ip.count.toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
             <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <ZapOff className="text-red-500" size={18} />
                  <h3 className="font-bold text-slate-700">지연 시간 상위 1,000건 상세</h3>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input 
                    type="text" placeholder="결과 내 검색..." 
                    className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none w-64"
                    value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
             </div>
             <div className="overflow-x-auto max-h-[500px]">
               <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 sticky top-0 shadow-sm z-10">
                    <tr>
                      <th className="px-6 py-3 font-bold text-slate-500">순위</th>
                      <th 
                        className="px-6 py-3 font-bold text-slate-500 cursor-pointer hover:bg-slate-100 transition-colors"
                        onClick={() => handleSort('rawTimestamp')}
                      >
                        <div className="flex items-center gap-1">
                          시간
                          <SortIndicator columnKey="rawTimestamp" />
                        </div>
                      </th>
                      <th 
                        className="px-6 py-3 font-bold text-slate-500 cursor-pointer hover:bg-slate-100 transition-colors"
                        onClick={() => handleSort('url')}
                      >
                        <div className="flex items-center gap-1">
                          {logType === 'sql_logback' ? '매퍼 메서드' : 'API 경로'}
                          <SortIndicator columnKey="url" />
                        </div>
                      </th>
                      <th 
                        className="px-6 py-3 font-bold text-slate-500 cursor-pointer hover:bg-slate-100 transition-colors"
                        onClick={() => handleSort('responseTime')}
                      >
                        <div className="flex items-center gap-1">
                          실행 시간
                          <SortIndicator columnKey="responseTime" />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedAndFilteredLogs.map((log, index) => (
                      <tr key={`${log.id}-${index}`} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-2 text-slate-400 font-bold">
                          {sortConfig.key === 'responseTime' && sortConfig.direction === 'desc' ? index + 1 : '-'}
                        </td>
                        <td className="px-6 py-2 text-slate-400 text-xs font-mono">{log.rawTimestamp}</td>
                        <td className="px-6 py-2 font-bold text-slate-700 truncate max-w-[400px]">{log.url}</td>
                        <td className="px-6 py-2 font-mono text-xs">
                           <span className={`font-bold px-2 py-1 rounded ${log.responseTime > 1 ? 'bg-red-100 text-red-600' : log.responseTime > 0.1 ? 'bg-orange-100 text-orange-600' : 'text-slate-500'}`}>
                            {(log.responseTime * 1000).toLocaleString()}ms
                           </span>
                        </td>
                      </tr>
                    ))}
                    {sortedAndFilteredLogs.length === 0 && (
                      <tr>
                        <td colSpan="4" className="px-6 py-10 text-center text-slate-400 italic">표시할 데이터가 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
               </table>
             </div>
          </div>
        </main>
      )}

      {!logs.length && !isProcessing && (
        <div className="max-w-3xl mx-auto mt-20 text-center p-20 border-2 border-dashed border-slate-200 rounded-[3rem] bg-white shadow-xl shadow-slate-200/50">
          <div className="bg-blue-50 w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner">
            <Database className="text-blue-500" size={48} />
          </div>
          <h2 className="text-2xl font-black mb-4">SQL 및 액세스 로그 통합 분석</h2>
          <p className="text-slate-500 mb-10 leading-relaxed">
            대용량 로그 파일에서 <b>성능이 가장 낮은 1,000건</b>을 선별하고<br/>
            5분 단위 응답시간 분포 통계를 제공합니다.
          </p>
          <label className="inline-flex items-center gap-3 bg-slate-900 hover:bg-black text-white px-12 py-5 rounded-2xl cursor-pointer shadow-2xl font-black text-xl transition-all hover:scale-105 active:scale-95">
            <Upload size={24} />
            분석 파일 업로드
            <input type="file" className="hidden" onChange={handleFileUpload} accept=".log,.txt" />
          </label>
        </div>
      )}
    </div>
  );
};

const StatCard = ({ icon, label, value }) => (
  <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex items-center gap-5 hover:border-blue-200 transition-all hover:shadow-md">
    <div className="p-4 bg-slate-50 rounded-2xl">{icon}</div>
    <div>
      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">{label}</p>
      <p className="text-2xl font-black text-slate-800 tracking-tighter">{value}</p>
    </div>
  </div>
);

export default App;