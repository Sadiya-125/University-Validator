/**
 * Shell Component
 *
 * Main application layout with sidebar, top bar, and breadcrumbs.
 * - Left sidebar: navigation menu
 * - Top bar: search (⌘K), system status pill
 * - Breadcrumbs: current location
 * - Main content area: page content
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Database, FileText, Package2, Settings, BarChart3, Menu, X } from "lucide-react";

/**
 * Navigation items in sidebar
 */
const NAV_ITEMS = [
  { href: "/", icon: BarChart3, label: "Overview", exact: true },
  { href: "/validate", icon: FileText, label: "Validate" },
  { href: "/records", icon: Database, label: "Records" },
  { href: "/batches", icon: Package2, label: "Batches" },
  { href: "/sources", icon: Activity, label: "Sources" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

interface ShellProps {
  children: React.ReactNode;
}

export function Shell({ children }: ShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Check if we're on API routes or special pages
  if (pathname?.startsWith("/api") || pathname?.startsWith("/dev/")) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen bg-bg text-text">
      {/* Sidebar */}
      <aside
        className={`
          transition-all duration-200 bg-bg-secondary border-r border-border
          ${sidebarOpen ? "w-64" : "w-20"}
          flex flex-col overflow-hidden
        `}
      >
        {/* Logo */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <Link href="/" className="flex items-center gap-2 font-display font-bold text-lg">
            {sidebarOpen && "UniValidator"}
            {!sidebarOpen && <div className="w-8 h-8 bg-primary rounded-md" />}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-2 px-2">
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.exact ? pathname === item.href : pathname?.startsWith(item.href);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`
                      flex items-center gap-3 px-3 py-2 rounded-md transition-colors
                      ${
                        isActive
                          ? "bg-primary/20 text-primary font-medium"
                          : "text-text-secondary hover:bg-bg-tertiary"
                      }
                    `}
                    title={item.label}
                  >
                    <item.icon size={20} className="flex-shrink-0" />
                    {sidebarOpen && <span>{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Toggle Button */}
        <div className="border-t border-border p-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md hover:bg-bg-tertiary transition-colors text-text-secondary"
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-bg-secondary border-b border-border px-6 py-4 flex items-center justify-between h-16 flex-shrink-0">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-2 text-sm text-text-secondary">
            <Link href="/" className="hover:text-text transition-colors">
              Home
            </Link>
            {pathname !== "/" && (
              <>
                <span className="text-text-tertiary">/</span>
                <span className="text-text">{pathname?.split("/")[1] || "Page"}</span>
              </>
            )}
          </nav>

          {/* Search and Status */}
          <div className="flex items-center gap-4">
            {/* Search */}
            <button
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className="flex items-center gap-2 px-3 py-2 bg-bg rounded-md border border-border text-text-secondary hover:text-text transition-colors text-sm"
              aria-label="Open search"
            >
              <span>⌘K</span>
            </button>

            {/* Status Pill */}
            <div className="flex items-center gap-2 px-3 py-2 bg-success/10 rounded-md text-success text-sm font-medium">
              <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
              Operational
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>

      {/* Search Modal (placeholder) */}
      {isSearchOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-modal flex items-start justify-center pt-20"
          onClick={() => setIsSearchOpen(false)}
        >
          <div
            className="bg-bg-secondary rounded-lg shadow-lg w-96 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="text"
              placeholder="Search institutions, batches, runs..."
              className="w-full px-4 py-2 bg-bg rounded-md border border-border text-text placeholder-text-tertiary focus:outline-none focus:border-primary"
              autoFocus
            />
            <div className="mt-4 text-center text-text-secondary text-sm">
              Press ESC to close
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
