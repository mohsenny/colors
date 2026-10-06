/*
 * The life, as data: every word the CV page says, and every fact the story,
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
import type { LogoId } from './logos.ts'

/** A fact not known yet, written so the ship gate can find it. */
export type Unknown = `[unknown: ${string}]`

export type Year = number | Unknown

/** One job or one degree. Dates as a reader writes them, `Feb 2013`; a year alone where that is all there is. */
export interface Role {
  kind: 'job' | 'degree'
  org: string
  /** The org where the facts at Now have no room for all of it. */
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
  /** Growing up has no year to start at, so its tab and the clock say where instead. */
  from: Year | 'Iran'
  to: Year | 'now'
  where?: string
  /** The story's big line. */
  headline: string
  /** Three sentences at most. */
  copy: string
  /** Where it happened, drawn larger than the tools. */
  orgs: LogoId[]
  /** What it was done with. */
  tools: LogoId[]
  /** The tools as stickers, each a little askew: the games. */
  stickers?: true
  roles?: Role[]
  dye: Dye
  /** Degrees, fixed. Within 1.5 either way, so neighbouring sheets keep their gap. */
  lean: number
}

export interface Life {
  name: string
  intro: string
  based: string
  reach: { email: string; linkedin: string; github: string; medium: string }
  /** In start order, which is also left to right. */
  chapters: Chapter[]
  skills: string
  /** Medium articles, after the profile in reach. An empty url lists the title without a link. */
  writing: { title: string; url: string }[]
  outside: string
  /** The instruments' names in it become links. */
  closing: string
}

/*
 * The dyes are set by eye, not rolled: six hues from Lightbox's family,
 * thinned to 0.5 to 0.55 so the lamp comes through the film and the picture
 * on it (art.ts) reads in a deep shade of the same hue.
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
      from: 'Iran',
      to: 2008,
      where: 'Tehran',
      headline: 'Tehran, and a lot of games',
      copy: 'Growing up in Tehran, I played a lot of video games. StarCraft, Warcraft and Dota were the ones I kept coming back to.',
      orgs: [],
      tools: ['starcraft', 'warcraft', 'dota'],
      stickers: true,
      dye: { L: 0.8, C: 0.17, h: 65, d: 0.55 },
      lean: -0.9,
    },
    {
      id: 'bachelor',
      name: "Bachelor's",
      from: 2008,
      to: 2012,
      where: 'Tehran',
      headline: 'Physics, maths, then software',
      copy: 'At school I was good at physics and maths, so engineering was the natural next step. I did a B.Sc. in Software Engineering at Iran University of Science and Technology.',
      orgs: ['iust'],
      tools: [],
      roles: [
        {
          kind: 'degree',
          org: 'Iran University of Science and Technology',
          title: 'B.Sc. Software Engineering',
          place: 'Tehran, Iran',
          from: '2008',
          to: '2012',
          points: [],
        },
      ],
      dye: { L: 0.78, C: 0.2, h: 148, d: 0.5 },
      lean: 0.7,
    },
    {
      id: 'finland',
      name: 'Finland',
      from: 2012,
      to: 2015,
      where: 'Joensuu',
      headline: 'A new life in Finland',
      copy: 'In 2012 I moved to Joensuu for an M.Sc. in Computer Science at the University of Eastern Finland. Long winters, deep snow, saunas, and my first job alongside the studies: full-stack developer at Arbonaut.',
      orgs: ['uef', 'arbonaut'],
      tools: ['php', 'javascript', 'openlayers', 'postgresql', 'dotnet'],
      roles: [
        {
          kind: 'degree',
          org: 'University of Eastern Finland',
          short: 'Eastern Finland',
          title: 'M.Sc. Computer Science',
          place: 'Joensuu, Finland',
          from: '2012',
          to: '2015',
          points: [],
        },
        {
          kind: 'job',
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
      dye: { L: 0.72, C: 0.15, h: 240, d: 0.55 },
      lean: -0.5,
    },
    {
      id: 'automation',
      name: 'Automation',
      from: 2016,
      to: 2018,
      where: 'Berlin',
      headline: 'Berlin, and testing as a craft',
      copy: 'In 2016 I moved to Berlin and its start-up scene, as a Senior QA Engineer at Hubrick. Automation became my thing: WebdriverIO and CI/CD, load tests in JMeter and Python, and quality metrics in Grafana.',
      orgs: ['hubrick'],
      tools: ['selenium', 'webdriverio', 'cypress', 'k6', 'jmeter', 'python', 'grafana', 'prometheus', 'datadog', 'testrail'],
      roles: [
        {
          kind: 'job',
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
      ],
      dye: { L: 0.68, C: 0.17, h: 300, d: 0.5 },
      lean: 1.1,
    },
    {
      id: 'leading-qa',
      name: 'Leading QA',
      from: 2018,
      to: 'now',
      headline: 'Leading QA, from start-ups to big companies',
      copy: 'In 2018 I stepped up to QA lead, and built and grew teams at OSRAM, HeyJobs and Talentspace. Then came the big companies: MessageBird in Amsterdam, LucaNet, and now CompuGroup Medical, where I lead manual and automation QAs.',
      orgs: ['osram', 'heyjobs', 'talentspace', 'messagebird', 'lucanet', 'cgm'],
      tools: [],
      roles: [
        {
          kind: 'job',
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
          kind: 'job',
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
          kind: 'job',
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
        {
          kind: 'job',
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
        {
          kind: 'job',
          org: 'LucaNet',
          title: 'QA Lead',
          from: '2024',
          to: '2025',
          points: ['Led the manual and automation QAs.'],
        },
        {
          kind: 'job',
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
      dye: { L: 0.7, C: 0.17, h: 20, d: 0.5 },
      lean: -0.8,
    },
    {
      id: 'with-ai',
      name: 'With AI',
      from: 2024,
      to: 'now',
      headline: 'Building with AI',
      copy: 'Since 2024 AI has been part of how I work, and since 2025 I build real things with it. At CGM: a test reporting dashboard, and an AI workflow hub that chains Claude agents into reviewed QA workflows. Outside work: this site.',
      orgs: [],
      tools: ['claude', 'jira', 'confluence', 'figma', 'react', 'webgl'],
      dye: { L: 0.75, C: 0.14, h: 190, d: 0.55 },
      lean: 0.6,
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
    'Then see what I make for fun: Solar keeps the planets at true scale, Gravity bends space with a mass, Lightbox mixes colour.',
}

/**
 * A chapter's years as a reader says them, `2008 to 2012`, or `until 2008`
 * with no year to start at. Lowercase, because it mostly follows a comma:
 * the live message, the tape's value and the tabs all say `Growing up, until
 * 2008`. Where it starts a line, the story capitalises it.
 */
export function yearsOf(chapter: Chapter): string {
  return typeof chapter.from === 'number' ? `${chapter.from} to ${chapter.to}` : `until ${chapter.to}`
}

/** Every role, oldest first, in the order the chapters hold them. */
function roles(life: Life): Role[] {
  return life.chapters.flatMap((c) => c.roles ?? [])
}

/** Every job, oldest first. */
export function jobs(life: Life = LIFE): Role[] {
  return roles(life).filter((r) => r.kind === 'job')
}

/** Every degree, oldest first. */
export function degrees(life: Life = LIFE): Role[] {
  return roles(life).filter((r) => r.kind === 'degree')
}

/**
 * Where the hashes of the eight-sheet page land now, so a link someone
 * kept still opens on the right chapter.
 */
export const MOVED: Record<string, string> = {
  master: 'finland',
  arbonaut: 'finland',
  'master-arbonaut': 'finland',
  berlin: 'automation',
  messagebird: 'leading-qa',
  'leading-qa-with-ai': 'with-ai',
}

/** The address as it is shown: no scheme, no www, no closing slash. */
export function bare(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
}

/** One line of the facts at Now. */
export interface Fact {
  label: string
  value: string
}

/**
 * The facts at Now, derived rather than written, so it cannot fall behind the
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
