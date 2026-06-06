import { REGEX } from './constants';
import { ParsedLog, LogType } from '../types';

export const getRespBucket = (timeInSec: number): string => {
  const ms = timeInSec * 1000;
  if (ms < 10) return 'b10ms';
  if (ms < 100) return 'b100ms';
  if (ms < 500) return 'b500ms';
  if (ms < 1000) return 'b1000ms';
  if (ms < 5000) return 'b5s';
  if (ms < 10000) return 'b10s';
  return 'bOver10s';
};

export const get5MinKey = (rawTime: string, type: LogType): string => {
  try {
    if (type === 'sql_logback') {
      const [date, time] = rawTime.split(' ');
      const [h, m] = time.split(':');
      const bucketM = Math.floor(parseInt(m, 10) / 5) * 5;
      return `${date} ${h}:${bucketM.toString().padStart(2, '0')}`;
    } else if (type === 'android_logcat') {
      // "05-28 23:15:30.123"
      const parts = rawTime.trim().split(/\s+/);
      const date = parts[0];
      const time = parts[1];
      const [h, m] = time.split(':');
      const bucketM = Math.floor(parseInt(m, 10) / 5) * 5;
      return `${date} ${h}:${bucketM.toString().padStart(2, '0')}`;
    } else {
      const parts = rawTime.split(':');
      const h = parts[1];
      const m = parts[2];
      const bucketM = Math.floor(parseInt(m, 10) / 5) * 5;
      return `${parts[0]} ${h}:${bucketM.toString().padStart(2, '0')}`;
    }
  } catch (e) {
    return "Unknown";
  }
};

export const parseLogcatLine = (line: string): ParsedLog | null => {
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

export const parseLogLine = (line: string, type: LogType): ParsedLog | null => {
  if (type === 'android_logcat') {
    return parseLogcatLine(line);
  } else if (type === 'sql_logback') {
    const sqlMatch = line.match(REGEX.sql);
    if (!sqlMatch) return null;
    const timeMatch = line.match(REGEX.sqlTime);
    const durationMs = parseInt(sqlMatch[2], 10);
    return {
      ip: "System",
      rawTimestamp: timeMatch ? timeMatch[1] : "Unknown",
      method: "SQL",
      url: sqlMatch[1].split('.').pop() || '',
      status: 200,
      responseTime: durationMs / 1000
    };
  } else {
    const match = line.match(REGEX.access);
    if (!match) return null;
    const [, ip, timestamp, method, url, status, , respTime] = match;
    let finalRespTime = respTime ? parseFloat(respTime) : null;
    if ((type === 'tomcat' || type === 'logback') && finalRespTime !== null && finalRespTime > 100) {
      finalRespTime = finalRespTime / 1000;
    }
    return {
      ip,
      rawTimestamp: timestamp,
      method,
      url: url.split('?')[0],
      status: parseInt(status, 10),
      responseTime: finalRespTime
    };
  }
};
