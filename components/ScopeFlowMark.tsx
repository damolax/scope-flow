import type { SVGProps } from "react";

export default function ScopeFlowMark({ size = 22, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M6.75 3.75h7.7L18 7.3v12.95H6.75V3.75Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M14.25 3.95V7.5h3.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m9.1 14.05 1.8 1.8 4.25-4.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
