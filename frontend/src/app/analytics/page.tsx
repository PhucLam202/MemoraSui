'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ClayCard } from '@/components/shared/ClayCard';
import { fetchApi, formatSui } from '@/lib/api-client';
import { loadWalletSessionFromStorage } from '@/lib/wallet-session';
import { 
  BarChart3, 
  TrendingUp, 
  Zap, 
  Globe, 
  Activity, 
  MousePointer2,
  Calendar,
  Layers,
  ArrowRight
} from 'lucide-react';

type FeeSummary = {
  totalFee: string;
  feeByDay: Array<{ date: string; totalFee: string }>;
};

type ActivitySummary = {
  txCountByDay: Array<{ date: string; count: number }>;
};

type ProtocolSummary = {
  topProtocols: Array<{ protocol: string; count: number }>;
};

// --- Sophisticated Data Viz Components ---

const AreaChart = ({ data, color, label }: { data: { x: string, y: number }[], color: string, label: string }) => {
  if (data.length === 0) return <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>No data points available</div>;

  const height = 180;
  const width = 500;
  const padding = 20;
  
  const maxY = Math.max(...data.map(d => d.y), 1) * 1.2;
  const points = data.map((d, i) => ({
    x: (i / (data.length - 1 || 1)) * (width - padding * 2) + padding,
    y: height - ((d.y / maxY) * (height - padding * 2) + padding)
  }));
  const firstPoint = points[0] ?? { x: padding, y: height - padding };
  const lastPoint = points[points.length - 1] ?? firstPoint;

  const pathData = `M ${firstPoint.x} ${firstPoint.y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
  const areaData = `${pathData} L ${lastPoint.x} ${height} L ${firstPoint.x} ${height} Z`;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        
        {/* Grid Lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(p => (
          <line 
            key={p} 
            x1={padding} 
            y1={padding + (height - padding * 2) * p} 
            x2={width - padding} 
            y2={padding + (height - padding * 2) * p} 
            stroke="var(--border-color)" 
            strokeDasharray="4 4" 
            strokeOpacity="0.5"
          />
        ))}

        {/* Area */}
        <path d={areaData} fill={`url(#grad-${label})`} />
        
        {/* Line */}
        <path 
          d={pathData} 
          fill="none" 
          stroke={color} 
          strokeWidth="3" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          style={{ filter: `drop-shadow(0px 4px 6px ${color}44)` }} 
        />

        {/* Points */}
        {points.map((p, i) => (
          <g key={i} className="chart-point-group">
            <circle cx={p.x} cy={p.y} r="4" fill="var(--white)" stroke={color} strokeWidth="2" />
            <circle cx={p.x} cy={p.y} r="10" fill={color} fillOpacity="0" className="point-hover-trigger" />
          </g>
        ))}
      </svg>
      <style jsx>{`
        .chart-point-group:hover circle {
           r: 6;
           stroke-width: 3;
        }
        .point-hover-trigger { cursor: pointer; }
      `}</style>
    </div>
  );
};

export default function AnalyticsPage() {
  const session = loadWalletSessionFromStorage();
  const walletAddress = session?.address ?? null;
  const networkName = 'testnet';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fees, setFees] = useState<FeeSummary | null>(null);
  const [activity, setActivity] = useState<ActivitySummary | null>(null);
  const [protocols, setProtocols] = useState<ProtocolSummary | null>(null);

  useEffect(() => {
    async function load() {
      if (!walletAddress) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [feeData, activityData, protocolData] = await Promise.all([
          fetchApi<FeeSummary>(`/analytics/wallets/${walletAddress}/fees`, { network: networkName }),
          fetchApi<ActivitySummary>(`/analytics/wallets/${walletAddress}/activity`, { network: networkName }),
          fetchApi<ProtocolSummary>(`/analytics/wallets/${walletAddress}/protocols`, { network: networkName }),
        ]);
        setFees(feeData);
        setActivity(activityData);
        setProtocols(protocolData);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load analytics.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [walletAddress, networkName]);

  const totalTx = useMemo(() => (activity?.txCountByDay ?? []).reduce((sum, item) => sum + item.count, 0), [activity]);
  
  const feeSeries = useMemo(() => 
    (fees?.feeByDay ?? []).slice(-10).map(f => ({ x: f.date, y: parseFloat(f.totalFee) / 1e9 })), 
    [fees]
  );
  
  const activitySeries = useMemo(() => 
    (activity?.txCountByDay ?? []).slice(-10).map(a => ({ x: a.date, y: a.count })), 
    [activity]
  );

  return (
    <MainLayout activePath="/analytics">
      <div className="analytics-shell" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)', width: '100%' }}>
        <header className="page-header" style={{ marginBottom: 'var(--spacing-md)' }}>
           <div className="header-badge">REAL-TIME INSIGHTS</div>
           <h1 className="hero-title" style={{ fontSize: '3.5rem', marginBottom: '12px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>On-Chain Analytics</h1>
           <p className="hero-subtitle" style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', maxWidth: '600px' }}>Comprehensive breakdown of your network footprint and gas economy.</p>
        </header>

        {error && (
          <ClayCard variant="flat" className="error-card">
            <Zap size={20} /> <span>{error}</span>
          </ClayCard>
        )}

        <div className="stats-row">
           <div className="stat-glass-card">
              <div className="stat-icon pink"><Activity /></div>
              <div className="stat-info">
                 <span className="label">Total Activity</span>
                 <h2 className="value">{loading ? '...' : totalTx} <small>Transactions</small></h2>
                 <div className="trend positive">Live Tracking Enabled</div>
              </div>
           </div>
           <div className="stat-glass-card">
              <div className="stat-icon green"><TrendingUp /></div>
              <div className="stat-info">
                 <span className="label">Gas Utilization</span>
                 <h2 className="value">{loading ? '...' : formatSui(fees?.totalFee)}</h2>
                 <div className="trend">Across {activity?.txCountByDay?.length || 0} active days</div>
              </div>
           </div>
           <div className="stat-glass-card">
              <div className="stat-icon blue"><Layers /></div>
              <div className="stat-info">
                 <span className="label">Protocol Reach</span>
                 <h2 className="value">{loading ? '...' : protocols?.topProtocols?.length || 0} <small>Protocols</small></h2>
                 <div className="trend">Deep ecosystem integration</div>
              </div>
           </div>
        </div>

        <section className="main-viz-split">
           <div className="charts-column">
              <ClayCard padding="lg" className="viz-card">
                 <div className="card-header">
                    <h3><Activity size={18} /> Transaction Velocity</h3>
                    <div className="pill-selector">
                       <span className="active">DAILY</span><span>WEEKLY</span>
                    </div>
                 </div>
                 <div className="chart-canvas">
                    <AreaChart data={activitySeries} color="#7BAE7F" label="activity" />
                 </div>
              </ClayCard>

              <ClayCard padding="lg" className="viz-card">
                 <div className="card-header">
                    <h3><TrendingUp size={18} /> Gas Efficiency</h3>
                    <div className="pill-selector">
                       <span className="active">SUI BURNT</span>
                    </div>
                 </div>
                 <div className="chart-canvas">
                    <AreaChart data={feeSeries} color="#5E8C61" label="fees" />
                 </div>
              </ClayCard>
           </div>

           <div className="leaderboard-column">
              <ClayCard padding="lg" className="viz-card leaderboard">
                 <header className="card-header">
                    <h3><Globe size={18} /> Protocol Leaderboard</h3>
                    <p>Ranked by interaction frequency</p>
                 </header>
                 
                 <div className="leaderboard-list">
                    {loading ? (
                       [1,2,3,4,5].map(i => <div key={i} className="shimmer-row" />)
                    ) : (protocols?.topProtocols ?? []).length === 0 ? (
                       <div className="empty-state">No protocol data found for this wallet.</div>
                    ) : (protocols?.topProtocols ?? []).map((item, idx) => (
                       <div key={item.protocol} className="leaderboard-item">
                          <div className="rank">#{idx + 1}</div>
                          <div className="proto-icon">{item.protocol.split('::').pop()?.charAt(0)}</div>
                          <div className="proto-meta">
                             <div className="name">{item.protocol.split('::').pop()}</div>
                             <div className="addr">{item.protocol.slice(0, 18)}...</div>
                          </div>
                          <div className="proto-count">
                             <span className="val">{item.count}</span>
                             <span className="unit">TXS</span>
                          </div>
                       </div>
                    ))}
                 </div>

                 <button className="full-report-btn">
                    Generate Full Report <ArrowRight size={16} />
                 </button>
              </ClayCard>
           </div>
        </section>
      </div>

      <style jsx>{`
        .analytics-shell {
          display: flex;
          flex-direction: column;
          gap: 40px;
          animation: fadeIn 0.8s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .header-badge {
          display: inline-block;
          background: var(--matcha-highlight);
          color: var(--matcha-accent);
          padding: 6px 14px;
          border-radius: 99px;
          font-size: 0.75rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          margin-bottom: 16px;
        }

        .hero-title { font-size: 3.5rem; line-height: 1.1; margin-bottom: 12px; }
        .hero-subtitle { font-size: 1.25rem; color: var(--text-secondary); max-width: 600px; }

        .stats-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }

        .stat-glass-card {
           background: rgba(255, 255, 255, 0.6);
           backdrop-filter: blur(12px);
           border: 1px solid rgba(255, 255, 255, 0.4);
           padding: 32px;
           border-radius: 32px;
           display: flex;
           align-items: center;
           gap: 24px;
           box-shadow: 0 10px 30px rgba(0,0,0,0.02);
           transition: transform 0.3s ease;
        }
        .stat-glass-card:hover { transform: translateY(-5px); }

        .stat-icon {
           width: 64px;
           height: 64px;
           border-radius: 20px;
           display: flex;
           align-items: center;
           justify-content: center;
           background: white;
           box-shadow: 0 8px 20px rgba(0,0,0,0.05);
        }
        .stat-icon.pink { color: #eb4d4b; }
        .stat-icon.green { color: #6ab04c; }
        .stat-icon.blue { color: #22a6b3; }

        .stat-info .label { font-size: 0.85rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; }
        .stat-info .value { font-size: 1.75rem; font-weight: 800; margin: 4px 0; }
        .stat-info .value small { font-size: 0.9rem; color: var(--text-secondary); font-weight: 500; }
        .stat-info .trend { font-size: 0.75rem; font-weight: 600; color: var(--matcha-accent); }

        .main-viz-split {
           display: grid;
           grid-template-columns: 1.5fr 1fr;
           gap: 32px;
        }

        .charts-column { display: flex; flex-direction: column; gap: 32px; }

        .viz-card { border: none; box-shadow: 0 20px 40px rgba(0,0,0,0.03); border-radius: 40px !important; }

        .card-header { display: flex; justify-content: space-between; align-items: center; marginBottom: 32px; }
        .card-header h3 { display: flex; alignItems: center; gap: 10px; font-size: 1.25rem; }

        .pill-selector { background: var(--matcha-bg); padding: 4px; border-radius: 12px; display: flex; gap: 4px; }
        .pill-selector span { padding: 6px 12px; border-radius: 9px; font-size: 0.7rem; font-weight: 700; cursor: pointer; color: var(--text-secondary); }
        .pill-selector span.active { background: var(--white); color: var(--matcha-accent); box-shadow: 0 2px 8px rgba(0,0,0,0.05); }

        .chart-canvas { padding: 10px 0; }

        .leaderboard-list { display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px; }
        .leaderboard-item {
           display: flex;
           align-items: center;
           gap: 16px;
           padding: 16px;
           background: var(--matcha-bg);
           border-radius: 20px;
           transition: transform 0.2s ease;
        }
        .leaderboard-item:hover { transform: scale(1.02); background: white; box-shadow: 0 10px 20px rgba(0,0,0,0.03); }

        .rank { font-weight: 900; color: var(--matcha-secondary); font-size: 0.9rem; min-width: 30px; }
        .proto-icon { width: 36px; height: 36px; background: var(--matcha-primary); color: white; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 800; }
        .proto-meta { flex: 1; }
        .proto-meta .name { font-weight: 700; font-size: 0.95rem; }
        .proto-meta .addr { font-size: 0.7rem; color: var(--text-secondary); font-family: var(--font-mono); }
        
        .proto-count { text-align: right; display: flex; flex-direction: column; }
        .proto-count .val { font-weight: 800; color: var(--matcha-accent); }
        .proto-count .unit { font-size: 0.6rem; font-weight: 700; color: var(--text-secondary); }

        .full-report-btn {
           width: 100%;
           padding: 16px;
           border-radius: 20px;
           background: var(--text-primary);
           color: white;
           font-weight: 700;
           display: flex;
           align-items: center;
           justify-content: center;
           gap: 10px;
           transition: opacity 0.2s;
        }
        .full-report-btn:hover { opacity: 0.9; }

        .shimmer-row { height: 68px; background: var(--matcha-bg); border-radius: 20px; animation: pulse 1.5s infinite; }
        @keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }

        @media (max-width: 1200px) {
           .main-viz-split { grid-template-columns: 1fr; }
           .stats-row { grid-template-columns: 1fr; }
           .hero-title { font-size: 2.5rem; }
        }
      `}</style>
    </MainLayout>
  );
}
