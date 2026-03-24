import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export const CHANNELS = [
  { value: "google_ads", label: "Google Ads", color: "#4285F4" },
  { value: "meta_ads", label: "Meta Ads", color: "#1877F2" },
  { value: "linkedin_ads", label: "LinkedIn Ads", color: "#0A66C2" },
  { value: "hubspot", label: "HubSpot", color: "#FF7A59" },
  { value: "email", label: "Email", color: "#10B981" },
  { value: "sms", label: "SMS", color: "#8B5CF6" },
  { value: "programmatic", label: "Programmatic", color: "#F59E0B" },
] as const;

export type Channel = (typeof CHANNELS)[number]["value"];

export const CONTENT_TYPES = [
  { value: "ad_copy", label: "Ad Copy" },
  { value: "headline", label: "Headline" },
  { value: "email", label: "Email" },
  { value: "landing_page", label: "Landing Page" },
  { value: "blog_post", label: "Blog Post" },
  { value: "social_post", label: "Social Post" },
  { value: "sms", label: "SMS" },
  { value: "whitepaper", label: "Whitepaper" },
  { value: "case_study", label: "Case Study" },
] as const;
