export type LogType = 'android_logcat' | 'sql_logback' | 'nginx' | 'tomcat' | 'logback';

export interface ParsedLog {
  id?: number;
  ip: string;
  rawTimestamp: string;
  method: string;
  url: string;
  status: number;
  responseTime: number | null;
  level?: string;
  tag?: string;
  message?: string;
}

export interface DistributionStats {
  time: string;
  [key: string]: number | string;
}

export interface SummaryStats {
  totalRequests: number;
  errorCount?: number;
  warnCount?: number;
  uniqueTags?: number;
  topTags?: { name: string; count: number }[];
  levelStats?: { name: string; count: number }[];
  tpsData: { time: string; tps: number }[];
  distributionStats: DistributionStats[];
  maxTps: number;
  
  // server specific
  uniqueIps?: number;
  uniqueApis?: number;
  errorRate?: string | number;
  avgResponseTime?: string | number;
  topIps?: { name: string; count: number }[];
  topApis?: { name: string; count: number; total: number; avgTime: number }[];
  topSlowApis?: { name: string; count: number; total: number; avgTime: number }[];
}
