import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteShell } from "@/components/site/SiteShell";
import { Parallax } from "@/components/site/Parallax";

import { useEffect, useState, type ReactNode } from "react";

import heroBg from "@/assets/hero-bg.jpg";
import aboutTeam from "@/assets/about-team.jpg";

// import insight1 from "@/assets/insight-1.jpg";
// import insight2 from "@/assets/insight-2.jpg";
// import insight3 from "@/assets/insight-3.jpg";
import blogImg5 from "@/assets/5 Key Benefits of Strategic Financial Planning for SMEs and Enterprises.avif";
import blogImg6 from "@/assets/Why Cloud Enterprise Performanc.avif";
import blogImg8 from "@/assets/real-time-decision-making.avif.avif";


import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Cloud,
  Brain,
  Database,
  Workflow,
  ShieldCheck,
  MapPin,
   X
} from "lucide-react";

/* =========================================================
   SCHEMA.ORG JSON-LD (Organization)
========================================================= */

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://www.vela-dg.com/#organization",
  name: "Vela Digital",
  url: "https://www.vela-dg.com/",
  logo: {
    "@type": "ImageObject",
    url: "https://www.vela-dg.com/assets/Scrolling%20Logo-EN6srfWp.png",
  },
  image: "https://www.vela-dg.com/assets/Scrolling%20Logo-EN6srfWp.png",
  description:
    "Vela Digital is an enterprise transformation partner helping organisations plan with precision and decide with data through enterprise planning, performance management, AI and decision intelligence, modern data platforms and cloud transformation.",
  slogan: "Plan with precision. Decide with data.",
  email: "hello@vela-dg.com",
  telephone: "+91 87660 33243",
  address: {
    "@type": "PostalAddress",
    streetAddress:
      "Unit No. C/201-202/2&3, Pune IT Park, 34 Aundh Road, Bhau Patil Marg",
    addressLocality: "Pune",
    addressRegion: "Maharashtra",
    postalCode: "411020",
    addressCountry: "IN",
  },
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "sales",
      telephone: "+91 87660 33243",
      email: "hello@vela-dg.com",
      areaServed: "Worldwide",
      availableLanguage: ["English"],
    },
  ],
  knowsAbout: [
    "Enterprise performance management",
    "Connected planning",
    "Sales and operations planning",
    "NetSuite EPM",
    "Power BI",
    "Cloud transformation",
    "AI and decision intelligence",
  ],
  sameAs: [
    "https://linkedin.com/company/vela-dg",
    "https://x.com/theveladigital",
    "https://instagram.com/theveladigital",
  ],
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title:
          "Enterprise Performance Management Consulting | Vela Digital",
      },
      {
        name: "description",
        content:
          "Vela Digital helps enterprises plan with precision and decide with data: connected planning, NetSuite EPM, Power BI and cloud transformation.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://www.vela-dg.com/",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(organizationSchema),
      },
    ],
  }),

  component: Home,
});

/* =========================================================
   SERVICES
========================================================= */

const services = [
  {
    icon: BarChart3,
    title: "Enterprise Planning",
    desc: "Unified financial, workforce, and operational planning on modern EPM platforms.",
  },
  {
    icon: Brain,
    title: "AI & Decision Intelligence",
    desc: "Operationalise AI for forecasting, scenarios and decisions that shape the future.",
  },
  {
    icon: Database,
    title: "Modern Data Platforms",
    desc: "Cloud data foundations engineered for governance, scale and speed.",
  },
  {
    icon: Workflow,
    title: "Performance Management",
    desc: "Close the loop from strategy to execution with metrics that move teams.",
  },
  {
    icon: Cloud,
    title: "Cloud Transformation",
    desc: "Migrate, modernise and re-architect critical systems with superior performance.",
  },
  {
    icon: ShieldCheck,
    title: "Advisory & Governance",
    desc: "Pragmatic guidance, target operating models and value-led roadmaps.",
  },
];

/* =========================================================
   HOME SUCCESS STORIES
========================================================= */

const homeSuccessStories = [
  {
    id: 1,
    category: "Automotive · Manufacturing",
    categories: ["Automotive", "Manufacturing"],
    platform: "Anaplan",
    location: "India",
    solutions: ["Sales & Operational Planning (S&OP)"],
    eyebrow: "Anaplan • S&OP",
    metric: "",
    metricLabel: "Supply matched to demand, end to end",
    title: "End-to-End Sales & Operational Planning for a Global Automaker",
    subtitle:
      "A connected S&OP model on Anaplan giving demand, supply, dealers and leadership one place to review and edit data.",
    description:
      "A connected S&OP model giving demand, supply, dealers and leadership one place to review and edit planning data.",
    excerpt:
      "The customer is an India-headquartered global automotive manufacturer and a leading producer of passenger and commercial vehicles, recognised for its innovation, engineering excellence and commitment to safe, sustainable, mobility-focused transportation solutions.",
    challenge:
      "The organisation needed a single connected planning environment that could give every stakeholder in the supply chain early visibility and automate routine forecasting and replenishment decisions.",
    solution:
      "Vela Digital built an end-to-end S&OP model on Anaplan that gives demand and supply planning teams, dealers and leadership role-based access to review and edit data, integrated with the customer's core systems.",
    result:
      "The customer moved from disconnected, manual planning to a single Anaplan-based connected planning platform spanning demand, supply and dealer networks, with dedicated dashboards for every planning team.",
    businessNeeds: [
      "End-to-end visibility across all supply chain stakeholders to achieve the best match between supply and demand",
      "Automation of standard and routine actions such as forecasts, stock norms, replenishment and allocations",
      "Alerts and early visibility into planning exceptions",
      "A collaborative platform for joint value creation across the company, its partners and customers",
    ],
    outcomes: [
      "End-to-end S&OP model on Anaplan serving demand, supply, dealers and leadership by role",
      "Automated connected planning solution for enterprise-wide planning and reporting",
      "Seamless data integration with SAP, CRM, PRM, RCCP and TMLD systems",
      "Improved business outcomes through predictive insights and reduced complexity",
      "Purpose-built UX dashboards for Ops Planning, Demand & Sales Planning and IB Planning teams",
    ],
    image:
      "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1400&q=85",
  },

  {
    id: 4,
    category: "Home Furnishing · Manufacturing",
    categories: ["Home Furnishing", "Manufacturing"],
    platform: "Anaplan",
    location: "USA",
    solutions: [
      "Financial Planning & Analysis (FP&A)",
      "MIS Reporting",
    ],
    eyebrow: "Anaplan • FP&A & MIS Reporting",
    metric: "",
    metricLabel: "Automated & Connected Plan",
    title: "SKU-Level Gross Margin Planning for a Sleep & Comfort Leader",
    subtitle:
      "Automated connected planning solution on Anaplan for enterprise-wide planning and reporting.",
    description:
      "An integrated Anaplan model connecting demand, plant labor cost and SKU-level gross margin planning to SAP.",
    excerpt:
      "A leading producer of sleep and comfort solutions across the entire value chain, designing, manufacturing and delivering mattresses, toppers and pillows under a growing portfolio of owned brands across highly diversified retail channels.",
    challenge:
      "Excel-based planning could not capture the SKU-level detail the business needed, and gross margin, demand and labor planning were disconnected from each other and from SAP.",
    solution:
      "Vela Digital implemented an automated, connected Anaplan planning solution integrated with SAP and HFM, and with ADP for employee-level workforce planning.",
    result:
      "The business replaced manual spreadsheet planning with a connected Anaplan model giving SKU-level gross margin visibility, integrated labor cost planning, and a full multi-year operating plan and monthly forecast cycle.",
    businessNeeds: [
      "Replace a manual, Excel-based planning and reporting process",
      "Capture more planning detail than Excel could support",
      "Plan employee-level cost for the plant labor force",
      "Integrate with SAP for demand and gross margin plan data at SKU level",
      "Calculate gross margin at SKU level with fast scenario analysis",
    ],
    outcomes: [
      "Automated connected planning solution on Anaplan",
      "Data integration with SAP and HFM systems",
      "Integration with ADP for employee-level workforce planning",
      "Gross margin planning by SKU, customer, SBU and plant",
      "Ability to prepare a multi-year operating plan and monthly forecast",
    ],
    image:
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1400&q=85",
  },

  {
    id: 5,
    category: "Fintech · Consumer Finance",
    categories: ["Fintech", "Consumer Finance"],
    platform: "Anaplan",
    location: "USA",
    solutions: [
      "Financial Planning & Analysis (FP&A)",
      "MIS Reporting",
    ],
    eyebrow: "Anaplan • FP&A & MIS Reporting",
    metric: "",
    metricLabel: "Planning cycle, from weeks to days",
    title: "Faster Forecasting and Employee-Level Cost Planning for a Fintech",
    subtitle:
      "Replacing disconnected spreadsheets with an Anaplan model built for complex, amortization-driven revenue forecasting.",
    description:
      "Replacing disconnected spreadsheets with an Anaplan model built for complex, amortization-driven revenue forecasting.",
    excerpt:
      "A leading Fintech & Consumer Finance company founded in 2003, using data science and technology to create opportunities for its customers, employees and merchants.",
    challenge:
      "Revenue forecasting depended on complex, loan-type-specific amortization drivers that numerous disconnected Excel sheets could not model or refresh quickly enough.",
    solution:
      "Vela Digital built an automated, connected Anaplan planning solution integrated with NetSuite ERP for actuals, supporting 3–5 year amortization-based revenue forecasting and employee-level workforce cost planning.",
    result:
      "The business cut its planning cycle from weeks to 2–3 days, gained a connected view of NetSuite actuals, and can now model complex, multi-year revenue amortization scenarios.",
    businessNeeds: [
      "Source actuals from NetSuite ERP for faster monthly reporting",
      "Collaborate faster across departments",
      "Build complex revenue forecast models",
      "Overcome manual plan and forecast preparation",
      "Forecast revenue using 3–5 year amortization models",
    ],
    outcomes: [
      "Automated connected planning solution on Anaplan",
      "Data integration with NetSuite ERP",
      "Plans can now be prepared within 2–3 days instead of weeks",
      "Employee-level workforce cost planning",
      "Ability to plan revenue out 3–5 years",
    ],
    image:
      "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1400&q=85",
  },
] as const;

/* =========================================================
   LATEST INSIGHTS
========================================================= */

const insights: Array<{
  tag: string;
  title: string;
  description: string;
  read: string;
  date: string;
  image: string;
  to: string;
}> = [
  {
    tag: "Cloud EPM",
    title:
      "Why Cloud Enterprise Performance Management Is the Future of Financial Decision-Making",
    description:
      "How Cloud EPM combines real-time insight, automation and scalability to modernise enterprise finance.",
    read: "7 min",
    date: "Aug 2026",
    image: blogImg6,
    to: "/insights/cloud-epm",
  },

  {
    tag: "Connected Planning",
    title:
      "Real-Time Decision-Making with Connected Planning: A Competitive Advantage",
    description:
      "How connected data, people and processes improve agility, forecasting and real-time business decisions.",
    read: "8 min",
    date: "Aug 2026",
    image: blogImg8,
    to: "/insights/connected-planning",
  },

  {
    tag: "Strategic Financial Planning",
    title:
      "5 Key Benefits of Strategic Financial Planning for SMEs and Enterprises",
    description:
      "Why forward-looking financial planning matters for capital allocation, cash flow, growth and resilience.",
    read: "6 min",
    date: "Aug 2026",
    image: blogImg5,
    to: "/insights/strategic-financial-planning",
  },
];

/* =========================================================
   HOME
========================================================= */

function Home() {
  const [selectedStory, setSelectedStory] =
    useState<(typeof homeSuccessStories)[number] | null>(null);

  useEffect(() => {
    if (!selectedStory) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedStory(null);
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [selectedStory]);

  return (
    <SiteShell>
      {/* =====================================================
          HERO SECTION
      ===================================================== */}

      <section className="relative isolate overflow-hidden bg-navy-deep text-primary-foreground">
        <div className="absolute inset-0">
          <img
            src={heroBg}
            alt=""
            width={1920}
            height={1280}
            className="h-full w-full object-cover opacity-60"
          />

          <div className="absolute inset-0 bg-gradient-to-b from-navy-deep/40 via-navy-deep/60 to-navy-deep" />
          <div className="absolute inset-0 bg-grain opacity-40" />
        </div>

        <div className="relative mx-auto flex min-h-[100svh] max-w-7xl flex-col justify-end px-6 pb-24 pt-40">
          <p className="text-eyebrow text-primary-foreground/70 reveal">
            Enterprise transformation · Cloud · AI · Data
          </p>

          <h1 className="mt-6 text-display text-[clamp(3rem,9vw,9rem)] reveal reveal-delay-1">
            Plan with
            <br />

            <span className="italic font-medium text-primary-foreground/80">
              precision.
            </span>{" "}

            <span className="block">Decide with data.</span>
          </h1>

          <div className="mt-10 grid gap-10 md:grid-cols-12">
            <p className="md:col-span-6 text-lg leading-relaxed text-primary-foreground/80 reveal reveal-delay-2">
              Vela Digital is the transformation partner for
              enterprises outgrowing the way they plan. We modernise planning, performance management and
              analytics — so businesses move faster, with conviction.
            </p>

            <div className="md:col-span-6 flex flex-wrap items-end gap-4 md:justify-end reveal reveal-delay-3">
              <Link
                to="/contact"
                className="group inline-flex items-center gap-3 rounded-full bg-primary-foreground px-7 py-4 text-sm font-semibold text-navy-deep transition-all hover:shadow-glow"
              >
                Schedule a consultation

                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>

              <Link
                to="/services"
                className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/30 px-7 py-4 text-sm font-medium hover:bg-primary-foreground/10"
              >
                Explore services
              </Link>
            </div>
          </div>
        </div>

        {/* PARTNERS MARQUEE */}

        <div className="relative overflow-hidden border-t border-primary-foreground/10">
          <div className="marquee flex whitespace-nowrap py-5 text-sm tracking-[0.3em] uppercase text-primary-foreground/40">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="px-10">
                Anaplan · Jedox · NetSuite EPM · insightsoftware · Azure · Power
                BI · Tableau ·
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* =====================================================
          WHO WE ARE
      ===================================================== */}

      <section className="relative mx-auto max-w-7xl px-6 py-32">
        <div className="grid gap-16 md:grid-cols-12">
          <div className="md:col-span-5">
            <p className="text-eyebrow">Who we are</p>

            <h2 className="mt-5 text-display text-5xl text-navy-deep">
              A modern partner for complex enterprises.
            </h2>

            <p className="mt-8 text-xl leading-relaxed text-foreground/80">
              We work shoulder-to-shoulder with CXOs and transformation leaders
              to make planning faster, performance
              sharper and decisions clearer.
            </p>

            <p className="mt-6 text-base leading-relaxed text-muted-foreground">
              No bloated decks. No theatre. Just subject matter experts, proven
              methodologies and platforms engineered to scale with your
              business.
            </p>
          </div>

          <div className="md:col-span-6 md:col-start-7">
            <Parallax
              speed={0.12}
              className="relative overflow-hidden rounded-[2rem] aspect-[4/5] shadow-elegant"
            >
              <img
                src={aboutTeam}
                alt="Enterprise leadership reviewing a luminous performance dashboard"
                width={1024}
                height={1280}
                loading="lazy"
                className="h-[115%] w-full object-cover"
              />

              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-navy-deep/60 via-transparent to-transparent" />

              <div className="absolute bottom-6 left-6 right-6 text-primary-foreground">
                <p className="text-eyebrow text-primary-foreground/70">
                  In the room
                </p>

                <p className="mt-2 text-display text-2xl">
                  Senior practitioners. Every engagement.
                </p>
              </div>
            </Parallax>
          </div>
        </div>
      </section>

      {/* =====================================================
          SERVICES
      ===================================================== */}

      <section className="relative bg-navy-deep py-32 text-primary-foreground">
        <div className="absolute inset-0 bg-grain opacity-20" />

        <div className="relative mx-auto max-w-7xl px-6">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="text-eyebrow text-primary-foreground/60">
                What we do
              </p>

              <h2 className="mt-4 text-display text-5xl md:text-6xl">
                Six disciplines.
                <br />
                One direction.
              </h2>
            </div>

            <Link
              to="/services"
              className="hidden sm:inline-flex items-center gap-2 rounded-full border border-primary-foreground/30 px-5 py-2.5 text-sm hover:bg-primary-foreground/10"
            >
              All services

              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-16 grid gap-px overflow-hidden rounded-3xl bg-primary-foreground/10 md:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <div
                key={service.title}
                className="group relative bg-navy-deep p-10 transition-colors hover:bg-navy"
              >
                <service.icon
                  className="h-9 w-9 text-primary-foreground/90 transition-transform duration-500 group-hover:rotate-6 group-hover:scale-110"
                  strokeWidth={1.4}
                />

                <h3 className="mt-8 text-2xl text-display">
                  {service.title}
                </h3>

                <p className="mt-3 text-sm leading-relaxed text-primary-foreground/65">
                  {service.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =====================================================
          SUCCESS STORIES
      ===================================================== */}

      <section className="relative overflow-hidden bg-[#F8F8F5] py-28 md:py-32">
        <div className="pointer-events-none absolute -left-32 top-10 h-[420px] w-[420px] rounded-full bg-[#172846]/[0.035] blur-[100px]" />

        <div className="pointer-events-none absolute -right-32 bottom-0 h-[420px] w-[420px] rounded-full bg-[#172846]/[0.04] blur-[100px]" />

        <div className="relative mx-auto max-w-7xl px-6">
          <div className="flex flex-col gap-8 border-b border-[#172846]/10 pb-10 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3">
                <span className="h-px w-8 bg-[#172846]/40" />

                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#172846]/45">
                  Success Stories
                </p>
              </div>

              <h2 className="mt-5 text-display text-[2.8rem] leading-[1.02] tracking-[-0.045em] text-[#051531] sm:text-5xl md:text-6xl">
                Real transformation.
                <br />

                <span className="italic font-medium text-[#051531]/55">
                  Measurable outcomes.
                </span>
              </h2>

              <p className="mt-6 max-w-2xl text-sm leading-7 text-[#172846]/55 md:text-base">
                See how organisations are replacing disconnected processes with
                connected planning, stronger visibility and faster,
                better-informed decisions.
              </p>
            </div>
          </div>

          <div className="mt-12 grid gap-7 md:grid-cols-2 lg:grid-cols-3">
            {homeSuccessStories.map((story, index) => (
              <article
                key={story.title}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedStory(story)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedStory(story);
                  }
                }}
                className="group relative isolate flex min-h-[560px] overflow-hidden rounded-[2rem] bg-[#051531] shadow-[0_20px_60px_rgba(5,21,49,0.08)]"
              >
                <div className="absolute inset-0 -z-20 overflow-hidden">
                  <img
                    src={story.image}
                    alt={story.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-[1000ms] ease-out group-hover:scale-[1.07]"
                  />
                </div>

                <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#051531]/5 via-[#051531]/30 to-[#051531]/95" />

                <div className="absolute inset-x-0 bottom-0 -z-10 h-[75%] bg-gradient-to-t from-[#051531] via-[#051531]/75 to-transparent" />

                <div className="absolute left-7 top-7 z-10 text-[10px] font-semibold tracking-[0.2em] text-white/50">
                  0{index + 1}
                </div>

                <div className="absolute right-6 top-6 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-white/95 text-[#051531] shadow-lg transition-all duration-300 group-hover:-translate-y-1 group-hover:translate-x-1">
                  <ArrowUpRight className="h-[18px] w-[18px]" />
                </div>

                <div className="relative z-10 mt-auto w-full p-7 md:p-8">
                  <div className="mb-5 flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-lg">
                      {story.platform}
                    </span>

                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#051531]/20 px-3 py-1.5 text-[9px] font-medium uppercase tracking-[0.08em] text-white/75 backdrop-blur-lg">
                      <MapPin className="h-3 w-3" />
                      {story.location}
                    </span>
                  </div>

                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/45">
                    {story.category}
                  </p>

                  <div className="mt-5 border-b border-white/15 pb-5">
                    <span className="text-[10px] leading-[1.45] text-white/50">
                      {story.metricLabel}
                    </span>
                  </div>

                  <p className="mt-5 text-[10px] font-medium uppercase tracking-[0.08em] text-white/50">
                    {story.solution}
                  </p>

                  <h3 className="mt-3 text-display text-[1.55rem] leading-[1.16] tracking-[-0.03em] text-white md:text-[1.7rem]">
                    {story.title}
                  </h3>

                  <p className="mt-4 line-clamp-3 text-[13px] leading-6 text-white/60">
                    {story.description}
                  </p>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-10 flex justify-center">
            <Link
              to="/success-stories"
              className="group inline-flex items-center gap-2 rounded-full bg-[#051531] px-7 py-4 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg"
            >
              Explore all success stories

              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>
      {/* =====================================================
          WHY VELA
      ===================================================== */}

      <section className="relative bg-sand py-32">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-16 md:grid-cols-12">
            <div className="md:col-span-5">
              <p className="text-eyebrow">Why Vela Digital</p>

              <h2 className="mt-5 text-display text-5xl text-navy-deep">
                Experienced. Resourceful. Accountable.
              </h2>

              <p className="mt-6 text-base leading-relaxed text-muted-foreground">
                We bring subject matter experts not a pyramid of trainees to
                every engagement. Our methodology is opinionated, our roadmaps
                are honest, and our success is measured the same way yours is.
              </p>
            </div>

            <div className="md:col-span-7">
              <ul className="divide-y divide-border border-y border-border">
                {[
                  [
                    "Industry expertise",
                    "Deep expertise and proven playbooks across major industries, including manufacturing, retail, healthcare, real estate, and more.",
                  ],
                  [
                    "Business-focused",
                    "We start with the outcome, then choose the technology never the other way round.",
                  ],
                  [
                    "Proven delivery",
                    "A battle-tested delivery framework, refined across numerous programs and proven to deliver measurable, repeatable results",
                  ],
                  [
                    "Long-term partnership",
                    "Committed to your success—today, tomorrow, and beyond.",
                  ],
                ].map(([title, description]) => (
                  <li
                    key={title}
                    className="group grid grid-cols-12 gap-6 py-7"
                  >
                    <div className="col-span-12 sm:col-span-4 text-display text-2xl text-navy-deep">
                      {title}
                    </div>

                    <p className="col-span-12 sm:col-span-8 text-base text-foreground/80">
                      {description}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================
          LATEST INSIGHTS
      ===================================================== */}

      <section className="bg-[#F7F9FC] py-32">
        <div className="mx-auto max-w-[1440px] px-6 sm:px-10 lg:px-16">
          <div className="mb-16 flex flex-col gap-7 border-b border-[#172846]/10 pb-10 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="h-px w-8 bg-[#172846]/40" />

                <p className="text-[11px] font-semibold uppercase tracking-[0.21em] text-[#172846]/45">
                  Latest insights
                </p>
              </div>

              <h2 className="mt-5 text-display text-4xl tracking-[-0.04em] text-[#172846] md:text-5xl">
                From the field.
              </h2>

              <p className="mt-5 max-w-2xl text-sm leading-7 text-[#172846]/50 md:text-base">
                Practical thinking on finance, planning, EPM and financial
                reporting from our specialists.
              </p>
            </div>

            <Link
              to="/insights"
              className="group inline-flex items-center gap-2 text-sm font-semibold text-[#172846]"
            >
              <span>Explore all insights</span>

              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="grid gap-x-8 gap-y-16 md:grid-cols-2 lg:grid-cols-3">
            {insights.map((article, index) => (
              <Link
                key={article.title}
                to={article.to}
                className="group flex h-full flex-col"
              >
                <div className="relative aspect-[4/3] overflow-hidden rounded-[1.55rem] bg-[#EAF0F7]">
                  <img
                    src={article.image}
                    alt={article.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-[850ms] ease-out group-hover:scale-[1.05]"
                  />

                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#051531]/35 via-transparent to-transparent" />

                  <div className="absolute left-5 top-5">
                    <span className="inline-flex rounded-full border border-white/35 bg-white/90 px-3.5 py-1.5 text-[10px] font-semibold text-[#172846] shadow-sm backdrop-blur-md">
                      {article.tag}
                    </span>
                  </div>

                  <div className="absolute bottom-5 right-5 flex h-11 w-11 translate-y-2 items-center justify-center rounded-full bg-white text-[#172846] opacity-0 shadow-xl transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                    <ArrowUpRight className="h-4 w-4" />
                  </div>
                </div>

                <div className="flex flex-1 flex-col pt-6">
                  <div className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.06em] text-[#172846]/35">
                    <span>{article.read}</span>

                    <span className="h-1 w-1 rounded-full bg-[#172846]/18" />

                    <span>{article.date}</span>
                  </div>

                  <h3 className="mt-4 text-display text-[1.55rem] leading-[1.17] tracking-[-0.03em] text-[#172846] transition-opacity duration-300 group-hover:opacity-65">
                    {article.title}
                  </h3>

                  <p className="mt-4 line-clamp-3 text-sm leading-7 text-[#172846]/52">
                    {article.description}
                  </p>

                  <div className="mt-auto pt-7">
                    <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#172846]">
                      <span>Read article</span>

                      <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-1" />
                    </div>
                  </div>

                  {index < insights.length - 1 && (
                    <div className="mt-8 h-px bg-[#172846]/[0.07] lg:hidden" />
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {selectedStory && (
        <HomeStoryLightbox
          story={selectedStory}
          onClose={() => setSelectedStory(null)}
        />
      )}
    </SiteShell>
  );
}


function HomeStoryLightbox({
  story,
  onClose,
}: {
  story: (typeof homeSuccessStories)[number];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#071120]/80 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label={story.title}
    >
      <div className="relative max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* CLOSE BUTTON */}

        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-[#172846]/90 text-white backdrop-blur transition hover:bg-[#172846]"
          aria-label="Close success story"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="max-h-[92vh] overflow-y-auto">
          {/* HERO IMAGE */}

          <div className="relative min-h-[320px] overflow-hidden bg-[#172846] sm:min-h-[390px]">
            <img
              src={story.image}
              alt={story.title}
              className="absolute inset-0 h-full w-full object-cover"
            />

            <div className="absolute inset-0 bg-gradient-to-t from-[#172846] via-[#172846]/55 to-[#172846]/15" />

            <div className="relative flex min-h-[320px] flex-col justify-end p-6 text-white sm:min-h-[390px] sm:p-9 lg:p-12">
              {/* BADGES */}

              <div className="mb-5 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] backdrop-blur">
                  {story.platform}
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] backdrop-blur">
                  <MapPin className="h-3 w-3" />
                  {story.location}
                </span>
              </div>

              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/65">
                {story.eyebrow}
              </p>

              <h2 className="mt-3 max-w-4xl text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl lg:text-5xl">
                {story.title}
              </h2>

              <p className="mt-4 max-w-3xl text-sm leading-7 text-white/75 sm:text-base">
                {story.subtitle}
              </p>
            </div>
          </div>

          {/* CONTENT */}

          <div className="grid gap-8 p-6 sm:p-9 lg:grid-cols-[1.6fr_0.8fr] lg:p-12">
            <div>
              {/* ABOUT */}

              <HomeModalSection title="About the client">
                <p>{story.excerpt}</p>
              </HomeModalSection>

              {/* BUSINESS NEEDS */}

              <HomeModalSection title="Business needs / challenge">
                <p>{story.challenge}</p>

                <HomeModalList items={[...story.businessNeeds]} />
              </HomeModalSection>

              {/* SOLUTION */}

              <HomeModalSection title="Solution">
                <p>{story.solution}</p>
              </HomeModalSection>

              {/* RESULTS */}

              <HomeModalSection title="Results">
                <p>{story.result}</p>
              </HomeModalSection>

              {/* OUTCOMES */}

              <HomeModalSection title="Key outcomes">
                <HomeModalList items={[...story.outcomes]} />
              </HomeModalSection>
            </div>

            {/* SNAPSHOT */}

            <aside className="h-fit rounded-2xl border border-[#172846]/10 bg-[#f6f7f9] p-5 sm:p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#172846]/45">
                Case study snapshot
              </p>

              <div className="mt-5 border-b border-[#172846]/10 pb-5">
                <div className="text-4xl font-semibold tracking-tight text-[#172846]">
                  {story.metric || "—"}
                </div>

                <div className="mt-1 text-sm text-[#172846]/55">
                  {story.metricLabel}
                </div>
              </div>

              <HomeSnapshotRow
                label="Platform"
                value={story.platform}
              />

              <HomeSnapshotRow
                label="Territory"
                value={story.location}
              />

              <HomeSnapshotRow
                label="Industry"
                value={story.categories.join(" • ")}
              />

              <HomeSnapshotRow
                label="Solution"
                value={story.solutions.join(" • ")}
              />
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}


function HomeModalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-[#172846]/10 pb-7 [&+section]:pt-7">
      <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-[#172846]/50">
        {title}
      </h3>

      <div className="mt-3 text-sm leading-7 text-[#172846]/70">
        {children}
      </div>
    </section>
  );
}

function HomeModalList({
  items,
}: {
  items: readonly string[];
}) {
  return (
    <ul className="mt-4 space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#172846]" />

          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function HomeSnapshotRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="border-b border-[#172846]/10 py-4 last:border-b-0">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#172846]/40">
        {label}
      </div>

      <div className="mt-1.5 text-sm font-semibold leading-6 text-[#172846]">
        {value}
      </div>
    </div>
  );
}
