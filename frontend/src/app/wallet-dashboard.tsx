'use client';

import { } from 'react';
import {
  useCurrentAccount,
  useCurrentWallet,
  useWalletConnection,
  useWallets,
} from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import {
  type HealthPayload,
  type SuiNetwork,
} from '@sui-portfolio/shared';
import { useWalletAuth } from '@/hooks/use-wallet-auth';

interface WalletDashboardProps {
  appName: string;
  apiBaseUrl: string;
  health: HealthPayload | null;
  initialNetwork: SuiNetwork;
}

function maskAddress(address: string) {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function StatePill({ state }: { state: string }) {
  const normalized = state.toLowerCase();
  const className =
    normalized === 'verified' || normalized === 'connected' || normalized === 'online'
      ? 'pill pill-good'
      : normalized === 'connecting' || normalized === 'signing' || normalized === 'pending' || normalized === 'reconnecting'
        ? 'pill pill-warm'
        : normalized === 'error' || normalized === 'stale' || normalized === 'offline'
          ? 'pill pill-danger'
          : 'pill pill-neutral';

  return <span className={className}>{state}</span>;
}

function WalletConsole({
  appName,
  apiBaseUrl,
  health,
}: WalletDashboardProps) {
  const account = useCurrentAccount();
  const currentWallet = useCurrentWallet();
  const walletConnection = useWalletConnection();
  const wallets = useWallets();

  const {
    session,
    isBusy,
    error,
    syncStatus,
    handleConnect,
    handleDisconnect,
    handleAuthenticate,
  } = useWalletAuth({
    appName,
    apiBaseUrl,
  });

  const connectionState = walletConnection.status;
  const backendNetwork = health?.network ?? 'unknown';

  const sessionStatus = session?.status ?? 'idle';
  const authLabel =
    sessionStatus === 'verified'
      ? 'Verified'
      : sessionStatus === 'signed'
        ? 'Signed locally'
        : sessionStatus === 'stale'
          ? 'Stale session'
          : sessionStatus === 'error'
            ? 'Auth error'
            : 'No auth session';

  return (
      <main className="shell">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Wallet console</p>
            <h1>{appName}</h1>
            <p className="lede">
              Manage your Sui wallet connection, authentication session, and synchronization state.
            </p>
          </div>

          <div className="hero-badges">
            <div className="hero-badge">
              <span>Backend network</span>
              <strong>{backendNetwork}</strong>
            </div>
            <div className="hero-badge">
              <span>Wallet state</span>
              <strong>{connectionState}</strong>
            </div>
            <div className="hero-badge">
              <span>Auth state</span>
              <strong>{authLabel}</strong>
            </div>
          </div>
        </section>

        {error && (
          <div style={{ 
            padding: '16px', 
            backgroundColor: '#fff5f5', 
            border: '1px solid #ffc9c9', 
            borderRadius: '12px',
            color: '#ff6b6b',
            marginBottom: '24px',
            fontSize: '0.875rem'
          }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        <section className="panel panel-split">
          <article className="stack">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Wallet connect</p>
                <h2>Connection Status</h2>
              </div>
              <StatePill state={connectionState} />
            </div>

            <div className="connect-row">
              <ConnectButton />
              <button className="secondary-button" type="button" onClick={handleDisconnect}>
                Disconnect
              </button>
            </div>

            {currentWallet ? (
              <div className="detail-grid">
                <article className="detail-card">
                  <span>Wallet</span>
                  <strong>{currentWallet.name}</strong>
                </article>
                <article className="detail-card">
                  <span>Address</span>
                  <strong>{account ? maskAddress(account.address) : 'No account'}</strong>
                </article>
              </div>
            ) : (
              <p className="muted-copy">
                No wallet connected yet. Choose one from the installed wallet
                list below or use the connect button.
              </p>
            )}

            <div className="wallet-list">
              {wallets.length === 0 ? (
                <div className="empty-state">
                  <strong>No wallets detected</strong>
                  <p>Install a Sui wallet extension and refresh the page.</p>
                </div>
              ) : (
                wallets.map((wallet) => {
                  const primaryAddress = wallet.accounts[0]?.address;

                  return (
                    <button
                      key={wallet.name}
                      className="wallet-card"
                      type="button"
                      onClick={() => {
                        void handleConnect(wallet.name);
                      }}
                    >
                      <div className="wallet-card-head">
                        <div className="wallet-icon">
                          {wallet.icon ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img alt="" src={wallet.icon} />
                          ) : (
                            <span>{wallet.name.slice(0, 1)}</span>
                          )}
                        </div>
                        <div>
                          <strong>{wallet.name}</strong>
                          <span>{primaryAddress ? maskAddress(primaryAddress) : 'No account selected'}</span>
                        </div>
                      </div>
                      <p>
                        {wallet.accounts.length} account{wallet.accounts.length === 1 ? '' : 's'} available
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </article>

          <article className="stack">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Auth session</p>
                <h2>Backend Identity</h2>
              </div>
              <StatePill state={authLabel} />
            </div>

            <div className="auth-card">
              <p>
                Sign a challenge to verify your identity with the backend.
                Verified sessions enable portfolio syncing and AI features.
              </p>
            <div className="auth-actions">
              <button
                className="primary-button"
                type="button"
                disabled={!account || isBusy}
                  onClick={() => {
                    void handleAuthenticate();
                  }}
                >
                  {isBusy ? 'Processing...' : 'Authenticate'}
                </button>
              </div>
            </div>

            <div className="detail-grid">
              <article className="detail-card">
                <span>Session status</span>
                <strong>{authLabel}</strong>
              </article>
              <article className="detail-card">
                <span>Sync status</span>
                <strong>{syncStatus ?? 'Idle'}</strong>
              </article>
              {session?.verifiedAt && (
                <article className="detail-card">
                  <span>Verified at</span>
                  <strong>{new Date(session.verifiedAt).toLocaleDateString()}</strong>
                </article>
              )}
            </div>
          </article>
        </section>

        <style jsx>{`
          .shell {
            max-width: 1200px;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            gap: 32px;
          }

          .hero {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            gap: 48px;
            padding-bottom: 24px;
            border-bottom: 1px solid var(--border-color);
          }

          .hero-copy {
            max-width: 600px;
          }

          .eyebrow {
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--matcha-accent);
            font-weight: 700;
            margin-bottom: 8px;
          }

          h1 {
            font-size: 2.5rem;
            margin-bottom: 12px;
            line-height: 1.1;
          }

          .lede {
            font-size: 1.125rem;
            color: var(--text-secondary);
          }

          .hero-badges {
            display: flex;
            gap: 16px;
          }

          .hero-badge {
            background: var(--white);
            padding: 12px 20px;
            border-radius: 16px;
            box-shadow: var(--shadow-outer);
            display: flex;
            flex-direction: column;
            gap: 4px;
            min-width: 140px;
          }

          .hero-badge span {
            font-size: 0.65rem;
            text-transform: uppercase;
            color: var(--text-secondary);
            font-weight: 600;
          }

          .panel-split {
            display: grid;
            grid-template-columns: 1.5fr 1fr;
            gap: 32px;
          }

          .stack {
            display: flex;
            flex-direction: column;
            gap: 24px;
          }

          .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }

          .pill {
            padding: 6px 14px;
            border-radius: 99px;
            font-size: 0.75rem;
            font-weight: 700;
            text-transform: uppercase;
          }

          .pill-good { background: #e6fcf5; color: #0ca678; }
          .pill-warm { background: #fff9db; color: #f08c00; }
          .pill-danger { background: #fff5f5; color: #f03e3e; }
          .pill-neutral { background: var(--matcha-highlight); color: var(--text-secondary); }

          .connect-row {
            display: flex;
            gap: 12px;
          }

          .secondary-button {
            padding: 0 20px;
            border-radius: 12px;
            border: none;
            cursor: pointer;
            background: var(--white);
            box-shadow: var(--shadow-outer);
            color: #ff6b6b;
            font-weight: 600;
            transition: var(--transition-fast);
          }

          .secondary-button:hover {
            transform: translateY(-2px);
            background: #fff5f5;
          }

          .detail-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
          }

          .detail-card {
            background: var(--matcha-highlight);
            padding: 16px;
            border-radius: 20px;
            box-shadow: var(--shadow-inner);
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .detail-card span {
            font-size: 0.725rem;
            color: var(--text-secondary);
          }

          .wallet-list {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
          }

          .wallet-card {
            background: var(--white);
            padding: 16px;
            border-radius: 20px;
            box-shadow: var(--shadow-outer);
            border: none;
            cursor: pointer;
            text-align: left;
            transition: var(--transition-fast);
          }

          .wallet-card:hover {
            transform: translateY(-4px);
            box-shadow: var(--shadow-hover);
          }

          .wallet-card-head {
            display: flex;
            gap: 12px;
            align-items: center;
            margin-bottom: 12px;
          }

          .wallet-icon {
            width: 40px;
            height: 40px;
            background: var(--matcha-highlight);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }

          .wallet-icon img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .auth-card {
            background: var(--white);
            padding: 24px;
            border-radius: 24px;
            box-shadow: var(--shadow-outer);
          }

          .auth-card p {
            margin-bottom: 24px;
            color: var(--text-secondary);
          }

          .primary-button {
            background: var(--matcha-primary);
            color: white;
            padding: 14px 28px;
            border: none;
            cursor: pointer;
            border-radius: 16px;
            font-weight: 700;
            box-shadow: var(--shadow-outer);
            transition: var(--transition-fast);
          }

          .primary-button:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: var(--shadow-hover);
          }

          .primary-button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          @media (max-width: 960px) {
            .hero {
              flex-direction: column;
              align-items: flex-start;
              gap: 24px;
            }
            .panel-split {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
      </main>
  );
}

export default function WalletDashboard(props: WalletDashboardProps) {
  return <WalletConsole {...props} />;
}
