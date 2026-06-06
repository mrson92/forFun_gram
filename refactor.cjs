const fs = require('fs');

const file = 'C:/project/src/logAnalyzer.tsx';
let content = fs.readFileSync(file, 'utf8');

const lines = content.split('\n');

const startIdx = lines.findIndex(l => l.includes('// --- Constants & Helpers ---'));
const appIdx = lines.findIndex(l => l.includes('const App = () => {'));
const statCardIdx = lines.findIndex(l => l.includes('const StatCard = '));
const statCardEndIdx = lines.findIndex((l, i) => i > statCardIdx && l.includes(');'));

const imports = `import { COLORS, SLOW_THRESHOLD, BUCKET_CONFIG, LOGCAT_LEVEL_CONFIG } from './utils/constants';
import { getRespBucket, get5MinKey, parseLogLine } from './utils/logParser';
import { CustomChartTooltip } from './components/CustomChartTooltip';
import { StatCard } from './components/StatCard';
import { ParsedLog, SummaryStats } from './types';`;

lines.splice(statCardIdx, statCardEndIdx - statCardIdx + 1);
lines.splice(startIdx, appIdx - startIdx, imports, '');

fs.writeFileSync(file, lines.join('\n'), 'utf8');
console.log('Refactored logAnalyzer.tsx');
