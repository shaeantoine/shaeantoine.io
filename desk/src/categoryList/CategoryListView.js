import { CATEGORY_LABELS } from '../content/schema.js';

/**
 * String builder for the category-list panel: a heading (the category's
 * display label) plus one row per Work in that category, each linking to
 * its full editorial detail page.
 */
export function buildCategoryListHtml(categoryId, works) {
    const categoryWorks = works.filter((work) => work.category === categoryId);
    const label = CATEGORY_LABELS[categoryId] ?? categoryId;

    const itemsHtml = categoryWorks.map((work) => `
        <a class="category-list-item" href="#/work/${work.id}/read">
            <img class="category-list-item-preview" src="${work.previewImage}" alt="${work.title}" />
            <div class="category-list-item-body">
                <span class="category-list-item-title">${work.title}</span>
                <span class="category-list-item-blurb">${work.blurb}</span>
            </div>
        </a>`).join('');

    return `
        <div class="category-list-header">
            <h2 class="category-list-title">${label}</h2>
            <button class="modal-close" type="button" aria-label="Close">&times;</button>
        </div>
        <div class="category-list-items">
            ${itemsHtml || '<p class="category-list-empty">Nothing here yet.</p>'}
        </div>
    `;
}

/**
 * Renders a category's Work list into `panelEl` and wires the close button.
 */
export function renderCategoryList(panelEl, categoryId, works, { onClose }) {
    panelEl.innerHTML = buildCategoryListHtml(categoryId, works);
    panelEl.querySelector('.modal-close').addEventListener('click', onClose);
}
