/**
 * ClimaAgentActions — serves MnemoClima's agent actions (doc 149) while this window is open.
 *
 * A CHILD that renders nothing, never a hook in App: App is mounted on the person's board while
 * the app runs, and a hook added to it breaks the order of its hooks under hot reload. The
 * handlers live in `climaAgent.ts`; this only keeps their view of the app fresh (a ref written
 * every render) and subscribes ONCE.
 *
 * Mounted with the panel, so a single MnemoClima serves from its one window and an exploded
 * board serves from its panel window (the map and the timeline follow through the link).
 */
import { useEffect, useRef } from 'react';
import { inShell, sdk } from './host';
import { climaAgentHandlers, type ClimaAgentContext } from './climaAgent';

export function ClimaAgentActions(props: ClimaAgentContext) {
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    // outside the shell nobody calls (a plain tab, the tests): no subscription, no timer
    if (!inShell()) return;
    if (typeof sdk.onAgentActions !== 'function') {
      // An iframe served an older SDK build: it must not take the window down.
      console.warn('[MnemoClima] this SDK build has no onAgentActions; reload the cartridge to serve agent actions');
      return undefined;
    }
    const sub = sdk.onAgentActions(climaAgentHandlers(() => latest.current));
    sub.ready.catch((err: unknown) => console.warn('[MnemoClima] agent actions not served:', err instanceof Error ? err.message : err));
    return () => sub.off();
  }, []);

  return null;
}
