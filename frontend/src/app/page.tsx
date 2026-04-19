'use client';

import React from 'react';
import Link from 'next/link';
import { ClayButton } from '@/components/shared/ClayButton';
import { ClayCard } from '@/components/shared/ClayCard';
import { ClayBadge } from '@/components/shared/ClayBadge';
import { Wallet, Activity, Zap, Shield, ArrowRight } from 'lucide-react';

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--matcha-bg)' }}>
      {/* Top Navbar */}
      <nav style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '80px',
        backgroundColor: 'rgba(244, 248, 242, 0.8)',
        backdropFilter: 'blur(24px)',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 var(--spacing-xl)',
        zIndex: 1000,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ 
            width: '40px', 
            height: '40px', 
            backgroundColor: 'var(--matcha-primary)', 
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            boxShadow: 'var(--shadow-outer)'
          }}>
            <Wallet size={20} />
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--matcha-accent)', fontFamily: 'var(--font-heading)' }}>Matcha</h1>
        </div>
        
        <div className="desktop-only" style={{ display: 'flex', gap: '32px', fontWeight: 600, color: 'var(--text-secondary)' }}>
          <a href="#features" style={{ transition: 'color 0.2s', textDecoration: 'none' }} onMouseOver={(e) => e.currentTarget.style.color = 'var(--text-primary)'} onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}>Features</a>
          <a href="#community" style={{ transition: 'color 0.2s', textDecoration: 'none' }} onMouseOver={(e) => e.currentTarget.style.color = 'var(--text-primary)'} onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}>Community</a>
        </div>

        <Link href="/dashboard" style={{ textDecoration: 'none' }}>
          <ClayButton variant="primary" size="md">
            Enter App <ArrowRight size={18} style={{ marginLeft: '4px' }} />
          </ClayButton>
        </Link>
      </nav>

      {/* Main Content */}
      <main style={{ paddingTop: '120px', paddingBottom: '80px', maxWidth: '1200px', margin: '0 auto', paddingLeft: 'var(--spacing-xl)', paddingRight: 'var(--spacing-xl)' }}>
        
        {/* Hero Section */}
        <section style={{ 
          display: 'grid', 
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', 
          gap: '64px',
          alignItems: 'center',
          marginBottom: '120px'
        }} className="hero-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
            <div style={{ marginBottom: '16px' }}>
              <ClayBadge variant="accent" size="sm">Powered by AI & Sui</ClayBadge>
            </div>
              <h2 style={{ fontSize: 'clamp(3rem, 5vw, 4.5rem)', lineHeight: 1.1, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                The Sanctuary <br />
                For Your <span style={{ color: 'var(--matcha-primary)' }}>Sui Assets</span>
              </h2>
            </div>
            
            <p style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: '500px' }}>
              Aethera AI intelligently manages your portfolio, tracks gas fees, and provides deep on-chain insights across the Sui ecosystem—all beautifully sculpted for performance.
            </p>
            
            <div style={{ display: 'flex', gap: '16px', marginTop: '16px', flexWrap: 'wrap' }}>
              <Link href="/dashboard" style={{ textDecoration: 'none' }}>
                <span style={{ display: 'inline-block', padding: '0 8px' }}>
                  <ClayButton size="lg">
                    Launch App
                  </ClayButton>
                </span>
              </Link>
              <ClayButton variant="ghost" size="lg">View Demo</ClayButton>
            </div>
          </div>

          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ 
              position: 'relative',
              width: '100%', 
              maxWidth: '500px', 
              aspectRatio: '1', 
              backgroundColor: 'var(--white)',
              borderRadius: '48px',
              padding: '24px',
              boxShadow: 'var(--shadow-outer)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              zIndex: 10
            }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src="/hero-image.png" 
                  alt="Assistant 3D Character" 
                  style={{ width: '100%', height: '100%', objectFit: 'contain', zIndex: 1 }} 
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.parentElement!.innerHTML = '<div style="width: 60%; height: 60%; background-color: var(--matcha-primary); border-radius: 30%; transform: rotate(15deg); box-shadow: var(--shadow-outer);"></div>';
                  }}
                />
            </div>
            <div style={{ position: 'absolute', top: '-10%', right: '-10%', width: '250px', height: '250px', backgroundColor: 'var(--matcha-highlight)', borderRadius: '50%', filter: 'blur(60px)', zIndex: 0 }} />
            <div style={{ position: 'absolute', bottom: '-10%', left: '-10%', width: '200px', height: '200px', backgroundColor: 'var(--matcha-secondary)', borderRadius: '50%', filter: 'blur(50px)', opacity: 0.5, zIndex: 0 }} />
          </div>
        </section>

        {/* Feature Highlights */}
        <section id="features" style={{ marginBottom: '80px' }}>
          <div style={{ textAlign: 'center', marginBottom: '64px' }}>
            <div style={{ marginBottom: '24px' }}>
              <ClayBadge variant="secondary" size="md">Deep Insights</ClayBadge>
            </div>
            <h3 style={{ fontSize: '3.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Sculpted for you.</h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '32px' }}>
            <ClayCard padding="lg" style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%' }}>
              <div style={{ width: '64px', height: '64px', backgroundColor: 'var(--matcha-highlight)', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--matcha-primary)' }}>
                <Activity size={32} />
              </div>
              <div>
                <h4 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '12px' }}>Predictive Analytics</h4>
                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>Track your on-chain journey with intelligent categorization and historical data analysis for all protocols.</p>
              </div>
            </ClayCard>

            <ClayCard padding="lg" style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%' }}>
              <div style={{ width: '64px', height: '64px', backgroundColor: 'var(--matcha-highlight)', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--matcha-primary)' }}>
                <Zap size={32} />
              </div>
              <div>
                <h4 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '12px' }}>Smart Gas Refuel</h4>
                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>Never run out of gas. Visualize network fee expenditures and optimize your Sui token usage seamlessly.</p>
              </div>
            </ClayCard>

            <ClayCard padding="lg" style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%' }}>
              <div style={{ width: '64px', height: '64px', backgroundColor: 'var(--matcha-highlight)', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--matcha-primary)' }}>
                <Shield size={32} />
              </div>
              <div>
                <h4 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '12px' }}>Object Management</h4>
                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>Deep dive into your NFTs and assets with a beautiful, tactile interface that prioritizes clarity and security.</p>
              </div>
            </ClayCard>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer style={{ backgroundColor: '#E1EBE0', padding: '64px var(--spacing-xl)', textAlign: 'center' }}>
         <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div style={{ width: '32px', height: '32px', backgroundColor: 'var(--matcha-primary)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
            <Wallet size={16} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--matcha-accent)' }}>Matcha Portfolio</h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>© 2024 Matcha. Carved from the sanctuary.</p>
      </footer>

      <style jsx>{`
        @media (max-width: 960px) {
          .desktop-only {
            display: none !important;
          }
          .hero-grid {
            grid-template-columns: 1fr !important;
            text-align: center;
          }
          .hero-grid > div:first-child {
            align-items: center;
          }
        }
      `}</style>
    </div>
  );
}
