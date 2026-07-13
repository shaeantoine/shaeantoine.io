import { on, emit } from '../util/EventBus.js';
import { STATES } from '../state/states.js';
import { getSlot } from '../data/zones.js';

/**
 * DOM overlay only — never touches Three.js objects directly. Reacts to
 * 'state:changed': shows/populates itself from the focused slot's
 * `skins[mode].sidebar` data on FOCUSED, hides on any other state.
 */
export class Sidebar {
    constructor(rootEl) {
        this.root = rootEl;
        this.root.innerHTML = `
            <button class="sidebar-close" type="button" aria-label="Close">close ×</button>
            <div class="sidebar-content"></div>
        `;
        this.contentEl = this.root.querySelector('.sidebar-content');
        this.root.querySelector('.sidebar-close').addEventListener('click', () => {
            emit('ui:sidebarClosed', {});
        });

        on('state:changed', ({ state, mode, selectedSlotId }) => {
            if (state === STATES.FOCUSED && selectedSlotId) {
                this._populate(getSlot(selectedSlotId).skins[mode]);
                this._open();
            } else {
                this._close();
            }
        });
    }

    _populate(skin) {
        const timeline = (skin.sidebar.timeline || [])
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
            <h2>${skin.sidebar.title}</h2>
            <p class="sidebar-subtitle">${skin.sidebar.subtitle}</p>
            ${timeline}
        `;
    }

    _open() {
        this.root.hidden = false;
        requestAnimationFrame(() => this.root.classList.add('open'));
    }

    _close() {
        this.root.classList.remove('open');
    }
}
