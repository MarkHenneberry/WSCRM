export const sources = ["Facebook", "Google", "Referral", "Other"] as const;
export const websiteStatuses = [
  "No website",
  "Broken website",
  "Weak website",
  "Has good website",
  "Unknown"
] as const;
export const salesStages = [
  "Prospect",
  "Contacted",
  "Replied",
  "Interested",
  "Demo Sent",
  "Won",
  "Lost"
] as const;
export const templateCategories = [
  "First Outreach",
  "Follow-Up",
  "Demo Sent",
  "Soft Close",
  "Other"
] as const;

export type LeadSource = (typeof sources)[number];
export type WebsiteStatus = (typeof websiteStatuses)[number];
export type SalesStage = (typeof salesStages)[number];
export type TemplateCategory = (typeof templateCategories)[number];

export type ActivityType = "created" | "updated" | "note" | "message" | "stage";

export type Activity = {
  id: string;
  type: ActivityType;
  title: string;
  description?: string;
  createdAt: string;
};

export type Lead = {
  id: string;
  businessName: string;
  contactName: string;
  businessType: string;
  source: LeadSource;
  websiteUrl: string;
  facebookUrl: string;
  phone: string;
  email: string;
  websiteStatus: WebsiteStatus;
  salesStage: SalesStage;
  lastContactedDate: string;
  nextFollowUpDate: string;
  notes: string;
  activities: Activity[];
  createdAt: string;
  updatedAt: string;
};

export type MessageTemplateKey =
  | "outreachWeakWebsite"
  | "outreachNoWebsite"
  | "outreachBrokenWebsite"
  | "followUpGeneral"
  | "followUpNoWebsite"
  | "followUpBrokenWebsite"
  | "demoSent"
  | "softClose";

export type MessageTemplate = {
  id: string;
  key?: MessageTemplateKey;
  name: string;
  category: TemplateCategory;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type LeadFilters = {
  query: string;
  stage: "All" | SalesStage;
  websiteStatus: "All" | WebsiteStatus;
  source: "All" | LeadSource;
  followUp: "All" | "Due today" | "Overdue" | "Upcoming" | "No date";
};
