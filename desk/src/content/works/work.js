import { buildLanyard } from '../lanyard.js';

export const appleEngineer = {
    id: 'work-apple-engineer',
    title: 'Software Engineer, Apple',
    date: 'January 2025',
    previewImage: '/previews/work-apple-engineer.png',
    previewAspect: 'wide',
    category: 'work',
    artifact: buildLanyard({ org: 'Apple', role: 'Software Engineer', cardColor: '#e9e6e0', access: 'EMPLOYEE', year: '2025' }),
    connections: [
        {
            workId: 'software-apple-knowledge-rag',
            sentence: 'Something'
        }
    ],
    editorial: {
        body: [
            "I never expected to work as a software engineer when I entered university. But I feel in love with creating technology. I wanted to get good at it. I wanted to learn how to make technology that people can love. I thought there wouldn't be a better place to do so than Apple",
            "Most of the things I learnt about developing technology had nothing to do with engineering. I worked on a lot of initiatives with multiple teams. I developed a real appreciation for product intuition, taste, and effective decision making.",
            "It's all to easy to undervalue these traits until you've been apart of teams where these qualities shine.",
        ],
    }
};

export const inspireTomorrow = {
    id: 'work-inspire-tomorrow',
    title: 'Chief Technology Officer, Inspire Tomorrow Education',
    date: 'February 2024 - December 2024',
    previewImage: '/previews/work-inspire-tomorrow.png',
    previewAspect: 'tall',
    category: 'work',
    artifact: buildLanyard({ org: 'Inspire Tomorrow', role: 'CTO', cardColor: '#d9e0e6', access: 'STAFF', year: '2024' }),
    connections: [
        {
            workId: 'academia-medical-education',
            sentence: 'Having been on the wrong end of an unevenly distributed education is what both of these are answers to.'
        }
    ],
    editorial: {
        body: [
            "I didn't have much of an intention to work in an non-profit. But once I met Phoebe (CEO of ITE), I knew I had to contribute to the organization any way I could.",
            "I managed almost anything to do with technology in the company from work emails and internal tools. But the most exciting thing I was apart of was working on the scholarship database.",
            "The point of ITE was to eliminate the barriers preventing Australian students from accessing university, financial reasons being one of the most prominent.",
            "ITE really taught me how to pull my sleeves up. When we started we had nothing, no money, no team, by the time I left we'd fundraised from AWS, built a large team (including engineers!) and Phoebe even earned a spot on Forbes 30 under 30."
        ],
    }
};

export const nextGen = {
    id: 'work-nextgen',
    title: 'Investment Principal, NextGen Ventures',
    date: 'January 2024 - January 2025',
    previewImage: '/previews/work-nextgen.png',
    previewAspect: 'wide',
    category: 'work',
    artifact: buildLanyard({ org: 'NextGen Ventures', role: 'Investment Principal', cardColor: '#e4dcd2', access: 'STAFF', year: '2024' }),
    connections: [
        {
            workId: 'software-hackathons',
            sentence: 'Sitting through a hundred pitches is the fastest way I know to develop a taste for what is real.'
        }
    ],
    editorial: {
        body: [
            "Working in venture made me realize how much I wanted to be apart of the process of creation. I didn't really care much for the financial side, ironic I know. What I really wanted to see was creation in action. It was exhilirating.",
            "I loved proving others wrong. Trying to find the people and technologies others didn't appreciate was the main reason I loved the job. If a deal got too popular I usually became uninterested. After all we were a small firm, we'd be squeezed if we tried to be apart of a big round.",
            "My intuition told me that the best things would be passed over by established investors, I needed to look where they wouldn't. I loved figuring out if I was delusional for looking into a company or everyone else was who didn't.",
            "I had a lot of pride when I left having led the firms first two investments into Fluency and Puralink who are now backed by Accel and Sequoia respectively. "
        ],
    }
};

export const deloitte = {
    id: 'work-deloitte',
    title: 'Quantitative Analyst Intern, Deloitte',
    date: 'December 2023 - February 2024',
    previewImage: '/previews/work-deloitte.png',
    previewAspect: 'wide',
    category: 'work',
    artifact: buildLanyard({ org: 'Deloitte', role: 'Quant Analyst', cardColor: '#dfe3d9', access: 'INTERN', year: '2023' }),
    connections: [
        {
            workId: 'work-apple-engineer',
            sentence: 'I ended up generating synthetic data again at Apple, for a completely different reason.'
        }
    ],
    editorial: {
        body: [
            "Deloitte was my third internship. I prepared myself to smash through the goals they'd set out for me.",
            "About half way through the program I had met a brilliant group of mathematics and economics PhDs. We began to come up with some ideas of how we could use new technology for financial clients.",
            "I had learned that aspects of the financial industry were resistant to technological change. Data was highly sensitive and systems needed to work with a significant level of confidence, there was little room for error.",
            "But we came up with a way to use Generative Adversarial Networks to work within these constraints. It was really well received by Deloitte's leadership and I couldn't of been more thankful to have worked with such a talented group of people."
        ],
    }
};

export const appleIntern = {
    id: 'work-apple-intern',
    title: 'Software Engineer Intern, Apple',
    date: 'February 2023 - August 2023',
    previewImage: '/previews/work-apple-intern.png',
    previewAspect: 'square',
    category: 'work',
    artifact: buildLanyard({ org: 'Apple', role: 'SWE Intern', cardColor: '#dedbd4', access: 'INTERN', year: '2023' }),
    connections: [
        {
            workId: 'work-apple-engineer',
            sentence: 'Two years later I came back and did the production version of the same idea.'
        },
        {
            workId: 'software-catch-the-dot',
            sentence: 'The pull to build something nobody asked for is the thing I trust most about myself.'
        }
    ],
    editorial: {
        body: [
            "From day one Apple felt different. I was picked as the only intern in ANZ out of thousands of applicants. There was a lot less hand holding and way higher expectations, the pressure was on. I didn't come from a formal computer science background so I really felt like I had something to prove.",
            "The project was entirely self driven. At the end of the internship all the APAC interns would present and it became quite obvious who enjoyed Apple's unique approach and who didn't. I liked the freedom, I learned to back my ideas and quickly figure out what worked and what didn't.",
            "I also loved how holistic it was. If you needed to speak to users, you didn't have a PM who'd do it for you. If you needed telemetry or QA, you'd have to do it yourself. If you didn't know something, you'd have to teach yourself or convince someone to help."
        ],
    }
};

export const amazon = {
    id: 'work-amazon',
    title: 'Growth Intern, Amazon',
    date: 'December 2022 - February 2023',
    previewImage: '/previews/work-amazon.png',
    previewAspect: 'square',
    category: 'work',
    artifact: buildLanyard({ org: 'Amazon', role: 'Growth Intern', cardColor: '#e8ded0', access: 'INTERN', year: '2022' }),
    connections: [
        {
            workId: 'work-deloitte',
            sentence: 'Both of these were really about learning to make a case to people who could say no.'
        }
    ],
    editorial: {
        body: [
            "Amazon was my introduction to the corporate world. I showed up on my first day in a full suit and quickly realized thats not the done thing in tech. I couldn't have asked for a better introduction to corporate life.",
            "Interning at Amazon was a treat. They really nailed the early career pipeline. The amount of mentorship and support was fantastic. I fell in love with the business too. I asked all sorts of questions like how Amazon's pricing works, how they determine demand, how we stock the distribution centres, you name it.",
            "I was given a project in the toys category. Coming from a maths degree, working in a role to sell toys felt a bit disappointing if I'm honest. But I loved it and I loved even more that the team totally changed the way I looked at how to grow and maintain a great service.",
        ],
    }
};

/** Desk order: the lanyard cycles in this sequence with most recent role first. */
export const workExperience = [appleEngineer, inspireTomorrow, nextGen, deloitte, appleIntern, amazon];
