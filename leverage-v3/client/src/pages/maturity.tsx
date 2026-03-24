import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Save, BarChart3, CheckCircle } from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Legend, Tooltip,
} from "recharts";

const DIMENSIONS = [
  { key: "strategy", label: "Strategy & Planning", description: "Strategic alignment of procurement with business objectives" },
  { key: "organization", label: "Organization & Talent", description: "Team structure, skills, and capability development" },
  { key: "process", label: "Process & Governance", description: "Standardized processes, policies, and compliance" },
  { key: "technology", label: "Technology & Tools", description: "Systems, automation, and digital enablement" },
  { key: "supplier_mgmt", label: "Supplier Management", description: "Supplier relationship management and development" },
  { key: "data_analytics", label: "Data & Analytics", description: "Spend visibility, reporting, and data-driven decisions" },
  { key: "risk_mgmt", label: "Risk Management", description: "Supply chain risk identification and mitigation" },
  { key: "sustainability", label: "Sustainability", description: "ESG integration into procurement operations" },
];

const LEVELS = [
  { value: 1, label: "Level 1 — Ad Hoc", description: "No formal processes; reactive, fragmented approach" },
  { value: 2, label: "Level 2 — Developing", description: "Basic processes emerging; inconsistent application across the organization" },
  { value: 3, label: "Level 3 — Defined", description: "Standardized processes documented; consistent execution with some gaps" },
  { value: 4, label: "Level 4 — Managed", description: "Measured and controlled; data-driven optimization with KPIs" },
  { value: 5, label: "Level 5 — Leading", description: "Best-in-class; continuous improvement, innovation, and industry leadership" },
];

function WizardStep({
  dimension,
  stepIndex,
  scores,
  evidence,
  onScoreChange,
  onEvidenceChange,
}: {
  dimension: typeof DIMENSIONS[number];
  stepIndex: number;
  scores: Record<string, number>;
  evidence: Record<string, string>;
  onScoreChange: (key: string, val: number) => void;
  onEvidenceChange: (key: string, val: string) => void;
}) {
  const currentScore = scores[dimension.key] || 0;

  return (
    <div className="space-y-6" data-testid={`wizard-step-${dimension.key}`}>
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Badge variant="outline" className="text-xs">Step {stepIndex + 1} of 8</Badge>
          <h3 className="text-lg font-bold">{dimension.label}</h3>
        </div>
        <p className="text-sm text-muted-foreground">{dimension.description}</p>
      </div>

      <div className="space-y-3">
        {LEVELS.map(level => (
          <label
            key={level.value}
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              currentScore === level.value
                ? "border-am-gold bg-am-gold/5"
                : "border-border hover:border-muted-foreground/30"
            }`}
            data-testid={`level-${dimension.key}-${level.value}`}
          >
            <input
              type="radio"
              name={`maturity-${dimension.key}`}
              value={level.value}
              checked={currentScore === level.value}
              onChange={() => onScoreChange(dimension.key, level.value)}
              className="mt-1 accent-am-gold"
            />
            <div>
              <p className="text-sm font-semibold">{level.label}</p>
              <p className="text-xs text-muted-foreground">{level.description}</p>
            </div>
          </label>
        ))}
      </div>

      <div>
        <label className="text-sm font-medium">Evidence & Observations</label>
        <Textarea
          placeholder="Document supporting evidence for this assessment..."
          className="mt-1"
          rows={3}
          value={evidence[dimension.key] || ""}
          onChange={e => onEvidenceChange(dimension.key, e.target.value)}
          data-testid={`evidence-${dimension.key}`}
        />
      </div>
    </div>
  );
}

function RadarView({ gapData }: { gapData: any }) {
  const gaps = gapData?.gaps || [];
  const radarData = gaps.map((g: any) => ({
    dimension: g.dimension.replace(/_/g, " "),
    current: g.current_score,
    target: g.target_score,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Maturity Radar — Current vs Target</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <RadarChart data={radarData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
            <PolarRadiusAxis domain={[0, 5]} tickCount={6} tick={{ fontSize: 10 }} />
            <Radar name="Current" dataKey="current" stroke="#CF7F00" fill="#CF7F00" fillOpacity={0.3} />
            <Radar name="Target" dataKey="target" stroke="#0085CA" fill="#0085CA" fillOpacity={0.15} />
            <Legend />
            <Tooltip />
          </RadarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function GapTable({ gapData }: { gapData: any }) {
  const gaps = (gapData?.gaps || []).sort((a: any, b: any) => b.priority - a.priority);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Gap Analysis</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dimension</TableHead>
                <TableHead className="text-center">Current</TableHead>
                <TableHead className="text-center">Target</TableHead>
                <TableHead className="text-center">Gap</TableHead>
                <TableHead className="text-center">Priority</TableHead>
                <TableHead>Top Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gaps.map((g: any) => (
                <TableRow key={g.dimension} data-testid={`gap-row-${g.dimension}`}>
                  <TableCell className="font-medium text-sm capitalize">
                    {g.dimension.replace(/_/g, " ")}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{g.current_score}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className="bg-blue-100 text-blue-800">{g.target_score}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className={g.gap > 1 ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}>
                      {g.gap}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center text-sm font-semibold">
                    {g.priority.toFixed(1)}
                  </TableCell>
                  <TableCell className="text-xs max-w-xs">
                    <ul className="space-y-0.5">
                      {(g.recommended_actions || []).slice(0, 3).map((a: any, i: number) => (
                        <li key={i} className="flex items-start gap-1">
                          <span className="text-muted-foreground">•</span>
                          <span>{typeof a === "string" ? a : a.action || a.description || JSON.stringify(a)}</span>
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MaturityPage({ engagementId }: { engagementId: number }) {
  const [step, setStep] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [showResults, setShowResults] = useState(false);

  const { data: existingAssessments, isLoading: loadingAssessments } = useQuery<any[]>({
    queryKey: ["/api/engagements", engagementId, "maturity"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/maturity`);
      return res.json();
    },
  });

  const { data: gapData, isLoading: loadingGap } = useQuery<any>({
    queryKey: ["/api/engagements", engagementId, "maturity", "gap-analysis"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engagements/${engagementId}/maturity/gap-analysis`);
      return res.json();
    },
    enabled: showResults || (existingAssessments !== undefined && existingAssessments.length > 0),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const assessments = DIMENSIONS.map(d => ({
        dimension: d.key,
        current_score: scores[d.key] || 1,
        evidence_notes: evidence[d.key] || "",
      }));
      const res = await apiRequest("POST", `/api/engagements/${engagementId}/maturity`, { assessments });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engagements", engagementId, "maturity"] });
      setShowResults(true);
    },
  });

  // Load existing scores into state if available
  const hasLoadedExisting = existingAssessments && existingAssessments.length > 0;
  if (hasLoadedExisting && Object.keys(scores).length === 0) {
    const existingScores: Record<string, number> = {};
    const existingEvidence: Record<string, string> = {};
    existingAssessments.forEach((a: any) => {
      existingScores[a.dimension] = a.current_score;
      existingEvidence[a.dimension] = a.evidence_notes || "";
    });
    setScores(existingScores);
    setEvidence(existingEvidence);
    setShowResults(true);
  }

  if (loadingAssessments) {
    return <Skeleton className="h-96" />;
  }

  const allScored = DIMENSIONS.every(d => scores[d.key] && scores[d.key] > 0);
  const isLastStep = step === DIMENSIONS.length - 1;

  // Results view
  if (showResults && gapData) {
    return (
      <div className="space-y-6" data-testid="maturity-results">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Procurement Maturity Assessment</h2>
            <p className="text-sm text-muted-foreground">Gap analysis and recommended actions</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => { setShowResults(false); setStep(0); }} data-testid="edit-assessment-btn">
            Edit Assessment
          </Button>
        </div>
        <RadarView gapData={gapData} />
        <GapTable gapData={gapData} />
      </div>
    );
  }

  if (showResults && loadingGap) {
    return <Skeleton className="h-96" />;
  }

  // Wizard view
  return (
    <div className="space-y-6" data-testid="maturity-page">
      <div>
        <h2 className="text-lg font-bold">Procurement Maturity Assessment</h2>
        <p className="text-sm text-muted-foreground">
          Rate your procurement organization across 8 dimensions
        </p>
      </div>

      {/* Progress */}
      <div className="flex gap-1">
        {DIMENSIONS.map((d, i) => (
          <button
            key={d.key}
            onClick={() => setStep(i)}
            className={`flex-1 h-2 rounded-full transition-colors ${
              i === step ? "bg-am-gold" : scores[d.key] ? "bg-emerald-400" : "bg-muted"
            }`}
            data-testid={`step-indicator-${i}`}
          />
        ))}
      </div>

      <Card>
        <CardContent className="p-6">
          <WizardStep
            dimension={DIMENSIONS[step]}
            stepIndex={step}
            scores={scores}
            evidence={evidence}
            onScoreChange={(k, v) => setScores(prev => ({ ...prev, [k]: v }))}
            onEvidenceChange={(k, v) => setEvidence(prev => ({ ...prev, [k]: v }))}
          />

          <div className="flex items-center justify-between mt-6 pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep(s => Math.max(0, s - 1))}
              disabled={step === 0}
              data-testid="prev-step-btn"
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>

            <div className="flex items-center gap-2">
              {isLastStep && allScored && (
                <Button
                  size="sm"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  data-testid="save-assessment-btn"
                >
                  <Save className="h-4 w-4 mr-1" />
                  {saveMutation.isPending ? "Saving..." : "Save Assessment"}
                </Button>
              )}
              {!isLastStep && (
                <Button
                  size="sm"
                  onClick={() => setStep(s => Math.min(DIMENSIONS.length - 1, s + 1))}
                  data-testid="next-step-btn"
                >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dimension completion summary */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2">
            {DIMENSIONS.map((d, i) => (
              <Badge
                key={d.key}
                variant={scores[d.key] ? "default" : "outline"}
                className={`cursor-pointer text-xs ${
                  scores[d.key] ? "bg-emerald-100 text-emerald-800" : ""
                } ${i === step ? "ring-2 ring-am-gold" : ""}`}
                onClick={() => setStep(i)}
                data-testid={`dimension-badge-${d.key}`}
              >
                {scores[d.key] && <CheckCircle className="h-3 w-3 mr-1" />}
                {d.label}: {scores[d.key] || "—"}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
