import "./landing.css";
import { useReveal } from "./useReveal";
import { Navbar } from "./Navbar";
import { Hero } from "./Hero";
import { TrustSection } from "./TrustSection";
import { RoleCards } from "./RoleCards";
import { WorkflowTimeline } from "./WorkflowTimeline";
import { Features } from "./Features";
import { SecuritySection } from "./SecuritySection";
import { Benefits } from "./Benefits";
import { StatsSection } from "./StatsSection";
import { Footer } from "./Footer";

export default function LandingPage() {
  useReveal();

  return (
    <div className="hilms-page">
      <Navbar />
      <main>
        <Hero />
        <TrustSection />
        <Features />
        <RoleCards />
        <WorkflowTimeline />
        <Benefits />
        <StatsSection />
        <SecuritySection />
      </main>
      <Footer />
    </div>
  );
}
