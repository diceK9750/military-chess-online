import type { ReactNode } from 'react';
export function CommandDeck({ children }: { children: ReactNode }) {
  return <div className="command-deck" role="region" aria-label="軍議操作"><div className="command-title">軍議操作 <small>COMMAND</small></div>{children}</div>;
}
