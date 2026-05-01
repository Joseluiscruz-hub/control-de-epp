"use client";

import { useAuth } from './auth-provider';
import { Button } from './ui/button';
import { LogOut, ShieldCheck, LayoutDashboard, Users, Package, Bot, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: '/empleados', label: 'Empleados', icon: <Users className="h-4 w-4" /> },
  { href: '/inventario', label: 'Inventario', icon: <Package className="h-4 w-4" /> },
];

export function NavBar() {
  const { user: authUser, logOut, isAdmin } = useAuth();
  const pathname = usePathname();

  // No mostrar navbar en el portal público si queremos una experiencia full screen
  if (pathname === '/portal') return null;

  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="h-10 w-10 rounded-2xl bg-[#F40009] flex items-center justify-center shadow-lg shadow-red-200 group-hover:shadow-red-300 transition-all group-hover:scale-110 active:scale-95 group-hover:rotate-3">
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
            <div className="hidden sm:block">
              <span className="font-black text-slate-900 text-lg leading-none block tracking-tighter uppercase">AssetGuard</span>
              <span className="text-[10px] text-[#F40009] font-black tracking-[0.2em] uppercase leading-none mt-1">Coca-Cola FEMSA</span>
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:gap-4">
            {/* Nav links */}
            <nav className="hidden lg:flex items-center bg-gray-100/50 rounded-2xl p-1 gap-1">
                {NAV_LINKS.map(link => {
                  const isActive = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all ${
                        isActive
                          ? 'bg-white text-[#F40009] shadow-md border border-slate-100 scale-105'
                          : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'
                      }`}
                    >
                      <span className={isActive ? 'text-[#F40009]' : 'text-slate-400'}>
                        {link.icon}
                      </span>
                      {link.label}
                    </Link>
                  );
                })}
            </nav>

            {/* Portal Link */}
            <Link href="/portal" target="_blank">
              <Button variant="ghost" size="sm" className="hidden md:flex items-center gap-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl font-medium">
                <ExternalLink className="h-3.5 w-3.5" />
                Portal Usuario
              </Button>
            </Link>

            <div className="h-6 w-px bg-gray-100 mx-1 hidden sm:block" />

            {/* AI status */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-100 rounded-xl">
              <div className="relative">
                <Bot className="h-4 w-4 text-[#F40009]" />
                <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 bg-green-500 rounded-full border border-white" />
              </div>
              <span className="text-[10px] font-black text-[#F40009] uppercase tracking-tight">ARIA AI Activo</span>
            </div>

            {/* User Profile */}
            <div className="flex items-center gap-2 pl-2">
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
                  className="h-8 w-8 rounded-full border-2 border-white shadow-sm ring-1 ring-gray-100"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold border-2 border-white shadow-sm">
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
          </div>
        </div>
      </div>
    </header>
  );
}
