interface LogoProps {
  className?: string;
}

export default function Logo({ className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 220 32"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Tanmatra"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <g transform="translate(2 2)">
        <path d="M2 2 H22 M12 2 V28" />
        <path d="M30 28 L40 2 L50 28 M34 22 H46" />
        <path d="M58 28 V2 L74 28 V2" />
        <path d="M82 28 V2 L94 18 L106 2 V28" />
        <path d="M114 28 L124 2 L134 28 M118 22 H130" />
        <path d="M142 2 H162 M152 2 V28" />
        <path d="M170 28 V2 H180 A6 6 0 0 1 180 14 H170 M180 14 L188 28" />
        <path d="M196 28 L206 2 L216 28 M200 22 H212" />
      </g>
    </svg>
  );
}
