/**
 * The box's words, verbatim from the fact-checked copy.
 * Never add facts here. Every string is on the object it describes: a print's
 * LINE on its bottom border, its BACK on the back, the DATE in the back's corner.
 */

export const LID_LABEL = 'kept';

/** The opening card at the front of the file, and the end card at the back. */
export const INTRO = Object.freeze({ text: 'things I kept · start at the front' });
export const END = Object.freeze({
    // From Shae's hackathons entry ("what the hell is worthy of solving").
    question: 'what the hell is worthy of solving?',
    arrow: '→ now',
    route: '#monitor/now'
});

/**
 * The three chapter dividers: the year on the tab, one line on the face —
 * each taken from Shae's own text (the Amazon, Apple intern and NextGen
 * entries). Do not embellish.
 */
export const CHAPTERS = Object.freeze({
    'ch-2022': Object.freeze({ year: '2022', line: 'A maths degree, and my first job was selling toys.' }),
    'ch-2023': Object.freeze({ year: '2023', line: 'No computer science degree, so I had something to prove.' }),
    'ch-2024': Object.freeze({ year: '2024', line: 'I wanted to be part of the process of creation.' })
});

/**
 * Threads: a line under a print's back note that hands off to something else
 * in the room, in Shae's hand with an arrow. Fact-checked connection lines —
 * verbatim. `to` is a box item (lifted from wherever it is) or a route.
 */
export const THREADS = Object.freeze({
    amazon: Object.freeze({ line: 'Both were about learning to make a case to people who could say no.', label: 'the harbour', to: 'deloitte' }),
    'apple-intern': Object.freeze({ line: 'Building what nobody asked for is the instinct I trust most in myself.', label: 'the monitor', to: '#monitor/dot' }),
    trophy: Object.freeze({ line: 'A weekend build and a pitch deck fail in exactly the same way.', label: 'the memos', to: 'puralink' }),
    // v4: on the back of the ITE clipping, across the room to the paper stack (the paper module's #paper/drai).
    ite: Object.freeze({ line: "I've been on the wrong end of an unevenly distributed education.", label: 'Paging Dr. AI', to: '#paper/drai' })
});

export const PRINTS = Object.freeze({
    amazon: {
        line: 'Day one in tech. Full suit. It is not the done thing.',
        back: "They put me on toys. With a maths degree, that felt a bit disappointing. It wasn't — the team changed how I think about growing, and keeping, a great service. The mentorship was fantastic.",
        date: 'Amazon · Dec 2022'
    },
    'apple-intern': {
        line: 'The only intern in ANZ, no CS degree, and a project that was entirely mine.',
        back: "No PM to talk to users for me, nobody to do telemetry or QA. If I didn't know something, I taught myself or talked someone into helping. I liked the freedom.",
        date: 'Apple · Jul 2023'
    },
    trophy: {
        line: 'I rarely had the best code. I could tell a hell of a story.',
        back: 'What I loved was how little they cared about the technology. It was the story, the problem, the thing you decided was worth pursuing before a line was written.',
        date: 'SafetyCulture Accelerate · 2023'
    },
    deloitte: {
        line: 'Sensitive data, little room for error — and, with a group of PhDs, a way to use GANs anyway.',
        back: "Deloitte was my third internship, and I'd prepared to smash through the goals they set me. Halfway through, I'd met a brilliant group of maths and economics PhDs, and we started working out how new technology could serve financial clients who couldn't afford to be wrong.",
        date: 'Deloitte · Dec 2023'
    },
    stanford: {
        line: 'By the end, I was pitching to panels of investors at Stanford.',
        back: null,
        date: 'Stanford · 2024'
    }
});

export const ITE = Object.freeze({
    headline: 'The law student reshaping how disadvantaged teens reach university',
    meta: 'Forbes Australia · 30 Under 30 · 1 Dec 2025',
    sticky: 'No money, no team when we started. By the time I left: AWS funding, and engineers.'
});

export const MEMOS = Object.freeze({
    puralink: {
        // Typed on the memo itself (the scan): read out for screen readers.
        typed: 'PURA LINK. NextGen Ventures Investment Memorandum. Shae McKenna. November 10th, 2024.',
        redPen: '10 Nov 2024',
        sticky: 'If a deal got too popular, I lost interest. I led our first two.',
        clipping: {
            headline: 'Puralink dredges up $2.3m seed round for autonomous pipe robot',
            meta: 'Forbes Australia · 17 Sep 2025',
            standfirst: '…the brains behind Puralink have closed an oversubscribed seed round led by Peak XV.',
            gap: '+311 days'
        }
    },
    fluency: {
        typed: 'Fluency. NextGen Ventures Investment Memorandum. Shae McKenna. December 10th, 2024.',
        redPen: '10 Dec 2024',
        sticky: null,
        clipping: {
            headline: 'Early Facebook investors back Australian AI that replaces consultants',
            meta: 'Australian Financial Review · 9 Feb 2026',
            setLine: 'Fluency — backed by Accel and DST Global Partners',
            gap: '+426 days'
        }
    }
});

/**
 * What the receipt lists for each item (ctx.visit.log) — the THINGS, not
 * their dates (the v1 receipt read "Apple · Jul 2023"). These strings are the
 * room's shared visit-log titles: the printer prints them verbatim, so they
 * must match the brief exactly.
 */
export const TITLES = Object.freeze({
    amazon: 'the suit — Amazon, 2022',
    'apple-intern': 'the intern project — Apple, 2023',
    trophy: 'the trophy — SafetyCulture, 2023',
    deloitte: 'the harbour — Deloitte, 2023',
    stanford: 'Stanford, 2024',
    ite: 'ITE, in Forbes',
    puralink: 'the Pura Link memo',
    fluency: 'the Fluency memo'
});

/** The sr-only mirror of whatever side of an item is facing the visitor. */
export function liveText(id, turned) {
    if (id === 'intro') return `An index card, handwritten: ${INTRO.text}`;
    if (id === 'end') return `An index card, handwritten: ${END.question} An arrow, and: now. It leads to the note on the monitor.`;
    if (CHAPTERS[id]) return `A divider in the box, tabbed ${CHAPTERS[id].year}. Written on it: ${CHAPTERS[id].line}`;
    const print = PRINTS[id];
    if (print) {
        if (!turned) return `A photo. Written on the border: ${print.line}${badgeText(id)}`;
        const thread = THREADS[id] ? ` Underneath: ${THREADS[id].line} An arrow to ${THREADS[id].label}.` : '';
        return print.back ? `The back: ${print.back}${thread} ${print.date}.` : `The back: ${print.date}.`;
    }
    if (id === 'ite') {
        return turned
            ? `The back of the clipping, written on in ink: ${THREADS.ite.line} An arrow to ${THREADS.ite.label}, the paper.`
            : `A newspaper clipping: ${ITE.headline}. ${ITE.meta}. A sticky note on it: ${ITE.sticky}${badgeText(id)}`;
    }
    const memo = MEMOS[id];
    if (!memo) return '';
    if (!turned) {
        const sticky = memo.sticky ? ` A sticky note: ${memo.sticky}` : '';
        return `A memo: ${memo.typed} In red pen: ${memo.redPen}.${sticky} A newspaper clipping is clipped behind it.${badgeText(id)}`;
    }
    const c = memo.clipping;
    const extra = c.standfirst ?? c.setLine;
    return `The clipping: ${c.headline}. ${c.meta}. ${extra} In red pen beside the date: ${c.gap}.`;
}

/**
 * v4: the ID badge clipped to a keepsake (layout.js BADGES), as the screen
 * reader hears it — the badge's own printed words (src/content/works/work.js),
 * nothing more.
 */
export const BADGE_TEXT = Object.freeze({
    amazon: 'Amazon, Growth Intern, 2022',
    'apple-intern': 'Apple, SWE Intern, 2023',
    deloitte: 'Deloitte, Quant Analyst, 2023',
    ite: 'Inspire Tomorrow, CTO, 2024',
    puralink: 'NextGen Ventures, Investment Principal, 2024'
});
function badgeText(id) {
    return BADGE_TEXT[id] ? ` An ID badge is clipped to its corner: ${BADGE_TEXT[id]}.` : '';
}
