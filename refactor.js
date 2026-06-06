const fs = require('fs');

const file = 'C:/project/src/logAnalyzer.tsx';
let content = fs.readFileSync(file, 'utf8');

// The lines we want to replace
const lines = content.split('\n');

// Find the index of "// --- Constants & Helpers ---"
const startIdx = lines.findIndex(l => l.includes('// --- Constants & Helpers ---'));

// Find the index of "const App = () => {"
const appIdx = lines.findIndex(l => l.includes('const App = () => {'));

// Find the index of "const StatCard = "
const statCardIdx = lines.findIndex(l => l.includes('const StatCard = '));
const statCardEndIdx = lines.findIndex((l, i) => i > statCardIdx && l.includes(');'));

const imports = `import { COLORS, SLOW_THRESHOLD, BUCKET_CONFIG, LOGCAT_LEVEL_CONFIG } from './utils/constants';
import { getRespBucket, get5MinKey, parseLogLine } from './utils/logParser';
import { CustomChartTooltip } from './components/CustomChartTooltip';
import { StatCard } from './components/StatCard';
import { ParsedLog, SummaryStats } from './types';`;

// remove statCard
lines.splice(statCardIdx, statCardEndIdx - statCardIdx + 1);

// replace constants to app
lines.splice(startIdx, appIdx - startIdx, imports, '');

fs.writeFileSync(file, lines.join('\n'), 'utf8');
console.log('Refactored logAnalyzer.tsx');
