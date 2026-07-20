import { getBody } from '../data/universe.js';

/**
 * The large hover label that replaces the masthead's essays/projects/contact
 * links (which all routed to the same body) as the way a visitor learns
 * what a planet is about. Invisible and out of the way at rest — the whole
 * point is not to clutter the solar view the way an always-on per-planet
 * label did — then snaps large and bright the instant a planet is hovered.
 *
 * Purely a dumb setter, same shape as PlanetLoader/ZoneLoader's own
 * setHovered: driven directly from main.js's 'input:hover' handler (the one
 * place that already knows "is a body hovered while SOLAR_ORBITING"),
 * rather than subscribing to the EventBus itself.
 */
export class PlanetCaption {
    constructor(rootEl) {
        this.root = rootEl;
        this.labelEl = this.root.querySelector('.planet-caption-label');
        this.hoveredBodyId = null;
    }

    setHovered(bodyId) {
        if (bodyId === this.hoveredBodyId) return;
        this.hoveredBodyId = bodyId;

        if (!bodyId) {
            this.root.classList.remove('planet-caption--visible');
            return;
        }
        this.labelEl.textContent = getBody(bodyId).label;
        this.root.classList.add('planet-caption--visible');
    }
}
