import { brief } from '../data/universe.js';
import { emit } from '../util/EventBus.js';

// Concept cards feel condescending if they linger — these are short beats,
// not reading time. Blurb timings are longer since there's actual text to
// read before the curtain starts pulling back.
const INTRO_NEXT_DELAY_MS = 1000;
const CURTAIN_FADE_DELAY_MS = 1800;
const CURTAIN_FADE_DURATION_MS = 3000;

/**
 * The landing sequence: a few one-sentence "concept" cards (solid black, no
 * scene visible or reachable), then the Brief blurb. The curtain starts
 * fading on the last intro card — "You can click on the links..." — so the
 * already-live 3D scene unveils behind the reader while that card is still
 * up, rather than waiting for the blurb. The blurb step carries a fallback
 * trigger for the same fade (see _scheduleCurtainReveal) for the "Skip"
 * path, which jumps straight past the intro cards, and ends with an
 * "explore" CTA alongside its existing inline links.
 *
 * Deliberately NOT a WorldStateMachine state — this is presentational
 * sequencing with exactly two exits, both already-existing events:
 * 'ui:navigateToTarget' (an inline link) and 'brief:dismissed' (explore, or
 * any link). WorldStateMachine and every other module are none the wiser
 * about how many steps it took to get there.
 */
export class BriefOverlay {
    constructor(rootEl) {
        this.root = rootEl;
        this.dismissed = false;
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        this.content = this.root.querySelector('.landing-content');
        this.curtain = this.root.querySelector('.landing-curtain');

        this.steps = [...brief.intro.map((text) => ({ type: 'intro', text })), { type: 'blurb' }];
        this.stepIndex = 0;
        this._timers = [];

        this._onTransitionEnd = this._onTransitionEnd.bind(this);
        this.content.addEventListener('transitionend', this._onTransitionEnd);
    }

    /** Shows the sequence (over the already-visible, already-animating 3D scene) — called once on first visit. */
    show() {
        this.root.hidden = false;
        this._renderStep();
    }

    _delay(ms) {
        return this.reducedMotion ? 0 : ms;
    }

    _revealAfterDelay(el, ms) {
        this._timers.push(setTimeout(() => el.classList.add('intro-affordance--visible'), this._delay(ms)));
    }

    // Idempotent (classList.add is a no-op if already applied), so it's safe
    // to call from both the last intro card and the blurb step — whichever
    // fires first wins, and the other is a harmless no-op re-application.
    _scheduleCurtainReveal() {
        this._timers.push(
            setTimeout(() => this.curtain.classList.add('landing-curtain--faded'), this._delay(CURTAIN_FADE_DELAY_MS))
        );
    }

    _clearTimers() {
        this._timers.forEach(clearTimeout);
        this._timers = [];
    }

    _renderStep() {
        this._clearTimers();
        this.content.innerHTML = '';
        const step = this.steps[this.stepIndex];
        if (step.type === 'intro') {
            this._renderIntroStep(step);
        } else {
            this._renderBlurbStep();
        }
    }

    _renderIntroStep(step) {
        const sentence = document.createElement('p');
        sentence.className = 'intro-sentence';
        sentence.textContent = step.text;
        this.content.appendChild(sentence);

        const actions = document.createElement('div');
        actions.className = 'intro-actions intro-affordance';

        const next = document.createElement('button');
        next.type = 'button';
        next.className = 'intro-next';
        next.textContent = 'Next';
        next.addEventListener('click', () => this._advance());
        actions.appendChild(next);

        const skip = document.createElement('button');
        skip.type = 'button';
        skip.className = 'intro-skip';
        skip.textContent = 'Skip';
        skip.addEventListener('click', () => this._skipIntro());
        actions.appendChild(skip);

        this.content.appendChild(actions);
        this._revealAfterDelay(actions, INTRO_NEXT_DELAY_MS);

        // Last intro card (currently "You can click on the links...") starts
        // the curtain fade so the scene unveils in the background while it's
        // still on screen, rather than making the reader wait for the blurb.
        if (this.stepIndex === this.steps.length - 2) this._scheduleCurtainReveal();
    }

    _renderBlurbStep() {
        for (const paragraph of brief.paragraphs) {
            const p = document.createElement('p');
            p.className = 'brief-paragraph';
            for (const run of paragraph) {
                if (run.target) {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'brief-link';
                    button.textContent = run.text;
                    button.addEventListener('click', () => this._onLinkClick(run.target));
                    p.appendChild(button);
                } else {
                    p.appendChild(document.createTextNode(run.text));
                }
            }
            this.content.appendChild(p);
        }

        const explore = document.createElement('button');
        explore.type = 'button';
        explore.className = 'explore-button';
        explore.textContent = 'explore the universe';
        explore.addEventListener('click', () => this._dismiss());
        this.content.appendChild(explore);

        // Fallback for the "Skip" path, which jumps straight here without
        // ever rendering the last intro card that normally triggers this.
        this._scheduleCurtainReveal();
    }

    _advance() {
        if (this.stepIndex >= this.steps.length - 1) return;
        this.stepIndex += 1;
        this._renderStep();
    }

    _skipIntro() {
        this.stepIndex = this.steps.length - 1;
        this._renderStep();
    }

    _onLinkClick(target) {
        emit('ui:navigateToTarget', target);
        this._dismiss();
    }

    _onTransitionEnd(event) {
        if (event.target !== this.content || !this.dismissed) return;
        this.content.hidden = true;
    }

    _dismiss() {
        if (this.dismissed) return;
        this.dismissed = true;
        this._clearTimers();
        this.content.classList.add('brief-content--dismissed');
        this.curtain.classList.add('landing-curtain--dismissed');
        emit('brief:dismissed', {});
        // Reduced motion strips the CSS transition (see landing.css), so
        // 'transitionend' never fires — hide directly instead of relying on
        // _onTransitionEnd, or the dismissed content stays keyboard-focusable.
        if (this.reducedMotion) this.content.hidden = true;
    }
}
