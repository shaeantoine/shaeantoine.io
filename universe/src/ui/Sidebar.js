import { on, emit } from '../util/EventBus.js';
import { STATES } from '../state/states.js';
import { getBody, getSkin } from '../data/universe.js';

/**
 * DOM overlay only — never touches Three.js objects directly. Reacts to
 * 'state:changed': populates itself from a flat `{title, subtitle,
 * timeline}` content object — a planet's own `content` on PLANET_FOCUSED,
 * or a country's `skins[mode].sidebar` on SLOT_FOCUSED — and hides on any
 * other state.
 */
export class Sidebar {
    constructor(rootEl) {
        this.root = rootEl;
        this.root.innerHTML = `
            <button class="sidebar-close" type="button" aria-label="Close">close ×</button>
            <div class="sidebar-content"></div>
        `;
        this.contentEl = this.root.querySelector('.sidebar-content');
        this.isOpen = false;
        this.root.querySelector('.sidebar-close').addEventListener('click', () => {
            emit('ui:sidebarClosed', {});
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.isOpen) emit('ui:sidebarClosed', {});
        });

        on('state:changed', ({ state, mode, selectedBodyId, selectedSlotId }) => {
            if (state === STATES.PLANET_FOCUSED && selectedBodyId) {
                this._populate(getBody(selectedBodyId).content);
                this._open();
            } else if (state === STATES.SLOT_FOCUSED && selectedSlotId) {
                this._populate(getSkin(selectedSlotId, mode).sidebar);
                this._open();
            } else {
                this._close();
            }
        });
    }

    _populate(content) {
        const timeline = (content.timeline || [])
            .map(
                (entry) => `
                <div class="timeline-entry">
                    <span class="timeline-period">${entry.period}</span>
                    <p>${entry.text}</p>
                </div>
            `
            )
            .join('');

        this.contentEl.innerHTML = `
            <h2>${content.title}</h2>
            <p class="sidebar-subtitle">${content.subtitle}</p>
            ${timeline}
        `;
    }

    _open() {
        this.isOpen = true;
        this.root.hidden = false;
        requestAnimationFrame(() => this.root.classList.add('open'));
    }

    _close() {
        this.isOpen = false;
        this.root.classList.remove('open');
    }
}
