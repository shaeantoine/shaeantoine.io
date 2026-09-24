export const continuousSelfImprovement = {
    id: 'software-continuous-self-improvement',
    title: 'Continuous Self-Improvement',
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
        body: [
            "Ongoing research into whether a model can improve itself continuously without a human grading every step. The appeal is obvious and so is the trap: a system that generates its own training signal will happily optimise into its own blind spot and report excellent numbers the entire way down.",
            "So the real subject is not generation, it's verification — what a model can check about its own output that is cheaper than producing the output again, and where that check is independent enough to be worth anything. This is the same question my day job runs into from the other side, and I don't think it is solved."
        ],
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
        body: [
            "Contributions to MLX, Apple's array framework for machine learning on Apple silicon. I also use it professionally, which puts me in the unusual position of filing against a framework whose behaviour I depend on and can actually go and change.",
            "The reason I care about this one is unified memory. Most ML tooling is built on the assumption that moving data to and from the accelerator is the expensive part, and a great deal of accumulated framework design exists to hide that cost. Take the assumption away and a surprising amount of received wisdom stops being true."
        ],
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
        body: [
            "A game where you catch a dot. There is no second feature, no roadmap, and nothing about it that would survive a product review.",
            "I keep it here on purpose. Everything else on this desk can justify itself — a metric moved, a paper got written, somebody found a scholarship. This one exists because it was fun on a Sunday, and a portfolio where every single item has a reason is a portfolio by someone who has stopped making things for their own sake."
        ],
    }
};

export const hackathons = {
    id: 'software-hackathons',
    title: 'Finding a love for building',
    date: '2024-08-01',
    previewImage: '/previews/software-hackathons.png',
    blurb: 'Its not about the code',
    previewAspect: 'square',
    category: 'software',
    connections: [
        {
            workId: 'work-nextgen',
            sentence: 'A weekend build and a pitch deck fail in exactly the same way, which is worth knowing before you fund one.'
        }
    ],
    editorial: {
        body: [
            "I didn't like studying software at university. I didn't realize it then but I am extremely opinionated about what I work on. I can be insufferable if I haven't bought into a project. And well there are a lot of boring games, dull file systems and algorithm implementations universities put undergraduates through.",
            "Then I did a hackathon. I love them. I love the arguing, the time pressure, the inevitable course correction far too close to the deadline. I loved working with a buch of different people, figuring out who should do what and how. It all felt much more real.",
            "I ended up doing quite a few. I started with university hackathons, then the odd company hackathon and by the end I was pitching to panels of investors at Antler and Stanford. What I loved most about hackathons was how little, in fact, they often cared about the technology. It was the story you told, the problem you solved, the thing you deemed worthy of pursuing even before a single line was written.",
            "I learnt a lot about myself during those late nights. I won a lot of hackathons but I don't think I ever necessarily produced the highest quality code or most sophisticated demo. But I could tell a hell of a story. I could find something worth while to work on. Thats the thing I care about with technology, what the hell is worthy of solving."
        ],
    }
};

export const financialModelling = {
    id: 'software-financial-modelling',
    title: 'How Does Mathematical Modelling Hold Up',
    date: '2019-09-13',
    previewImage: '/previews/software-continuous-self-improvement.png',
    blurb: 'Humans are messy but using the tools of science to approximate human dynamics is wonderful',
    previewAspect: 'wide',
    category: 'software',
    connections: [
        {
            workId: 'academia-medical-education',
            sentence: 'A model that cannot tell when it is wrong is the thing that makes it dangerous to teach with.'
        }
    ],
    editorial: {
        body: [
            "I loved economics in high school. I studied as much economics as I could from economic history, development economics and financial economics. I realized quite quickly that advanced economics heavily relied on mathematics. And so, I began to take maths seriously (even competing in IMO!).",
            "When I was 16, I came across the concept of Geometric Brownian Motion to model stock prices. But I was skeptical of its uses. Academic economics can be overzealous with it's applicability. I wanted to know how well the assumptions of GBM hold up with real world data.",
            "Unsurprisingly the data didn't satisfy the assumptions of the model. These results defined how I look at the tools of science in the world of humans. These tools can be useful however, what I came to appreciate is that the space between mathematical elegance and human chaos is beautiful."
        ],
    }
};

export const software = [
    continuousSelfImprovement,
    mlx,
    catchTheDot,
    hackathons,
    financialModelling
];
