"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { collection, getDocs, query, orderBy, limit, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Bot, X, Send, Loader2, Minimize2, Maximize2,
  Sparkles, RefreshCw, TrendingUp, AlertTriangle,
  ShoppingCart, BarChart3, ChevronRight
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

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
      content: '¡Hola! Soy **ARIA**, tu asistente de Seguridad Industrial. 🦺\n\nPuedo analizar el inventario, detectar anomalías de consumo y hacer predicciones de stock en tiempo real.\n\n¿En qué puedo ayudarte hoy?',
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

  const fetchContext = useCallback(async () => {
    try {
      const [invSnap, empSnap, assignSnap] = await Promise.all([
        getDocs(collection(db, 'ppe_catalog')),
        getDocs(query(collection(db, 'employees'), where('active', '==', true))),
        getDocs(query(collection(db, 'assignments'), orderBy('assignedAt', 'desc'), limit(50))),
      ]);

      const inventory = invSnap.docs.map(d => ({ ...d.data(), _id: d.id }));
      const employees = empSnap.docs.map(d => ({ ...d.data(), _id: d.id }));
      const assignments = assignSnap.docs.map(d => {
        const data = d.data();
        return {
          ...data,
          _id: d.id,
          assignedAt: data.assignedAt instanceof Timestamp
            ? data.assignedAt.toDate().toISOString()
            : null,
          nextReplacementAt: data.nextReplacementAt instanceof Timestamp
            ? data.nextReplacementAt.toDate().toISOString()
            : null,
        };
      });

      // Compute alerts
      const now = new Date();
      const alerts = inventory
        .filter((i: Record<string, unknown>) => {
          const stock = i.stock as number;
          return stock === 0 || stock <= 20;
        })
        .map((i: Record<string, unknown>) => ({
          sku: i.sku,
          name: i.name,
          stock: i.stock,
          severity: (i.stock as number) === 0 ? 'CRÍTICO' : 'BAJO',
        }));

      return { inventory, employees, assignments, alerts, currentDate: now.toISOString() };
    } catch {
      return { inventory: [], employees: [], assignments: [], alerts: [] };
    }
  }, []);

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
      const context = await fetchContext();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, context }),
      });
      const data = await res.json();
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.text || data.error || 'Error al procesar la respuesta.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botMsg]);
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '❌ No pude conectar con el servidor de IA. Verifica tu `GEMINI_API_KEY` en `.env.local`.',
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  }, [loading, fetchContext]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const clearChat = () => {
    setMessages([{
      id: Date.now().toString(),
      role: 'assistant',
      content: '¡Chat reiniciado! ¿En qué puedo ayudarte? 🦺',
      timestamp: new Date(),
    }]);
  };

  return (
    <>
      {/* Floating Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 group flex items-center gap-2.5 bg-gradient-to-br from-indigo-600 to-purple-700 text-white px-4 py-3.5 rounded-2xl shadow-2xl shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all duration-300 hover:scale-105 active:scale-95"
          title="Abrir ARIA - Asistente IA"
        >
          <div className="relative">
            <Bot className="h-5 w-5" />
            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-green-400 rounded-full border-2 border-indigo-600 animate-pulse" />
          </div>
          <span className="font-semibold text-sm tracking-wide">ARIA</span>
          <Sparkles className="h-4 w-4 text-indigo-200 group-hover:rotate-12 transition-transform" />
        </button>
      )}

      {/* Chat Panel */}
      {open && (
        <div
          className={`fixed right-6 z-50 bg-white rounded-2xl shadow-2xl shadow-black/10 border border-gray-100 flex flex-col transition-all duration-300 ${
            minimized
              ? 'bottom-6 h-14 w-72'
              : 'bottom-6 w-96 h-[600px] max-h-[85vh]'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-700 rounded-t-2xl flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="h-8 w-8 rounded-xl bg-white/20 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 bg-green-400 rounded-full border-2 border-indigo-600" />
              </div>
              <div>
                <p className="font-bold text-white text-sm leading-none">ARIA</p>
                <p className="text-indigo-200 text-xs mt-0.5">Asistente IA · En línea</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clearChat}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-indigo-200 hover:text-white"
                title="Limpiar chat"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                onClick={() => setMinimized(!minimized)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-indigo-200 hover:text-white"
              >
                {minimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-indigo-200 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!minimized && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
                {messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'assistant' && (
                      <div className="h-7 w-7 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5 shadow-sm">
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                    )}
                    <div
                      className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-br from-indigo-600 to-purple-700 text-white rounded-tr-sm shadow-md'
                          : 'bg-gray-50 border border-gray-100 text-gray-800 rounded-tl-sm shadow-sm'
                      }`}
                    >
                      {msg.role === 'assistant' ? (
                        <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-strong:text-gray-900 prose-ul:text-gray-700 prose-li:marker:text-indigo-500">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p>{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="h-7 w-7 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 mr-2 shadow-sm">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                    <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-1.5">
                        <div className="h-2 w-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
                        <div className="h-2 w-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
                        <div className="h-2 w-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Prompts */}
              {messages.length <= 1 && (
                <div className="px-4 pb-3">
                  <p className="text-xs text-gray-400 font-medium mb-2">Preguntas frecuentes:</p>
                  <div className="space-y-1.5">
                    {QUICK_PROMPTS.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(p.text)}
                        disabled={loading}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-left transition-colors group border border-indigo-100 hover:border-indigo-200"
                      >
                        <span className="text-indigo-500 flex-shrink-0">{p.icon}</span>
                        <span className="text-xs text-indigo-700 font-medium flex-1">{p.text}</span>
                        <ChevronRight className="h-3 w-3 text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input */}
              <form onSubmit={handleSubmit} className="p-3 border-t border-gray-100 flex gap-2 flex-shrink-0">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Pregunta sobre el inventario o EPP..."
                  disabled={loading}
                  className="flex-1 text-sm h-9 rounded-xl border-gray-200 focus:border-indigo-400 focus:ring-indigo-200"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={loading || !input.trim()}
                  className="h-9 w-9 p-0 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-700 hover:from-indigo-700 hover:to-purple-800 shadow-md shadow-indigo-200"
                >
                  {loading
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Send className="h-4 w-4" />
                  }
                </Button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}
