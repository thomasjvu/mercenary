import type { AnchorHTMLAttributes } from "react";

export const BOSSRAID_DOCS_URL = "https://boss-raid-docs.pages.dev";

type DocsButtonProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children"> & {
  href?: string;
  label?: string;
};

export function DocsButton({
  className,
  href = BOSSRAID_DOCS_URL,
  label = "VIEW DOCS",
  target = "_blank",
  rel = "noreferrer",
  ...props
}: DocsButtonProps) {
  return (
    <a className={className} href={href} target={target} rel={rel} {...props}>
      {label}
    </a>
  );
}
