import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";

export default function ToolSelectorPage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-am-navy via-am-navy to-[#1a2744] flex flex-col items-center justify-center p-6" data-testid="tool-selector-page">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight mb-2">
          A&M <span className="text-am-gold">PEPI</span>
        </h1>
        <p className="text-lg text-white/60 font-light tracking-wide">Select Your Tool</p>
      </div>

      {/* Tool Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full">
        {/* LEVERAGE Card */}
        <Card
          className="group relative overflow-hidden border-white/10 bg-white/5 backdrop-blur-sm cursor-pointer transition-all duration-300 hover:border-am-gold/50 hover:shadow-2xl hover:shadow-am-gold/10 hover:scale-[1.02]"
          data-testid="tool-card-leverage"
          onClick={() => navigate("/engagements")}
        >
          <CardContent className="p-8 flex flex-col items-center text-center min-h-[340px] justify-center">
            {/* Leverage Triangle SVG */}
            <div className="mb-6 transition-transform duration-300 group-hover:scale-110">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" aria-label="Leverage logo">
                <path d="M4 20L12 4L20 20H4Z" stroke="white" strokeWidth="1.5" fill="none" />
                <path d="M8 14H16" stroke="#CF7F00" strokeWidth="2" />
              </svg>
            </div>

            <h2 className="text-2xl font-bold text-white tracking-wide mb-2">LEVERAGE</h2>
            <p className="text-am-gold text-sm font-medium mb-4">Elite Procurement AI Operating System</p>
            <p className="text-white/50 text-sm leading-relaxed">
              Spend analysis, savings modeling, supplier risk, market intelligence, and AI-powered procurement optimization.
            </p>

            {/* Hover accent bar */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-am-gold transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
          </CardContent>
        </Card>

        {/* COMMAND CENTER Card */}
        <Card
          className="group relative overflow-hidden border-white/10 bg-white/5 backdrop-blur-sm cursor-pointer transition-all duration-300 hover:border-am-gold/50 hover:shadow-2xl hover:shadow-am-gold/10 hover:scale-[1.02]"
          data-testid="tool-card-command-center"
          onClick={() => navigate("/command-center")}
        >
          <CardContent className="p-8 flex flex-col items-center text-center min-h-[340px] justify-center">
            {/* Command Center Grid/Shield SVG */}
            <div className="mb-6 transition-transform duration-300 group-hover:scale-110">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" aria-label="Command Center logo">
                <rect x="3" y="3" width="18" height="18" rx="3" stroke="white" strokeWidth="1.5" fill="none" />
                <rect x="6" y="6" width="5" height="5" rx="1" fill="#CF7F00" />
                <rect x="13" y="6" width="5" height="5" rx="1" fill="white" opacity="0.5" />
                <rect x="6" y="13" width="5" height="5" rx="1" fill="white" opacity="0.5" />
                <rect x="13" y="13" width="5" height="5" rx="1" fill="#CF7F00" />
              </svg>
            </div>

            <h2 className="text-2xl font-bold text-white tracking-wide mb-2">COMMAND CENTER</h2>
            <p className="text-am-gold text-sm font-medium mb-4">Engagement Management Hub</p>
            <p className="text-white/50 text-sm leading-relaxed">
              DRL tracking, work plans, team management, meeting notes, AI-powered email generation, interview guides, and status reports.
            </p>

            {/* Hover accent bar */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-am-gold transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="mt-12 text-center">
        <p className="text-white/30 text-xs">Alvarez &amp; Marsal Private Equity Performance Improvement</p>
      </div>
    </div>
  );
}
