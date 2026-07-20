import { on } from '../util/EventBus.js';
import { STATES } from '../state/states.js';

// Hidden whenever a planet/country sidebar is focused — same "don't compete
// with focused panel content" reasoning as ModeToggle/ClusterReturn, just
// applied to the site nav bar instead.
const HIDDEN_STATES = new Set([STATES.PLANET_FOCUSED, STATES.SLOT_FOCUSED]);

/**
 * The site nav bar (name/role). Hidden until the Brief is dismissed — it
 * shouldn't compete with the Brief text on first paint — then persists
 * while navigating the universe, hiding again whenever a planet/country
 * sidebar is open.
 */
export class Masthead {
    constructor(rootEl) {
        this.root = rootEl;
        this.dismissed = false;

        on('brief:dismissed', () => {
            this.dismissed = true;
            this._updateVisibility(STATES.SOLAR_ORBITING);
        });
        on('state:changed', ({ state }) => this._updateVisibility(state));
    }

    _updateVisibility(state) {
        this.root.hidden = !this.dismissed || HIDDEN_STATES.has(state);
    }
}
