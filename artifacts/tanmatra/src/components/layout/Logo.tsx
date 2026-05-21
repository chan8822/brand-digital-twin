interface LogoProps {
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}

export default function Logo({ className, "aria-hidden": ariaHidden }: LogoProps) {
  const src = `${import.meta.env.BASE_URL}tanmatra-logo.png`;
  const decorative = ariaHidden === true || ariaHidden === "true";
  return (
    <img
      src={src}
      {...(decorative ? { "aria-hidden": true, alt: "" } : { alt: "Tanmatra" })}
      className={className}
      style={{ display: "inline-block", objectFit: "contain" }}
    />
  );
}
