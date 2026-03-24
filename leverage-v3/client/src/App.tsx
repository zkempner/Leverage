import { useState, useEffect } from "react";
import { Switch, Route, Router, useLocation, useRoute } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import NotFound from "@/pages/not-found";
import EngagementListPage from "@/pages/engagement-list";
import NewEngagementPage from "@/pages/new-engagement";
import ReferenceLibraryPage from "@/pages/reference-library";
import DashboardPage from "@/pages/dashboard";
import DataImportPage from "@/pages/data-import";
import DataCleansingPage from "@/pages/data-cleansing";
import CategorizationPage from "@/pages/categorization";
import SpendAnalysisPage from "@/pages/spend-analysis";
import SavingsModelingPage from "@/pages/savings-modeling";
import AssumptionsPage from "@/pages/assumptions";
import TariffImpactPage from "@/pages/tariff-impact";
import SavingsTrackerPage from "@/pages/savings-tracker";
import CashFlowPage from "@/pages/cashflow";
import ReportingPage from "@/pages/reporting";
import FinancialModelPage from "@/pages/financial-model";
import HundredDayPlanPage from "@/pages/hundred-day-plan";
import MaturityPage from "@/pages/maturity";
import CategoryStrategyPage from "@/pages/category-strategy";
import ContractsPage from "@/pages/contracts";
import SpendFlagsPage from "@/pages/spend-flags";
import MarketIntelPage from "@/pages/market-intel";
import ContractUploadPage from "@/pages/contract-upload";
import DeliverablesPage from "@/pages/deliverables";
import SupplierRiskPage from "@/pages/supplier-risk";
import AlertsPage from "@/pages/alerts";
import PortfolioPage from "@/pages/portfolio";
import FxExposurePage from "@/pages/fx-exposure";
import PortalPage from "@/pages/portal";
import PipelineDashboardPage from "@/pages/pipeline-dashboard";

function EngagementRouter() {
  const [, params] = useRoute("/engagements/:id/:rest*");
  const [, navigate] = useLocation();
  const engagementId = params?.id ? Number(params.id) : null;

  useEffect(() => {
    // If just /engagements/:id with no sub-path, redirect to dashboard
    if (engagementId && !params?.rest) {
      navigate(`/engagements/${engagementId}/dashboard`, { replace: true });
    }
  }, [engagementId, params?.rest, navigate]);

  if (!engagementId) return <NotFound />;

  const onEngagementChange = (newId: number) => {
    const subPath = params?.rest || "dashboard";
    navigate(`/engagements/${newId}/${subPath}`);
  };

  return (
    <Layout engagementId={engagementId} onEngagementChange={onEngagementChange}>
      <Switch>
        <Route path="/engagements/:id/dashboard" component={() => <DashboardPage engagementId={engagementId} />} />
        <Route path="/engagements/:id/import" component={() => <DataImportPage engagementId={engagementId} />} />
        <Route path="/engagements/:id/cleansing" component={() => <DataCleansingPage engagementId={engagementId} />} />
        <Route path="/engagements/:id/categorization" component={() => <CategorizationPage engagementId={engagementId} />} />
        <Route path="/engagements/:id/analysis" component={() => <SpendAnalysisPage engagementId={engagementId} />} />
        <Route path="/engagements/:id/tariff-impact" component={() => <TariffImpactPage engagementId={engagementId} />} />
        <Route path="/engagements/:id/modeling" component={() => <SavingsModelingPage engagementId={engagementId} />} />
        <Route path="/engagements/:id/assumptions" component={() => <AssumptionsPage engagementId={engagementId} />} />
        <Route path="/engagements/:id/tracker" component={() => <SavingsTrackerPage engagementId={engagementId} />} />
        <Route path="/engagements/:id/cashflow" component={() => <CashFlowPage engagementId={engagementId} />} />
        <Route path="/engagements/:id/financial-model" component={() => <FinancialModelPage engagementId={engagementId} />} />
        <Route path="/engagements/:id/100-day-plan" component={() => <HundredDayPlanPage engagementId={engagementId} />} />
        <Route path="/engagements/:id/maturity" component={() => <MaturityPage engagementId={engagementId} />} />
        <Route path="/engagements/:id/category-strategy" component={() => <CategoryStrategyPage engagementId={engagementId} />} />
        <Route path="/engagements/:id/contracts" component={() => <ContractsPage engagementId={engagementId} />} />
        <Route path="/engagements/:id/spend-flags" component={() => <SpendFlagsPage engagementId={engagementId} />} />
        <Route path="/engagements/:id/reporting" component={() => <ReportingPage engagementId={engagementId} />} />
        <Route path="/engagements/:id/market-intel" component={() => <MarketIntelPage />} />
        <Route path="/engagements/:id/contract-upload" component={() => <ContractUploadPage engagementId={engagementId} />} />
        <Route path="/engagements/:id/deliverables" component={() => <DeliverablesPage engagementId={engagementId} />} />
        <Route path="/engagements/:id/supplier-risk" component={() => <SupplierRiskPage engagementId={engagementId} />} />
        <Route path="/engagements/:id/alerts" component={() => <AlertsPage engagementId={engagementId} />} />
        <Route path="/engagements/:id/fx-exposure" component={() => <FxExposurePage engagementId={engagementId} />} />
        <Route path="/engagements/:id/pipeline" component={() => <PipelineDashboardPage engagementId={engagementId} />} />
        <Route path="/engagements/:id/reference" component={() => <ReferenceLibraryPage />} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

// Redirect /engagements/:id to /engagements/:id/dashboard
function EngagementRedirect() {
  const [, params] = useRoute("/engagements/:id");
  const [, navigate] = useLocation();
  useEffect(() => {
    if (params?.id) {
      navigate(`/engagements/${params.id}/dashboard`, { replace: true });
    }
  }, [params?.id, navigate]);
  return null;
}

// Redirect old URL patterns (pre-engagement-scoped routes) to new ones
function LegacyRedirect() {
  const [location] = useLocation();
  const [, navigate] = useLocation();
  useEffect(() => {
    // Old patterns like /dashboard, /import, /analysis etc → redirect to engagement 1
    const oldPaths = ['dashboard','import','cleansing','categorization','analysis','modeling','assumptions','tracker','cashflow','financial-model','reporting','tariff-impact','100-day-plan','maturity','category-strategy','contracts','spend-flags'];
    const path = location.replace(/^\//, '');
    if (oldPaths.includes(path)) {
      navigate(`/engagements/1/${path}`, { replace: true });
    }
  }, [location, navigate]);
  return <NotFound />;
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={EngagementListPage} />
      <Route path="/new-engagement" component={NewEngagementPage} />
      <Route path="/reference" component={ReferenceLibraryPage} />
      <Route path="/market-intel" component={MarketIntelPage} />
      <Route path="/portfolio" component={PortfolioPage} />
      <Route path="/portal/:id" component={PortalPage} />
      <Route path="/engagements/:id/:rest*" component={EngagementRouter} />
      <Route path="/engagements/:id" component={EngagementRedirect} />
      <Route component={LegacyRedirect} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <AppRouter />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
