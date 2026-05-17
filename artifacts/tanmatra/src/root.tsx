import { useEffect } from "react";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { LinksFunction, MetaFunction } from "react-router";
import { Toaster } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartProvider } from "@/lib/cartContext";
import { ThemeManager } from "@/lib/clinicalTheme";
import { OrdersProvider } from "@/lib/ordersContext";
import { PreferencesProvider } from "@/lib/preferencesContext";
import OnboardingQuizGate from "@/components/preferences/OnboardingQuizGate";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import BottomNav from "@/components/layout/BottomNav";
import ScrollToTop from "@/components/layout/ScrollToTop";
import StickyCheckoutBar from "@/components/cart/StickyCheckoutBar";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import "./index.css";

export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://images.unsplash.com" },
];

export const meta: MetaFunction = () => [
  { title: "Tanmatra — Therapeutic Meal Delivery" },
  { name: "description", content: "Clinical-grade therapeutic meals designed by registered dietitians. Browse the curated menu, build personalised weekly plans, and track wellness, performance, and clinical protocols." },
  { name: "theme-color", content: "#050505" },
  { property: "og:type", content: "website" },
  { property: "og:site_name", content: "Tanmatra" },
  { property: "og:title", content: "Tanmatra — Therapeutic Meal Delivery" },
  { property: "og:description", content: "Clinical-grade therapeutic meals designed by registered dietitians. Curated menu, personalised plans, wellness tracking." },
  { property: "og:image", content: "https://tanmatra.food/og-image.jpg" },
  { property: "og:url", content: "https://tanmatra.food/" },
  { name: "twitter:card", content: "summary_large_image" },
  { name: "twitter:title", content: "Tanmatra — Therapeutic Meal Delivery" },
  { name: "twitter:description", content: "Clinical-grade therapeutic meals designed by registered dietitians." },
  { name: "twitter:image", content: "https://tanmatra.food/og-image.jpg" },
];

const queryClient = new QueryClient();

const LOADER_STYLE = `
  #__tanmatra-loader {
    position: fixed; inset: 0; z-index: 9999;
    background: #050505;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 20px;
  }
  #__tanmatra-loader.hidden { display: none; }
  .__tl-wordmark { color: #D4AF37; font-size: 1.25rem; font-weight: 600; letter-spacing: 0.08em; font-family: serif; }
  .__tl-sub { color: #A1A1AA; font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.12em; }
  .__tl-bar { width: 120px; height: 2px; background: #111114; border-radius: 2px; overflow: hidden; }
  .__tl-bar-inner { height: 100%; width: 0%; background: #D4AF37; animation: __tl-slide 1.4s ease-in-out infinite; }
  @keyframes __tl-slide { 0%{width:0%;margin-left:0} 50%{width:60%;margin-left:20%} 100%{width:0%;margin-left:100%} }
  .__tl-retry { display: none; margin-top: 8px; background: transparent; border: 1px solid #D4AF37; color: #D4AF37;
    padding: 6px 16px; border-radius: 4px; cursor: pointer; font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; }
`.trim();

const LOADER_SCRIPT = `
  (function(){
    var t = setTimeout(function(){
      var r = document.getElementById('__tl-retry');
      if(r) r.style.display='block';
    }, 7000);
    var autoDismiss = setTimeout(function(){
      var el = document.getElementById('__tanmatra-loader');
      if(el){ el.classList.add('hidden'); setTimeout(function(){ el.remove(); }, 300); }
    }, 15000);
    window.__clearTanmatraLoader = function(){
      clearTimeout(t);
      clearTimeout(autoDismiss);
      var el = document.getElementById('__tanmatra-loader');
      if(el){ el.classList.add('hidden'); setTimeout(function(){ el.remove(); }, 300); }
    };
  })();
`.trim();

export default function Root() {
  useEffect(() => {
    window.__clearTanmatraLoader?.();
  }, []);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <Meta />
        <Links />
        {/* Inline loader styles so they apply before any stylesheet downloads */}
        <style dangerouslySetInnerHTML={{ __html: LOADER_STYLE }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FoodEstablishment",
              "name": "Tanmatra",
              "description": "Clinical-grade therapeutic meal delivery designed by registered dietitians.",
              "url": "https://tanmatra.food",
              "logo": "https://tanmatra.food/og-image.jpg",
              "servesCuisine": ["Indian", "Mediterranean", "Therapeutic"],
              "priceRange": "₹₹",
              "address": {
                "@type": "PostalAddress",
                "addressLocality": "Bengaluru",
                "addressRegion": "Karnataka",
                "addressCountry": "IN"
              },
              "contactPoint": {
                "@type": "ContactPoint",
                "contactType": "customer service",
                "email": "care@tanmatra.health",
                "telephone": "+918047019200"
              }
            })
          }}
        />
      </head>
      <body>
        {/* A1c: branded splash shown immediately; cleared by entry.client.tsx on hydration */}
        <div id="__tanmatra-loader" aria-hidden="true">
          <span className="__tl-wordmark">Tanmatra</span>
          <span className="__tl-sub">Clinical Nutrition</span>
          <div className="__tl-bar"><div className="__tl-bar-inner" /></div>
          <button id="__tl-retry" className="__tl-retry" onClick={() => window.location.reload()}>
            Tap to retry
          </button>
        </div>
        <noscript>
          <div style={{ position:"fixed", inset:0, background:"#050505", color:"#fff", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"12px", fontFamily:"sans-serif", textAlign:"center", padding:"24px" }}>
            <strong style={{ color:"#D4AF37", fontSize:"1.25rem" }}>Tanmatra</strong>
            <p style={{ color:"#A1A1AA", fontSize:"0.875rem", maxWidth:"300px" }}>
              This site requires JavaScript. To order, please WhatsApp us or email
              <a href="mailto:care@tanmatra.health" style={{ color:"#D4AF37", marginLeft:"4px" }}>care@tanmatra.health</a>
            </p>
          </div>
        </noscript>

        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <CartProvider>
                <OrdersProvider>
                  <PreferencesProvider>
                    <ThemeManager />
                    <ScrollToTop />
                    <div className="min-h-screen flex flex-col bg-clinical-dark">
                      <Header />
                      <OnboardingQuizGate />
                      <main className="flex-1 pb-20 md:pb-0">
                        <Outlet />
                      </main>
                      <Footer />
                      <BottomNav />
                      <StickyCheckoutBar />
                    </div>
                    <Toaster theme="dark" position="top-center" richColors offset={72} />
                  </PreferencesProvider>
                </OrdersProvider>
              </CartProvider>
            </TooltipProvider>
          </QueryClientProvider>
        </ErrorBoundary>
        <ScrollRestoration />
        <script dangerouslySetInnerHTML={{ __html: LOADER_SCRIPT }} />
        <Scripts />
      </body>
    </html>
  );
}
