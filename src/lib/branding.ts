/** SEO / document titles — do not put ORG_NAME in header UI. Landing body may show it. */

export const SITE_NAME = "Pulse";
export const ORG_NAME = "Rotaract South Asia MDIO";
export const ORG_SHORT = "RSAMDIO";
export const ORG_URL = "https://rsamdio.org";
export const SITE_URL = "https://pulse.rsamdio.org";

export const TITLE_SUFFIX = `${SITE_NAME} · ${ORG_NAME}`;

export const DEFAULT_TITLE = `${SITE_NAME} · Live rooms | ${ORG_NAME}`;

export const DEFAULT_DESCRIPTION =
  "Live rooms for Q&A, polls, and open prompts. Ask, upvote, and engage in real time. By Rotaract South Asia MDIO.";

/** Richer homepage / OG description for landing SEO. */
export const LANDING_DESCRIPTION =
  "Pulse is live rooms for Rotaract clubs and districts across South Asia. Ask and upvote questions, run polls and word clouds, and present to the room. By Rotaract South Asia MDIO (RSAMDIO).";

export const LANDING_KEYWORDS = [
  "Pulse",
  "RSAMDIO",
  "Rotaract South Asia MDIO",
  "Rotaract",
  "South Asia",
  "live rooms",
  "live Q&A",
  "live poll",
  "audience engagement",
  "word cloud",
  "Rotaract meeting",
  "district assembly",
] as const;

export const OG_IMAGE_PATH = "/og.png?v=2";
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const OG_IMAGE_ALT = "Pulse · Live rooms by Rotaract South Asia MDIO";

/** Browser tab / metadata title: `Segment | Pulse · Rotaract South Asia MDIO` */
export function pageTitle(segment: string): string {
  const clean = segment.trim();
  if (!clean) return DEFAULT_TITLE;
  return `${clean} | ${TITLE_SUFFIX}`;
}
