import React from 'react';
import { Calendar, Filter, ChevronDown } from 'lucide-react';

interface FilterBarProps {
  onDateChange: (range: string) => void;
  onProtocolChange: (protocol: string) => void;
  activeDateRange: string;
  activeProtocol: string;
}

export const FilterBar: React.FC<FilterBarProps> = ({ 
  onDateChange, 
  onProtocolChange, 
  activeDateRange, 
  activeProtocol 
}) => {
  return (
    <div style={{
      display: 'flex',
      gap: '12px',
      flexWrap: 'wrap',
      marginBottom: '8px'
    }}>
      {/* Date Filter */}
      <div className="filter-dropdown">
        <Calendar size={16} />
        <span>{activeDateRange}</span>
        <ChevronDown size={14} />
        <select 
          value={activeDateRange} 
          onChange={(e) => onDateChange(e.target.value)}
          className="filter-select"
        >
          <option value="Last 7 Days">Last 7 Days</option>
          <option value="Last 30 Days">Last 30 Days</option>
          <option value="Last 90 Days">Last 90 Days</option>
          <option value="All Time">All Time</option>
        </select>
      </div>

      {/* Protocol Filter */}
      <div className="filter-dropdown">
        <Filter size={16} />
        <span>{activeProtocol}</span>
        <ChevronDown size={14} />
        <select 
          value={activeProtocol} 
          onChange={(e) => onProtocolChange(e.target.value)}
          className="filter-select"
        >
          <option value="All Protocols">All Protocols</option>
          <option value="Cetus">Cetus</option>
          <option value="Sui Staking">Sui Staking</option>
          <option value="Direct">Direct</option>
        </select>
      </div>

      <style jsx>{`
        .filter-dropdown {
          position: relative;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background-color: var(--white);
          border-radius: 14px;
          box-shadow: var(--shadow-outer);
          color: var(--text-secondary);
          font-weight: 500;
          font-size: 0.875rem;
          transition: var(--transition-fast);
          cursor: pointer;
        }
        
        .filter-dropdown:hover {
          box-shadow: var(--shadow-hover);
          color: var(--matcha-accent);
        }

        .filter-select {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
};
