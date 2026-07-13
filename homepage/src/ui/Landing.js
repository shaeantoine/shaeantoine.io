import { GameOfLife } from './GameOfLife.js';

/**
 * The photo/bio splash screen shown on load, covering the canvas until
 * dismissed. Purely presentational — doesn't touch WorldStateMachine or
 * EventBus, since the globe underneath is already loading/rotating
 * regardless of whether this is visible. Dismissed only by an explicit
 * click (the "here" link in the footer), not by scroll/swipe, so there's
 * exactly one way in.
 */
export class Landing {
    constructor(rootEl) {
        this.root = rootEl;
        this.dismissed = false;

        this.lifeCanvas = this.root.querySelector('.landing-life');
        this.gameOfLife = this.lifeCanvas ? new GameOfLife(this.lifeCanvas) : null;

        this._onEnterClick = this._onEnterClick.bind(this);
        this._onTransitionEnd = this._onTransitionEnd.bind(this);

        this.root.addEventListener('transitionend', this._onTransitionEnd);

        const enterButton = this.root.querySelector('.landing-explore');
        enterButton?.addEventListener('click', this._onEnterClick);
    }

    /** Re-shows the landing overlay — called from the "return" control in the globe view. */
    show() {
        if (!this.dismissed) return;
        this.dismissed = false;
        this.root.hidden = false;
        if (!this.gameOfLife && this.lifeCanvas) {
            this.gameOfLife = new GameOfLife(this.lifeCanvas);
        }
        // Force a layout flush so the browser paints the dismissed state
        // once before the class removal below transitions away from it.
        this.root.getBoundingClientRect();
        this.root.classList.remove('landing--dismissed');
    }

    _onEnterClick() {
        this._dismiss();
    }

    _onTransitionEnd() {
        if (!this.dismissed) return;
        this.root.hidden = true;
        this.gameOfLife?.dispose();
        this.gameOfLife = null;
    }

    _dismiss() {
        if (this.dismissed) return;
        this.dismissed = true;
        this.root.classList.add('landing--dismissed');
    }
}
