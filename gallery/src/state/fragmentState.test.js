import { describe, expect, it } from 'vitest';
import { createFragmentState } from './fragmentState.js';

const fragments = [
    { targetId: 'a', text: 'one' },
    { targetId: 'b', text: 'two' }
];

describe('createFragmentState', () => {
    it('returns the matching fragment and marks it revealed', () => {
        const state = createFragmentState(fragments);
        expect(state.reveal('a')).toEqual(fragments[0]);
        expect(state.revealedCount()).toBe(1);
    });

    it('returns null for an unknown targetId without changing revealed count', () => {
        const state = createFragmentState(fragments);
        expect(state.reveal('nope')).toBeNull();
        expect(state.revealedCount()).toBe(0);
    });

    it('re-revealing the same fragment does not double count', () => {
        const state = createFragmentState(fragments);
        state.reveal('a');
        state.reveal('a');
        expect(state.revealedCount()).toBe(1);
    });

    it('hasRevealedAll is true only once every fragment has been revealed', () => {
        const state = createFragmentState(fragments);
        state.reveal('a');
        expect(state.hasRevealedAll()).toBe(false);
        state.reveal('b');
        expect(state.hasRevealedAll()).toBe(true);
    });
});
