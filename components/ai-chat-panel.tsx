"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Bot, X, Send, Loader2, Minimize2, Maximize2,
  Sparkles, RefreshCw, TrendingUp, AlertTriangle,
  ShoppingCart, BarChart3, ChevronRight
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const QUICK_PROMPTS = [
  { icon: <AlertTriangle className="h-3.5 w-3.5" />, text: '¿Qué EPP está a punto de agotarse?' },
  { icon: <TrendingUp className="h-3.5 w-3.5" />, text: '¿Qué área consume más equipo?' },
  { icon: <ShoppingCart className="h-3.5 w-3.5" />, text: 'Genera una orden de compra sugerida' },
  { icon: <BarChart3 className="h-3.5 w-3.5" />, text: 'Resumen ejecutivo del estado actual' },
];

export function AiChatPanel() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: 'Hola. Soy **ARIA**, tu asistente de Seguridad Industrial.\n\nPuedo analizar inventario, detectar anomalías de consumo y preparar resúmenes ejecutivos del estado operativo.\n\n¿En qué puedo ayudarte hoy?',
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open && !minimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, minimized]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('missing_auth');
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.text || data.error || 'Error al procesar la respuesta.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: error instanceof Error && error.message === 'missing_auth'
          ? 'Necesitas iniciar sesión como administrador para usar ARIA.'
          : 'No pude conectar con el servidor de IA. Verifica `GEMINI_API_KEY` y la sesión de Firebase.',
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const clearChat = () => {
    setMessages([{
      id: Date.now().toString(),
      role: 'assistant',
      content: 'Chat reiniciado. ¿En qué puedo ayudarte?',
      timestamp: new Date(),
    }]);
  };

  return (
    <>
      {/* Floating Button - FEMSA themed */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-6 right-6 z-50 group flex items-center gap-2.5 bg-[#10151d] text-white px-5 py-4 rounded-xl shadow-2xl shadow-black/30 hover:shadow-red-950/20 transition-all duration-500 hover:scale-105 active:scale-95 border border-white/10"
            title="Abrir ARIA - Asistente IA"
          >
            <div className="relative">
              <div className="h-9 w-9 rounded-lg bg-[#F40009] flex items-center justify-center shadow-lg shadow-red-950/20 group-hover:shadow-red-950/40 transition-shadow">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 bg-green-400 rounded-full border-2 border-slate-950 animate-pulse" />
            </div>
            <div className="hidden sm:block">
              <span className="font-black text-sm tracking-tight block">ARIA</span>
              <span className="text-[9px] text-red-500 font-bold uppercase tracking-widest">IA Activa</span>
            </div>
            <Sparkles className="h-4 w-4 text-red-400 group-hover:rotate-12 transition-transform" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={`fixed right-6 z-50 bg-[#f8fafc] rounded-xl shadow-2xl shadow-black/25 border border-white/20 flex flex-col overflow-hidden ${
              minimized
                ? 'bottom-6 h-16 w-72'
                : 'bottom-6 w-[420px] h-[640px] max-h-[85vh]'
            }`}
          >
            {/* Header - FEMSA branded */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-[#0d1117] flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="h-9 w-9 rounded-lg bg-[#F40009] flex items-center justify-center shadow-lg shadow-red-950/20">
                    <Bot className="h-5 w-5 text-white" />
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 bg-green-400 rounded-full border-2 border-slate-950" />
                </div>
                <div>
                  <p className="font-black text-white text-sm leading-none tracking-tight">ARIA IA</p>
                  <p className="text-[9px] text-red-500 font-bold uppercase tracking-widest mt-0.5">Seguridad Industrial</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={clearChat}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
                  title="Limpiar chat"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setMinimized(!minimized)}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
                >
                  {minimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-lg hover:bg-red-500/20 transition-colors text-slate-400 hover:text-red-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {!minimized && (
              <>
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {messages.map(msg => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {msg.role === 'assistant' && (
                        <div className="h-7 w-7 rounded-xl bg-[#F40009] flex items-center justify-center flex-shrink-0 mr-2 mt-0.5 shadow-sm">
                          <Bot className="h-4 w-4 text-white" />
                        </div>
                      )}
                      <div
                        className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-[#0d1117] text-white rounded-tr-sm shadow-lg'
                            : 'bg-white border border-slate-200 text-gray-800 rounded-tl-sm shadow-sm'
                        }`}
                      >
                        {msg.role === 'assistant' ? (
                          <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-strong:text-gray-900 prose-ul:text-gray-700 prose-li:marker:text-red-500">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        ) : (
                          <p>{msg.content}</p>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="h-7 w-7 rounded-xl bg-[#F40009] flex items-center justify-center flex-shrink-0 mr-2 shadow-sm">
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 w-2 bg-red-400 rounded-full animate-bounce [animation-delay:0ms]" />
                          <div className="h-2 w-2 bg-red-400 rounded-full animate-bounce [animation-delay:150ms]" />
                          <div className="h-2 w-2 bg-red-400 rounded-full animate-bounce [animation-delay:300ms]" />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Quick Prompts */}
                {messages.length <= 1 && (
                  <div className="px-5 pb-3">
                    <p className="text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Consultas Rápidas</p>
                    <div className="space-y-1.5">
                      {QUICK_PROMPTS.map((p, i) => (
                        <button
                          key={i}
                          onClick={() => sendMessage(p.text)}
                          disabled={loading}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-white hover:bg-red-50 text-left transition-all group border border-slate-200 hover:border-red-100"
                        >
                          <span className="text-[#F40009] flex-shrink-0">{p.icon}</span>
                          <span className="text-xs text-slate-700 font-bold flex-1">{p.text}</span>
                          <ChevronRight className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 group-hover:text-red-400 transition-all" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Input */}
                <form onSubmit={handleSubmit} className="p-4 border-t border-slate-200 flex gap-2 flex-shrink-0 bg-slate-50/80">
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="Pregunta sobre inventario o EPP..."
                    disabled={loading}
                    className="flex-1 text-sm h-11 rounded-lg border-slate-200 bg-white focus:border-red-300 focus:ring-red-100 font-medium"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={loading || !input.trim()}
                    className="h-11 w-11 p-0 rounded-lg bg-[#0d1117] hover:bg-[#F40009] shadow-lg transition-all duration-300"
                  >
                    {loading
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Send className="h-4 w-4" />
                    }
                  </Button>
                </form>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
