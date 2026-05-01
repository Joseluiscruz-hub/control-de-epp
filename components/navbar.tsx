"use client";

import { useAuth } from './auth-provider';
import { Button } from './ui/button';
import { LogOut, ShieldCheck, LayoutDashboard, Users, Package, Bot, ExternalLink, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: '/empleados', label: 'Empleados', icon: <Users className="h-4 w-4" /> },
  { href: '/inventario', label: 'Inventario', icon: <Package className="h-4 w-4" /> },
];

export function NavBar() {
  const { user: authUser, logOut, isAdmin } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // No mostrar navbar en el portal público si queremos una experiencia full screen
  if (pathname === '/portal') return null;

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      <header className={`sticky top-0 z-40 transition-all duration-500 ${
        scrolled 
          ? 'bg-white/85 backdrop-blur-2xl border-b border-slate-100/80 shadow-lg shadow-slate-200/20' 
          : 'bg-white/60 backdrop-blur-xl border-b border-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 group relative">
              <div className="relative">
                <div className="absolute inset-0 bg-red-600 rounded-2xl blur-md opacity-0 group-hover:opacity-30 transition-opacity duration-500" />
                <div className="relative h-10 w-10 rounded-2xl bg-[#F40009] flex items-center justify-center shadow-lg shadow-red-200 group-hover:shadow-red-300 transition-all group-hover:scale-110 active:scale-95 group-hover:rotate-3">
                  <ShieldCheck className="h-6 w-6 text-white" />
                </div>
              </div>
              <div className="hidden sm:block">
                <span className="font-black text-slate-900 text-lg leading-none block tracking-tighter uppercase">AssetGuard</span>
                <span className="text-[10px] text-[#F40009] font-black tracking-[0.2em] uppercase leading-none mt-1">Coca-Cola FEMSA</span>
              </div>
            </Link>

            <div className="flex items-center gap-2 sm:gap-4">
              {/* Desktop Nav links */}
              <nav className="hidden lg:flex items-center bg-slate-50/80 rounded-2xl p-1 gap-1 backdrop-blur-sm border border-slate-100/50">
                  {NAV_LINKS.map(link => {
                    const isActive = pathname === link.href;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={`relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all duration-300 ${
                          isActive
                            ? 'bg-white text-[#F40009] shadow-md border border-slate-100 scale-105'
                            : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'
                        }`}
                      >
                        <span className={`transition-colors duration-300 ${isActive ? 'text-[#F40009]' : 'text-slate-400'}`}>
                          {link.icon}
                        </span>
                        {link.label}
                        {isActive && (
                          <motion.div
                            layoutId="nav-active-indicator"
                            className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-[#F40009]"
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          />
                        )}
                      </Link>
                    );
                  })}
              </nav>

              {/* Portal Link */}
              <Link href="/portal" target="_blank">
                <Button variant="ghost" size="sm" className="hidden md:flex items-center gap-2 text-gray-500 hover:text-[#F40009] hover:bg-red-50 rounded-xl font-bold transition-all duration-300">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Portal
                </Button>
              </Link>

              <div className="h-6 w-px bg-gray-100 mx-1 hidden sm:block" />

              {/* AI status */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-100 rounded-xl group cursor-default hover:bg-red-100/50 transition-colors duration-300">
                <div className="relative">
                  <Bot className="h-4 w-4 text-[#F40009] group-hover:rotate-12 transition-transform duration-300" />
                  <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 bg-green-500 rounded-full border border-white" />
                </div>
                <span className="text-[10px] font-black text-[#F40009] uppercase tracking-tight">ARIA AI</span>
              </div>

              {/* User Profile */}
              <div className="hidden sm:flex items-center gap-2 pl-2">
                <div className="flex flex-col items-end hidden xl:flex">
                  <span className="text-xs font-bold text-gray-900 truncate max-w-[120px]">
                    {authUser?.displayName || 'Administrador'}
                  </span>
                  <span className="text-[9px] text-green-600 font-bold uppercase tracking-tighter">
                    {isAdmin ? 'Modo Admin' : 'Editor'}
                  </span>
                </div>
                {authUser?.photoURL ? (
                  <img
                    src={authUser.photoURL}
                    alt="Perfil"
                    className="h-8 w-8 rounded-full border-2 border-white shadow-sm ring-1 ring-gray-100 hover:ring-red-200 transition-all"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-red-50 flex items-center justify-center text-red-600 text-xs font-bold border-2 border-white shadow-sm ring-1 ring-red-100">
                    {authUser?.email?.charAt(0).toUpperCase() || 'A'}
                  </div>
                )}
                <div className="h-8 w-px bg-slate-100 mx-2 hidden sm:block" />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={logOut}
                  className="h-10 w-10 text-slate-400 hover:text-[#F40009] hover:bg-red-50 rounded-xl transition-all"
                >
                  <LogOut className="h-5 w-5" />
                </Button>
              </div>

              {/* Mobile Menu Button */}
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden h-10 w-10 rounded-xl text-slate-600 hover:text-[#F40009] hover:bg-red-50"
                onClick={() => setMobileOpen(!mobileOpen)}
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="absolute top-16 left-0 right-0 bg-white/95 backdrop-blur-2xl border-b border-slate-100 shadow-2xl shadow-slate-200/30 p-6"
              onClick={e => e.stopPropagation()}
            >
              <nav className="space-y-2">
                {NAV_LINKS.map(link => {
                  const isActive = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`flex items-center gap-4 px-6 py-4 rounded-2xl text-base font-black transition-all ${
                        isActive
                          ? 'bg-red-50 text-[#F40009] border border-red-100'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <span className={isActive ? 'text-[#F40009]' : 'text-slate-400'}>{link.icon}</span>
                      {link.label}
                    </Link>
                  );
                })}
                <Link
                  href="/portal"
                  target="_blank"
                  className="flex items-center gap-4 px-6 py-4 rounded-2xl text-base font-bold text-slate-500 hover:bg-slate-50 transition-all"
                >
                  <ExternalLink className="h-4 w-4 text-slate-400" />
                  Portal del Colaborador
                </Link>
              </nav>

              <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {authUser?.photoURL ? (
                    <img src={authUser.photoURL} alt="Perfil" className="h-10 w-10 rounded-full border-2 border-white shadow-sm ring-1 ring-slate-100" />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center text-red-600 font-bold border-2 border-white shadow-sm">
                      {authUser?.email?.charAt(0).toUpperCase() || 'A'}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-bold text-slate-900">{authUser?.displayName || 'Admin'}</p>
                    <p className="text-xs text-green-600 font-bold">{isAdmin ? 'Admin' : 'Editor'}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={logOut}
                  className="text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Salir
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
