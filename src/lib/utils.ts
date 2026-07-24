import type { QuestionView } from "./types";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeSlugInput(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function questionHeadline(
  q: Pick<QuestionView, "question" | "text">,
): string {
  return (q.question || q.text || "").trim();
}

export function questionDetails(
  q: Pick<QuestionView, "details">,
): string {
  return (q.details || "").trim();
}

export function sortQuestions(questions: QuestionView[]): QuestionView[] {
  return [...questions].sort((a, b) => {
    const aDone = Boolean(a.answered);
    const bDone = Boolean(b.answered);
    if (aDone !== bDone) return aDone ? 1 : -1; // unanswered first
    if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
    return a.createdAt - b.createdAt;
  });
}

export function questionsToCsv(questions: QuestionView[]): string {
  const header = [
    "question",
    "description",
    "author",
    "votes",
    "answered",
    "createdAt",
  ];
  const rows = sortQuestions(questions).map((q) => [
    csvEscape(questionHeadline(q)),
    csvEscape(q.details ?? ""),
    csvEscape(q.authorName),
    String(q.voteCount),
    q.answered ? "yes" : "no",
    new Date(q.createdAt).toISOString(),
  ]);
  return [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

function csvEscape(value: string): string {
  let cell = value;
  const trimmed = cell.trim();
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    cell = `'${cell}`;
  }
  if (/[",\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

export function downloadTextFile(
  filename: string,
  contents: string,
  mime = "text/csv;charset=utf-8",
): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function formatRelativeTime(ts: number): string {
  const delta = Date.now() - ts;
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
