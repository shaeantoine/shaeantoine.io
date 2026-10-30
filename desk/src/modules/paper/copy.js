/**
 * PAPER — the words. Verbatim from Shae; nothing here may be added to or
 * "improved". Four documents, top of the stack to the bottom.
 *
 * Covers: the three real front pages are images (src/media/papers, 991 ×
 * 1400 renders of page one). The triangulations paper has no cover render
 * yet, so it is typeset (serif, like a student paper) from the three lines
 * below. To use a real one: put `triangulations-cover.jpg` (A4 portrait) in
 * src/media/papers and set TRIANGULATIONS_COVER_IMAGE to
 * 'papers/triangulations-cover' — nothing else changes. Say where its title
 * sits (titleBand) and its cap height (capPx at 1400 px tall) so the reading
 * distance keeps the title ≥ 14 CSS px.
 *
 * The margin page is the back of each document: ONE page of Shae's hand, never
 * the paper itself.
 */

export const TRIANGULATIONS_COVER_IMAGE = null;

export const PAPERS = Object.freeze({
    triangulations: Object.freeze({
        id: 'triangulations',
        title: 'the triangulations paper', // visit log (the receipt prints it)
        cover: TRIANGULATIONS_COVER_IMAGE
            ? Object.freeze({ image: TRIANGULATIONS_COVER_IMAGE, capPx: 24, titleBand: Object.freeze([0.1, 0.2]) })
            : Object.freeze({
                typeset: Object.freeze({
                    title: 'Experimentally Bounding the Space of Triangulations',
                    lines: Object.freeze(['Supervised by Prof. Jonathan Spreer', 'The University of Sydney']),
                    year: '2024'
                })
            }),
        spokenCover: 'Experimentally Bounding the Space of Triangulations. Supervised by Prof. Jonathan Spreer, The University of Sydney. 2024.',
        line: "Maths isn't meant to be settled by sampling. I sampled anyway, and landed within 94% of theory.",
        note: "A simulation can't prove anything. What it can do is tell you where to point — and knowing which statement is worth the year is most of the difficulty. The other 6% is the finding.",
        figure: Object.freeze({
            label: "illustrative — not the paper's data",
            xAxis: 'triangles',
            yAxis: 'vertices ÷ triangles',
            bound: 'bound'
        })
    }),
    pvsnp: Object.freeze({
        id: 'pvsnp',
        title: 'the P vs NP review',
        cover: Object.freeze({ image: 'papers/p_vs_np-cover', capPx: 24, titleBand: Object.freeze([0.105, 0.17]) }),
        spokenCover: 'P vs NP: An Introduction into Complexity Theory. Shae McKenna, May 2022.',
        line: "We didn't advance the problem. Nobody expected us to.",
        note: "What it taught me was how to read a paper I wasn't yet equipped to read, and to admit which parts I'd only nodded along to.",
        pencil: Object.freeze({ prior: 'My prior: P ≠ NP', loosely: 'held loosely' }),
        thread: Object.freeze({
            to: '#paper/triangulations',
            line: "One by reading, one by simulating. I wouldn't have predicted which taught more.",
            label: 'the triangulations'
        })
    }),
    ansto: Object.freeze({
        id: 'ansto',
        title: 'the ANSTO report',
        cover: Object.freeze({ image: 'papers/ansto_research-cover', capPx: 31, titleBand: Object.freeze([0.3, 0.43]) }),
        spokenCover: 'Automating Radiation Surveillance During Nuclear Reactor Decommissioning Using CORIS360. Supervisor: Dr Balaji Trichy Narayanaswamy. Team members: Chloe Boucher, Shae McKenna, Isaac Ho, Dorie Li.',
        // PLACEHOLDER — facts from the cover only; Shae will supply a better line.
        line: 'A team of four, a CORIS360 camera, and a nuclear reactor being taken apart.'
    }),
    drai: Object.freeze({
        id: 'drai',
        title: 'Paging Dr. AI',
        cover: Object.freeze({ image: 'papers/paging_doctor_ai-cover', capPx: 19, titleBand: Object.freeze([0.4, 0.46]) }),
        spokenCover: 'Paging Dr. AI — The Future of Teaching Professional Judgement for Medicine. Group 2, SCDL1991. Supervisors: Mr Martin Brown, Shae McKenna. School of Medical Science, The University of Sydney.',
        aside: 'co-supervised with Martin Brown',
        line: 'It never made my résumé. It changed my thinking more than anything else here.',
        note: "The learner can't yet referee the answer, and the failure is delayed: a wrong mechanism absorbed now surfaces years later, in front of a patient.",
        thread: Object.freeze({
            to: '#monitor/trash',
            line: "It all comes back to whether a model can tell when it's wrong.",
            label: 'the trash'
        })
    })
});

export const HINTS = Object.freeze({
    stack: 'click a paper or → to pick one up · esc to step back',
    front: 'click to turn it over · ← → for the others · esc to step back',
    notes: 'click to turn it back · ← → for the others · esc to step back',
    thread: 'click the arrow to follow it · ← → · esc to step back'
});

export const LIVE_STACK = 'A stack of four clipped papers. On top: Experimentally Bounding the Space of Triangulations.';
