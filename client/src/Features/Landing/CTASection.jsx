import { Link } from "react-router-dom";
import { HeartPulse, FlaskConical, Stethoscope, Activity } from "lucide-react";

export function CTASection() {
  return (
    <section className="pb-20 pt-6 lg:pb-24">
      <div className="hilms-container">
        <div className="reveal relative overflow-hidden rounded-[32px] bg-gradient-to-br from-coral to-coral-dark px-6 py-16 text-center shadow-[0_30px_60px_-24px_rgba(242,106,80,0.6)] sm:px-12 lg:py-20">
          {/* decorative icons */}
          <div className="pointer-events-none absolute inset-0 opacity-20">
            <HeartPulse className="absolute left-8 top-8 size-16 text-white" />
            <FlaskConical className="absolute right-10 top-14 size-12 text-white" />
            <Stethoscope className="absolute bottom-10 left-14 size-12 text-white" />
            <Activity className="absolute bottom-8 right-16 size-14 text-white" />
            <span className="absolute left-1/4 top-6 text-4xl text-white">✚</span>
            <span className="absolute right-1/4 bottom-8 text-3xl text-white">♥</span>
          </div>

          <div className="relative mx-auto max-w-2xl">
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                to="/signup"
                className="hilms-btn hilms-btn-white h-13 px-9 text-base"
              >
                Create Account
              </Link>
              <Link
                to="/login"
                className="hilms-btn inline-flex h-13 items-center justify-center rounded-full border-2 border-white/60 px-9 text-base font-bold text-white transition hover:bg-white/15"
              >
                Log In
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
