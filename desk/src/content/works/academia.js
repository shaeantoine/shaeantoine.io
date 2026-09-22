/*
This file is a repository of research.

WHY IT IS A SEPARATE OBJECT AND NOT MORE SCREEN ENTRIES. A software entry gets
two short paragraphs, because that is all the monitor renders before
screenCanvas.js stops mid-thought. These are the other register: work where the
answer was not mine to choose and the interesting part is what the method could
and could not settle, which does not fit in two paragraphs. So they get their
own object on the desk — a stapled run of printouts — and their own paper stock
in pageCanvas.js, paginated so a piece can run as long as its argument needs.
The medium is doing the sorting, which is the whole premise of the desk.

SUPERVISOR ATTRIBUTION IS LOAD-BEARING. These name real academics. The
pairings below follow the résumé: Prof. Jonathan Spreer supervised the
triangulations work, Prof. Alexander Fish supervised the P vs NP review. If
that is ever edited, check it against the source rather than against memory —
getting a named third party's credit wrong on a public page is the one
mistake here that costs somebody other than me.
*/

export const triangulations = {
    id: 'academia-triangulations',
    title: 'Experimentally Bounding the Space of Triangulations',
    date: '2024-06-01',
    previewImage: '/previews/academia-triangulations.png',
    blurb: 'Monte Carlo as a way of doing mathematics, supervised by Prof. Jonathan Spreer.',
    previewAspect: 'square',
    category: 'academia',
    connections: [
        {
            workId: 'academia-p-vs-np',
            sentence: 'The other piece of undergraduate research I did was the opposite method on an adjacent question.'
        }
    ],
    editorial: {
        credit: 'Shae McKenna · supervised by Prof. Jonathan Spreer, University of Sydney',
        body: [
            "I wrote Monte Carlo simulations to investigate properties of triangulations, and got empirical bounds landing within 94% of the theoretical estimates. Supervised by Professor Jonathan Spreer at the University of Sydney.",
            "This is the purest piece of curiosity on my CV and I want to defend the method rather than the result, because the method is the part people find strange. Mathematics is not supposed to be settled by sampling. A simulation cannot prove anything — run it a billion times and you have a billion instances, not a theorem. What it can do is tell you where to point, and that turns out to be most of the difficulty. The space of triangulations is enormous and largely unintuitive, and the honest bottleneck in a lot of combinatorial work is not proving the statement, it is knowing which statement is worth the year.",
            "So what the 94% actually means is: the theory and the experiment agree closely enough that neither is obviously wrong, and the remaining 6% is where the interesting question lives. That gap is not an error bar to be driven down. It's the finding.",
            "I loved this and I want to say why without dressing it up. It is the only work I have done where nobody needed the answer. Nothing shipped, no ticket volume moved, no partner committed resources. It was a question that was interesting because it was interesting, and the experience of spending months on one of those is, I think, something you should do at least once before you spend a career on problems that justify themselves commercially.",
            "It also permanently changed how I think about computation. I write simulations now as a first move rather than a last resort — including in contexts where nobody expects one, like sanity-checking a retrieval system's behaviour before trusting an evaluation of it."
        ],
        stat: { value: '94%', label: 'agreement between the simulated bounds and the theoretical estimates' },
        quote: null,
        bio: null,
        links: []
    }
};

export const pVsNp = {
    id: 'academia-p-vs-np',
    title: 'The State of P vs NP',
    date: '2024-03-01',
    previewImage: '/previews/academia-p-vs-np.png',
    blurb: 'A literature review with a team of five, supervised by Prof. Alexander Fish.',
    previewAspect: 'tall',
    category: 'academia',
    connections: [
        {
            workId: 'academia-triangulations',
            sentence: 'One of these was done by reading and the other by simulating, and I would not have predicted which taught me more.'
        }
    ],
    editorial: {
        credit: 'Shae McKenna · supervised by Prof. Alexander Fish, University of Sydney',
        body: [
            "I worked in a team of five on a literature review of the state of the P vs NP problem, supervised by Professor Alexander Fish at the University of Sydney.",
            "The first thing to say is what an undergraduate literature review on P vs NP actually is, because the title oversells it. We did not advance the problem. Nobody expected us to. What a review like this teaches you is how to read — specifically, how to read a paper you are not yet equipped to read, extract the shape of its argument, and be honest with yourself and your team about which parts you have genuinely followed and which parts you have only nodded along to. That is a much rarer skill than it sounds, and I had it much less than I thought at the start.",
            "The most useful thing I took away is the structure of why the problem is hard, rather than any opinion about the answer. Relativization, natural proofs, algebrization — the barrier results are, to me, the genuinely interesting content, because each one is a proof that an entire family of techniques cannot work. A field that knows precisely which of its tools are disqualified is in a much more advanced state than one that is merely stuck, and from outside those two look the same.",
            "I'll give my prior, with the caveat that an undergraduate's prior on this is worth nothing: P ≠ NP, for the unsatisfying reason that essentially everyone who has looked hard thinks so and no serious approach has produced evidence otherwise. I hold that loosely and I'd enjoy being wrong.",
            "Working in a team of five on something none of us fully understood was its own lesson. The failure mode is not disagreement. It's five people independently deciding not to admit which section they didn't follow, and the review quietly ending up with a gap in the middle that everyone assumed somebody else had covered."
        ],
        stat: null,
        quote: null,
        bio: null,
        links: []
    }
};

export const medicalEducation = {
    id: 'academia-medical-education',
    title: 'Large Language Models in Medical Education',
    date: '2024-09-01',
    previewImage: '/previews/academia-medical-education.png',
    blurb: 'The highest-stakes place to put a model that is confidently wrong.',
    previewAspect: 'wide',
    category: 'academia',
    connections: [
        {
            workId: 'work-inspire-tomorrow',
            sentence: 'Who gets access to an education and who is left to find it on their own is the question I keep circling.'
        },
        {
            workId: 'software-continuous-self-improvement',
            sentence: 'Everything I worry about here comes back to whether a model can tell when it is wrong.'
        }
    ],
    editorial: {
        credit: 'Shae McKenna · with Martin Brown, University of Sydney',
        body: [
            "Research with Martin Brown on the use of large language models in medical education.",
            "Medical education is close to the worst possible place to deploy a system that produces fluent, confident, unsourced text — and therefore one of the most important places to study it properly rather than let it arrive by default. It has every property that makes hallucination dangerous. The domain rewards recall of specifics. The learner is by definition not yet able to referee the answer. The failure is delayed: a student absorbs a wrong mechanism now and it surfaces years later in front of a patient, with no trace back to where it came from.",
            "The thing I found hardest to reason about is that the obvious safeguard doesn't work. Telling students to verify everything assumes the verification step is cheap, and the entire appeal of the tool is that it is cheaper than the textbook. A tool that is only safe when used in a way that removes its advantage will not be used that way.",
            "The argument on the other side is one I take seriously, and it's personal. Good teaching does not scale and it is not evenly distributed. I have been on the wrong end of that distribution. A patient tutor that will explain the same mechanism a fourth way at eleven at night is genuinely valuable to somebody who has never had a teacher with the time for it, and dismissing that because the tool is imperfect is an argument made by people who had the good teacher.",
            "So I don't think the question is whether to use these in medical education. It's what has to be true first — sourcing that a student can actually follow, calibrated refusal instead of a confident guess, and some way to measure what was learned rather than what was generated. None of those are solved.",
            "This never made it onto my résumé, which is part of why it's here. It's the piece of my work that has changed my thinking most and has the least to show for itself."
        ],
        stat: null,
        quote: null,
        bio: null,
        links: []
    }
};

export const academia = [triangulations, medicalEducation, pVsNp];
