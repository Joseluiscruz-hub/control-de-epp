"use client";

import { useEffect, useState } from 'react';
import { useAuth } from './auth-provider';
import { Button } from './ui/button';
import { LogOut, ShieldCheck, LayoutDashboard, Users, Package, Bot, ExternalLink, Menu, X, HardHat, FileSpreadsheet, RadioTower, UserCog, WalletCards } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { PlantContextSwitcher } from './plant-context-switcher';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: '/monitoreo', label: 'Monitoreo', icon: <RadioTower className="h-4 w-4" /> },
  { href: '/empleados', label: 'Empleados', icon: <Users className="h-4 w-4" /> },
  { href: '/inventario', label: 'Inventario', icon: <Package className="h-4 w-4" /> },
  { href: '/reportes', label: 'Reportes', icon: <FileSpreadsheet className="h-4 w-4" /> },
  { href: '/presupuesto', label: 'Presupuesto', icon: <WalletCards className="h-4 w-4" />, globalOnly: true },
  { href: '/administradores', label: 'Admins', icon: <UserCog className="h-4 w-4" /> },
];

export function NavBar() {
  const { user: authUser, logOut, isAdmin, isGlobalAdmin, isOfflineSession } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [online, setOnline] = useState(true);
  const hideNav = pathname === '/portal' || pathname?.startsWith('/kiosko');
  const visibleNavLinks = NAV_LINKS.filter(link => !link.globalOnly || isGlobalAdmin);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setMobileOpen(false), 0);
    return () => window.clearTimeout(timeout);
  }, [pathname]);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  if (hideNav) return null;

  return (
    <>
      <header className={`sticky top-0 z-40 transition-all duration-300 ${
        scrolled
          ? 'navbar-glass'
          : 'bg-transparent'
      }`}>
        <div className="w-full px-3 sm:px-4 lg:px-6">
          <div className="flex h-[4.25rem] items-center justify-between gap-2 lg:gap-3">

            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 group relative shrink-0" aria-label="Ir al dashboard de AssetGuard">
              <div className="relative">
                <div className="relative h-10 w-10 rounded-xl bg-[#F40009] flex items-center justify-center shadow-xl shadow-red-950/40 ring-1 ring-white/20 group-hover:scale-[1.04] active:scale-95 transition-all duration-300">
                  <ShieldCheck className="h-5 w-5 text-white" />
                </div>
              </div>
              <div className="hidden sm:block leading-none">
                <span className="font-black text-white text-base leading-none block tracking-tight">AssetGuard</span>
                <span className="text-[9px] font-bold tracking-[0.17em] uppercase leading-none mt-1 flex items-center gap-1" style={{color: 'rgba(244,0,9,0.75)'}}>
                  Coca-Cola FEMSA
                  <span className="text-[8px] font-bold" style={{color:'rgba(255,255,255,0.25)'}}>· EPP</span>
                </span>
              </div>
            </Link>

            <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 shadow-inner shadow-white/5">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[9px] font-black uppercase tracking-[0.16em] text-white/65">Corporate Security Command</span>
            </div>

            <div className="flex items-center gap-1.5 lg:gap-2 min-w-0 overflow-hidden">

              {/* Desktop Nav */}
              <nav className="hidden lg:flex items-center gap-1 p-1 rounded-xl" style={{background:'rgba(255,255,255,0.055)', border:'1px solid rgba(255,255,255,0.12)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)'}} aria-label="Navegación principal">
                {visibleNavLinks.map(link => {
                  const isActive = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={isActive ? 'page' : undefined}
                      className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-300 whitespace-nowrap ${
                        isActive
                          ? 'text-white shadow-lg'
                          : 'text-white/50 hover:text-white/90 hover:bg-white/8'
                      }`}
                      style={isActive ? {background: 'linear-gradient(180deg, rgba(244,0,9,0.2), rgba(244,0,9,0.12))', border: '1px solid rgba(244,0,9,0.34)'} : {}}
                    >
                      <span className={`transition-colors duration-300 ${isActive ? 'text-[#ff5d61]' : ''}`}>
                        {link.icon}
                      </span>
                      {link.label}
                      {isActive && (
                        <motion.div
                          layoutId="nav-active-indicator"
                          className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-[#F40009]"
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        />
                      )}
                    </Link>
                  );
                })}
              </nav>

              <div className="hidden 2xl:block">
                <PlantContextSwitcher />
              </div>

              {/* External links */}
              <Link href="/portal" target="_blank">
                <Button variant="ghost" size="sm" className="hidden xl:flex items-center gap-1.5 text-white/55 hover:text-white hover:bg-white/10 rounded-lg font-semibold transition-all text-xs border border-white/8">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Portal
                </Button>
              </Link>

              <Link href="/kiosko" target="_blank">
                <Button variant="ghost" size="sm" className="hidden xl:flex items-center gap-1.5 text-white/55 hover:text-amber-300 hover:bg-amber-500/12 rounded-lg font-semibold transition-all text-xs border border-white/8">
                  <HardHat className="h-3.5 w-3.5" />
                  Kiosko
                </Button>
              </Link>

              {/* ARIA + Live combined indicator */}
              <div className="hidden lg:flex items-center gap-1.5 shrink-0">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{background:'rgba(212,160,23,0.1)', border:'1px solid rgba(212,160,23,0.24)', boxShadow:'inset 0 1px 0 rgba(255,255,255,0.08)'}}>
                  <div className="relative">
                    <Bot className="h-3 w-3" style={{color:'#D4A017'}} />
                    <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 bg-emerald-500 rounded-full border border-[#040813]" />
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wider hidden xl:inline" style={{color:'#D4A017'}}>ARIA</span>
                </div>
                <div
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg"
                  style={{
                    background: online && !isOfflineSession ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.09)',
                    border: online && !isOfflineSession ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(245,158,11,0.22)',
                  }}
                >
                  <span className="relative flex h-1.5 w-1.5">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${online && !isOfflineSession ? 'bg-emerald-400' : 'bg-amber-400'} opacity-50`}></span>
                    <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${online && !isOfflineSession ? 'bg-emerald-500' : 'bg-amber-400'}`}></span>
                  </span>
                  <span className={`text-[8px] font-black uppercase tracking-widest ${online && !isOfflineSession ? 'text-emerald-400' : 'text-amber-300'}`}>
                    {online && !isOfflineSession ? 'Live' : 'Off'}
                  </span>
                </div>
              </div>

              {/* User profile */}
              <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                <div className="hidden 2xl:flex flex-col items-end">
                  <span className="text-[11px] font-semibold text-white/70 truncate max-w-[80px]">
                    {authUser?.displayName?.split(' ')[0] || 'Admin'}
                  </span>
                  <span className="text-[8px] font-bold uppercase tracking-wider" style={{color:'rgba(16,185,129,0.8)'}}>
                    {isGlobalAdmin ? 'Global' : isAdmin ? 'Local' : 'Editor'}
                  </span>
                </div>
                {authUser?.photoURL ? (
                  <Image
                    src={authUser.photoURL}
                    alt="Perfil"
                    width={28}
                    height={28}
                    unoptimized
                    className="h-7 w-7 rounded-full ring-2 ring-white/10 hover:ring-red-500/40 transition-all shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-white/10 shrink-0" style={{background:'rgba(244,0,9,0.15)', color:'#F40009'}}>
                    {authUser?.email?.charAt(0).toUpperCase() || 'A'}
                  </div>
                )}
                <div className="h-5 w-px" style={{background:'rgba(255,255,255,0.08)'}} />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={logOut}
                  aria-label="Cerrar sesión"
                  className="h-8 w-8 text-white/45 hover:text-red-300 hover:bg-red-500/12 rounded-lg transition-all shrink-0 border border-transparent hover:border-red-500/25"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Mobile toggle */}
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden h-9 w-9 rounded-xl text-white/55 hover:text-white hover:bg-white/10 border border-white/10"
                onClick={() => setMobileOpen(open => !open)}
                aria-expanded={mobileOpen}
                aria-controls="mobile-navigation"
                aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <motion.div
              id="mobile-navigation"
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute top-16 left-0 right-0 shadow-2xl shadow-black/60 p-4"
              style={{background:'rgba(7,9,13,0.97)', backdropFilter:'blur(20px)', borderBottom:'1px solid rgba(255,255,255,0.1)'}}
              onClick={e => e.stopPropagation()}
            >
              <nav className="space-y-1" aria-label="Navegación móvil">
                <div className="px-1 pb-3">
                  <PlantContextSwitcher compact />
                </div>
                {visibleNavLinks.map(link => {
                  const isActive = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                        isActive
                          ? 'text-white'
                          : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                      }`}
                      style={isActive ? {background:'rgba(244,0,9,0.12)', border:'1px solid rgba(244,0,9,0.2)'} : {}}
                    >
                      <span className={isActive ? 'text-[#F40009]' : 'text-white/30'}>{link.icon}</span>
                      {link.label}
                    </Link>
                  );
                })}
                <Link href="/portal" target="_blank" className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-white/40 hover:text-white/70 hover:bg-white/5 transition-all">
                  <ExternalLink className="h-4 w-4 text-white/25" />
                  Portal del Colaborador
                </Link>
                <Link href="/kiosko" target="_blank" className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-white/40 hover:text-amber-400 hover:bg-amber-500/10 transition-all">
                  <HardHat className="h-4 w-4 text-amber-500/50" />
                  Kiosko de EPP
                </Link>
              </nav>

              <div className="mt-4 pt-4 flex items-center justify-between gap-4" style={{borderTop:'1px solid rgba(255,255,255,0.06)'}}>
                <div className="flex items-center gap-3 min-w-0">
                  {authUser?.photoURL ? (
                    <Image
                      src={authUser.photoURL}
                      alt="Perfil"
                      width={36}
                      height={36}
                      unoptimized
                      className="h-9 w-9 rounded-full ring-2 ring-white/10"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-full flex items-center justify-center font-bold ring-2 ring-white/10 text-sm" style={{background:'rgba(244,0,9,0.15)', color:'#F40009'}}>
                      {authUser?.email?.charAt(0).toUpperCase() || 'A'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white/80 truncate">{authUser?.displayName || 'Admin'}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{color:'rgba(16,185,129,0.7)'}}>{isGlobalAdmin ? 'Global' : isAdmin ? 'Local' : 'Editor'}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={logOut} className="text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg shrink-0 text-xs">
                  <LogOut className="h-4 w-4 mr-1.5" />
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
