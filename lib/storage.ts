import { defaultTemplates } from "@/lib/templates";
import type { Activity, Lead, MessageTemplate, SalesStage, TemplateCategory } from "@/lib/types";

const STORAGE_KEY = "local-business-crm-leads";
const TEMPLATE_STORAGE_KEY = "local-business-crm-templates";
const LEADS_BACKUP_LATEST_KEY = "local-business-crm-leads-backup-latest";

const makeId = () => globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const timestampForBackupKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}-${hours}-${minutes}-${seconds}`;
};

export function loadLeads(): Lead[] {
  if (typeof window === "undefined") return [];

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    return JSON.parse(raw) as Lead[];
  } catch {
    return [];
  }
}

function safeParseLeadArray(raw: string | null): Lead[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Lead[]) : [];
  } catch {
    return [];
  }
}

function writeLeadBackups(previousRaw: string) {
  const now = new Date();
  window.localStorage.setItem(LEADS_BACKUP_LATEST_KEY, previousRaw);
  window.localStorage.setItem(`local-business-crm-leads-backup-${timestampForBackupKey(now)}`, previousRaw);
}

export function saveLeads(leads: Lead[], options: { allowEmptyOverwrite?: boolean } = {}) {
  const previousRaw = window.localStorage.getItem(STORAGE_KEY);
  const previousLeads = safeParseLeadArray(previousRaw);

  if (previousRaw) {
    writeLeadBackups(previousRaw);
  }

  if (leads.length === 0 && previousLeads.length > 0 && !options.allowEmptyOverwrite) {
    const confirmed = window.confirm(
      "This would save zero leads over existing leads. Continue? This cannot be undone without a backup."
    );
    if (!confirmed) return false;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
  return true;
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
