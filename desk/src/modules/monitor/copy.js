/**
 * MONITOR — every word on the desktop, verbatim from Shae (v4 brief). Nothing
 * here may be embellished: no numbers, outcomes or names that aren't below.
 * Anything illustrative says so on screen.
 */

import { COPY as RECEIPT } from '../printer/receipt.js';

export const APPS = Object.freeze({
    // v9: the home app is "Hello" (welcome.js: hello, what this is, the map). Its id and route stay 'readme' (#monitor/readme).
    readme: Object.freeze({ dock: 'start here', title: 'Hello', log: 'the map' }),
    walk: Object.freeze({ dock: 'walk.py', title: 'walk.py — 2019', log: 'walk.py — 2019' }),
    dot: Object.freeze({ dock: 'Catch The Dot', title: 'Catch The Dot', log: 'Catch The Dot' }),
    mlx: Object.freeze({ dock: 'MLX', title: 'MLX', log: 'MLX' }),
    apple: Object.freeze({ dock: 'Apple', title: 'Apple', log: 'the locked window — Apple' }),
    trash: Object.freeze({ dock: 'Trash', title: 'Trash', log: 'self-improvement — in the trash' })
});

export const WALK = Object.freeze({
    command: '$ python walk.py',
    caption: 'At 16 I met Geometric Brownian Motion and was sceptical. Real-world data didn\'t satisfy its assumptions.',
    standIn: 'a random walk, standing in for the original script',
    /** What the stand-in did — a description of the drawing, not a claim about the original. */
    output: (paths) => `${paths} paths from one start`
});

export const MLX = Object.freeze({
    line: 'Filing against a framework I depend on at work, and can actually go and change.',
    why: 'Most ML tooling assumes moving data to and from the accelerator is the expensive part, and a lot of framework design exists to hide that cost. Take the assumption away and a surprising amount of received wisdom stops being true.',
    illustrative: 'illustrative',
    lanes: Object.freeze({
        copy: Object.freeze({ name: 'most frameworks', cpu: 'CPU memory', gpu: 'GPU memory', toGpu: 'copy to GPU', compute: 'compute', back: 'copy back' }),
        unified: Object.freeze({ name: 'MLX on Apple silicon', memory: 'one shared memory', cpu: 'CPU', gpu: 'GPU', compute: 'compute' })
    }),
    done: 'done'
});

export const APPLE = Object.freeze({
    role: 'Software Engineer, Apple · 2025 –',
    line: 'I can\'t show you this one.',
    small: 'Most of what I\'ve learnt here about making it has had nothing to do with engineering.'
});

export const TRASH = Object.freeze({
    count: '1 item',
    folder: 'self-improvement/',
    question: 'can a model get reliably better without a human in the loop?',
    running: 'running locally · no cloud',
    fans: 'fans',
    max: 'max',
    progress: 'progress'
});

/** Handwritten, on paper (typed in Shae Hand). */
export const THREADS = Object.freeze({
    dot: Object.freeze({ line: 'Nobody asked for that one either.', label: 'the intern project', to: '#box/apple-intern' }),
    mlx: Object.freeze({ line: 'Caring what a model costs to run: the same instinct, on a microcontroller.', label: 'the breadboard', to: '#bench/eeg' }),
    phone: Object.freeze({ line: '', label: 'the phone', to: '#bench/phone' })
});

export const TRASH_NOTE = 'Tried it on my laptop, no cloud. Impossible, even on the beefiest desktop Mac.';

/**
 * "Hello" (v9, welcome.js + map.js): the home app, on the screen from the
 * first frame — one tall page in three window-high parts. Part 2 is Shae's
 * own (v9.2, below); the rest is draft — Shae to edit. No facts beyond the
 * brief; the email is the receipt's (printer/receipt.js COPY), so the two can
 * never disagree. Nothing here is set in Shae's hand: the page is print.
 */

const EMAIL = RECEIPT.contacts.find(([label]) => label === 'email') ?? ['email', 'shaeantoine@gmail.com', 'mailto:shaeantoine@gmail.com'];

export const WELCOME = Object.freeze({
    /** Part 1, what the room sees: the photo and Shae's own words. */
    clickMe: 'Click me!',
    photo: 'A photo of Shae, smiling, holding a takeaway coffee in front of a flower-covered shopfront.',
    /** Up close only, under part 1; and at the foot of part 2 (on to the map). */
    scroll: 'scroll',
    /**
     * Part 2: VERBATIM FROM SHAE (2026-10-04) — these three paragraphs, in
     * this order, word for word; the only change is typographic apostrophes
     * (’ for '). Not to be edited, shortened, added to or reworded except by
     * Shae. Phones get the same words ("click" included: Shae wrote it).
     */
    about: Object.freeze({
        paragraphs: Object.freeze([
            'This is my personal website. While I’ve included the usual stuff like work experience, I wanted to give it an extra spark.',
            'This website is a model of my real desk. Most items on the desk are clickable and represent real aspects of my working life. You might find hardware projects, sticky notes, news articles or apps. They all can be interacted with in unique ways. I encourage you to click around and be curious!',
            'I’ve provided a map on the next page.'
        ])
    })
});

/**
 * Part 3, the map (map.js): the line drawing of the desk with its six labels,
 * and "Short on time?". (v8's bio and how-to strip are gone: part 2 says
 * what the site is, in Shae's words.)
 */
export const MAP = Object.freeze({
    kicker: 'A MAP OF MY DESK',
    /** v8's page copy, kept for reference (unused: part 2 now introduces the desk in Shae's own words). */
    bio: 'I make software. Before that I backed student-founded startups, was CTO of an education non-profit, and interned at Amazon, Deloitte and Apple. Everything on this desk is a piece of my work and life.',
    short: Object.freeze({
        title: 'SHORT ON TIME?',
        work: Object.freeze({ label: 'My work history', value: 'the photo box →', to: '#box' }),
        email: Object.freeze({ label: 'Email me', value: EMAIL[1], href: EMAIL[2] }),
        more: Object.freeze({ label: 'LinkedIn, GitHub', value: 'Before you go →', to: '#printer' })
    }),
    /**
     * The six labels, in the landscape page's reading order (the left column
     * top to bottom, then the right). Only the name is shown (Shae: a name
     * like "My working life" "is totally fine, we don't need more than
     * that"); `object` names the thing it points at, for screen readers only.
     * `to` is where the label (its leader, its drawn object) goes.
     */
    labels: Object.freeze([
        Object.freeze({ id: 'badge', to: '#badge', name: 'My day job', object: 'the badge' }),
        Object.freeze({ id: 'bench', to: '#bench', name: 'Hardware I’ve built', object: 'the workbench' }),
        Object.freeze({ id: 'printer', to: '#printer', name: 'Say hello', object: 'the printer' }),
        Object.freeze({ id: 'screen', to: '#monitor/now', name: 'What I’m up to', object: 'this screen' }),
        Object.freeze({ id: 'box', to: '#box', name: 'My working life', object: 'the photo box' }),
        Object.freeze({ id: 'papers', to: '#paper', name: 'My research', object: 'the papers' })
    ]),
    here: 'You are here'
});
