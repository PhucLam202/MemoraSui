'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  LayoutDashboard, 
  History, 
  MessageSquare, 
  BarChart3,
  Boxes,
  Settings, 
  Wallet,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface SidebarItemProps {
  href: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  isCollapsed?: boolean;
}

const SIDEBAR_COLLAPSE_KEY = 'sui-portfolio:sidebar-collapsed';

const SidebarItem = ({ href, label, icon, active, isCollapsed }: SidebarItemProps) => (
  <Link href={href} style={{ width: '100%', textDecoration: 'none' }}>
    <div 
      className={`sidebar-item ${active ? 'active' : ''} ${isCollapsed ? 'collapsed' : ''}`}
      title={isCollapsed ? label : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: isCollapsed ? '0' : '14px',
        padding: isCollapsed ? '12px' : '14px 20px',
        justifyContent: isCollapsed ? 'center' : 'flex-start',
        borderRadius: isCollapsed ? '16px' : '20px',
        color: active ? 'var(--matcha-accent)' : 'var(--text-secondary)',
        fontWeight: active ? 700 : 500,
        transition: 'var(--transition-slow)',
        backgroundColor: active ? 'var(--matcha-highlight)' : 'transparent',
        boxShadow: active ? 'var(--shadow-outer)' : 'none',
        marginBottom: '4px',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      }}
    >
      <div style={{
         display: 'flex',
         alignItems: 'center',
         justifyContent: 'center',
         color: active ? 'var(--matcha-accent)' : 'var(--text-secondary)',
         transition: 'var(--transition-fast)',
         minWidth: '24px',
      }}>
        {icon}
      </div>
      {!isCollapsed && <span style={{ transition: 'opacity 0.3s ease' }}>{label}</span>}
      
      <style jsx>{`
        .sidebar-item:hover {
          background-color: var(--matcha-highlight);
          color: var(--matcha-accent);
          transform: ${isCollapsed ? 'scale(1.05)' : 'translateX(4px)'};
        }
        .sidebar-item:active {
          transform: scale(0.98);
        }
      `}</style>
    </div>
  </Link>
);

export const Sidebar = ({ activePath }: { activePath?: string }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSE_KEY);
    if (stored === 'true') setIsCollapsed(true);
    setIsHydrated(true);
  }, []);

  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem(SIDEBAR_COLLAPSE_KEY, String(newState));
    // Dispatch custom event for MainLayout to listen to
    window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { collapsed: newState } }));
  };

  if (!isHydrated) return <aside style={{ width: '280px' }} />;

  return (
    <aside style={{
      width: isCollapsed ? '88px' : '280px',
      height: '100vh',
      position: 'fixed',
      left: 0,
      top: 0,
      padding: isCollapsed ? 'var(--spacing-xl) 12px' : 'var(--spacing-xl) var(--spacing-md)',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--matcha-bg)',
      borderRight: '1px solid var(--border-color)',
      zIndex: 1000,
      transition: 'width var(--transition-slow), padding var(--transition-slow)',
    }}>
      {/* Header / Logo / Toggle Section */}
      <div style={{ 
        position: 'relative',
        display: 'flex', 
        alignItems: 'center', 
        height: '44px', // Match logo height for absolute centering
        marginBottom: '48px',
        width: '100%'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '14px', 
          paddingLeft: isCollapsed ? '0' : '12px', 
          width: '100%',
          justifyContent: 'flex-start',
          transition: 'padding var(--transition-slow)'
        }}>
          <div style={{ 
            width: '44px', 
            height: '44px', 
            backgroundColor: 'var(--matcha-primary)', 
            borderRadius: '14px',
            boxShadow: 'var(--shadow-outer)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            flexShrink: 0
          }}>
            <Wallet size={24} />
          </div>
          {!isCollapsed && (
            <div style={{ overflow: 'hidden', paddingRight: '40px' }}>
               <h2 style={{ fontSize: '1.25rem', lineHeight: 1, marginBottom: '2px', whiteSpace: 'nowrap' }}>Matcha</h2>
               <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', letterSpacing: '0.05em', fontWeight: 600, whiteSpace: 'nowrap' }}>PORTFOLIO</span>
            </div>
          )}
        </div>

        {/* Small Toggle Button - Vertically centered, perfectly right-aligned */}
        <button 
          onClick={toggleCollapse}
          className="collapse-toggle-mini"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          style={{
            position: 'absolute',
            right: isCollapsed ? '-12px' : '0', // Touches the sidebar border when collapsed, stays within padding when expanded
            top: '50%',
            transform: 'translateY(-50%)',
            width: '32px',
            height: '32px',
            borderRadius: '10px',
            backgroundColor: 'var(--white)',
            boxShadow: 'var(--shadow-outer)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--matcha-accent)',
            border: '1px solid var(--border-color)',
            cursor: 'pointer',
            zIndex: 1001,
            transition: 'var(--transition-slow)',
          }}
        >
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
        <SidebarItem 
          href="/dashboard" 
          label="Dashboard" 
          icon={<LayoutDashboard size={22} />} 
          active={activePath === '/dashboard'} 
          isCollapsed={isCollapsed}
        />
        <SidebarItem 
          href="/activity" 
          label="Activity" 
          icon={<History size={22} />} 
          active={activePath === '/activity'} 
          isCollapsed={isCollapsed}
        />
        <SidebarItem 
          href="/assets" 
          label="Assets" 
          icon={<Boxes size={22} />} 
          active={activePath === '/assets'} 
          isCollapsed={isCollapsed}
        />
        <SidebarItem 
          href="/analytics" 
          label="Analytics" 
          icon={<BarChart3 size={22} />} 
          active={activePath === '/analytics'} 
          isCollapsed={isCollapsed}
        />
        <SidebarItem 
          href="/chat" 
          label="AI Chat" 
          icon={<MessageSquare size={22} />} 
          active={activePath === '/chat'} 
          isCollapsed={isCollapsed}
        />
      </nav>

      {/* Footer Settings */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <SidebarItem 
          href="/settings" 
          label="Settings" 
          icon={<Settings size={22} />} 
          active={activePath === '/settings'} 
          isCollapsed={isCollapsed}
        />
      </div>

      <style jsx>{`
        .collapse-toggle-mini:hover {
          background-color: var(--matcha-highlight) !important;
          transform: scale(1.1);
          color: var(--matcha-primary) !important;
        }
        .collapse-toggle-mini:active {
          transform: scale(0.95);
        }
      `}</style>
    </aside>
  );
};
