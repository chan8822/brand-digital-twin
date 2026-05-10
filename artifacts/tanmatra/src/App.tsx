import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartProvider } from "@/lib/cartContext";
import { OrdersProvider } from "@/lib/ordersContext";
import { PreferencesProvider } from "@/lib/preferencesContext";
import OnboardingQuizGate from "@/components/preferences/OnboardingQuizGate";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import BottomNav from "@/components/layout/BottomNav";
import ScrollToTop from "@/components/layout/ScrollToTop";
import StickyCheckoutBar from "@/components/cart/StickyCheckoutBar";
import Home from "@/pages/Home";
import Menu from "@/pages/Menu";
import Dish from "@/pages/Dish";
import { useParams } from "react-router";

function DishWithKey() {
  const { slug } = useParams<{ slug: string }>();
  return <Dish key={slug} />;
}
import Cart from "@/pages/Cart";
import Checkout from "@/pages/Checkout";
import Track from "@/pages/Track";
import Orders from "@/pages/Orders";
import Subscribe from "@/pages/Subscribe";
import Subscriptions from "@/pages/Subscriptions";
import WeeklyPlanner from "@/pages/WeeklyPlanner";
import Rewards from "@/pages/Rewards";
import Preferences from "@/pages/Preferences";
import Account from "@/pages/Account";
import Addresses from "@/pages/Addresses";
import Wellness from "@/pages/Wellness";
import Performance from "@/pages/Performance";
import Clinical from "@/pages/Clinical";
import Team from "@/pages/Team";
import TeamMember from "@/pages/TeamMember";
import RdPlans from "@/pages/RdPlans";
import RdPlanDetail from "@/pages/RdPlanDetail";
import RdDirectory from "@/pages/RdDirectory";
import RdProfile from "@/pages/RdProfile";
import Appointments from "@/pages/Appointments";
import RdConsole from "@/pages/RdConsole";
import CheckoutAppointment from "@/pages/CheckoutAppointment";
// Admin surfaces are gated behind /admin/* and 99% of customers never
// hit them — code-split so they don't ship in the customer bundle.
const AdminOpsDashboard = lazy(() => import("@/pages/AdminOpsDashboard"));
const AdminAiRuns = lazy(() => import("@/pages/AdminAiRuns"));
const AdminOpsAgent = lazy(() => import("@/pages/AdminOpsAgent"));
const AdminCmsAgent = lazy(() => import("@/pages/AdminCmsAgent"));
const AdminForecasting = lazy(() => import("@/pages/AdminForecasting"));
const AdminMenuEngineering = lazy(() => import("@/pages/AdminMenuEngineering"));
const AdminAnalytics = lazy(() => import("@/pages/AdminAnalytics"));
const AdminSupportTickets = lazy(() => import("@/pages/AdminSupportTickets"));
import RdPartnersLanding from "@/pages/RdPartnersLanding";
import RdPartnersWizard from "@/pages/RdPartnersWizard";
const AdminRdApplications = lazy(() => import("@/pages/AdminRdApplications"));
const AdminCommunityModeration = lazy(() => import("@/pages/AdminCommunityModeration"));
const AdminModeration = lazy(() => import("@/pages/AdminModeration"));
import GroupOrder from "@/pages/GroupOrder";
import Recipes from "@/pages/Recipes";
import RecipeDetail from "@/pages/RecipeDetail";
import Challenges from "@/pages/Challenges";
import ChallengeDetail from "@/pages/ChallengeDetail";
import Login from "@/pages/Login";
import Corporate from "@/pages/Corporate";
import CorporateAdmin from "@/pages/CorporateAdmin";
import CorporateInvite from "@/pages/CorporateInvite";
import OfficeLunch from "@/pages/OfficeLunch";
import CorporateLunchPlanner from "@/pages/CorporateLunchPlanner";
const AdminSalesConsole = lazy(() => import("@/pages/AdminSalesConsole"));
const AdminSalesAccount = lazy(() => import("@/pages/AdminSalesAccount"));
import Vouchers from "@/pages/Vouchers";
import Premium from "@/pages/Premium";
import Marketplace from "@/pages/Marketplace";
import MarketplaceItemPage from "@/pages/MarketplaceItem";
const Styleguide = lazy(() => import("@/pages/Styleguide"));
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

const ADMIN_KEY = "tanmatra:admin:v1";

function AdminGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  if (typeof window === "undefined") return null;
  const flag = window.localStorage.getItem(ADMIN_KEY);
  if (flag !== "1") {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <>{children}</>;
}

const RD_KEY = "tanmatra:rd:v1";

function RdGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  if (typeof window === "undefined") return null;
  const rdFlag = window.localStorage.getItem(RD_KEY);
  const adminFlag = window.localStorage.getItem(ADMIN_KEY);
  if (rdFlag !== "1" && adminFlag !== "1") {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CartProvider>
          <OrdersProvider>
            <PreferencesProvider>
            <BrowserRouter basename={basename}>
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
  );
}
