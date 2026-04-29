import { defaultTemplates } from "@/lib/templates";
import type { Activity, Lead, MessageTemplate, SalesStage, TemplateCategory } from "@/lib/types";

const STORAGE_KEY = "local-business-crm-leads";
const TEMPLATE_STORAGE_KEY = "local-business-crm-templates";

const today = new Date();
const makeId = () => globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const isoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const addDays = (days: number) => {
  const date = new Date(today);
  date.setDate(today.getDate() + days);
  return isoDate(date);
};

function makeActivity(
  title: string,
  type: Activity["type"] = "created",
  description?: string
): Activity {
  return {
    id: makeId(),
    type,
    title,
    description,
    createdAt: new Date().toISOString()
  };
}

export const sampleLeads: Lead[] = [
  {
    id: makeId(),
    businessName: "Harbourfront Auto Detailing",
    contactName: "Ryan Cole",
    businessType: "Auto detailing",
    source: "Facebook",
    websiteUrl: "",
    facebookUrl: "https://facebook.com/",
    phone: "19025550122",
    email: "ryan@example.com",
    websiteStatus: "No website",
    salesStage: "Contacted",
    lastContactedDate: isoDate(today),
    nextFollowUpDate: isoDate(today),
    notes: "Mentioned they mostly get leads through Facebook posts. Strong candidate for a simple booking site.",
    activities: [
      makeActivity("Lead created"),
      makeActivity("First outreach copied", "message", "Sent a short Facebook message.")
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: makeId(),
    businessName: "North End Family Dental",
    contactName: "Maya Singh",
    businessType: "Dental clinic",
    source: "Google",
    websiteUrl: "https://example.com",
    facebookUrl: "",
    phone: "19025550145",
    email: "maya@example.com",
    websiteStatus: "Weak website",
    salesStage: "Interested",
    lastContactedDate: addDays(-2),
    nextFollowUpDate: addDays(1),
    notes: "Website loads slowly on mobile and booking CTA is buried.",
    activities: [
      makeActivity("Lead created"),
      makeActivity("Stage changed to Interested", "stage", "Asked to see examples.")
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: makeId(),
    businessName: "Maple Street Landscaping",
    contactName: "Alex Martin",
    businessType: "Landscaping",
    source: "Referral",
    websiteUrl: "https://example.org",
    facebookUrl: "https://facebook.com/",
    phone: "19025550188",
    email: "",
    websiteStatus: "Broken website",
    salesStage: "Demo Sent",
    lastContactedDate: addDays(-5),
    nextFollowUpDate: addDays(-1),
    notes: "Homepage hero image is broken. Demo sent with a stronger seasonal quote request page.",
    activities: [
      makeActivity("Lead created"),
      makeActivity("Demo sent", "message", "Sent preview link and pricing range.")
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export function loadLeads(): Lead[] {
  if (typeof window === "undefined") return sampleLeads;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleLeads));
    return sampleLeads;
  }

  try {
    return JSON.parse(raw) as Lead[];
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleLeads));
    return sampleLeads;
  }
}

export function saveLeads(leads: Lead[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
}

function normalizeTemplate(template: Partial<MessageTemplate>, index: number): MessageTemplate {
  const matchedDefault = defaultTemplates.find((item) => item.key === template.key || item.id === template.id);
  const now = new Date().toISOString();

  return {
    id: template.id || template.key || `template-${index}-${makeId()}`,
    key: template.key,
    name: template.name || matchedDefault?.name || "Untitled template",
    category: template.category || matchedDefault?.category || "Other",
    body: template.body || matchedDefault?.body || "",
    createdAt: template.createdAt || now,
    updatedAt: template.updatedAt || now
  };
}

export function loadTemplates(): MessageTemplate[] {
  if (typeof window === "undefined") return defaultTemplates;

  const raw = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
  if (!raw) {
    window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(defaultTemplates));
    return defaultTemplates;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<MessageTemplate>[];
    return parsed.map(normalizeTemplate);
  } catch {
    window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(defaultTemplates));
    return defaultTemplates;
  }
}

export function saveTemplates(templates: MessageTemplate[]) {
  window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
}

export function createTemplate({
  name,
  category,
  body
}: {
  name: string;
  category: TemplateCategory;
  body: string;
}): MessageTemplate {
  const now = new Date().toISOString();

  return {
    id: makeId(),
    name,
    category,
    body,
    createdAt: now,
    updatedAt: now
  };
}

export function createBlankLead(): Lead {
  const now = new Date().toISOString();

  return {
    id: makeId(),
    businessName: "New local business",
    contactName: "",
    businessType: "",
    source: "Facebook",
    websiteUrl: "",
    facebookUrl: "",
    phone: "",
    email: "",
    websiteStatus: "Unknown",
    salesStage: "Prospect",
    lastContactedDate: "",
    nextFollowUpDate: "",
    notes: "",
    activities: [
      {
        id: makeId(),
        type: "created",
        title: "Lead created",
        createdAt: now
      }
    ],
    createdAt: now,
    updatedAt: now
  };
}

export function createActivity(
  title: string,
  type: Activity["type"] = "updated",
  description?: string
): Activity {
  return {
    id: makeId(),
    type,
    title,
    description,
    createdAt: new Date().toISOString()
  };
}

export function stageActivity(stage: SalesStage) {
  return createActivity(`Stage changed to ${stage}`, "stage");
}
