/**
 * MnemoClima's agent actions (doc 149): the manifest's declaration passes the HOST's own check,
 * every declared action has its handler (a declared action without one would be offered to
 * agents and fail), and the limit it declares is the one the handler enforces.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { agentActionsFromManifest } from '../../../infinity-edition/src/main/plugins/cartridgeAgentActions';
import { HAZARD_KINDS, HAZARDS_LIMIT, SPAN_YEARS, TABS, ZOOMS } from './climaAgent';

const root = join(__dirname, '..', '..');
const manifest = JSON.parse(readFileSync(join(root, 'mnemo-plugin.json'), 'utf8')) as unknown;
const source = readFileSync(join(root, 'src', 'ui', 'climaAgent.ts'), 'utf8');
const block = source.slice(source.indexOf('// agent-actions:begin'), source.indexOf('// agent-actions:end'));
const handlers = [...block.matchAll(/^ {4}(\w+): (?:async )?\(/gm)].map((m) => m[1]);

function declared() {
  const r = agentActionsFromManifest(manifest);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe("MnemoClima's agent actions", () => {
  it("pass the host's check of the manifest", () => {
    const r = agentActionsFromManifest(manifest);
    expect(r.ok ? 'ok' : r.error).toBe('ok');
  });

  it('every declared action has its handler, and no handler is undeclared', () => {
    expect(handlers.length).toBeGreaterThan(5);
    expect([...handlers].sort()).toEqual(declared().map((a) => a.id).sort());
  });

  it('nothing spends credits, and only status, hazards and episodes are reads', () => {
    expect(declared().filter((a) => a.effect === 'spend')).toEqual([]);
    expect(declared().filter((a) => a.effect === 'read').map((a) => a.id).sort()).toEqual(['episodes', 'hazards', 'status']);
  });

  it("the limits and choices it declares are the ones the handlers enforce", () => {
    const hazards = declared().find((a) => a.id === 'hazards')!;
    expect(hazards.params.limit).toMatchObject({ minimum: HAZARDS_LIMIT.min, maximum: HAZARDS_LIMIT.max });
    expect(hazards.params.kind).toMatchObject({ enum: [...HAZARD_KINDS] });
    expect(declared().find((a) => a.id === 'setHazardKind')!.params.kind).toMatchObject({ enum: [...HAZARD_KINDS] });
    expect(declared().find((a) => a.id === 'showTab')!.params.tab).toMatchObject({ enum: [...TABS] });
    const zoom = declared().find((a) => a.id === 'zoomTimeline')!;
    expect(zoom.params.zoom).toMatchObject({ enum: [...ZOOMS] });
    expect(zoom.params.years).toMatchObject({ minimum: SPAN_YEARS.min, maximum: SPAN_YEARS.max });
  });
});
