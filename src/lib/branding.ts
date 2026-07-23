/** SEO / document titles only — do not put ORG_NAME in header/footer UI. */

export const SITE_NAME = "Pulse";
export const ORG_NAME = "Rotaract South Asia MDIO";
export const SITE_URL = "https://pulse.rsamdio.org";

export const TITLE_SUFFIX = `${SITE_NAME} · ${ORG_NAME}`;

export const DEFAULT_TITLE = `${SITE_NAME} · Live Room Q&A | ${ORG_NAME}`;

export const DEFAULT_DESCRIPTION =
  "Live rooms where the best questions rise to the top. By Rotaract South Asia MDIO.";

/** Browser tab / metadata title: `Segment | Pulse · Rotaract South Asia MDIO` */
export function pageTitle(segment: string): string {
  const clean = segment.trim();
  if (!clean) return DEFAULT_TITLE;
  return `${clean} | ${TITLE_SUFFIX}`;
}
