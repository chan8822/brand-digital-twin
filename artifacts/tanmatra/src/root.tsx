import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { LinksFunction, MetaFunction } from "react-router";
import "./index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: "/src/index.css" },
];

export const meta: MetaFunction = () => [
  { title: "Tanmatra — Therapeutic Meal Delivery" },
  { name: "description", content: "Tanmatra delivers clinical-grade therapeutic meals designed by registered dietitians. Browse the curated menu, build personalised weekly plans, and track wellness, performance, and clinical protocols." },
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
import { Toaster } from "sonner";
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

const queryClient = new QueryClient();

export default function Root() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FoodEstablishment",
              "name": "Tanmatra",
              "url": "https://tanmatra.food",
              "logo": "https://tanmatra.food/og-image.jpg",
              "sameAs": [
                "TODO(founder): add social link"
              ],
              "contactPoint": {
                "@type": "ContactPoint",
                "telephone": "TODO(founder): add phone number",
                "contactType": "customer service",
                "email": "support@tanmatra.food"
              }
            })
          }}
        />
      </head>
      <body>
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
        <Scripts />
      </body>
    </html>
  );
}
