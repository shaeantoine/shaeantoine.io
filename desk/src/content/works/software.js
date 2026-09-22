/*
This file is a repository of software projects.

HARD LENGTH LIMIT, AND IT IS SILENT. These render on the monitor via
focus/strategies/screenCanvas.js, which lays the body out top-down and stops
the moment the next line would collide with the link row — `break paragraphs`,
no warning, no ellipsis. At the display's 1.787 aspect that is roughly eight
lines, or about 800–900 characters of body once a two-line blurb and a stat
have taken their share.

So these are deliberately two short paragraphs each. An entry that wants six
belongs on the paper stack (academia) instead — the constraint is the medium
telling you which object the writing goes on, which is the whole premise of the
desk.

Order below is the order the arrows step through. The first entry is what the
resting screen shows, via scene/idleScreenCanvas.js picking the most recent
date — so the newest-dated item here is what a visitor sees before they click
anything. Keep that pointed at whatever is actually current.
*/

export const continuousSelfImprovement = {
    id: 'software-continuous-self-improvement',
    title: 'Continuous LLM Self-Improvement',
    date: '2026-09-13',
    previewImage: '/previews/software-continuous-self-improvement.png',
    blurb: 'What I am working on now: can a model get reliably better without a human in the loop?',
    previewAspect: 'wide',
    category: 'software',
    connections: [
        {
            workId: 'academia-medical-education',
            sentence: 'A model that cannot tell when it is wrong is the thing that makes it dangerous to teach with.'
        }
    ],
    editorial: {
        credit: 'Shae McKenna',
        body: [
            "Ongoing research into whether a model can improve itself continuously without a human grading every step. The appeal is obvious and so is the trap: a system that generates its own training signal will happily optimise into its own blind spot and report excellent numbers the entire way down.",
            "So the real subject is not generation, it's verification — what a model can check about its own output that is cheaper than producing the output again, and where that check is independent enough to be worth anything. This is the same question my day job runs into from the other side, and I don't think it is solved."
        ],
        stat: null,
        quote: null,
        bio: null,
        links: []
    }
};

export const appleKnowledgeRag = {
    id: 'software-apple-knowledge-rag',
    title: 'Retrieval for Apple Knowledge',
    date: '2026-06-01',
    previewImage: '/previews/software-apple-knowledge-rag.png',
    blurb: 'Five micro-services, and four of them exist to catch the first one being wrong.',
    previewAspect: 'wide',
    category: 'software',
    connections: [
        {
            workId: 'work-apple-engineer',
            sentence: 'The longer account of what this cost and what the metric really measures is under the job itself.'
        }
    ],
    editorial: {
        credit: 'Shae McKenna',
        body: [
            "A RAG service making Apple's internal knowledge queryable through the AI tool its employees use. Kafka ingestion, Qdrant, trained embedding and reranker models, synthetic data generation, and an evaluation service — five micro-services, of which retrieval proper is one.",
            "The shape of that split is the lesson. At a scale where nobody can read the output, the engineering is mostly apparatus for knowing whether you are wrong. The reranker did more for quality than any embedding upgrade, because ordering what you found is cheaper and far more legible than finding more."
        ],
        stat: { value: '38,000', label: 'helpline tickets resolved since deployment' },
        quote: null,
        bio: null,
        links: []
    }
};

export const scholarshipDatabase = {
    id: 'software-scholarship-database',
    title: 'Australia\'s Scholarship Database',
    date: '2024-11-01',
    previewImage: '/previews/software-scholarship-database.png',
    blurb: 'Seven and a half thousand scholarships that already existed and could not be found.',
    previewAspect: 'tall',
    category: 'software',
    connections: [
        {
            workId: 'work-inspire-tomorrow',
            sentence: 'Why I took this on, and what it has to do with my own scholarships, is under the job.'
        }
    ],
    editorial: {
        credit: 'Shae McKenna',
        body: [
            "The largest higher-education scholarship database in Australia: 7,500+ records on AWS, built with two engineers at Inspire Tomorrow Education. Every provider describes eligibility differently and none of them have any reason to publish in a shared format, so the hard part is normalisation, not storage.",
            "Freshness is the requirement everything else bends around. A listing for a scholarship that closed in March is worse than an empty database, because somebody trusted it and stopped looking. We spent our entire engineering budget on coverage and staleness rather than on anything a user would call a feature."
        ],
        stat: { value: '7,500+', label: 'scholarships indexed' },
        quote: null,
        bio: null,
        links: []
    }
};

export const hackathons = {
    id: 'software-hackathons',
    title: 'Four Weekends',
    date: '2024-08-01',
    previewImage: '/previews/software-hackathons.png',
    blurb: 'Three firsts and a third, and what forty-eight hours is actually good for.',
    previewAspect: 'square',
    category: 'software',
    connections: [
        {
            workId: 'work-nextgen',
            sentence: 'A weekend build and a pitch deck fail in exactly the same way, which is worth knowing before you fund one.'
        }
    ],
    editorial: {
        credit: 'Shae McKenna',
        body: [
            "SafetyCulture AI Accelerator, first, 2023 — extended their production codebase to save clients around 5,000 hours a year. DS&AI Association of Australia, first, 2023 — a multimodal trading algorithm, at the largest hackathon in the southern hemisphere. Tibra Capital, first, 2024 — an ensemble XGBoost and ARIMA price predictor. Stanford, third, 2024 — a consumer-to-consumer compute sharing model.",
            "What a weekend is genuinely good for is finding out whether an idea has a demo in it. What it is not good for is anything downstream of that, which is most of the work. Three of these four would not survive contact with a real user, and I'd say the SafetyCulture one is the only one that counts, because it shipped into something that already existed."
        ],
        stat: { value: '3 × 1st', label: 'and one third place, across four hackathons' },
        quote: null,
        bio: null,
        links: []
    }
};

export const mlx = {
    id: 'software-mlx',
    title: 'Contributing to MLX',
    date: '2025-06-01',
    previewImage: '/previews/software-mlx.png',
    blurb: 'Open source at the company you work for is a strange and good position to be in.',
    previewAspect: 'wide',
    category: 'software',
    connections: [
        {
            workId: 'hardware-eeg-headset',
            sentence: 'Caring about what a model costs to run is the same instinct that makes me put one on a microcontroller.'
        }
    ],
    editorial: {
        credit: 'Shae McKenna',
        body: [
            "Contributions to MLX, Apple's array framework for machine learning on Apple silicon. I also use it professionally, which puts me in the unusual position of filing against a framework whose behaviour I depend on and can actually go and change.",
            "The reason I care about this one is unified memory. Most ML tooling is built on the assumption that moving data to and from the accelerator is the expensive part, and a great deal of accumulated framework design exists to hide that cost. Take the assumption away and a surprising amount of received wisdom stops being true."
        ],
        stat: null,
        quote: null,
        bio: null,
        links: []
    }
};

export const catchTheDot = {
    id: 'software-catch-the-dot',
    title: 'Catch The Dot',
    date: '2025-02-01',
    previewImage: '/previews/software-catch-the-dot.png',
    blurb: 'A small dumb game with no justification, which is the point.',
    previewAspect: 'square',
    category: 'software',
    connections: [
        {
            workId: 'work-apple-intern',
            sentence: 'Nobody asked for that one either, and it ended up with twenty thousand daily users.'
        }
    ],
    editorial: {
        credit: 'Shae McKenna',
        body: [
            "A game where you catch a dot. There is no second feature, no roadmap, and nothing about it that would survive a product review.",
            "I keep it here on purpose. Everything else on this desk can justify itself — a metric moved, a paper got written, somebody found a scholarship. This one exists because it was fun on a Sunday, and a portfolio where every single item has a reason is a portfolio by someone who has stopped making things for their own sake."
        ],
        stat: null,
        quote: null,
        bio: null,
        links: []
    }
};

export const software = [
    continuousSelfImprovement,
    appleKnowledgeRag,
    mlx,
    scholarshipDatabase,
    hackathons,
    catchTheDot
];
