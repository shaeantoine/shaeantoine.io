/*
This file is a repository of jobs.

WHY THESE ARE BADGES. Every other category on this desk is represented by the
thing that was made — a screen, a page, a board with solder on it. A job
doesn't produce an object. What it produces is a laminated card with your face
on it that you stop noticing after the first week and then keep in a drawer
forever. That is the honest object for this category, and it is also the one
that refuses to be a trophy: nobody's ID badge looks impressive.

Each entry carries its own holder and clip, which is not redundancy —
artifactStrategy reparents the whole resting group into the first project's
slot, so hardware shared between the cards would walk off the desk the first
time you pressed an arrow. Six identical clips is also just what six badges
look like: the card is what differs between jobs, and the clip is the same
part from the same supplier every time.

THE ENTRIES USED TO CARRY A `seed` as well, which varied how each one's lanyard
strap fell — one coil repeated six times would have read as an asset placed six
times, the rule the two shelf plants are held to. The straps are gone (they ran
across the editorial column; see content/lanyard.js) and with them the only
thing on this object that had any reason to vary.

`access` and `year` are card furniture, and they earn their place on the two
Apple entries in particular — same employer, same header band, and without a
class and a date the two cards are one card with a different job title on it.

WHAT THE COPY IS FOR. The résumé already has the metrics and so does LinkedIn.
Repeating them here would make this page strictly worse than a PDF. So each
body below is the part that doesn't fit on a résumé: what the number actually
measures, what the decision cost, or what I got wrong. Where a figure appears
it is there to be qualified, not to be claimed.
*/

import { buildLanyard } from '../lanyard.js';

export const appleEngineer = {
    id: 'work-apple-engineer',
    title: 'Software Engineer, Apple',
    date: '2025-01-06',
    previewImage: '/previews/work-apple-engineer.png',
    blurb: 'Building the retrieval layer under an AI tool 150,000 people did not ask for.',
    previewAspect: 'wide',
    category: 'work',
    artifact: buildLanyard({ org: 'Apple', role: 'Software Engineer', cardColor: '#e9e6e0', strapColor: '#2f3136', access: 'EMPLOYEE', year: '2025' }),
    connections: [
        {
            workId: 'software-apple-knowledge-rag',
            sentence: 'The service itself — five micro-services and an evaluation problem — is written up on its own.'
        }
    ],
    editorial: {
        credit: 'Shae McKenna',
        body: [
            "I'm a core developer on Apple Knowledge, the backend behind the internal AI tool that about 150,000 employees have access to. My part of it is retrieval: I pitched a RAG service to make Apple's internal knowledge actually queryable, prototyped it, and then led it to production.",
            "The line on my résumé says it cut internal helpline ticket volume by 13% and has resolved 38,000 tickets to date. Both numbers are real and I'd defend the measurement, but I want to say plainly what I think they're worth. A drop in tickets is a proxy. It's consistent with people getting a good answer from the tool instead of raising a ticket. It's also consistent with people asking the tool, getting something plausible and wrong, and never finding out. From the outside those two look identical, and the second one is worse than having built nothing.",
            "That's the actual problem at this scale, and it's the reason the service is five micro-services rather than a retrieval call and a prompt. You cannot read 38,000 answers. Nobody can. So most of the engineering is not the retrieval at all — it's the machinery that lets you say anything trustworthy about output you will never personally look at. Synthetic data generation and augmentation, so there's something to evaluate against in domains where nobody has written the questions down. Training for the embedding and reranker models, because generic embeddings are quietly terrible on internal jargon that appears nowhere on the public internet. And an evaluation service, whose entire job is to be the thing that catches me being wrong.",
            "I'd underline the reranker, because it's the least glamorous part and it's carried the most. The temptation with retrieval is always to reach for a bigger embedding model. A reranker is cheaper, more legible, and you can look at what it did. Most of the quality that shipped came from ordering results better rather than from finding more of them.",
            "What I did not expect going in is how much of this job is other people's data. Kafka ingestion pipelines, Qdrant, Mongo, Redis, auth — the code is not the hard part. The hard part is that internal knowledge inside a company this size is not a corpus. It's thousands of half-maintained documents with real institutional politics attached to every one of them, and making that queryable means making decisions about whose page is authoritative.",
            "I think this is the most useful kind of work you can do inside a big company, and I'd also say it's close to invisible. There's no launch. Nobody outside tells you it's good. You find out it worked because a metric you don't fully trust moved, which is the whole reason I care about the eval harness more than I care about the metric."
        ],
        stat: { value: '150,000', label: 'employees with access to the tool it sits under' },
        quote: null,
        bio: null,
        links: []
    }
};

export const appleIntern = {
    id: 'work-apple-intern',
    title: 'Software Engineer Intern, Apple',
    date: '2023-01-09',
    previewImage: '/previews/work-apple-intern.png',
    blurb: 'Nobody asked for it. That turned out to be the hard part and the whole point.',
    previewAspect: 'square',
    category: 'work',
    artifact: buildLanyard({ org: 'Apple', role: 'SWE Intern', cardColor: '#dedbd4', strapColor: '#4a4e57', access: 'INTERN', year: '2023' }),
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
        credit: 'Shae McKenna',
        body: [
            "I built a RAG query engine for internal search over eight months as an intern, and the word on my résumé that matters is \"autonomously\". It wasn't assigned. I thought internal search was bad, I thought retrieval would fix it, and I started building before anyone had agreed with me.",
            "I want to be honest about the headline figure. \"Estimated to save Apple employees 1,000 hours daily\" is an estimate, and estimates like that are constructed — you pick a per-query time saving, multiply by daily active users, and the number you get out is mostly a function of the assumption you put in. What I'd actually stand behind is the denominator: it shipped on the three most popular internal sites, with about 20,000 daily active users between them. That part is counted rather than modelled.",
            "The engineering was the easy half. The genuinely hard part of building something nobody asked for is that there's no mandate attached to it, so every single person who has to help you is doing you a favour. By the end it touched 3 functions, 14 international teams and 108 colleagues, and almost none of that was technical work. It was finding the person who owned a data source, convincing them the thing was real, and then not wasting their time.",
            "I presented it to the CIO's direct reports. I was an intern with a demo. What I remember is not the pitch, it's the realisation partway through that a working demo is worth more than any amount of argument — people cannot really evaluate a proposal, but they can immediately tell you whether a thing in front of them is good.",
            "If I'd been wrong about internal search, eight months of an internship would have gone into a prototype nobody deployed, and I'd have deserved that. I think you have to be willing to eat that outcome for the approach to mean anything."
        ],
        stat: { value: '20,000', label: 'daily active users across the three sites it shipped on' },
        quote: null,
        bio: null,
        links: []
    }
};

export const deloitte = {
    id: 'work-deloitte',
    title: 'Quantitative Analyst Intern, Deloitte',
    date: '2023-11-13',
    previewImage: '/previews/work-deloitte.png',
    blurb: 'Synthetic credit data is an ethics problem wearing a technical costume.',
    previewAspect: 'wide',
    category: 'work',
    artifact: buildLanyard({ org: 'Deloitte', role: 'Quant Analyst', cardColor: '#dfe3d9', strapColor: '#2c3a2b', access: 'INTERN', year: '2023' }),
    connections: [
        {
            workId: 'work-apple-engineer',
            sentence: 'I ended up generating synthetic data again at Apple, for a completely different reason.'
        }
    ],
    editorial: {
        credit: 'Shae McKenna',
        body: [
            "I led the research proposal for Deloitte's first synthetic data generation project — realistic credit data — and pitched three partners into committing six figures of resources to build the MVP. On paper that's the achievement. The part I actually think about is what we were proposing to do.",
            "The pitch for synthetic credit data is clean: real credit data is sensitive, you can't move it around, and modelling teams are permanently blocked waiting for access. Generate a faithful synthetic copy and everyone can work. The trouble is the word faithful. A generative model trained on historical credit decisions learns the distribution it was given, including every bias sitting in it. Do the job well and you have manufactured an unlimited, fully shareable supply of that bias, now laundered through a model and wearing the word \"synthetic\", which sounds neutral and isn't. Do the job badly on the minority classes — which is exactly where these models are weakest and exactly where credit decisions hurt people — and you get something worse: a dataset that looks representative and quietly isn't.",
            "So the interesting question was never whether CTGAN could produce plausible rows. It was what we were going to measure with SDMetrics and, more to the point, what we were going to do when a fidelity metric and a fairness concern disagreed. I don't think we resolved that, and I don't think the field has either. I'd be uncomfortable if this had shipped without someone whose job was to own that question.",
            "The smaller piece of work was the one I'd most defend as engineering. Vodafone's iPhone credit line ran on a credit risk model that was drifting, and I built the automation to reingest new data and correct it. Model drift is the least discussed and most reliable fact about deployed machine learning: the world moves, the model doesn't, and the failure is silent because the model keeps confidently returning numbers the entire time. Nothing about that is clever. It's plumbing. But a model nobody has retrained is a model nobody should be using, and an enormous amount of production ML is exactly that.",
            "I took a return offer conversation seriously here, and turned it down. Consulting is very good at teaching you to make a case, and I wanted to spend my twenties building the thing rather than proposing it."
        ],
        stat: null,
        quote: null,
        bio: null,
        links: []
    }
};

export const amazon = {
    id: 'work-amazon',
    title: 'Growth Intern, Amazon',
    date: '2022-11-07',
    previewImage: '/previews/work-amazon.png',
    blurb: 'My first real job, and the least technical thing I have ever done.',
    previewAspect: 'square',
    category: 'work',
    artifact: buildLanyard({ org: 'Amazon', role: 'Growth Intern', cardColor: '#e8ded0', strapColor: '#3c332a', access: 'INTERN', year: '2022' }),
    connections: [
        {
            workId: 'work-deloitte',
            sentence: 'Both of these were really about learning to make a case to people who could say no.'
        }
    ],
    editorial: {
        credit: 'Shae McKenna',
        body: [
            "This was the first one. I spearheaded a proposal to unlock a $4MM product line with Australia's biggest toy vendors — Mattel, Hasbro — and worked across 7 teams in Data Science and Vendor Management on the go-to-market strategy. I also wrote a lot of PostgreSQL for daily and specialty reports, which is what I was actually doing most days.",
            "I arrived assuming that in a company famously built on data, the data decided things. That's not what I found, and I don't mean that cynically. What I found is that data narrows the set of defensible options and then a person still has to pick one, and which one gets picked depends on who is in the room, what they are measured on, and whether anyone has the appetite to own it if it fails. The proposal didn't move because the numbers were good. It moved because seven teams were willing to be associated with it.",
            "The most useful thing I learned had nothing to do with the project. It's that being the most junior person in the room is a real advantage for about three months, because you are the only one who can ask why without it costing you anything. I used that less than I should have. I spent too much of it trying to seem like I already knew.",
            "I was nineteen and writing SQL about toys. I'd recommend it. There is a specific kind of seriousness you only learn by doing unglamorous work inside a large organisation, and I don't think you can get it from a side project."
        ],
        stat: null,
        quote: null,
        bio: null,
        links: []
    }
};

export const inspireTomorrow = {
    id: 'work-inspire-tomorrow',
    title: 'Chief Technology Officer, Inspire Tomorrow Education',
    date: '2024-02-05',
    previewImage: '/previews/work-inspire-tomorrow.png',
    blurb: 'I got the scholarships. Then I built the thing that helps other people find theirs.',
    previewAspect: 'tall',
    category: 'work',
    artifact: buildLanyard({ org: 'Inspire Tomorrow', role: 'CTO', cardColor: '#d9e0e6', strapColor: '#233240', access: 'STAFF', year: '2024' }),
    connections: [
        {
            workId: 'academia-medical-education',
            sentence: 'Having been on the wrong end of an unevenly distributed education is what both of these are answers to.'
        },
        {
            workId: 'software-scholarship-database',
            sentence: 'The database itself — 7,500 scholarships and the scraping problem underneath it — is written up separately.'
        }
    ],
    editorial: {
        credit: 'Shae McKenna',
        body: [
            "I was CTO of Inspire Tomorrow Education for a year, leading two engineers to build what became the largest higher-education scholarship database in Australia: over 7,500 scholarships on record, running on AWS.",
            "I should say the obvious thing, because it's the reason I took it. I went to the University of Sydney on scholarships — the Google Generation Scholarship, the Robertson-Cunningham, the St Andrews All-Rounder. I would not have gone otherwise. And I found them the way everyone finds them, which is to say badly: through people who happened to mention them, on university pages that assume you already know what you're looking for, in PDFs. The money was always there. The problem was never funding. The problem was that the information was scattered across a few hundred institutions with no reason to make it findable and no shared format to make it findable in.",
            "That's a boring technical problem and a genuinely consequential one. Most of the work is not modelling; it's that every provider describes eligibility differently, deadlines move, half the records are stale, and a scholarship database that confidently lists something that closed last March is worse than no database, because the person trusted it.",
            "There's a straight line from here to most of what I've ended up doing. The Apple work is retrieval over internal knowledge that exists but can't be found. This is retrieval over scholarship funding that exists but can't be found. I did not notice they were the same job until I wrote them down next to each other.",
            "Being CTO of a small organisation mostly means deciding what not to build. With two engineers you get one good system, so we spent it on coverage and freshness rather than on anything a user would describe as a feature. I still think that was right."
        ],
        stat: { value: '7,500+', label: 'scholarships on record — the largest such database in Australia' },
        quote: null,
        bio: null,
        links: []
    }
};

export const nextGen = {
    id: 'work-nextgen',
    title: 'Investment Principal, NextGen Ventures',
    date: '2024-01-15',
    previewImage: '/previews/work-nextgen.png',
    blurb: 'Two of a hundred worked. I am still not sure I was right for the right reasons.',
    previewAspect: 'wide',
    category: 'work',
    artifact: buildLanyard({ org: 'NextGen Ventures', role: 'Investment Principal', cardColor: '#e4dcd2', strapColor: '#443a4e', access: 'STAFF', year: '2024' }),
    connections: [
        {
            workId: 'software-hackathons',
            sentence: 'Sitting through a hundred pitches is the fastest way I know to develop a taste for what is real.'
        }
    ],
    editorial: {
        credit: 'Shae McKenna',
        body: [
            "I made the firm's first two investments, into Fluency and Puralink. Both have since raised from Accel and Sequoia respectively. I also led a team of five sourcing over a hundred startups, including companies with 50,000 monthly actives and Hult Prize finalists.",
            "The two that worked are the part everyone repeats back to me, so let me put the right frame on it. Two hits out of a hundred sourced is not evidence that I can pick companies. It's a small sample from a period when a lot of things raised, evaluated by the person who made the picks. A later round is a signal that other investors agreed with me later — which is a real signal and is not the same as being right about the business. I'll believe my own judgement here in about eight years.",
            "What I do think I learned is what an engineer sees in a pitch that a finance person doesn't, and it cuts both ways. I could usually tell within a few minutes whether a technical claim was load-bearing or decorative, whether a demo was a product or a screenshot with a button, and whether the hard part of what they were describing was the part they were excited about. That's a genuine edge and it's narrower than it feels. What I was bad at was everything about distribution. I consistently overrated teams with a beautiful technical answer to a problem nobody was funding a solution to, and underrated founders who could obviously sell and were building something I found boring. The second group is where the returns were.",
            "The other thing a hundred pitches gives you is a very fast calibration for how much of what gets built is built for a reason the founder can actually say out loud. You can hear it. Someone who is solving their own problem sounds completely different from someone who has identified a market. Neither is disqualifying. But I stopped being able to un-hear the difference, and it has made me much more suspicious of my own projects."
        ],
        stat: { value: '2 / 100+', label: 'sourced startups I backed — both later raised from Accel and Sequoia' },
        quote: null,
        bio: null,
        links: []
    }
};

/** Desk order: the lanyard cycles in this sequence, most recent role first. */
export const workExperience = [appleEngineer, inspireTomorrow, nextGen, deloitte, appleIntern, amazon];
