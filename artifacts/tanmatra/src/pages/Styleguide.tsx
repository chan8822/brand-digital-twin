import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  ForkKnife,
  Calendar,
  Stethoscope,
  UsersThree,
  UserCircle,
  Sparkle,
  HandHeart,
  ShieldCheck,
} from "@phosphor-icons/react";
import { Heart, Activity, Flame, Leaf, Dumbbell } from "lucide-react";
import { motion } from "framer-motion";
import { DURATION, EASE, FADE_IN_UP } from "@/lib/motion";

const swatches = [
  { name: "background", token: "--color-background", value: "hsl(0 0% 2%)" },
  { name: "clinical-dark", token: "--color-clinical-dark", value: "#050505" },
  { name: "clinical-surface", token: "--color-clinical-surface", value: "#0A0A0C" },
  { name: "clinical-surface-elevated", token: "--color-clinical-surface-elevated", value: "#111114" },
  { name: "clinical-gold", token: "--color-clinical-gold", value: "#D4AF37" },
  { name: "clinical-blue", token: "--color-clinical-blue", value: "#6BA3C8" },
  { name: "clinical-sage", token: "--color-clinical-sage", value: "#7D9E7E" },
  { name: "clinical-slate", token: "--color-clinical-slate", value: "#334155" },
  { name: "clinical-zinc", token: "--color-clinical-zinc", value: "#A1A1AA" },
  { name: "destructive", token: "--color-destructive", value: "hsl(0 72% 51%)" },
];

const radii = [
  { name: "xs", value: "0.25rem" },
  { name: "sm", value: "0.375rem" },
  { name: "md", value: "0.625rem" },
  { name: "lg", value: "0.875rem" },
  { name: "xl", value: "1.125rem" },
  { name: "2xl", value: "1.5rem" },
];

const motionTokens = [
  { name: "instant", value: `${DURATION.instant * 1000}ms` },
  { name: "fast", value: `${DURATION.fast * 1000}ms` },
  { name: "base", value: `${DURATION.base * 1000}ms` },
  { name: "slow", value: `${DURATION.slow * 1000}ms` },
  { name: "slower", value: `${DURATION.slower * 1000}ms` },
];

function Section({ title, kicker, children }: { title: string; kicker?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        {kicker && <p className="text-clinical-label">{kicker}</p>}
        <h2 className="text-clinical-h2 text-white mt-1">{title}</h2>
      </div>
      <Separator className="bg-clinical-slate/30" />
      <div>{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Contrast helpers — sRGB → relative luminance → WCAG ratio.
// Used by AlertPaletteGrid to print a live ratio for every text token
// over the clinical-dark background, so reviewers can verify AAA at a
// glance instead of trusting a comment.
// ---------------------------------------------------------------------------
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = parseInt(
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h,
    16,
  );
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function relLum([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(fg: string, bg: string): number {
  const a = relLum(hexToRgb(fg));
  const b = relLum(hexToRgb(bg));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}
const ALERTS = [
  { name: "Allergen Red", accent: "#FF6B6B", text: "#FF9999", token: "alert-allergen" },
  { name: "STAT Amber", accent: "#F59E0B", text: "#FCD34D", token: "alert-stat" },
  { name: "Safe Green", accent: "#4ADE80", text: "#86EFAC", token: "alert-safe" },
  { name: "Info Blue", accent: "#60A5FA", text: "#93C5FD", token: "alert-info" },
];

function AlertPaletteGrid() {
  const bg = "#050505";
  return (
    <div className="space-y-4">
      <p className="text-body-sm text-clinical-zinc">
        Each alert has an accent (chip background, border) and a text variant
        tuned for ≥7:1 contrast on the clinical-dark background. The ratios
        below are computed live in the browser.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ALERTS.map((a) => {
          const ratioText = contrast(a.text, bg);
          const ratioAccent = contrast(a.accent, bg);
          const aaaText = ratioText >= 7;
          return (
            <div
              key={a.token}
              className="rounded-lg border border-clinical-slate/30 bg-clinical-surface overflow-hidden"
            >
              <div className="flex">
                <div className="h-20 w-20 shrink-0" style={{ background: a.accent }} />
                <div className="h-20 w-20 shrink-0" style={{ background: a.text }} />
                <div className="p-3 min-w-0 flex-1">
                  <p className="text-caption text-white font-medium">{a.name}</p>
                  <p className="text-[10px] text-clinical-zinc font-mono mt-0.5">
                    --color-{a.token} · {a.accent}
                  </p>
                  <p className="text-[10px] text-clinical-zinc font-mono">
                    --color-{a.token}-text · {a.text}
                  </p>
                </div>
              </div>
              <div className="px-3 py-2 border-t border-clinical-slate/30 bg-clinical-dark">
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <p className="text-clinical-zinc">Text on dark</p>
                    <p
                      className="font-mono tabular-nums"
                      style={{ color: a.text }}
                    >
                      {ratioText.toFixed(2)}:1{" "}
                      <span
                        className={
                          aaaText
                            ? "text-clinical-sage"
                            : "alert-allergen-text"
                        }
                      >
                        {aaaText ? "AAA" : "below AAA"}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-clinical-zinc">Accent on dark</p>
                    <p
                      className="font-mono tabular-nums"
                      style={{ color: a.accent }}
                    >
                      {ratioAccent.toFixed(2)}:1
                    </p>
                  </div>
                </div>
              </div>
              {/* Sample chip + body using the canonical utility classes */}
              <div
                className={`m-3 rounded-md border px-2.5 py-1.5 flex items-center gap-2 ${a.token}-bg ${a.token}-border`}
              >
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${a.token}-bg-strong ${a.token}-text ${a.token}-border`}
                >
                  {a.name.split(" ")[0]}
                </span>
                <span className={`text-[12px] ${a.token}-text`}>
                  Sample alert body using <code className="font-mono">.{a.token}-text</code>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Styleguide() {
  return (
    <div className="min-h-screen bg-clinical-dark">
      {/* Hero */}
      <div className="border-b border-clinical-slate/20 bg-gradient-to-b from-clinical-gold/5 to-transparent">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <p className="text-clinical-label text-clinical-gold">Tanmatra · Design System</p>
          <h1 className="text-display text-white mt-3">
            Clinical, calm, <span className="italic">precise.</span>
          </h1>
          <p className="text-body-lg text-clinical-zinc mt-5 max-w-2xl">
            The visual language behind Tanmatra. Every token here is wired into both Tailwind utilities and JS motion helpers so screens stay in lockstep.
          </p>
          <div className="flex items-center gap-2 mt-6 text-caption text-clinical-zinc">
            <kbd className="rounded bg-clinical-slate/40 px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
            <span>opens the command palette anywhere in the app</span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-12 space-y-16">
        {/* Type scale */}
        <Section title="Type scale" kicker="Inter Variable · Instrument Serif · JetBrains Mono">
          <div className="space-y-5">
            <div>
              <p className="text-clinical-label">.text-display · serif</p>
              <p className="text-display text-white mt-1">A meal, designed.</p>
            </div>
            <div>
              <p className="text-clinical-label">.text-clinical-h1</p>
              <p className="text-clinical-h1 text-white mt-1">Therapeutic nutrition</p>
            </div>
            <div>
              <p className="text-clinical-label">.text-clinical-h2</p>
              <p className="text-clinical-h2 text-white mt-1">Clinical menu</p>
            </div>
            <div>
              <p className="text-clinical-label">.text-clinical-h3</p>
              <p className="text-clinical-h3 text-white mt-1">Macros, decoded</p>
            </div>
            <div>
              <p className="text-clinical-label">.text-clinical-h4</p>
              <p className="text-clinical-h4 text-white mt-1">Section heading</p>
            </div>
            <div>
              <p className="text-clinical-label">.text-body-lg / .text-body / .text-body-sm</p>
              <p className="text-body-lg text-white mt-1">Body large · the calm reading size for editorial passages.</p>
              <p className="text-body text-white mt-1">Body default · used everywhere by default.</p>
              <p className="text-body-sm text-clinical-zinc mt-1">Body small · captions, micro-context, helper text.</p>
            </div>
            <div>
              <p className="text-clinical-label">.text-clinical-data</p>
              <p className="text-clinical-data text-clinical-gold mt-1">412 kcal · 38 g protein · 24 g carbs</p>
            </div>
            <div>
              <p className="text-clinical-label">.text-clinical-label</p>
              <p className="text-clinical-label mt-1">Macros · Tabular nums everywhere</p>
            </div>
          </div>
        </Section>

        {/* Color */}
        <Section title="Color tokens" kicker="Clinical Dark palette">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {swatches.map((s) => (
              <div
                key={s.token}
                className="rounded-lg border border-clinical-slate/30 bg-clinical-surface overflow-hidden"
              >
                <div className="h-16" style={{ background: `var(${s.token})` }} />
                <div className="p-3">
                  <p className="text-caption text-white font-medium">{s.name}</p>
                  <p className="text-[10px] text-clinical-zinc font-mono mt-0.5">{s.value}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Radii */}
        <Section title="Radii" kicker="Surface curvature">
          <div className="flex flex-wrap gap-3">
            {radii.map((r) => (
              <div
                key={r.name}
                className="flex flex-col items-center gap-2 p-4 border border-clinical-slate/30 bg-clinical-surface"
                style={{ borderRadius: `var(--radius-${r.name})` }}
              >
                <div
                  className="w-16 h-16 bg-clinical-gold/15"
                  style={{ borderRadius: `var(--radius-${r.name})` }}
                />
                <p className="text-caption text-white font-mono">{r.name}</p>
                <p className="text-[10px] text-clinical-zinc">{r.value}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Motion */}
        <Section title="Motion" kicker="Durations & easing">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {motionTokens.map((m) => (
              <motion.div
                key={m.name}
                whileHover={{ y: -4, scale: 1.02 }}
                transition={{ duration: DURATION.base, ease: EASE.standard }}
                className="rounded-lg border border-clinical-slate/30 bg-clinical-surface p-4 cursor-default"
              >
                <p className="text-clinical-label">{m.name}</p>
                <p className="text-clinical-data text-clinical-gold mt-1">{m.value}</p>
              </motion.div>
            ))}
          </div>
          <motion.div
            {...FADE_IN_UP}
            className="mt-6 rounded-lg border border-clinical-gold/30 bg-clinical-gold/5 px-4 py-3"
          >
            <p className="text-body-sm text-white">
              FADE_IN_UP entrance — apply to hero/copy blocks for the same fade-rise rhythm everywhere.
            </p>
          </motion.div>
        </Section>

        {/* Iconography */}
        <Section title="Iconography" kicker="Phosphor (primary) · Lucide (legacy)">
          <Card className="bg-clinical-surface border-clinical-slate/30 p-5">
            <p className="text-body-sm text-clinical-zinc mb-4">
              Use <strong className="text-white">Phosphor</strong> for nav, anchor screens, and new components — its rounded geometry pairs with Inter Variable. <strong className="text-white">Lucide</strong> remains available for legacy admin/RD console screens already using it.
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
              {[ForkKnife, Calendar, Stethoscope, UsersThree, UserCircle, Sparkle, HandHeart, ShieldCheck].map((Icon, i) => (
                <div key={i} className="aspect-square rounded-md border border-clinical-slate/30 bg-clinical-dark flex items-center justify-center">
                  <Icon className="w-5 h-5 text-clinical-gold" weight="regular" />
                </div>
              ))}
              {[Heart, Activity, Flame, Leaf, Dumbbell].map((Icon, i) => (
                <div key={`l-${i}`} className="aspect-square rounded-md border border-clinical-slate/30 bg-clinical-dark flex items-center justify-center">
                  <Icon className="w-5 h-5 text-clinical-zinc" />
                </div>
              ))}
            </div>
          </Card>
        </Section>

        {/* Buttons */}
        <Section title="Buttons" kicker="shadcn primitives">
          <div className="flex flex-wrap gap-3">
            <Button>Primary action</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Section>

        {/* Badges */}
        <Section title="Badges">
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge className="bg-clinical-gold/15 text-clinical-gold border-clinical-gold/30">Clinical Gold</Badge>
            <Badge className="bg-clinical-sage/15 text-clinical-sage border-clinical-sage/30">Sage</Badge>
            <Badge className="bg-clinical-blue/15 text-clinical-blue border-clinical-blue/30">Blue</Badge>
          </div>
        </Section>

        {/* Inputs */}
        <Section title="Inputs">
          <div className="grid sm:grid-cols-2 gap-3 max-w-xl">
            <Input placeholder="Default input" />
            <Input placeholder="Disabled" disabled />
          </div>
        </Section>

        {/* Focus rings */}
        <Section title="Focus rings" kicker="a11y · keyboard">
          <Card className="p-6 bg-clinical-surface border-clinical-slate/30">
            <p className="text-body-sm text-clinical-zinc mb-4">
              Every interactive primitive uses the same canonical focus ring:{" "}
              <code className="text-clinical-data text-clinical-gold">
                focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background
              </code>
              . Tab through the controls below to see it.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button>Tab to me</Button>
              <Button variant="outline">Then me</Button>
              <Input placeholder="Then this input" className="w-56" />
              <Badge>Then this badge</Badge>
            </div>
          </Card>
        </Section>

        {/* Cards */}
        <Section title="Surface elevations">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-clinical-slate/30 bg-clinical-dark p-5">
              <p className="text-clinical-label">L0 · clinical-dark</p>
              <p className="text-body text-white mt-2">Page background</p>
            </div>
            <div className="rounded-lg border border-clinical-slate/30 bg-clinical-surface p-5">
              <p className="text-clinical-label">L1 · clinical-surface</p>
              <p className="text-body text-white mt-2">Cards, sheets, footer</p>
            </div>
            <div className="rounded-lg border border-clinical-slate/30 bg-clinical-surface-elevated p-5 shadow-clinical">
              <p className="text-clinical-label">L2 · surface-elevated</p>
              <p className="text-body text-white mt-2">Popovers, dialogs</p>
            </div>
          </div>
        </Section>

        {/* Canonical alert palette + AAA contrast readouts */}
        <Section title="Alert palette" kicker="Canonical · WCAG AAA on #050505">
          <AlertPaletteGrid />
        </Section>

        <div className="pt-8 pb-16 text-center text-caption text-clinical-zinc">
          Internal-only · keep this page in sync with `src/index.css` and `src/lib/motion.ts`.
        </div>
      </div>
    </div>
  );
}
