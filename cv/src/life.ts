/*
 * The life, as data: every word the CV page says, and every fact the card,
 * the sheets, the tape and the text CV are drawn from. Nothing else on the
 * page holds copy.
 *
 * Nothing is unknown any more: the dates, the email and the LinkedIn address
 * were answered on 2026-10-06. A fact that turns out to be missing goes in as
 * `[unknown: ...]`, listed here, and the page does not ship until it is filled
 * in (life.test.ts fails while any `[unknown` is left).
 *
 * The imports carry their extension because vite.config.ts builds the text CV
 * from this file under Node's own resolution, which wants it.
 */

import type { Dye } from '../../src/core/types.ts'

/** A fact not known yet, written so the ship gate can find it. */
export type Unknown = `[unknown: ${string}]`

export type Year = number | Unknown

/** One job or one degree. Dates as a reader writes them, `Feb 2013`; a year alone where that is all there is. */
export interface Role {
  org: string
  /** The org where the facts card has no room for all of it. */
  short?: string
  title: string
  /** Left out where it is not known. */
  place?: string
  from: string
  to: string
  points: string[]
}

export interface Chapter {
  /** Also its hash, so lowercase words: never Lightbox's `s=`. */
  id: string
  name: string
  /** Learning on the top row, work below. */
  row: 'learn' | 'work'
  /** Growing up has no year to start at, so its tab and the clock say where instead. */
  from: Year | 'Iran'
  to: Year | 'now'
  where?: string
  /** Two sentences at most. */
  copy: string
  roles?: Role[]
  dye: Dye
  /** Degrees, fixed. Within 1.5 either way, so same-row sheets keep their gap. */
  lean: number
}

/** Two chapters that ran at once, where their sheets cross. */
export interface Crossing {
  a: string
  b: string
  name: string
  copy: string
}

export interface Life {
  name: string
  intro: string
  based: string
  reach: { email: string; linkedin: string; github: string; medium: string }
  /** In start order, which is also left to right. */
  chapters: Chapter[]
  crossings: Crossing[]
  skills: string
  /** Medium articles, after the profile in reach. An empty url lists the title without a link. */
  writing: { title: string; url: string }[]
  outside: string
  /** The instruments' names in it become links. */
  closing: string
}

/*
 * The dyes are one roll of src/palette/palette.ts, eight sheets from seed
 * 2607, dealt to the chapters so the two crossings get the roll's cleanest
 * pair each: lilac over deep rose goes violet, yellow over sky goes green,
 * each at least 0.17 in OKLab from both of its sheets in paint, and no two
 * sheets sit closer than 0.13. Out of 4,000 seeds, the best on both counts.
 * The roll thinned six sheets below the 0.75 density floor (Master's 0.34,
 * Berlin 0.544, MessageBird 0.523, Bachelor's, With AI and Leading QA 0.68),
 * and those were lifted to it.
 */
export const LIFE: Life = {
  name: 'Mohsen Nasiri',
  intro: "I'm Mohsen, a QA lead in Germany. If it takes creativity, tech or AI, it's for me.",
  based: 'Germany',
  reach: {
    email: 'mohsen.n89@gmail.com',
    linkedin: 'https://www.linkedin.com/in/mohsen-nasiri-qa/',
    github: 'https://github.com/mohsenny',
    medium: 'https://medium.com/@mohsenny',
  },
  chapters: [
    {
      id: 'growing-up',
      name: 'Growing up',
      row: 'learn',
      from: 'Iran',
      to: 2008,
      where: 'Tehran',
      copy: 'I grew up in Tehran and played a lot of video games.',
      dye: { L: 0.842, C: 0.247, h: 147.6, d: 0.803 },
      lean: -0.9,
    },
    {
      id: 'bachelor',
      name: "Bachelor's",
      row: 'learn',
      from: 2008,
      to: 2012,
      where: 'Tehran',
      copy: 'B.Sc. in Software Engineering at Iran University of Science and Technology.',
      roles: [
        {
          org: 'Iran University of Science and Technology',
          title: 'B.Sc. Software Engineering',
          place: 'Tehran, Iran',
          from: '2008',
          to: '2012',
          points: [],
        },
      ],
      dye: { L: 0.705, C: 0.191, h: 48.7, d: 0.75 },
      lean: 0.7,
    },
    {
      id: 'master',
      name: "Master's",
      row: 'learn',
      from: 2012,
      to: 2015,
      where: 'Joensuu',
      copy: 'Then Finland, for an M.Sc. in Computer Science at the University of Eastern Finland.',
      roles: [
        {
          org: 'University of Eastern Finland',
          short: 'Eastern Finland',
          title: 'M.Sc. Computer Science',
          place: 'Joensuu, Finland',
          from: '2012',
          to: '2015',
          points: [],
        },
      ],
      dye: { L: 0.819, C: 0.144, h: 318.7, d: 0.75 },
      lean: -0.5,
    },
    {
      id: 'arbonaut',
      name: 'Arbonaut',
      row: 'work',
      from: 2013,
      to: 2015,
      where: 'Finland',
      copy: 'Full-stack developer while I studied. Web apps in PHP, JavaScript and OpenLayers, GIS plugins, and .NET apps for Windows.',
      roles: [
        {
          org: 'Arbonaut',
          title: 'Full-stack Developer',
          place: 'Finland',
          from: 'Feb 2013',
          to: 'Dec 2015',
          points: [
            'Web apps in PHP, JavaScript and OpenLayers.',
            'ArcGIS plugins with GeoServer, PostGIS and PostgreSQL.',
            'Windows mobile and desktop apps in .NET C#.',
          ],
        },
      ],
      dye: { L: 0.345, C: 0.136, h: 4, d: 0.88 },
      lean: 1.1,
    },
    {
      id: 'berlin',
      name: 'Berlin',
      row: 'work',
      from: 2016,
      to: 2022,
      copy: 'Senior QA Engineer at Hubrick, then QA Lead at OSRAM, HeyJobs and Talentspace. I built QA teams and test automation, and put quality on dashboards.',
      roles: [
        {
          org: 'Hubrick',
          title: 'Senior QA Engineer',
          place: 'Berlin',
          from: 'Jan 2016',
          to: 'Jul 2018',
          points: [
            'A QA workflow inside the feature teams, with test steps in CI/CD and TestRail.',
            'Test automation with WebdriverIO, and load testing with JMeter and Python.',
            'QA metrics with Prometheus and Grafana.',
          ],
        },
        {
          org: 'OSRAM',
          title: 'QA Lead',
          place: 'Berlin',
          from: 'Aug 2018',
          to: 'Nov 2019',
          points: [
            'Built a QA team of three from the ground up.',
            'Manual and automated testing of web apps, backend microservices and their API, with QA engaged early.',
            'Performance and load testing of the IoT cloud.',
          ],
        },
        {
          org: 'HeyJobs',
          title: 'QA Lead',
          place: 'Berlin',
          from: 'Nov 2019',
          to: 'Aug 2020',
          points: [
            'Quality metrics for error rate, page speed and downtime, with monitors and alerts.',
            'Grew the team through hiring, and took QA from the product spec to after the release.',
            'Less flaky test automation, visual regression, parallel runs and device farms.',
          ],
        },
        {
          org: 'Talentspace',
          title: 'QA Lead',
          place: 'Berlin',
          from: 'Nov 2020',
          to: 'Feb 2022',
          points: [
            'Created and managed the QA team, and the QA process across all feature teams, with company-wide bug triage.',
            'An end-to-end framework with visual regression in Cypress, WebdriverIO and Percy, and API testing in Chai and Supertest.',
            'Quality of service dashboards on Datadog, plus SonarCloud and FullStory.',
          ],
        },
      ],
      dye: { L: 0.558, C: 0.085, h: 192.7, d: 0.75 },
      lean: -1.2,
    },
    {
      id: 'messagebird',
      name: 'MessageBird',
      row: 'work',
      from: 2022,
      to: 2024,
      where: 'Amsterdam',
      copy: 'Senior QA Engineer. Web and API automation, a load testing framework in k6, and bug triage for every product team.',
      roles: [
        {
          org: 'MessageBird',
          title: 'Senior QA Engineer',
          place: 'Amsterdam',
          from: 'Feb 2022',
          to: '2024',
          points: [
            'Web and API automation with Cypress and Supertest.',
            'A load testing framework for load-heavy user journeys, in k6 and Chai.',
            'Bug reporting and triage for all product teams, and dashboards, monitors and alerts on quality metrics.',
          ],
        },
      ],
      dye: { L: 0.544, C: 0.252, h: 270.3, d: 0.75 },
      lean: 0.8,
    },
    {
      id: 'leading-qa',
      name: 'Leading QA',
      row: 'work',
      from: 2024,
      to: 'now',
      copy: 'QA Lead at LucaNet, then at CompuGroup Medical, where I am now. I lead manual and automation QAs.',
      roles: [
        {
          org: 'LucaNet',
          title: 'QA Lead',
          from: '2024',
          to: '2025',
          points: ['Led the manual and automation QAs.'],
        },
        {
          org: 'CompuGroup Medical',
          title: 'QA Lead',
          from: '2025',
          to: 'now',
          points: [
            'Lead the manual and automation QAs.',
            'Built a test reporting dashboard.',
            'Built an AI workflow hub: agent workflows for QA with human review steps. It is becoming the standard AI workflow tool at CGM in Germany.',
          ],
        },
      ],
      dye: { L: 0.778, C: 0.149, h: 226, d: 0.75 },
      lean: -0.4,
    },
    {
      id: 'with-ai',
      name: 'With AI',
      row: 'learn',
      from: 2024,
      to: 'now',
      copy: "From 2024 I used AI for test frameworks and docs, and since 2025 I build real things with it, like this site. Off screen it's space and physics, quantum field theory especially, and my golden retriever.",
      dye: { L: 0.851, C: 0.175, h: 95.7, d: 0.75 },
      lean: 1.3,
    },
  ],
  crossings: [
    {
      a: 'master',
      b: 'arbonaut',
      name: 'Both at once',
      copy: "The master's and my first job ran side by side, 2013 to 2015.",
    },
    {
      a: 'leading-qa',
      b: 'with-ai',
      name: 'QA with AI',
      copy: 'At CGM I built a test reporting dashboard and an AI workflow hub that is becoming the standard AI workflow tool at CGM in Germany.',
    },
  ],
  skills:
    'Working in agile and scrum teams. Building QA teams and managing people: 1-on-1s, syncs and performance reviews. Python, Java, JavaScript and Go. Test automation with Cypress, WebdriverIO and Selenium-based libraries. Desktop and mobile clients, REST and GraphQL services, and TestRail. Quality metrics defined and made visible in Grafana, Prometheus and Datadog. Daily work with developers, product owners, designers and customer success.',
  writing: [
    {
      title: 'Testing Agent Workflows Like End-to-End Systems',
      url: 'https://medium.com/@mohsenny/testing-agent-workflows-like-end-to-end-systems-6a461c7d9516',
    },
    {
      title: 'Stop Breaking My API: A Practical Guide to Contract Testing with Pact',
      url: 'https://medium.com/@mohsenny/stop-breaking-my-api-a-practical-guide-to-contract-testing-with-pact-33858d113386',
    },
    {
      title: 'Your Agent Is Just a Markdown File. We Can Do Better.',
      url: 'https://medium.com/@mohsenny/your-agent-is-just-a-markdown-file-we-can-do-better-0a681cb78739',
    },
  ],
  outside: 'Space and physics, quantum field theory especially, and my golden retriever.',
  closing:
    'Then see what I make for fun: Lattice bends space with a mass, Solar keeps the planets at true scale, Lightbox mixes colour.',
}

/**
 * A chapter's years as a reader says them, `2008 to 2012`, or `until 2008`
 * with no year to start at. Lowercase, because it mostly follows a comma:
 * the live message, the tape's value and the tabs all say `Growing up, until
 * 2008`. Where it starts a line, the card capitalises it.
 */
export function yearsOf(chapter: Chapter): string {
  return typeof chapter.from === 'number' ? `${chapter.from} to ${chapter.to}` : `until ${chapter.to}`
}

/** Every job, oldest first, from the work row. */
export function jobs(life: Life = LIFE): Role[] {
  return life.chapters.filter((c) => c.row === 'work').flatMap((c) => c.roles ?? [])
}

/** Every degree, oldest first, from the learning row. */
export function degrees(life: Life = LIFE): Role[] {
  return life.chapters.filter((c) => c.row === 'learn').flatMap((c) => c.roles ?? [])
}

/** The address as it is shown: no scheme, no www, no closing slash. */
export function bare(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
}

/** One row of the facts card at Now. */
export interface Fact {
  label: string
  value: string
}

/**
 * The card at Now, derived rather than written, so it cannot fall behind the
 * chapters: the current job, the three before it, the newest degree, where he
 * lives and how to reach him.
 */
export function facts(life: Life = LIFE): Fact[] {
  const work = jobs(life).reverse()
  const now = work[0]
  const study = degrees(life).at(-1)
  return [
    { label: 'Now', value: now ? `${now.title}, ${now.org}` : '' },
    { label: 'Before', value: work.slice(1, 4).map((r) => r.short ?? r.org).join(', ') },
    { label: 'Studied', value: study ? `${study.title}, ${study.short ?? study.org}` : '' },
    { label: 'Based', value: life.based },
    {
      label: 'Reach',
      value: [life.reach.email, bare(life.reach.linkedin), bare(life.reach.github), bare(life.reach.medium)].join(', '),
    },
  ]
}
