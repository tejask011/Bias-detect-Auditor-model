import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Brain, Loader2, Clipboard, CheckCircle } from 'lucide-react';
import axios from 'axios';


export default function GeminiSummary({ isOpen, onClose, analysisData }) {
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const generateSummary = async () => {
    if (!analysisData) return;
    setLoading(true);
    setError(null);

    const BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://backend-service-1025621130719.asia-south1.run.app";


    try {
      const response = await axios.post(`${BASE_URL}/summary`, {
        analysisData
      });

      setSummary(response.data.summary);
    } catch (error) {
  console.log("🔥 FULL ERROR:", error);

  if (error.response) {
    console.log("🔥 BACKEND ERROR:", error.response.data);
    setError(JSON.stringify(error.response.data, null, 2));
  } else if (error.request) {
    setError("No response from server");
  } else {
    setError(error.message);
  }
}
  };


  useEffect(() => {
    if (isOpen && !summary && analysisData) {
      generateSummary();
    }
  }, [isOpen, analysisData]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-md z-[110]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed inset-x-4 top-[10%] bottom-[10%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[800px] bg-white rounded-[40px] shadow-2xl z-[120] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-orange-500/5 to-pink-500/5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900" style={{ fontFamily: 'Sora' }}>AI Data Summary</h2>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Powered by Gemini AI</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {summary && (
                  <button
                    onClick={copyToClipboard}
                    className="p-2.5 rounded-xl hover:bg-slate-100 transition-colors text-slate-500 relative"
                    title="Copy to clipboard"
                  >
                    {copied ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <Clipboard className="w-5 h-5" />}
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-slate-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30">
              {loading ? (
                <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  >
                    <Loader2 className="w-12 h-12 text-orange-500" />
                  </motion.div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">Generating Insightful Summary...</h3>
                    <p className="text-slate-500">Gemini is analyzing your fairness report data.[we are using free gemini due to high traffic it may crash]</p>
                  </div>
                </div>
              ) : error ? (
                <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
                  <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                    <Brain className="w-8 h-8 text-red-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">Oops! Something went wrong</h3>
                    <p className="text-red-500 font-medium mb-4">{error}</p>
                    <button
                      onClick={generateSummary}
                      className="px-6 py-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              ) : summary ? (
                <div className="prose prose-slate max-w-none">
                  <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 whitespace-pre-wrap font-medium text-slate-700 leading-relaxed">
                    {summary}
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
                   <p className="text-slate-400">No analysis data available to summarize.</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-8 py-5 border-t border-slate-100 bg-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Ready for Export</span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">© 2024 Bias Detect Auditor • Gemini Intelligence</p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
