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
import type { GlyphId } from './glyphs.ts'
import type { LogoId } from './logos.ts'

/** A fact not known yet, written so the ship gate can find it. */
export type Unknown = `[unknown: ${string}]`

export type Year = number | Unknown

/** One job or one degree. Dates as a reader writes them, `Feb 2013`; a year alone where that is all there is. */
export interface Role {
  kind: 'job' | 'degree'
  org: string
  /** The org where the facts have no room for all of it. */
  short?: string
  /** The org's own site, where it still has one: its name in the story links to it. */
  site?: string
  title: string
  /** Left out where it is not known. */
  place?: string
  from: string
  to: string
  /** The org's mark, one of its chapter's orgs. */
  logo: LogoId
  /** Short lines, one thing each. */
  points: string[]
}

/** A skill: a tool by its mark, or by its name alone where it has none. */
export interface Skill {
  name: string
  logo?: LogoId
}

/** Skills under one label, which the text CV sets as a row. */
export interface SkillSet {
  label: string
  skills: Skill[]
}

export interface Chapter {
  /** Also its hash, so lowercase words: never Lightbox's `s=`. */
  id: string
  name: string
  /** Growing up has no year to start at, so the clock, the tape and the list say where instead. Its tab says the year he was born. */
  from: Year | 'Iran'
  to: Year | 'now'
  where?: string
  /** The country it starts in, on its tab after the year: only the chapters that open in a new one. */
  country?: string
  /** The story's big line. */
  headline: string
  /** Five sentences and 500 characters at most, which the story holds on the smallest phone (life.test.ts). */
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
  /** The year he was born, which Growing up's tab starts at. */
  born: number
  intro: string
  /**
   * The face the page lands on, before any chapter: where, a hello, who he
   * is and the ways in. Play and CV in the copy are the dock's buttons too.
   */
  cover: { kicker: string; headline: string; copy: string }
  /** What he does, in a line under the name. */
  role: string
  based: string
  reach: { email: string; linkedin: string; github: string; medium: string }
  /** In start order, which is also left to right. */
  chapters: Chapter[]
  skills: SkillSet[]
  /** Medium articles, after the profile in reach. An empty url lists the title without a link. */
  writing: { title: string; url: string }[]
  outside: string
  /** `outside` in parts, each with a line icon, for the text CV. */
  interests: { glyph: GlyphId; text: string }[]
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
  born: 1989,
  intro: "Based in Germany. If it takes creativity, tech or AI, it's for me.",
  cover: {
    kicker: 'Based in Germany',
    headline: "Hi, I'm Mohsen",
    copy: "Tech lead with a focus on quality. If it takes creativity, tech or AI, it's for me. My story is in the cards below: pick one to read it, press Play to go through them all, or open my CV.",
  },
  role: 'Tech lead with a focus on quality',
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
      country: 'Iran',
      headline: 'Growing up on video games',
      copy: 'StarCraft, Warcraft and Dota were the ones I kept coming back to.',
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
      copy: 'Those were my best subjects at school, so engineering was the natural next step. I did a B.Sc. in Software Engineering at Iran University of Science and Technology.',
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
          logo: 'iust',
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
      country: 'Finland',
      headline: 'A new life in Finland',
      copy: 'I moved to Joensuu for an M.Sc. in Computer Science at the University of Eastern Finland. Long winters, deep snow, saunas, and my first job alongside the studies: full-stack developer at Arbonaut.',
      orgs: ['uef', 'arbonaut'],
      tools: ['php', 'javascript', 'openlayers', 'postgresql', 'dotnet'],
      roles: [
        {
          kind: 'degree',
          org: 'University of Eastern Finland',
          site: 'https://www.uef.fi/en',
          short: 'Eastern Finland',
          title: 'M.Sc. Computer Science',
          place: 'Joensuu, Finland',
          from: '2012',
          to: '2015',
          logo: 'uef',
          points: [],
        },
        {
          kind: 'job',
          org: 'Arbonaut',
          site: 'https://arbonaut.com',
          title: 'Full-stack Developer',
          place: 'Finland',
          from: 'Feb 2013',
          to: 'Dec 2015',
          logo: 'arbonaut',
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
      country: 'Germany',
      headline: 'Testing as a craft',
      copy: 'I moved to Berlin and its start-up scene, as a Senior QA Engineer at Hubrick. Automation became my thing: WebdriverIO and CI/CD, load tests in JMeter and Python, and quality metrics in Grafana.',
      orgs: ['hubrick'],
      tools: ['selenium', 'webdriverio', 'cypress', 'k6', 'jmeter', 'python', 'grafana', 'prometheus', 'datadog', 'testrail'],
      roles: [
        {
          kind: 'job',
          org: 'Hubrick',
          site: 'https://www.linkedin.com/company/hubrick',
          title: 'Senior QA Engineer',
          place: 'Berlin',
          from: 'Jan 2016',
          to: 'Jul 2018',
          logo: 'hubrick',
          points: [
            'QA workflow inside the feature teams, with test steps in CI/CD and TestRail.',
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
      copy: 'I stepped up to QA lead and built and grew teams at OSRAM, HeyJobs and Talentspace. Then came MessageBird in Amsterdam, LucaNet, and now CompuGroup Medical. Day to day I lead and coach manual and automation QAs, set the test automation strategy and own release management.',
      orgs: ['osram', 'heyjobs', 'talentspace', 'messagebird', 'lucanet', 'cgm'],
      tools: [],
      roles: [
        {
          kind: 'job',
          org: 'OSRAM',
          site: 'https://www.osram.com',
          title: 'QA Lead',
          place: 'Berlin',
          from: 'Aug 2018',
          to: 'Nov 2019',
          logo: 'osram',
          points: [
            'Built a QA team of three from the ground up.',
            'Manual and automated testing of web apps, microservices and their API.',
            'QA engaged early.',
            'Performance and load testing of the IoT cloud.',
          ],
        },
        {
          kind: 'job',
          org: 'HeyJobs',
          site: 'https://www.heyjobs.co',
          title: 'QA Lead',
          place: 'Berlin',
          from: 'Nov 2019',
          to: 'Aug 2020',
          logo: 'heyjobs',
          points: [
            'Metrics, monitors and alerts for error rate, page speed and downtime.',
            'Grew the team through hiring.',
            'QA from the product spec to after the release.',
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
          logo: 'talentspace',
          points: [
            'Created and managed the QA team.',
            'QA process across all feature teams, with company-wide bug triage.',
            'End-to-end framework with visual regression in Cypress, WebdriverIO and Percy.',
            'API testing in Chai and Supertest.',
            'Quality of service dashboards on Datadog, plus SonarCloud and FullStory.',
          ],
        },
        {
          kind: 'job',
          org: 'MessageBird',
          site: 'https://bird.com',
          title: 'Senior QA Engineer',
          place: 'Amsterdam',
          from: 'Feb 2022',
          to: '2024',
          logo: 'messagebird',
          points: [
            'Web and API automation with Cypress and Supertest.',
            'Load testing framework in k6 and Chai for load-heavy user journeys.',
            'Bug reporting and triage for all product teams.',
            'Dashboards, monitors and alerts on quality metrics.',
          ],
        },
        {
          kind: 'job',
          org: 'LucaNet',
          site: 'https://www.lucanet.com',
          title: 'QA Lead',
          from: '2024',
          to: '2025',
          logo: 'lucanet',
          points: ['Led the manual and automation QAs.'],
        },
        {
          kind: 'job',
          org: 'CompuGroup Medical',
          short: 'CGM',
          site: 'https://www.cgm.com/corp_en',
          title: 'QA Lead',
          from: '2025',
          to: 'now',
          logo: 'cgm',
          points: [
            'Lead the manual and automation QAs.',
            'Built an AI workflow hub: agents, tools and human review take a Jira ticket to test cases, automated tests, a merge request and a code review.',
            'The hub is becoming the standard AI workflow tool at CGM in Germany.',
            'Built a test reporting dashboard on Allure results: trends, flaky tests, coverage by team, Jira bugs, Zephyr sync and visual snapshot review.',
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
      copy: 'AI has been part of how I work since 2024, and since 2025 I ship real things with it. At CGM I built an AI workflow hub where agents, tools and human review take a Jira ticket through test cases, automated tests and a merge request to a code review. There is also my test reporting dashboard for nightly runs: trends, flaky tests, coverage by team and results synced to Zephyr. Outside work I made this site with Claude Code: the CV, Solar, Gravity and Lightbox.',
      orgs: [],
      tools: ['claude', 'openai', 'deepseek', 'jira', 'figma', 'react'],
      dye: { L: 0.75, C: 0.14, h: 190, d: 0.55 },
      lean: 0.6,
    },
  ],
  // The sentence the paper had, in rows, plus k6 and JMeter from the roles
  // and the AI tools from With AI's sheet.
  skills: [
    {
      label: 'Leading',
      skills: [
        { name: 'Building QA teams' },
        { name: '1-on-1s, syncs and reviews' },
        { name: 'Agile and scrum' },
      ],
    },
    {
      label: 'Code',
      skills: [
        { name: 'Python', logo: 'python' },
        { name: 'Java' },
        { name: 'JavaScript', logo: 'javascript' },
        { name: 'Go', logo: 'go' },
      ],
    },
    {
      label: 'Automation',
      skills: [
        { name: 'Cypress', logo: 'cypress' },
        { name: 'WebdriverIO', logo: 'webdriverio' },
        { name: 'Selenium', logo: 'selenium' },
      ],
    },
    {
      label: 'Load',
      skills: [
        { name: 'k6', logo: 'k6' },
        { name: 'JMeter', logo: 'jmeter' },
      ],
    },
    {
      label: 'Testing',
      skills: [
        { name: 'Desktop and mobile clients' },
        { name: 'REST' },
        { name: 'GraphQL', logo: 'graphql' },
        { name: 'TestRail', logo: 'testrail' },
      ],
    },
    {
      label: 'Metrics',
      skills: [
        { name: 'Grafana', logo: 'grafana' },
        { name: 'Prometheus', logo: 'prometheus' },
        { name: 'Datadog', logo: 'datadog' },
      ],
    },
    {
      label: 'AI',
      skills: [
        { name: 'Claude', logo: 'claude' },
        { name: 'ChatGPT', logo: 'openai' },
        { name: 'DeepSeek', logo: 'deepseek' },
      ],
    },
    {
      label: 'Daily with',
      skills: [{ name: 'Developers' }, { name: 'Product owners' }, { name: 'Designers' }, { name: 'Customer success' }],
    },
  ],
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
  outside: 'Space and physics, quantum physics especially, tennis and my golden retriever.',
  interests: [
    { glyph: 'orbit', text: 'Space and physics' },
    { glyph: 'atom', text: 'Quantum physics' },
    { glyph: 'tennis', text: 'Tennis' },
    { glyph: 'dog', text: 'My golden retriever' },
  ],
  closing:
    'Then see what I make for fun: Solar keeps the planets at true scale, Gravity simulates a mass bending space, Lightbox mixes colour.',
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

/** What a chapter's tab says. */
export interface Tab {
  year: number
  country?: string
}

/**
 * A chapter's tab: the year it starts, or the year he was born where there
 * is none, and the country where it opens in a new one. `1989 Iran`,
 * `2008`, `2012 Finland`.
 */
export function tabOf(chapter: Chapter, life: Life = LIFE): Tab {
  return { year: typeof chapter.from === 'number' ? chapter.from : life.born, country: chapter.country }
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

/** The ways to him on the web, in the order the page gives them, after email. */
export const WEB = ['linkedin', 'github', 'medium'] as const

/** The address as it is shown: no scheme, no www, no closing slash. */
export function bare(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
}

/** One line of the facts. */
export interface Fact {
  label: string
  value: string
}

/**
 * The facts, derived rather than written, so it cannot fall behind the
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
