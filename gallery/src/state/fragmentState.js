/**
 * Tracks which of a Work's fragments have been revealed by interaction.
 */
export function createFragmentState(fragments) {
    const revealed = new Set();

    return {
        reveal(targetId) {
            const fragment = fragments.find((f) => f.targetId === targetId);
            if (!fragment) return null;
            revealed.add(targetId);
            return fragment;
        },
        revealedCount() {
            return revealed.size;
        },
        hasRevealedAll() {
            return revealed.size === fragments.length;
        }
    };
}
