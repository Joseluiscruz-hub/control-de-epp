"use client";

import { useAuth } from './auth-provider';
import { Button } from './ui/button';
import { LogOut, ShieldCheck, LayoutDashboard, Users, Package, Bot } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: '/empleados', label: 'Empleados', icon: <Users className="h-4 w-4" /> },
  { href: '/inventario', label: 'Inventario', icon: <Package className="h-4 w-4" /> },
];

export function NavBar() {
  const { user, logOut } = useAuth();
  const pathname = usePathname();

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center shadow-md shadow-indigo-200 group-hover:shadow-lg group-hover:shadow-indigo-300 transition-shadow">
              <ShieldCheck className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <span className="font-bold text-gray-900 text-sm leading-none block">Control de EPP</span>
              <span className="text-[10px] text-gray-400 leading-none">Seguridad Industrial</span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            {/* Nav links */}
            <nav className="hidden md:flex items-center bg-gray-50 rounded-xl p-1 gap-0.5">
              {NAV_LINKS.map(link => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-white text-indigo-700 shadow-sm border border-gray-100'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-white/70'
                    }`}
                  >
                    <span className={isActive ? 'text-indigo-600' : 'text-gray-400'}>
                      {link.icon}
                    </span>
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            {/* AI badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-lg">
              <Bot className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-xs font-semibold text-indigo-700">ARIA IA</span>
              <span className="h-1.5 w-1.5 bg-green-400 rounded-full animate-pulse" />
            </div>

            {/* User + logout */}
            <div className="flex items-center gap-2 pl-3 border-l border-gray-100">
              {user?.photoURL && (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Usuario'}
                  className="h-7 w-7 rounded-full border-2 border-indigo-100"
                />
              )}
              <span className="text-xs text-gray-600 font-medium hidden lg:block max-w-32 truncate">
                {user?.displayName || user?.email}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={logOut}
                title="Cerrar sesión"
                className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
