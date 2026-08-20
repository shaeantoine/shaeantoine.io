import { on } from './shared/EventBus.js';
import { validateWork } from './content/schema.js';
import { firstWork } from './content/works/first-work.js';
import { createFragmentState } from './state/fragmentState.js';
import { FirstArtwork } from './artwork/FirstArtwork.js';
import { renderPiece } from './ui/PieceView.js';

const work = validateWork(firstWork);

const canvas = document.getElementById('artwork-canvas');
const fragmentEl = document.getElementById('fragment');
const enterButton = document.getElementById('enter-piece');
const pieceEl = document.getElementById('piece');

const fragmentState = createFragmentState(work.fragments);
const artwork = new FirstArtwork(canvas);

on('artwork:interact', ({ targetId }) => {
    const fragment = fragmentState.reveal(targetId);
    if (!fragment) return;
    fragmentEl.textContent = fragment.text;
    fragmentEl.hidden = false;
});

function enterPiece() {
    artwork.setVisible(false);
    canvas.hidden = true;
    fragmentEl.hidden = true;
    enterButton.hidden = true;
    renderPiece(pieceEl, work);
    pieceEl.hidden = false;
    requestAnimationFrame(() => pieceEl.classList.add('visible'));
}

enterButton.addEventListener('click', enterPiece);
