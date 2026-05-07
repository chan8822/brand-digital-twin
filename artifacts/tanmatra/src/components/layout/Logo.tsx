interface LogoProps {
  className?: string;
}

export default function Logo({ className }: LogoProps) {
  const src = `${import.meta.env.BASE_URL}tanmatra-logo.png`;
  return (
    <span
      role="img"
      aria-label="Tanmatra"
      className={className}
      style={{
        display: "inline-block",
        aspectRatio: "1600 / 397",
        backgroundColor: "currentColor",
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}
