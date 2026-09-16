"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, User, Shield, MapPin, X, Menu } from "lucide-react";
import { useState, useEffect, useRef } from "react";

export default function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside tap
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const navItems = [
    { href: "/dashboard", label: "Routes", icon: <MapPin className="w-5 h-5" /> },
    { href: "/profile", label: "Profile", icon: <User className="w-5 h-5" /> },
  ];

  return (
    <header className="sticky top-0 z-50 bg-slate-800/80 backdrop-blur-xl border-b border-slate-700">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="bg-gradient-to-br from-green-400 to-emerald-500 p-1.5 sm:p-2 rounded-lg">
            <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">HerWay</h1>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-4">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}
              className={`px-3 py-1.5 rounded-lg transition text-sm font-medium ${pathname === item.href ? "bg-green-500/20 text-green-400" : "text-gray-300 hover:text-white"}`}>
              {item.label}
            </Link>
          ))}
          <button onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition text-sm">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </nav>

        {/* Mobile hamburger */}
        <div className="md:hidden" ref={menuRef}>
          <button onClick={() => setMenuOpen(!menuOpen)} className="p-2 hover:bg-slate-700 rounded-lg transition touch-manipulation">
            {menuOpen ? <X className="w-6 h-6 text-white" /> : <Menu className="w-6 h-6 text-white" />}
          </button>
          {menuOpen && (
            <div className="absolute right-4 top-14 w-52 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 transition touch-manipulation ${pathname === item.href ? "bg-green-500/10 text-green-400" : "text-gray-300 hover:bg-slate-700"}`}>
                  {item.icon} {item.label}
                </Link>
              ))}
              <button onClick={() => signOut({ callbackUrl: "/login" })}
                className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 transition touch-manipulation border-t border-slate-700">
                <LogOut className="w-5 h-5" /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
