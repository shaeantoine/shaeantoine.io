/**
 * The books on the desk that are actually somebody's books.
 *
 * Order here is order along the row, left to right. Only the titles that land
 * outside the monitor's occlusion get lettered — see content/bookRow.js — so
 * the list runs out before the row does and the hidden middle stays plain.
 *
 * ON LEGIBILITY, because it sets what this list is for. At the establishing
 * shot a spine is about 18 px wide on a 900px-tall viewport and 32 px on a
 * 1600px one. Type running down it tops out around 11 px of cap height for a
 * short title and about 3 px for the longest one here. Short titles are
 * squintable on a large display; long ones read as lettering rather than as
 * words. That is still worth doing — spine type is most of what separates a
 * row of books from a row of coloured boxes — but nobody is going to read
 * "One Day in the Life of Ivan Denisovich" off the shelf.
 *
 * `author` is the spine form, not the full credit: surnames, because that is
 * what fits and what real spines print. Full names live in the comments where
 * they differ.
 */
export const BOOKS = [
    { title: 'Scarcity', author: 'Mullainathan' },
    { title: 'Shadows of the Mind', author: 'Penrose' },
    { title: 'Thus Spoke Zarathustra', author: 'Nietzsche' },
    { title: 'War and Peace', author: 'Tolstoy' },
    { title: 'The Glass Bead Game', author: 'Hesse' },
    { title: "Ender's Game", author: 'Card' },
    { title: 'I Have No Mouth and I Must Scream', author: 'Ellison' },
    { title: 'Gödel, Escher, Bach', author: 'Hofstadter' },
    { title: 'Radical Uncertainty', author: 'Kay' },
    { title: 'The Digital Delusion', author: 'Horvath' },
    { title: 'Make Something Wonderful', author: 'Steve Jobs' },
    { title: 'Demons', author: 'Dostoevsky' },
    { title: 'Don Quixote', author: 'Cervantes' },
    { title: 'One Day in the Life of Ivan Denisovich', author: 'Solzhenitsyn' },
    { title: 'Collected Works', author: 'Edgar Allan Poe' },
    { title: "The Emperor's New Mind", author: 'Penrose' },
    { title: 'Poor Economics', author: 'Banerjee & Duflo' },
    { title: 'The Muqaddimah', author: 'Ibn Khaldun' },
    { title: 'End Times', author: 'Turchin' },
    { title: 'Cosmos', author: 'Sagan' }
];
