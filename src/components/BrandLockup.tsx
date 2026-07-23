import Link from "next/link";

export function BrandLockup({
  href,
  size = "md",
}: {
  href: string;
  size?: "sm" | "md";
}) {
  return (
    <Link href={href} className={`brand-lockup brand-lockup-${size}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/rsamdio.webp"
        alt=""
        className="brand-logo"
        width={size === "sm" ? 28 : 34}
        height={size === "sm" ? 28 : 34}
      />
      <span className="brand-mark">
        Pul<span className="brand-mark-pink">se</span>
      </span>
    </Link>
  );
}
