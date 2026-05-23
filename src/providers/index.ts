/**
 * Provider abstraction. Picks the right parser/observer based on hostname.
 *
 * All providers expose the same surface (a constructible observer with
 * `start`/`stop`/`refresh`, plus `selectorHealth` and `forwardClick`), so the
 * content script can stay source-agnostic.
 */

import {
  forwardClick as ambossForwardClick,
  selectorHealth as ambossHealth,
} from '../amboss/parser';
import { AmbossObserver } from '../amboss/observer';
import {
  forwardClick as nbmeForwardClick,
  selectorHealth as nbmeHealth,
} from '../nbme/parser';
import { NbmeObserver } from '../nbme/observer';
import type { ParsedExplanation, ParsedQuestion } from '../types';
import {
  forwardClick as uworldForwardClick,
  selectorHealth as uworldHealth,
} from '../uworld/parser';
import { UWorldObserver } from '../uworld/observer';

type Listeners = {
  onQuestion?: (q: ParsedQuestion) => void;
  onExplanation?: (e: ParsedExplanation) => void;
};

export interface Provider {
  name: 'uworld' | 'amboss' | 'nbme';
  createObserver: (l: Listeners) => UWorldObserver | AmbossObserver | NbmeObserver;
  selectorHealth: () => { ok: boolean; missing: string[] };
  forwardClick: (letter: string) => boolean;
}

const UWORLD: Provider = {
  name: 'uworld',
  createObserver: (l) => new UWorldObserver(l),
  selectorHealth: uworldHealth,
  forwardClick: uworldForwardClick,
};

const AMBOSS: Provider = {
  name: 'amboss',
  createObserver: (l) => new AmbossObserver(l),
  selectorHealth: ambossHealth,
  forwardClick: ambossForwardClick,
};

const NBME: Provider = {
  name: 'nbme',
  createObserver: (l) => new NbmeObserver(l),
  selectorHealth: nbmeHealth,
  forwardClick: nbmeForwardClick,
};

/** Pick a provider for the given hostname, or null if it's not a match. */
export function providerForHost(host: string): Provider | null {
  if (host.endsWith('.uworld.com') || host === 'uworld.com') return UWORLD;
  if (host.endsWith('.amboss.com') || host === 'amboss.com') return AMBOSS;
  // NBME exam delivery runs on starttest.com. The content script is set up
  // with `all_frames: true` because the actual question lives inside the
  // `ElementDisplayFrame` iframe (itd.aspx); the parent and child are both
  // on starttest.com, so a single host match catches both. Frames without
  // an `.ITSStem` simply parse to null and stay silent.
  if (host.endsWith('.starttest.com') || host === 'starttest.com') return NBME;
  return null;
}
