/**
 * String builder for the modal-panel's condensed preview: media,
 * title, one line, and a link into the full editorial detail page.
 */
export function buildModalHtml(work) {
    return `
        <img class="modal-preview" src="${work.previewImage}" alt="${work.title}" />
        <div class="modal-body">
            <h2 class="modal-title">${work.title}</h2>
            <p class="modal-blurb">${work.blurb}</p>
            <a class="modal-read-link" href="#/work/${work.id}/read">Read the full piece &rarr;</a>
        </div>
        <button class="modal-close" type="button" aria-label="Close">&times;</button>
    `;
}

/**
 * Renders a Work's modal preview into `panelEl` and wires the close button.
 */
export function renderModal(panelEl, work, { onClose }) {
    panelEl.innerHTML = buildModalHtml(work);
    panelEl.querySelector('.modal-close').addEventListener('click', onClose);
}
