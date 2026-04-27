import { useState, useCallback } from 'react';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Upload, LogOut, AlertTriangle, CheckCircle2, TrendingUp, Shield, Zap, Eye, Activity, Info, X, FileText, Lock, Unlock, CircleAlert, CircleCheck, CircleMinus, ShieldAlert, TriangleAlert, Sparkles } from 'lucide-react';
import axios from 'axios';
import GeminiSummary from './component/GeminiSummary';


const safeNum = (val, digits = 2) => {
  if (val === undefined || val === null || isNaN(val)) return "0.00";
  return Number(val).toFixed(digits);
};
const cn = (...classes) => classes.filter(Boolean).join(' ');

// ── Transform backend response (passthrough with safety) ─────────────
function transformBackendData(raw) {
  if (!raw) return null;
  return raw;
}

// ── Severity / Label badges (replaces emojis) ──────────────────────────
function SeverityBadge({ text }) {
  const isHigh = text.includes('High');
  const isMedium = text.includes('Medium');
  const isLow = text.includes('Low');
  const bg = isHigh ? 'bg-red-500' : isMedium ? 'bg-amber-500' : 'bg-emerald-500';
  const ring = isHigh ? 'ring-red-500/30' : isMedium ? 'ring-amber-500/30' : 'ring-emerald-500/30';
  const label = isHigh ? 'High' : isMedium ? 'Medium' : 'Low';
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-white px-2.5 py-1 rounded-full ${bg} ring-2 ${ring}`}>
      <motion.span
        animate={isHigh ? { scale: [1, 1.4, 1] } : {}}
        transition={{ repeat: Infinity, duration: 1.5 }}
        className="w-1.5 h-1.5 bg-white rounded-full inline-block"
      />
      {label}
    </span>
  );
}

function TypeBadge({ text }) {
  const isSensitive = text.includes('Sensitive');
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${isSensitive ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
      {isSensitive ? <ShieldAlert className="w-3 h-3" /> : <TriangleAlert className="w-3 h-3" />}
      {isSensitive ? 'Sensitive' : 'General'}
    </span>
  );
}

function LabelBadge({ text }) {
  const isFair = text.includes('Fair');
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${isFair ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
      {isFair ? <CircleCheck className="w-3 h-3" /> : <CircleAlert className="w-3 h-3" />}
      {isFair ? 'Fair' : 'Biased'}
    </span>
  );
}

// ── Custom Recharts Tooltip ─────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="bg-white rounded-2xl px-5 py-4 shadow-2xl border border-slate-100"
    >
      <p className="text-sm font-extrabold text-slate-800 mb-1" style={{ fontFamily: 'Sora' }}>{label}</p>
      <p className="text-2xl font-black" style={{ fontFamily: 'Sora', color: payload[0]?.payload?.color || '#f97316' }}>
        {safeNum(payload[0]?.value, 1)}%
      </p>
    </motion.div>
  );
}

// ── Custom Bar Shape with rounded animation ─────────────────────────────
function AnimatedBar(props) {
  const { x, y, width, height, fill } = props;
  return (
    <motion.rect
      initial={{ height: 0, y: y + height }}
      animate={{ height, y }}
      transition={{ duration: 0.8, ease: 'easeOut', delay: props.index * 0.1 }}
      x={x}
      width={width}
      rx={10}
      ry={10}
      fill={fill}
      className="drop-shadow-sm"
    />
  );
}

// ── FloatingCard ────────────────────────────────────────────────────────
function FloatingCard({ children, delay = 0, className = '' }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-100, 100], [5, -5]);
  const rotateY = useTransform(x, [-100, 100], [-5, 5]);

  function handleMouse(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    x.set(event.clientX - (rect.left + rect.width / 2));
    y.set(event.clientY - (rect.top + rect.height / 2));
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay, type: 'spring', bounce: 0.4 }}
      whileHover={{ y: -8, transition: { type: 'spring', bounce: 0.6, duration: 0.6 } }}
      onMouseMove={handleMouse}
      onMouseLeave={() => { x.set(0); y.set(0); }}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
      className={cn("perspective-1000", className)}
    >
      {children}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
export default function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [geminiOpen, setGeminiOpen] = useState(false);

  const handleFileChange = (e) => {
    if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;
    setIsAnalyzing(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', selectedFile);
try {
  const response = await axios.post(
    "https://ai-service-1025621130719.asia-south1.run.app/analyze",
    formData,
    {
      timeout: 120000,
    }
  );
} catch (error) {
  console.log("FULL ERROR:", error);

  if (error.response) {
    console.log("BACKEND ERROR:", error.response.data);
    setError(error.response.data.error || "Server error");
  } else if (error.request) {
    console.log("NO RESPONSE RECEIVED");
    setError("No response from server");
  } else {
    setError(error.message);
  }
}
  };

  // ── Derived data ──
  const getChartData = useCallback(() => {
    if (!analysisData?.data_bias) return [];
    const colors = ['#14b8a6', '#f97316', '#06b6d4', '#fb923c', '#0891b2', '#6366f1'];
    return Object.entries(analysisData.data_bias).map(([key, value], i) => ({
      category: key.charAt(0).toUpperCase() + key.slice(1).replace('_', ' '),
      distribution: Object.values(value).reduce((a, b) => a + b, 0) * 100 / Object.values(value).length,
      color: colors[i % colors.length]
    }));
  }, [analysisData]);

  const biasData = getChartData();
  const defaultChartData = [
    { category: 'Age', distribution: 65, color: '#14b8a6' },
    { category: 'Gender', distribution: 82, color: '#f97316' },
    { category: 'Ethnicity', distribution: 48, color: '#06b6d4' },
    { category: 'Income', distribution: 73, color: '#fb923c' },
    { category: 'Education', distribution: 56, color: '#0891b2' },
  ];
  const chartData = biasData.length ? biasData : defaultChartData;

  const score1 = analysisData?.with_sensitive?.summary?.overall_bias_score !== undefined 
    ? safeNum(analysisData.with_sensitive.summary.overall_bias_score)
    : safeNum(Object.values(analysisData?.with_sensitive?.bias_report || {}).reduce((a, c) => a + (c?.bias_score || 0), 0) / (Object.keys(analysisData?.with_sensitive?.bias_report || {}).length || 1));

  const score2 = analysisData?.without_sensitive?.summary?.overall_bias_score !== undefined
    ? safeNum(analysisData.without_sensitive.summary.overall_bias_score)
    : safeNum(Object.values(analysisData?.without_sensitive?.bias_report || {}).reduce((a, c) => a + (c?.bias_score || 0), 0) / (Object.keys(analysisData?.without_sensitive?.bias_report || {}).length || 1));
  const impactText = analysisData?.without_sensitive?.summary?.mitigation_impact || "Limited";
  const biasReport = analysisData?.with_sensitive?.bias_report || {};

  const sensitiveColumns = Object.entries(biasReport).filter(([, r]) => r?.type?.includes('Sensitive'));
  const generalColumns = Object.entries(biasReport).filter(([, r]) => !r?.type?.includes('Sensitive'));
  const topInsights = Object.entries(biasReport).sort(([, a], [, b]) => (b?.bias_score || 0) - (a?.bias_score || 0)).slice(0, 2);

  const lrData = analysisData?.models?.logistic_regression;
  const rfData = analysisData?.models?.random_forest;
  const mitData = analysisData?.models?.mitigated;
  const retData = analysisData?.models?.retrained;

  const extraModels = [
    {
      name: "Logistic Regression",
      score: lrData ? safeNum(lrData.avg_bias) : "—",
      feature: lrData?.most_biased_feature || "N/A"
    },
    {
      name: "Random Forest",
      score: rfData ? safeNum(rfData.avg_bias) : "—",
      feature: rfData?.most_biased_feature || "N/A"
    },
    {
      name: "Mitigated Model",
      score: mitData ? safeNum(mitData.avg_bias) : "—",
      feature: mitData?.most_biased_feature || "N/A"
    },
    {
      name: "Retrained Model",
      score: retData ? safeNum(retData.avg_bias) : "—",
      feature: retData?.optimization || retData?.most_biased_feature || "N/A"
    },
  ];

  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-[#FFFBF5] relative overflow-hidden font-sans pb-20">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-200/30 blur-[100px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-cyan-100/30 blur-[120px] rounded-full" />

      {/* ══════ SIDEBAR ══════ */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[90]" />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="fixed top-0 right-0 w-full max-w-[520px] h-full bg-white z-[100] shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-2xl font-extrabold text-slate-900" style={{ fontFamily: 'Sora' }}>Full Report</h2>
                </div>
                <button onClick={() => setSidebarOpen(false)} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8">
                {!analysisData ? (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-4 opacity-50">
                    <FileText className="w-16 h-16 text-slate-300" />
                    <p className="text-slate-400 font-semibold">Upload a dataset to see the full report.</p>
                  </div>
                ) : (
                  <>
                    {/* 1. Overall Summary */}
                    <section>
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Overall Summary</h3>
                      <div className="bg-orange-50 rounded-2xl p-5 border border-orange-100 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-500">Overall Bias</span>
                          <SeverityBadge 
                          text={
                            (analysisData?.with_sensitive?.summary?.overall_bias || "Low").includes("Moderate")
                              ? "Medium"
                              : (analysisData?.with_sensitive?.summary?.overall_bias || "Low")
                          }
                        />
                        </div>
                        <p className="text-sm text-slate-700 font-medium leading-relaxed">{analysisData?.with_sensitive?.summary?.message || "No summary available"}</p>
                        <p className="text-xs text-slate-500 italic">{analysisData?.with_sensitive?.summary?.reason || ""}</p>
                      </div>
                    </section>

                    {/* 2. Dataset Distribution */}
                    <section>
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Dataset Distribution</h3>
                      <div className="space-y-3">
                        {Object.entries(analysisData?.data_bias || {}).map(([cat, vals]) => (
                          <div key={cat} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                            <p className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-3">{cat.replace('_', ' ')}</p>
                            <div className="space-y-2">
                              {Object.entries(vals).map(([sub, pct]) => (
                                <div key={sub} className="flex items-center gap-3 text-xs">
                                  <span className="w-16 text-slate-500 font-semibold capitalize truncate">{sub}</span>
                                  <div className="flex-1 h-2 bg-white rounded-full overflow-hidden border border-slate-100">
                                    <motion.div
                                      initial={{ width: 0 }}
                                      animate={{ width: `${pct * 100}%` }}
                                      transition={{ duration: 0.8, ease: 'easeOut' }}
                                      className="h-full bg-gradient-to-r from-orange-400 to-orange-500 rounded-full"
                                    />
                                  </div>
                                  <span className="w-12 text-right text-slate-700 font-bold">{safeNum(pct * 100, 1)}%</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    {/* 3. Bias Report With Sensitive */}
                    <section>
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Bias Report — With Sensitive</h3>
                      <p className="text-[11px] text-slate-500 mb-4 font-medium leading-tight">Baseline audit: Analyzing the raw dataset with all features to identify existing algorithmic discrimination.</p>
                      <div className="space-y-3">
                          {Object.entries(analysisData?.with_sensitive?.bias_report || {}).map(([feature, report]) => (
                            <div
                              key={feature}
                              className="rounded-xl border border-slate-100 p-4 hover:border-orange-200 transition-colors"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-extrabold text-slate-800 capitalize">
                                  {feature.replace('_', ' ')}
                                </span>
                                <div className="flex items-center gap-2">
                                  <TypeBadge text={report.type} />
                                  <SeverityBadge text={report.severity} />
                                </div>
                              </div>

                              {/* Insight */}
                              <p className="text-xs text-slate-600 font-medium mb-2">
                                {report.insight}
                              </p>

                              {/* ✅ NEW FAIRNESS METRICS */}
                              <div className="flex gap-2 mt-2 mb-3">
                                <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                                  report.demographic_parity > 0.3 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                                }`}>
                                  DP: {safeNum(report.demographic_parity)}
                                </span>

                                <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                                  report.equal_opportunity > 0.3 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                                }`}>
                                  EO: {safeNum(report.equal_opportunity)}
                                </span>

                                <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                                  report.disparate_impact < 0.8 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                                }`}>
                                  DI: {safeNum(report.disparate_impact)}
                                </span>
                              </div>

                              {/* Score bar */}
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] text-slate-400 font-bold">Score:</span>

                                <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(report?.bias_score || 0) * 100}%` }}
                                    transition={{ duration: 1, ease: 'easeOut' }}
                                    className="h-full bg-gradient-to-r from-orange-400 to-red-500 rounded-full"
                                  />
                                </div>

                                <span className="text-xs font-black text-slate-700">
                                  {safeNum(report?.bias_score)}
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </section>

                    {/* 4. Mitigated Report */}
                    <section>
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Bias Report — After Mitigation</h3>
                      <p className="text-[11px] text-slate-500 mb-4 font-medium leading-tight">Fairness audit: The results after applying the best mitigation strategy (Reweighting or Retraining) to the model.</p>
                      <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100 mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-500">Overall Bias</span>
                          <SeverityBadge text="Low" />
                        </div>
                        <p className="text-sm text-slate-700 font-medium">{analysisData?.without_sensitive?.summary?.message || "No summary"}</p>
                      </div>
                      <div className="space-y-2">
                        {Object.entries(analysisData?.without_sensitive?.bias_report || {}).map(([feature, report]) => (
                          <div key={feature} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors">
                            <span className="text-xs font-bold text-slate-600 capitalize">{feature.replace('_', ' ')}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-emerald-600">{safeNum(report?.bias_score)}</span>
                              <LabelBadge text={report.label} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    {/* 5. Privacy */}
                    <section>
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Privacy Insight</h3>
                      <div className="bg-cyan-50 rounded-2xl p-5 border border-cyan-100">
                        <p className="text-sm text-cyan-800 font-bold">{analysisData?.privacy_insight || 'No privacy insight available.'}</p>
                      </div>
                    </section>
                  </>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ══════ MAIN ══════ */}
      <div className="relative max-w-[1600px] mx-auto px-6 py-10">
        {/* Header */}
        <header className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-5">
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
              className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-xl shadow-orange-500/20"
            >
              <Activity className="w-7 h-7 text-white" />
            </motion.div>
            <div>
              <h1 className="text-5xl font-extrabold text-slate-900 tracking-tight" style={{ fontFamily: 'Sora' }}>
                AI Fairness Dashboard
              </h1>
              <p className="text-slate-500 font-medium mt-1" style={{ fontFamily: 'Manrope' }}>
                Real-time algorithmic bias detection & mitigation
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setGeminiOpen(true)}
              disabled={!analysisData}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-2xl font-bold shadow-lg shadow-orange-500/20 hover:brightness-110 transition-all disabled:opacity-50 disabled:grayscale"
              style={{ fontFamily: 'Manrope' }}
            >
              <Sparkles className="w-5 h-5" />
              AI Summary
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setSidebarOpen(true)}
              className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl font-bold shadow-lg hover:bg-slate-800 transition-all"
              style={{ fontFamily: 'Manrope' }}
            >
              <FileText className="w-5 h-5" />
              Full Report
            </motion.button>
            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-100 rounded-2xl text-slate-600 font-bold shadow-sm" style={{ fontFamily: 'Manrope' }}>
              <LogOut className="w-5 h-5" />
              Logout
            </motion.button>
          </div>
        </header>

        {/* Upload */}
        <FloatingCard className="mb-10">
          <div className="bg-white rounded-[32px] p-8 shadow-2xl shadow-slate-200/50 border border-slate-50">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="flex-1 w-full">
                <p className="text-orange-600 font-bold text-sm mb-3 flex items-center gap-2" style={{ fontFamily: 'Sora' }}>
                  <Upload className="w-4 h-4" /> UPLOAD DATASET
                </p>
                <div className="flex items-center gap-4 bg-slate-50 rounded-2xl p-2 border border-slate-100 overflow-hidden">
                  <label className="cursor-pointer px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold rounded-xl shadow-lg shadow-orange-500/30 hover:brightness-110 active:scale-95 transition-all text-sm uppercase tracking-wider whitespace-nowrap" style={{ fontFamily: 'Space Mono' }}>
                    Choose File
                    <input type="file" className="hidden" onChange={handleFileChange} />
                  </label>
                  <span className="text-slate-400 font-medium truncate italic text-sm" style={{ fontFamily: 'Space Mono' }}>
                    {selectedFile ? selectedFile.name : 'No file chosen'}
                  </span>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={handleAnalyze}
                disabled={isAnalyzing || !selectedFile}
                className="w-full md:w-auto px-10 py-5 bg-gradient-to-r from-orange-500 via-orange-600 to-pink-500 rounded-[20px] font-extrabold text-white text-lg shadow-xl shadow-orange-600/20 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-3"
                style={{ fontFamily: 'Sora' }}
              >
                {isAnalyzing ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                    <Zap className="w-6 h-6" />
                  </motion.div>
                ) : <Zap className="w-6 h-6" />}
                {isAnalyzing ? 'Analyzing...' : 'Analyze Data'}
              </motion.button>
            </div>
            {error && <p className="mt-4 text-red-500 font-semibold text-center text-xs">{error}</p>}
          </div>
        </FloatingCard>

        {/* ══════ DISTRIBUTION CHART (FULL WIDTH, LARGE) ══════ */}
        <FloatingCard className="mb-10">
          <div className="bg-white rounded-[32px] p-10 shadow-2xl shadow-slate-200/50 border border-slate-50">
            <div className="flex items-center gap-3 mb-8">
              <motion.div
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-4 h-4 rounded-full bg-gradient-to-r from-orange-400 to-red-400"
              />
              <h2 className="text-3xl font-extrabold text-[#111827]" style={{ fontFamily: 'Sora' }}>
                Categorical Distribution
              </h2>
            </div>
            <div style={{ width: "100%", height: 420 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barGap={16} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                  <defs>
                    {chartData.map((entry, i) => (
                      <linearGradient key={i} id={`barGrad-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={entry.color} stopOpacity={1} />
                        <stop offset="100%" stopColor={entry.color} stopOpacity={0.7} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="6 6" stroke="#E2E8F0" strokeOpacity={0.6} />
                  <XAxis
                    dataKey="category"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748B', fontWeight: 700, fontSize: 13 }}
                    dy={12}
                    style={{ fontFamily: 'Space Mono' }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94A3B8', fontWeight: 600, fontSize: 12 }}
                    style={{ fontFamily: 'Space Mono' }}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(248,250,252,0.8)', radius: 8 }} />
                  <Bar dataKey="distribution" shape={<AnimatedBar />} barSize={70}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={`url(#barGrad-${i})`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </FloatingCard>

        {/* ERROR MESSAGE */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mt-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 font-bold"
            >
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <p className="text-sm">{error}</p>
              <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-red-100 rounded-full">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <section className="mt-12">
          <div className="flex items-center gap-4 mb-8">
            <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 2, repeat: Infinity }}>
              <Eye className="w-8 h-8 text-cyan-500" />
            </motion.div>
            <h2 className="text-4xl font-extrabold text-slate-900" style={{ fontFamily: 'Sora' }}>Standard & Mitigation Models</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">

            {/* Logistic Regression */}
            <FloatingCard>
              <div className="bg-white rounded-[32px] p-8 shadow-xl shadow-slate-100 border border-slate-50 relative overflow-hidden h-full">
                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-100/30 rounded-full blur-[40px] -mr-16 -mt-16" />
                <div className="relative">
                  <div className="flex justify-between items-start mb-6">
                    <h3 className="text-xl font-bold text-slate-800 leading-tight" style={{ fontFamily: 'Sora' }}>Logistic Regression</h3>
                    <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                      <AlertTriangle className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-slate-400 font-bold text-[10px] tracking-widest uppercase mb-1">Bias Score</p>
                      <h4 className="text-5xl font-black text-orange-600" style={{ fontFamily: 'Sora' }}>{extraModels[0].score}</h4>
                    </div>
                    <div className="pt-4 border-t border-slate-50">
                      <p className="text-slate-400 font-bold text-[10px] tracking-widest uppercase mb-1">Top Bias</p>
                      <p className="text-lg font-bold text-slate-700" style={{ fontFamily: 'Space Mono' }}>{extraModels[0].feature}</p>
                    </div>
                  </div>
                </div>
              </div>
            </FloatingCard>

            {/* Random Forest */}
            <FloatingCard>
              <div className="bg-white rounded-[32px] p-8 shadow-xl shadow-slate-100 border border-slate-50 relative overflow-hidden h-full">
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-100/30 rounded-full blur-[40px] -mr-16 -mt-16" />
                <div className="relative">
                  <div className="flex justify-between items-start mb-6">
                    <h3 className="text-xl font-bold text-slate-800 leading-tight" style={{ fontFamily: 'Sora' }}>Random Forest</h3>
                    <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
                      <Info className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-slate-400 font-bold text-[10px] tracking-widest uppercase mb-1">Bias Score</p>
                      <h4 className="text-5xl font-black text-amber-600" style={{ fontFamily: 'Sora' }}>{extraModels[1].score}</h4>
                    </div>
                    <div className="pt-4 border-t border-slate-50">
                      <p className="text-slate-400 font-bold text-[10px] tracking-widest uppercase mb-1">Top Bias</p>
                      <p className="text-lg font-bold text-slate-700" style={{ fontFamily: 'Space Mono' }}>{extraModels[1].feature}</p>
                    </div>
                  </div>
                </div>
              </div>
            </FloatingCard>

            {/* Mitigated */}
            <FloatingCard>
              <div className="bg-white rounded-[32px] p-8 shadow-xl shadow-cyan-100 border-2 border-cyan-50 relative overflow-hidden h-full scale-105 z-10">
                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-100/40 rounded-full blur-[40px] -mr-16 -mt-16" />
                <div className="relative">
                  <div className="flex justify-between items-start mb-6">
                    <h3 className="text-xl font-bold text-slate-800 leading-tight" style={{ fontFamily: 'Sora' }}>Mitigated Model</h3>
                    <div className="w-10 h-10 rounded-xl bg-cyan-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                      <Shield className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-slate-400 font-bold text-[10px] tracking-widest uppercase mb-1">Bias Score</p>
                      <h4 className="text-5xl font-black text-cyan-600" style={{ fontFamily: 'Sora' }}>{extraModels[2].score}</h4>
                    </div>
                    <div className="pt-4 border-t border-slate-50">
                      <p className="text-slate-400 font-bold text-[10px] tracking-widest uppercase mb-2">Bias Features (Avg)</p>
                      <div className="flex flex-wrap gap-2">
                       {mitData ? Object.keys(mitData?.bias_report || {}).slice(0, 3).map(f => (
                              <span key={f} className="px-2 py-1 bg-cyan-50 text-cyan-700 rounded-lg text-[10px] font-bold uppercase tracking-tighter">
                                {f.replace('_', ' ')}: {safeNum(mitData?.bias_report?.[f]?.bias_score)}
                              </span>
                            )) : analysisData ? Object.keys(analysisData?.without_sensitive?.bias_report || {}).slice(0, 3).map(f => (
                              <span key={f} className="px-2 py-1 bg-cyan-50 text-cyan-700 rounded-lg text-[10px] font-bold uppercase tracking-tighter">
                                {f.replace('_', ' ')}: {safeNum(analysisData?.without_sensitive?.bias_report?.[f]?.bias_score)}
                              </span>
                            )) : ["City: 0.00", "Age: 0.00"].map(f => (
                              <span key={f} className="px-2 py-1 bg-cyan-50 text-cyan-700 rounded-lg text-[10px] font-bold uppercase tracking-tighter">
                                {f}
                              </span>
                            ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </FloatingCard>

            {/* Retrained */}
            <FloatingCard>
              <div className="bg-white rounded-[32px] p-8 shadow-xl shadow-slate-100 border border-slate-50 relative overflow-hidden h-full">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-100/30 rounded-full blur-[40px] -mr-16 -mt-16" />
                <div className="relative">
                  <div className="flex justify-between items-start mb-6">
                    <h3 className="text-xl font-bold text-slate-800 leading-tight" style={{ fontFamily: 'Sora' }}>Retrained Model</h3>
                    <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                      <CheckCircle2 className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-slate-400 font-bold text-[10px] tracking-widest uppercase mb-1">Bias Score</p>
                      <h4 className="text-5xl font-black text-emerald-600" style={{ fontFamily: 'Sora' }}>{extraModels[3].score}</h4>
                    </div>
                    <div className="pt-4 border-t border-slate-50">
                      <p className="text-slate-400 font-bold text-[10px] tracking-widest uppercase mb-1">Optimization</p>
                      <p className="text-lg font-bold text-slate-700" style={{ fontFamily: 'Space Mono' }}>{extraModels[2].feature}</p>
                    </div>
                  </div>
                </div>
              </div>
            </FloatingCard>
          </div>
        </section>

        {/* Bottom Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Mitigation */}
          <div className="lg:col-span-1 bg-gradient-to-br from-teal-400 via-cyan-500 to-blue-600 rounded-[40px] p-10 text-white shadow-2xl shadow-cyan-600/20">
            <div className="flex items-center gap-4 mb-10">
              <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 2, repeat: Infinity }}>
                <TrendingUp className="w-9 h-9" />
              </motion.div>
              <h3 className="text-4xl font-extrabold" style={{ fontFamily: 'Sora' }}>Mitigation</h3>
            </div>
            <div className="space-y-6">
              <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/20">
                <p className="text-white/70 font-bold text-sm mb-1 uppercase tracking-wider">Before</p>
                <p className="text-5xl font-black" style={{ fontFamily: 'Sora' }}>{score1}</p>
              </div>
              <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/20">
                <p className="text-white/70 font-bold text-sm mb-1 uppercase tracking-wider">After</p>
                <p className="text-5xl font-black" style={{ fontFamily: 'Sora' }}>{score2}</p>
              </div>
              <motion.div whileHover={{ scale: 1.03 }} className="bg-white rounded-3xl p-6 shadow-xl text-cyan-600 text-center">
                <p className="font-bold text-sm mb-2 uppercase tracking-widest">Impact</p>
                <p className="text-4xl font-black" style={{ fontFamily: 'Sora' }}>{impactText}</p>
              </motion.div>
            </div>
          </div>

          {/* Key Insights */}
          <div className="lg:col-span-2 bg-white rounded-[40px] p-10 shadow-2xl shadow-slate-200/50 border border-slate-100">
            <div className="flex items-center gap-4 mb-10">
              <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}>
                <Zap className="w-9 h-9 text-orange-500" />
              </motion.div>
              <h3 className="text-4xl font-extrabold text-slate-900" style={{ fontFamily: 'Sora' }}>Key Insights</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

              {/* Bias Detected */}
              <div className="bg-orange-50/50 rounded-[32px] p-8 border border-orange-100 flex flex-col gap-5">
                <div className="w-14 h-14 rounded-2xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                  <AlertTriangle className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h4 className="text-2xl font-extrabold text-slate-800 mb-3" style={{ fontFamily: 'Sora' }}>Bias Detected</h4>
                  {topInsights.length > 0 ? (
                    <div className="space-y-3">
                      {topInsights.map(([key, report]) => (
                        <div key={key} className="bg-white rounded-xl p-3 border border-orange-100">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-extrabold text-slate-700 capitalize">{key.replace('_', ' ')}</span>
                            <SeverityBadge text={report.severity} />
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed">{report.insight}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-600 font-medium leading-relaxed" style={{ fontFamily: 'Manrope' }}>
                      Upload a dataset to view detected bias insights.
                    </p>
                  )}
                </div>
              </div>

              {/* Privacy Filter */}
              <div className="bg-cyan-50/50 rounded-[32px] p-8 border border-cyan-100 flex flex-col gap-5">
                <div className="w-14 h-14 rounded-2xl bg-cyan-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                  <Lock className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h4 className="text-2xl font-extrabold text-slate-800 mb-3" style={{ fontFamily: 'Sora' }}>Privacy Filter</h4>
                  {analysisData ? (
                    <div className="space-y-3">
                      {sensitiveColumns.length > 0 && (
                        <div>
                          <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-2">Sensitive Columns</p>
                          {sensitiveColumns.map(([key, report]) => (
                            <div key={key} className="flex items-center gap-2 bg-red-50 rounded-lg px-3 py-2 mb-1 border border-red-100">
                              <Lock className="w-3 h-3 text-red-500 flex-shrink-0" />
                              <span className="text-xs font-bold text-red-700 capitalize">{key.replace('_', ' ')}</span>
                              <span className="text-[9px] text-red-500 ml-auto font-black">{safeNum(report?.bias_score)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {generalColumns.length > 0 && (
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">General Columns</p>
                          {generalColumns.map(([key, report]) => (
                            <div key={key} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 mb-1 border border-slate-100">
                              <Unlock className="w-3 h-3 text-slate-400 flex-shrink-0" />
                              <span className="text-xs font-bold text-slate-600 capitalize">{key.replace('_', ' ')}</span>
                              <span className="text-[9px] text-slate-500 ml-auto font-black">{safeNum(report?.bias_score)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-cyan-700 font-semibold italic mt-2">{analysisData?.privacy_insight || ''}</p>
                    </div>
                  ) : (
                    <p className="text-slate-600 font-medium leading-relaxed" style={{ fontFamily: 'Manrope' }}>
                      All attributes properly anonymized. Zero violations detected.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <GeminiSummary
        isOpen={geminiOpen}
        onClose={() => setGeminiOpen(false)}
        analysisData={analysisData}
      />
    </div>
  );
}