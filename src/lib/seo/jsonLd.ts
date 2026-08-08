import {
  LANDING_DESCRIPTION,
  ORG_NAME,
  ORG_SHORT,
  ORG_URL,
  SITE_NAME,
  SITE_URL,
} from "@/lib/branding";

export type LandingFaq = { question: string; answer: string };

export const LANDING_FAQS: LandingFaq[] = [
  {
    question: "What is Pulse?",
    answer:
      "Pulse is a live room product for Q&A and audience engagement. Organizers open a room; attendees sign in with Google to ask and upvote questions on Ask, or answer polls and short prompts on Engage.",
  },
  {
    question: "Who can create a room?",
    answer:
      "Signed-in organizers can create rooms. Platform admins can manage organizers. Attendees join with Google, and may also use a join code when the room requires one.",
  },
  {
    question: "What is the difference between Ask and Engage?",
    answer:
      "Ask is the live question board with upvotes. Engage runs MCQ polls, word clouds, and open text prompts, with an optional draft queue, timers, and reveal controls.",
  },
  {
    question: "What is Present?",
    answer:
      "Present is an audience-safe projection window for the screen share or projector. It shows prompts and revealed results without host Peek or manage chrome.",
  },
];

export function buildLandingJsonLd(faqs: LandingFaq[] = LANDING_FAQS) {
  const orgId = `${ORG_URL}/#organization`;
  const websiteId = `${SITE_URL}/#website`;
  const appId = `${SITE_URL}/#app`;

  const organization = {
    "@type": "Organization",
    "@id": orgId,
    name: ORG_NAME,
    alternateName: ORG_SHORT,
    url: ORG_URL,
    logo: `${SITE_URL}/rsamdio.webp`,
    areaServed: {
      "@type": "Place",
      name: "South Asia",
    },
  };

  const website = {
    "@type": "WebSite",
    "@id": websiteId,
    name: SITE_NAME,
    url: SITE_URL,
    description: LANDING_DESCRIPTION,
    inLanguage: "en",
    publisher: { "@id": orgId },
  };

  const software = {
    "@type": "WebApplication",
    "@id": appId,
    name: SITE_NAME,
    url: SITE_URL,
    description: LANDING_DESCRIPTION,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    browserRequirements: "Requires JavaScript and Google sign-in",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    creator: { "@id": orgId },
    publisher: { "@id": orgId },
  };

  const faqPage = {
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  return {
    "@context": "https://schema.org",
    "@graph": [organization, website, software, faqPage],
  };
}
