import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { apiPath } from "@/lib/apiBase";
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
// Eager imports: pages on the critical purchase path. Anything a
// first-time visitor hits during the discover → cart → checkout flow
// must render without a network round-trip for its bundle.
import Home from "@/pages/Home";
import Menu from "@/pages/Menu";
import Dish from "@/pages/Dish";
import Cart from "@/pages/Cart";
import Checkout from "@/pages/Checkout";
import Login from "@/pages/Login";
import AdminLogin from "@/pages/AdminLogin";
import NotFound from "@/pages/not-found";
import { useParams } from "react-router";

function DishWithKey() {
  const { slug } = useParams<{ slug: string }>();
  return <Dish key={slug} />;
}

// --- Lazy-loaded routes ----------------------------------------------------
//
// Everything below this line is reached only after the user has signed in,
// taken an action, or navigated past the landing/menu surface. Code-
// splitting them keeps the initial bundle under control — measured ~40 %
// JS reduction on the home route. <Suspense fallback={null}> below renders
// blank while a chunk loads, which matches the existing skeleton-free
// transition feel and avoids a layout shift.

// Post-purchase / account
const Track = lazy(() => import("@/pages/Track"));
const Orders = lazy(() => import("@/pages/Orders"));
const Subscribe = lazy(() => import("@/pages/Subscribe"));
const Subscriptions = lazy(() => import("@/pages/Subscriptions"));
const WeeklyPlanner = lazy(() => import("@/pages/WeeklyPlanner"));
const Rewards = lazy(() => import("@/pages/Rewards"));
const Preferences = lazy(() => import("@/pages/Preferences"));
const Account = lazy(() => import("@/pages/Account"));
const Addresses = lazy(() => import("@/pages/Addresses"));
const Terms = lazy(() => import("@/pages/Terms"));
const Privacy = lazy(() => import("@/pages/Privacy"));
// Clinical / wellness surfaces — heavy chart deps (recharts), niche audience
const Wellness = lazy(() => import("@/pages/Wellness"));
const Performance = lazy(() => import("@/pages/Performance"));
const Clinical = lazy(() => import("@/pages/Clinical"));
// RD / appointment surfaces
const Team = lazy(() => import("@/pages/Team"));
const TeamMember = lazy(() => import("@/pages/TeamMember"));
const RdPlans = lazy(() => import("@/pages/RdPlans"));
const RdPlanDetail = lazy(() => import("@/pages/RdPlanDetail"));
const RdDirectory = lazy(() => import("@/pages/RdDirectory"));
const RdProfile = lazy(() => import("@/pages/RdProfile"));
const Appointments = lazy(() => import("@/pages/Appointments"));
const RdConsole = lazy(() => import("@/pages/RdConsole"));
const CheckoutAppointment = lazy(() => import("@/pages/CheckoutAppointment"));
// Admin surfaces are gated behind /admin/* and 99% of customers never
// hit them — code-split so they don't ship in the customer bundle.
const AdminIndex = lazy(() => import("@/pages/AdminIndex"));
const AdminOpsDashboard = lazy(() => import("@/pages/AdminOpsDashboard"));
const AdminAiRuns = lazy(() => import("@/pages/AdminAiRuns"));
const AdminOpsAgent = lazy(() => import("@/pages/AdminOpsAgent"));
const AdminCmsAgent = lazy(() => import("@/pages/AdminCmsAgent"));
const AdminForecasting = lazy(() => import("@/pages/AdminForecasting"));
const AdminMenuEngineering = lazy(() => import("@/pages/AdminMenuEngineering"));
const AdminAnalytics = lazy(() => import("@/pages/AdminAnalytics"));
const AdminSupportTickets = lazy(() => import("@/pages/AdminSupportTickets"));
const RdPartnersLanding = lazy(() => import("@/pages/RdPartnersLanding"));
const RdPartnersWizard = lazy(() => import("@/pages/RdPartnersWizard"));
const AdminRdApplications = lazy(() => import("@/pages/AdminRdApplications"));
const AdminCommunityModeration = lazy(() => import("@/pages/AdminCommunityModeration"));
const AdminModeration = lazy(() => import("@/pages/AdminModeration"));
const GroupOrder = lazy(() => import("@/pages/GroupOrder"));
const Recipes = lazy(() => import("@/pages/Recipes"));
const RecipeDetail = lazy(() => import("@/pages/RecipeDetail"));
const Challenges = lazy(() => import("@/pages/Challenges"));
const ChallengeDetail = lazy(() => import("@/pages/ChallengeDetail"));
const Corporate = lazy(() => import("@/pages/Corporate"));
const CorporateAdmin = lazy(() => import("@/pages/CorporateAdmin"));
const CorporateInvite = lazy(() => import("@/pages/CorporateInvite"));
const OfficeLunch = lazy(() => import("@/pages/OfficeLunch"));
const CorporateLunchPlanner = lazy(() => import("@/pages/CorporateLunchPlanner"));
const AdminSalesConsole = lazy(() => import("@/pages/AdminSalesConsole"));
const AdminSalesAccount = lazy(() => import("@/pages/AdminSalesAccount"));
const Vouchers = lazy(() => import("@/pages/Vouchers"));
const Premium = lazy(() => import("@/pages/Premium"));
const Marketplace = lazy(() => import("@/pages/Marketplace"));
const MarketplaceItemPage = lazy(() => import("@/pages/MarketplaceItem"));
const Styleguide = lazy(() => import("@/pages/Styleguide"));

const queryClient = new QueryClient();

const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

const ADMIN_KEY = "tanmatra:admin:v1";

type AdminAuthState = "checking" | "authed" | "anon";

function useAdminAuth(): AdminAuthState {
  const [state, setState] = useState<AdminAuthState>("checking");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiPath("/admin/me"), {
          credentials: "include",
        });
        if (cancelled) return;
        if (res.ok) {
          try {
            window.localStorage.setItem(ADMIN_KEY, "1");
          } catch {
            /* ignore */
          }
          setState("authed");
        } else {
          try {
            window.localStorage.removeItem(ADMIN_KEY);
          } catch {
            /* ignore */
          }
          setState("anon");
        }
      } catch {
        if (!cancelled) setState("anon");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

function AdminGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const state = useAdminAuth();
  if (state === "checking") {
    return (
      <div className="px-4 py-12 text-center text-sm text-clinical-muted">
        Checking admin session…
      </div>
    );
  }
  if (state !== "authed") {
    return (
      <Navigate
        to={`/admin/login?next=${encodeURIComponent(
          location.pathname + location.search,
        )}`}
        replace
      />
    );
  }
  return <>{children}</>;
}

const RD_KEY = "tanmatra:rd:v1";

function RdGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const adminState = useAdminAuth();
  if (typeof window === "undefined") return null;
  const rdFlag = window.localStorage.getItem(RD_KEY);
  if (rdFlag === "1") return <>{children}</>;
  if (adminState === "checking") {
    return (
      <div className="px-4 py-12 text-center text-sm text-clinical-muted">
        Checking session…
      </div>
    );
  }
  if (adminState === "authed") return <>{children}</>;
  return (
    <Navigate
      to={`/login?next=${encodeURIComponent(location.pathname)}`}
      replace
    />
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <CartProvider>
            <OrdersProvider>
              <PreferencesProvider>
            <BrowserRouter basename={basename}>
              <ThemeManager />
              <ScrollToTop />
              <div className="min-h-screen flex flex-col bg-clinical-dark">
                <Header />
                <OnboardingQuizGate />
                <main className="flex-1 pb-20 md:pb-0">
                  <Suspense fallback={null}>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/menu" element={<Menu />} />
                    <Route path="/dish/:slug" element={<DishWithKey />} />
                    <Route path="/cart" element={<Cart />} />
                    <Route path="/checkout" element={<Checkout />} />
                    <Route path="/track" element={<Track />} />
                    <Route path="/orders" element={<Orders />} />
                    <Route path="/subscribe" element={<Subscribe />} />
                    <Route path="/subscriptions" element={<Subscriptions />} />
                    <Route path="/meal-planner" element={<WeeklyPlanner />} />
                    <Route path="/rewards" element={<Rewards />} />
                    <Route path="/preferences" element={<Preferences />} />
                    <Route path="/account" element={<Account />} />
                    <Route path="/account/addresses" element={<Addresses />} />
                    <Route path="/wellness" element={<Wellness />} />
                    <Route path="/performance" element={<Performance />} />
                    <Route path="/clinical" element={<Clinical />} />
                    <Route path="/team" element={<Team />} />
                    <Route path="/team/:slug" element={<TeamMember />} />
                    <Route path="/plans" element={<RdPlans />} />
                    <Route path="/plans/:slug" element={<RdPlanDetail />} />
                    <Route path="/rd" element={<RdDirectory />} />
                    <Route path="/rd/:slug" element={<RdProfile />} />
                    <Route path="/appointments" element={<Appointments />} />
                    <Route
                      path="/rd-console"
                      element={
                        <RdGate>
                          <RdConsole />
                        </RdGate>
                      }
                    />
                    <Route
                      path="/checkout-appointment"
                      element={<CheckoutAppointment />}
                    />
                    <Route
                      path="/admin"
                      element={
                        <AdminGate>
                          <AdminIndex />
                        </AdminGate>
                      }
                    />
                    <Route
                      path="/admin/ops"
                      element={
                        <AdminGate>
                          <AdminOpsDashboard />
                        </AdminGate>
                      }
                    />
                    <Route
                      path="/admin/ai-runs"
                      element={
                        <AdminGate>
                          <AdminAiRuns />
                        </AdminGate>
                      }
                    />
                    <Route
                      path="/admin/ops-agent"
                      element={
                        <AdminGate>
                          <AdminOpsAgent />
                        </AdminGate>
                      }
                    />
                    <Route
                      path="/admin/cms-agent"
                      element={
                        <AdminGate>
                          <AdminCmsAgent />
                        </AdminGate>
                      }
                    />
                    <Route
                      path="/admin/forecasting"
                      element={
                        <AdminGate>
                          <AdminForecasting />
                        </AdminGate>
                      }
                    />
                    <Route
                      path="/admin/menu-engineering"
                      element={
                        <AdminGate>
                          <AdminMenuEngineering />
                        </AdminGate>
                      }
                    />
                    <Route
                      path="/admin/analytics"
                      element={
                        <AdminGate>
                          <AdminAnalytics />
                        </AdminGate>
                      }
                    />
                    <Route
                      path="/admin/support-tickets"
                      element={
                        <AdminGate>
                          <AdminSupportTickets />
                        </AdminGate>
                      }
                    />
                    <Route path="/rd-partners" element={<RdPartnersLanding />} />
                    <Route path="/rd-partners/apply" element={<RdPartnersWizard />} />
                    <Route
                      path="/admin/rd-applications"
                      element={
                        <AdminGate>
                          <AdminRdApplications />
                        </AdminGate>
                      }
                    />
                    <Route path="/group/:code" element={<GroupOrder />} />
                    <Route path="/recipes" element={<Recipes />} />
                    <Route path="/recipes/:slug" element={<RecipeDetail />} />
                    <Route
                      path="/admin/moderation"
                      element={
                        <AdminGate>
                          <AdminModeration />
                        </AdminGate>
                      }
                    />
                    <Route
                      path="/admin/community-moderation"
                      element={
                        <AdminGate>
                          <AdminCommunityModeration />
                        </AdminGate>
                      }
                    />
                    <Route path="/challenges" element={<Challenges />} />
                    <Route path="/challenges/:slug" element={<ChallengeDetail />} />
                    <Route path="/corporate" element={<Corporate />} />
                    <Route path="/corporate/invite/:token" element={<CorporateInvite />} />
                    <Route path="/corporate/:slug" element={<CorporateAdmin />} />
                    <Route
                      path="/corporate/:slug/lunch-planner"
                      element={<CorporateLunchPlanner />}
                    />
                    <Route path="/office-lunch/:id" element={<OfficeLunch />} />
                    <Route
                      path="/admin/sales-console"
                      element={
                        <AdminGate>
                          <AdminSalesConsole />
                        </AdminGate>
                      }
                    />
                    <Route
                      path="/admin/sales-console/:slug"
                      element={
                        <AdminGate>
                          <AdminSalesAccount />
                        </AdminGate>
                      }
                    />
                    <Route path="/vouchers" element={<Vouchers />} />
                    <Route path="/premium" element={<Premium />} />
                    <Route path="/marketplace" element={<Marketplace />} />
                    <Route path="/marketplace/:slug" element={<MarketplaceItemPage />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/terms" element={<Terms />} />
                    <Route path="/privacy" element={<Privacy />} />
                    <Route path="/admin/login" element={<AdminLogin />} />
                    {import.meta.env.DEV && (
                      <Route path="/__styleguide" element={<Styleguide />} />
                    )}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                  </Suspense>
                </main>
                <Footer />
                <BottomNav />
                <StickyCheckoutBar />
              </div>
              <Toaster theme="dark" position="top-center" richColors offset={72} />
            </BrowserRouter>
              </PreferencesProvider>
            </OrdersProvider>
          </CartProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
