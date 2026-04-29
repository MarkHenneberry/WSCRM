"use client";

import {
  BarChart3,
  CalendarClock,
  Check,
  Clipboard,
  ExternalLink,
  Facebook,
  LayoutDashboard,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  Users,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  createActivity,
  createBlankLead,
  createTemplate,
  loadLeads,
  loadTemplates,
  saveLeads,
  saveTemplates,
  stageActivity
} from "@/lib/storage";
import { renderTemplate } from "@/lib/templates";
import { salesStages, sources, templateCategories, websiteStatuses } from "@/lib/types";
import type {
  Lead,
  LeadAuditResult,
  LeadFilters,
  LeadProblemType,
  LeadSource,
  MessageTemplate,
  MessageTemplateKey,
  TemplateCategory,
  WebsiteStatus
} from "@/lib/types";

type View = "dashboard" | "leads" | "templates" | "discovery";
type TemplateFormState = {
  name: string;
  category: TemplateCategory;
  body: string;
};
type ImportedLeadRow = {
  id: string;
  businessName: string;
  link: string;
  phone: string;
  notes: string;
  selected: boolean;
  duplicateStatus: "none" | "exact" | "possible";
  duplicateMatches: Array<{
    leadName: string;
    leadLink: string;
    leadPhone: string;
    reason: string;
    type: "exact" | "possible";
  }>;
};
type PlacesLeadCandidate = {
  id: string;
  name: string;
  googleListingLink: string;
  website: string;
  phone: string;
  rating: number | null;
  reviewCount: number;
  category: string;
  address: string;
  websiteStatus: string;
  websiteWeakReasons: string[];
  businessStatus: string;
  openNow: boolean;
  activitySignal: "active" | "inactive" | "unclear";
  opportunityScore: number;
  leadLabel: "Best lead" | "Good lead" | "Maybe" | "Skip";
  opportunityReason: string;
  possibleDuplicate?: boolean;
  duplicateReason?: string;
  audit?: LeadAuditResult;
};
type PlacesSearchDebug = {
  googleReturned: number;
  removedExactCrmDuplicates: number;
};
type LocalStorageKeyInfo = {
  key: string;
  leadCount: number;
};

const initialFilters: LeadFilters = {
  query: "",
  businessType: "All",
  stage: "All",
  websiteStatus: "All",
  source: "All",
  followUp: "All"
};

const stageClass: Record<Lead["salesStage"], string> = {
  Prospect: "badge badge-slate",
  Contacted: "badge badge-blue",
  Replied: "badge badge-cyan",
  Interested: "badge badge-green",
  "Demo Sent": "badge badge-violet",
  Won: "badge badge-emerald",
  Lost: "badge badge-red"
};

const websiteClass: Record<Lead["websiteStatus"], string> = {
  "No website": "status status-red",
  "Broken website": "status status-amber",
  "Weak website": "status status-orange",
  "Has good website": "status status-green",
  Unknown: "status status-slate"
};

function todayDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(date: string) {
  if (!date) return "No date";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${date}T12:00:00`));
}

function formatDateTime(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(date));
}

function normalizeUrl(url: string) {
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function normalizePhone(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

function makeLocalId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function followUpState(lead: Lead) {
  if (!lead.nextFollowUpDate) return "No date";
  const today = todayDate();
  if (lead.nextFollowUpDate < today) return "Overdue";
  if (lead.nextFollowUpDate === today) return "Due today";
  return "Upcoming";
}

function websiteStatusFromProblem(problem: LeadProblemType): WebsiteStatus {
  if (problem === "no website") return "No website";
  if (problem === "broken website") return "Broken website";
  if (problem === "weak presence") return "Weak website";
  return "Has good website";
}

function sourceFromLink(link: string): LeadSource {
  if (/facebook\.com/i.test(link)) return "Facebook";
  if (link.trim()) return "Google";
  return "Other";
}

function countLeadsInRawValue(raw: string | null) {
  if (!raw) return 0;

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.length;
    if (Array.isArray(parsed?.leads)) return parsed.leads.length;
    return 0;
  } catch {
    return 0;
  }
}

function parseLeadsFromRawValue(raw: string | null): Lead[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as Lead[];
    if (Array.isArray(parsed?.leads)) return parsed.leads as Lead[];
    return [];
  } catch {
    return [];
  }
}

function mergeLeads(existing: Lead[], incoming: Lead[]) {
  const seen = new Set(existing.map((lead) => lead.id));
  const uniqueIncoming = incoming.filter((lead) => {
    if (!lead.id || seen.has(lead.id)) return false;
    seen.add(lead.id);
    return true;
  });

  return [...uniqueIncoming, ...existing];
}

function normalizeDuplicateName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !["ltd", "limited", "inc", "incorporated", "co", "company"].includes(word))
    .join(" ");
}

function normalizeDuplicateUrl(value: string) {
  const withoutQuery = value.split("?")[0];
  return withoutQuery.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

function normalizeDuplicatePhone(value: string) {
  return value.replace(/\D/g, "");
}

function splitCsvRow(row: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    const next = row[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function splitImportRow(row: string) {
  return row.includes("|") ? row.split("|").map((value) => value.trim()) : splitCsvRow(row);
}

function getImportDuplicateMatches(
  row: Pick<ImportedLeadRow, "id" | "businessName" | "link" | "phone">,
  leads: Lead[],
  otherRows: Array<Pick<ImportedLeadRow, "id" | "businessName" | "link" | "phone">> = []
) {
  const matches: ImportedLeadRow["duplicateMatches"] = [];
  const seen = new Set<string>();
  const rowName = normalizeDuplicateName(row.businessName);
  const rowLink = normalizeDuplicateUrl(row.link);
  const rowPhone = normalizeDuplicatePhone(row.phone);

  const addMatch = ({
    leadName,
    leadLink,
    leadPhone,
    reason,
    type
  }: {
    leadName: string;
    leadLink: string;
    leadPhone: string;
    reason: string;
    type: "exact" | "possible";
  }) => {
    const key = `${leadName}-${leadLink}-${leadPhone}-${reason}-${type}`;
    if (seen.has(key)) return;
    seen.add(key);
    matches.push({ leadName, leadLink, leadPhone, reason, type });
  };

  leads.forEach((lead) => {
    const leadName = normalizeDuplicateName(lead.businessName);
    const leadWebsite = normalizeDuplicateUrl(lead.websiteUrl);
    const leadFacebook = normalizeDuplicateUrl(lead.facebookUrl);
    const leadDiscoveryLink = normalizeDuplicateUrl(lead.discoveryLink ?? "");
    const leadPhone = normalizeDuplicatePhone(lead.phone);

    const leadDisplayLink = lead.websiteUrl || lead.facebookUrl || lead.discoveryLink || "";
    const leadMatch = {
      leadName: lead.businessName,
      leadLink: leadDisplayLink,
      leadPhone: lead.phone
    };

    if (rowName && leadName && leadName === rowName) addMatch({ ...leadMatch, reason: "business name", type: "exact" });
    if (rowName && leadName && leadName !== rowName && (leadName.includes(rowName) || rowName.includes(leadName))) {
      addMatch({ ...leadMatch, reason: "similar business name", type: "possible" });
    }
    if (
      rowLink &&
      (leadWebsite === rowLink ||
        leadFacebook === rowLink ||
        leadDiscoveryLink === rowLink)
    ) {
      addMatch({ ...leadMatch, reason: "website or Facebook link", type: "exact" });
    }
    if (rowPhone && leadPhone === rowPhone) addMatch({ ...leadMatch, reason: "phone", type: "exact" });
  });

  otherRows.forEach((other) => {
    if (other.id === row.id) return;
    const otherName = normalizeDuplicateName(other.businessName);
    const otherLink = normalizeDuplicateUrl(other.link);
    const otherPhone = normalizeDuplicatePhone(other.phone);

    const otherMatch = {
      leadName: other.businessName,
      leadLink: other.link,
      leadPhone: other.phone
    };

    if (rowName && otherName && otherName === rowName) addMatch({ ...otherMatch, reason: "business name repeats in import", type: "exact" });
    if (rowName && otherName && otherName !== rowName && (otherName.includes(rowName) || rowName.includes(otherName))) {
      addMatch({ ...otherMatch, reason: "similar name repeats in import", type: "possible" });
    }
    if (rowLink && otherLink === rowLink) addMatch({ ...otherMatch, reason: "link repeats in import", type: "exact" });
    if (rowPhone && otherPhone === rowPhone) addMatch({ ...otherMatch, reason: "phone repeats in import", type: "exact" });
  });

  return matches;
}

function parseImportedLeadRows(raw: string, leads: Lead[]): ImportedLeadRow[] {
  const baseRows = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [businessName = "", link = "", phone = "", ...noteParts] = splitImportRow(line);
      return {
        id: makeLocalId(),
        businessName: businessName.trim(),
        link: link.trim(),
        phone: phone.trim(),
        notes: noteParts.join(", ").trim(),
        selected: Boolean(businessName.trim()),
        duplicateStatus: "none" as const,
        duplicateMatches: []
      };
    })
    .filter((row) => row.businessName);

  return baseRows.map((row) => {
    const duplicateMatches = getImportDuplicateMatches(row, leads, baseRows);
    const duplicateStatus: ImportedLeadRow["duplicateStatus"] = duplicateMatches.some((match) => match.type === "exact")
      ? "exact"
      : duplicateMatches.length > 0
        ? "possible"
        : "none";

    return {
      ...row,
      duplicateStatus,
      duplicateMatches
    };
  });
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function matchesFilters(lead: Lead, filters: LeadFilters) {
  const query = filters.query.trim().toLowerCase();
  const queryMatch =
    !query ||
    lead.businessName.toLowerCase().includes(query) ||
    lead.contactName.toLowerCase().includes(query) ||
    lead.businessType.toLowerCase().includes(query);

  return (
    queryMatch &&
    (filters.businessType === "All" || lead.businessType === filters.businessType) &&
    (filters.stage === "All" || lead.salesStage === filters.stage) &&
    (filters.websiteStatus === "All" || lead.websiteStatus === filters.websiteStatus) &&
    (filters.source === "All" || lead.source === filters.source) &&
    (filters.followUp === "All" || followUpState(lead) === filters.followUp)
  );
}

export function CrmApp() {
  const [view, setView] = useState<View>("dashboard");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [filters, setFilters] = useState<LeadFilters>(initialFilters);
  const [copiedKey, setCopiedKey] = useState<string>("");
  const [toastMessage, setToastMessage] = useState<string>("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [auditingId, setAuditingId] = useState<string>("");
  const [storageKeyInfo, setStorageKeyInfo] = useState<LocalStorageKeyInfo[]>([]);
  const [importText, setImportText] = useState("");
  const [importRows, setImportRows] = useState<ImportedLeadRow[]>([]);
  const [recentImportedLeadIds, setRecentImportedLeadIds] = useState<string[]>([]);
  const [placesSearchTerm, setPlacesSearchTerm] = useState("roofing");
  const [placesLocation, setPlacesLocation] = useState("Halifax, NS");
  const [placesArea, setPlacesArea] = useState("HRM");
  const [prioritizeNoWebsite, setPrioritizeNoWebsite] = useState(true);
  const [includeNoWebsite, setIncludeNoWebsite] = useState(true);
  const [includeWeakWebsite, setIncludeWeakWebsite] = useState(true);
  const [useMinimumRating, setUseMinimumRating] = useState(false);
  const [minimumRating, setMinimumRating] = useState("4.0");
  const [useMinimumReviewCount, setUseMinimumReviewCount] = useState(true);
  const [minimumReviewCount, setMinimumReviewCount] = useState("5");
  const [excludeInactive, setExcludeInactive] = useState(true);
  const [excludeChains, setExcludeChains] = useState(true);
  const [placesResults, setPlacesResults] = useState<PlacesLeadCandidate[]>([]);
  const [placesMessage, setPlacesMessage] = useState("");
  const [placesDebug, setPlacesDebug] = useState<PlacesSearchDebug | null>(null);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [passedPlaceIds, setPassedPlaceIds] = useState<string[]>([]);
  const [showPassedPlaces, setShowPassedPlaces] = useState(false);
  const [placesBatchLabel, setPlacesBatchLabel] = useState("");

  useEffect(() => {
    const loaded = loadLeads();
    setLeads(loaded);
    setMessageTemplates(loadTemplates());
    setSelectedLeadId(loaded[0]?.id ?? "");
    refreshStorageKeyInfo();
    setHasLoaded(true);
  }, []);

  useEffect(() => {
    if (hasLoaded) {
      const saved = saveLeads(leads);
      if (!saved) {
        setLeads(loadLeads());
      }
      refreshStorageKeyInfo();
    }
  }, [hasLoaded, leads]);

  useEffect(() => {
    if (hasLoaded) saveTemplates(messageTemplates);
  }, [hasLoaded, messageTemplates]);

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedLeadId) ?? leads[0],
    [leads, selectedLeadId]
  );

  const filteredLeads = useMemo(
    () => leads.filter((lead) => matchesFilters(lead, filters)),
    [filters, leads]
  );

  const businessTypeOptions = useMemo(
    () => Array.from(new Set(leads.map((lead) => lead.businessType.trim()).filter(Boolean))).sort(),
    [leads]
  );

  const metrics = useMemo(() => {
    const dueToday = leads.filter((lead) => followUpState(lead) === "Due today").length;
    const overdue = leads.filter((lead) => followUpState(lead) === "Overdue").length;

    return [
      { label: "Total leads", value: leads.length, icon: Users },
      {
        label: "Leads contacted",
        value: leads.filter((lead) => lead.salesStage !== "Prospect").length,
        icon: Send
      },
      {
        label: "Replies",
        value: leads.filter((lead) =>
          ["Replied", "Interested", "Demo Sent", "Won"].includes(lead.salesStage)
        ).length,
        icon: MessageCircle
      },
      {
        label: "Interested",
        value: leads.filter((lead) => lead.salesStage === "Interested").length,
        icon: BarChart3
      },
      {
        label: "Demos sent",
        value: leads.filter((lead) => lead.salesStage === "Demo Sent").length,
        icon: ExternalLink
      },
      {
        label: "Won / Lost",
        value: `${leads.filter((lead) => lead.salesStage === "Won").length} / ${
          leads.filter((lead) => lead.salesStage === "Lost").length
        }`,
        icon: Check
      },
      { label: "Due today", value: dueToday, icon: CalendarClock },
      { label: "Overdue", value: overdue, icon: CalendarClock, urgent: overdue > 0 }
    ];
  }, [leads]);

  function updateLead(id: string, patch: Partial<Lead>) {
    setLeads((current) =>
      current.map((lead) => {
        if (lead.id !== id) return lead;

        const { activities, ...leadPatch } = patch;
        const nextActivities = activities ? [...activities] : [...lead.activities];
        if (patch.salesStage && patch.salesStage !== lead.salesStage) {
          nextActivities.unshift(stageActivity(patch.salesStage));
        }

        return {
          ...lead,
          ...leadPatch,
          activities: nextActivities,
          updatedAt: new Date().toISOString()
        };
      })
    );
  }

  function addLead() {
    const lead = createBlankLead();
    setLeads((current) => [lead, ...current]);
    setSelectedLeadId(lead.id);
    setView("leads");
  }

  function showToast(message: string) {
    setToastMessage(message);
    setTimeout(() => setToastMessage(""), 2200);
  }

  function refreshStorageKeyInfo() {
    if (typeof window === "undefined") return;

    const keys = Object.keys(window.localStorage)
      .filter((key) => /lead|crm/i.test(key))
      .sort();

    setStorageKeyInfo(
      keys.map((key) => ({
        key,
        leadCount: countLeadsInRawValue(window.localStorage.getItem(key))
      }))
    );
  }

  function exportBackup() {
    const localStorageSnapshot: Record<string, string | null> = {};
    Object.keys(window.localStorage)
      .filter((key) => /crm|lead/i.test(key))
      .forEach((key) => {
        localStorageSnapshot[key] = window.localStorage.getItem(key);
      });

    downloadJson(`website-sales-crm-backup-${todayDate()}.json`, {
      version: 1,
      exportedAt: new Date().toISOString(),
      leads,
      templates: messageTemplates,
      settings: {
        selectedLeadId,
        filters
      },
      localStorage: localStorageSnapshot
    });
    showToast("Backup exported");
  }

  function importBackupFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const importedLeads = Array.isArray(parsed?.leads) ? (parsed.leads as Lead[]) : [];
        const importedTemplates = Array.isArray(parsed?.templates) ? (parsed.templates as MessageTemplate[]) : [];

        if (importedLeads.length === 0 && importedTemplates.length === 0) {
          showToast("No leads or templates found");
          return;
        }

        if (importedLeads.length > 0) {
          setLeads((current) => mergeLeads(current, importedLeads));
        }
        if (importedTemplates.length > 0) {
          setMessageTemplates((current) => {
            const seen = new Set(current.map((template) => template.id));
            return [...importedTemplates.filter((template) => template.id && !seen.has(template.id)), ...current];
          });
        }
        refreshStorageKeyInfo();
        showToast("Backup imported");
      } catch {
        showToast("Could not import backup");
      }
    };
    reader.readAsText(file);
  }

  function restoreLeadsFromStorageKey(key: string) {
    const restoredLeads = parseLeadsFromRawValue(window.localStorage.getItem(key));
    if (restoredLeads.length === 0) {
      showToast("No leads found in backup");
      return;
    }

    setLeads((current) => mergeLeads(current, restoredLeads));
    refreshStorageKeyInfo();
    showToast("Backup leads restored");
  }

  function deleteLead(id: string) {
    if (!window.confirm("Delete this lead? This cannot be undone.")) return;

    setLeads((current) => {
      const next = current.filter((lead) => lead.id !== id);
      if (selectedLeadId === id) setSelectedLeadId(next[0]?.id ?? "");
      return next;
    });
    setView("leads");
    showToast("Lead deleted");
  }

  async function auditBusiness({
    businessName,
    websiteUrl,
    facebookUrl
  }: {
    businessName: string;
    websiteUrl?: string;
    facebookUrl?: string;
  }) {
    const response = await fetch("/api/lead-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessName, websiteUrl, facebookUrl })
    });

    if (!response.ok) throw new Error("Lead audit failed");
    return (await response.json()) as LeadAuditResult & { usedFallback?: boolean };
  }

  function getExcludedPlaceUrls() {
    return [
      ...leads.flatMap((lead) => [lead.websiteUrl, lead.facebookUrl, lead.discoveryLink ?? ""])
    ].filter(Boolean);
  }

  function getExcludedPlaceNames() {
    return leads.map((lead) => lead.businessName).filter(Boolean);
  }

  function getExcludedPlacePhones() {
    return leads.map((lead) => lead.phone).filter(Boolean);
  }

  function mergePlacesResults(current: PlacesLeadCandidate[], incoming: PlacesLeadCandidate[]) {
    const seen = new Set(
      current.map((result) => result.id || `${result.name.toLowerCase()}-${result.address.toLowerCase()}-${result.website.toLowerCase()}`)
    );
    const uniqueIncoming = incoming.filter((result) => {
      const key = result.id || `${result.name.toLowerCase()}-${result.address.toLowerCase()}-${result.website.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return [...current, ...uniqueIncoming];
  }

  function resetRealLeadSearchState() {
    setPlacesResults([]);
    setPassedPlaceIds([]);
    setPlacesMessage("Search state reset.");
    setPlacesDebug(null);
    setPlacesBatchLabel("");
    showToast("Search state reset");
  }

  function relatedSearchTerms(candidate: PlacesLeadCandidate) {
    const base = `${placesSearchTerm} ${candidate.category}`.toLowerCase();

    if (base.includes("driveway") || base.includes("asphalt") || base.includes("pavement") || base.includes("seal")) {
      return ["asphalt sealing", "pavement sealing", "driveway repair", "sealcoating"];
    }
    if (base.includes("roof")) return ["roof repair", "roofing contractor", "shingle repair", "metal roofing"];
    if (base.includes("landscap") || base.includes("lawn")) return ["lawn care", "landscaping services", "yard cleanup", "hardscaping"];
    if (base.includes("clean")) return ["house cleaning", "commercial cleaning", "pressure washing", "window cleaning"];
    if (base.includes("paint")) return ["interior painting", "exterior painting", "house painter", "painting contractor"];
    if (base.includes("plumb")) return ["plumber", "drain cleaning", "water heater repair", "emergency plumbing"];
    if (base.includes("electric")) return ["electrician", "electrical contractor", "panel upgrade", "lighting installation"];

    return [candidate.category, `${placesSearchTerm} services`, `${placesSearchTerm} contractor`].filter(Boolean);
  }

  async function searchRealLeads(
    options: { append?: boolean; searchTermOverride?: string; searchTermsOverride?: string[]; label?: string } = {}
  ) {
    const activeSearchTerm = options.searchTermOverride ?? options.searchTermsOverride?.[0] ?? placesSearchTerm;
    setIsSearchingPlaces(true);
    setPlacesMessage("");
    try {
      const response = await fetch("/api/places-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchTerm: activeSearchTerm,
          searchTerms: options.searchTermsOverride,
          location: placesLocation,
          area: placesArea,
          prioritizeNoWebsite,
          includeNoWebsite,
          includeWeakWebsite,
          useMinimumRating,
          minimumRating: Number(minimumRating) || 0,
          useMinimumReviewCount,
          minimumReviewCount: Number(minimumReviewCount) || 0,
          excludeInactive,
          excludeChains,
          excludedPlaceIds: passedPlaceIds.filter(Boolean),
          excludedUrls: getExcludedPlaceUrls(),
          excludedNames: getExcludedPlaceNames(),
          excludedPhones: getExcludedPlacePhones()
        })
      });
      const data = (await response.json()) as {
        setupRequired?: boolean;
        message?: string;
        error?: string;
        results?: PlacesLeadCandidate[];
        debug?: PlacesSearchDebug;
      };

      setPlacesResults((current) => (options.append ? mergePlacesResults(current, data.results ?? []) : data.results ?? []));
      setPlacesDebug(data.debug ?? null);
      setPlacesBatchLabel(options.label ?? `Results for ${activeSearchTerm}`);
      setPlacesMessage(data.message ?? data.error ?? "");
      if (data.setupRequired) showToast("Google Places key needed");
      else showToast(`${data.results?.length ?? 0} real leads found`);
    } catch {
      setPlacesMessage("Could not run real lead search.");
    } finally {
      setIsSearchingPlaces(false);
    }
  }

  function passPlacesCandidate(candidate: PlacesLeadCandidate) {
    setPassedPlaceIds((current) => (current.includes(candidate.id) ? current : [...current, candidate.id]));
    showToast("Lead passed");
  }

  function undoPassPlacesCandidate(candidateId: string) {
    setPassedPlaceIds((current) => current.filter((id) => id !== candidateId));
    showToast("Pass undone");
  }

  async function findSimilarPlaces(candidate: PlacesLeadCandidate) {
    const terms = relatedSearchTerms(candidate);
    if (terms.length === 0) return;
    await searchRealLeads({
      append: true,
      searchTermsOverride: terms,
      label: `Added similar leads for ${candidate.name}`
    });
  }

  async function generatePlacesCandidateInsight(candidate: PlacesLeadCandidate) {
    setAuditingId(candidate.id);
    try {
      const audit = await auditBusiness({
        businessName: candidate.name,
        websiteUrl: candidate.website,
        facebookUrl: ""
      });
      setPlacesResults((current) =>
        current.map((item) => (item.id === candidate.id ? { ...item, audit } : item))
      );
      showToast("Lead insight generated");
    } catch {
      showToast("Could not generate insight");
    } finally {
      setAuditingId("");
    }
  }

  function addPlacesCandidateToCrm(candidate: PlacesLeadCandidate) {
    const now = new Date().toISOString();
    const lead = {
      ...createBlankLead(),
      businessName: candidate.name,
      businessType: candidate.category,
      source: "Google",
      discoveryLink: candidate.googleListingLink,
      websiteUrl: candidate.website,
      facebookUrl: "",
      phone: candidate.phone,
      websiteStatus:
        candidate.websiteStatus === "No website"
          ? "No website"
          : candidate.websiteStatus === "Weak website"
            ? "Weak website"
            : "Unknown",
      problemType: candidate.audit?.problem_type,
      leadScore: candidate.audit?.lead_score ?? candidate.opportunityScore,
      leadInsight: candidate.audit?.insight ?? candidate.opportunityReason,
      firstMessage: candidate.audit?.first_message,
      followUpMessage: candidate.audit?.follow_up_message,
      auditUpdatedAt: candidate.audit ? now : undefined,
      notes: `Google Places: ${candidate.address}. ${candidate.opportunityReason}`,
      createdAt: now,
      updatedAt: now
    } satisfies Lead;

    setLeads((current) => [lead, ...current]);
    setSelectedLeadId(lead.id);
    setPlacesResults((current) => current.filter((item) => item.id !== candidate.id));
    showToast("Lead added to CRM");
  }

  function parseImportPreview() {
    const parsedRows = parseImportedLeadRows(importText, leads);
    setImportRows(parsedRows);
    setRecentImportedLeadIds([]);
    showToast(parsedRows.length ? "Import preview ready" : "No valid rows found");
  }

  function toggleImportRow(id: string) {
    setImportRows((current) =>
      current.map((row) => (row.id === id ? { ...row, selected: !row.selected } : row))
    );
  }

  function setImportRowSelected(id: string, selected: boolean) {
    setImportRows((current) =>
      current.map((row) => (row.id === id ? { ...row, selected } : row))
    );
  }

  function setAllImportRows(selected: boolean) {
    setImportRows((current) => current.map((row) => ({ ...row, selected })));
  }

  function addSelectedImportedLeads() {
    const selectedRows = importRows.filter((row) => row.selected);
    if (selectedRows.length === 0) {
      showToast("No imported leads selected");
      return;
    }

    const exactDuplicates = selectedRows.filter((row) => row.duplicateStatus === "exact");
    if (exactDuplicates.length > 0) {
      const confirmed = window.confirm(
        `${exactDuplicates.length} selected rows are marked Duplicate. Add them anyway?`
      );
      if (!confirmed) return;
    }

    const now = new Date().toISOString();
    const newLeads = selectedRows.map((row) => {
      const isFacebook = /facebook\.com/i.test(row.link);
      return {
        ...createBlankLead(),
        businessName: row.businessName,
        source: sourceFromLink(row.link),
        discoveryLink: row.link,
        websiteUrl: isFacebook ? "" : row.link,
        facebookUrl: isFacebook ? row.link : "",
        phone: row.phone,
        notes: row.notes,
        createdAt: now,
        updatedAt: now
      } satisfies Lead;
    });

    setLeads((current) => [...newLeads, ...current]);
    setRecentImportedLeadIds(newLeads.map((lead) => lead.id));
    setImportRows((current) => current.filter((row) => !row.selected));
    showToast(`${newLeads.length} leads added`);
  }

  async function generateRecentImportedInsights() {
    const importedLeads = leads.filter((lead) => recentImportedLeadIds.includes(lead.id));
    if (importedLeads.length === 0) {
      showToast("No imported leads ready for AI");
      return;
    }

    for (const lead of importedLeads) {
      await generateLeadInsight(lead);
    }
  }

  async function generateLeadInsight(lead: Lead) {
    setAuditingId(lead.id);
    try {
      const audit = await auditBusiness({
        businessName: lead.businessName,
        websiteUrl: lead.websiteUrl,
        facebookUrl: lead.facebookUrl
      });
      updateLead(lead.id, {
        problemType: audit.problem_type,
        leadScore: audit.lead_score,
        leadInsight: audit.insight,
        firstMessage: audit.first_message,
        followUpMessage: audit.follow_up_message,
        auditUpdatedAt: new Date().toISOString(),
        websiteStatus: websiteStatusFromProblem(audit.problem_type),
        activities: [
          createActivity("AI lead insight generated", "updated", audit.insight.slice(0, 180)),
          ...lead.activities
        ]
      });
      showToast("Lead insight generated");
    } catch {
      showToast("Could not generate insight");
    } finally {
      setAuditingId("");
    }
  }

  async function copySuggestedMessage(message: string, label: string) {
    await copyToClipboard(message);
    showToast(`${label} copied`);
  }

  function addNoteActivity(lead: Lead) {
    const trimmed = lead.notes.trim();
    if (!trimmed) return;

    updateLead(lead.id, {
      activities: [
        createActivity("Note saved", "note", trimmed.slice(0, 180)),
        ...lead.activities
      ]
    });
  }

  async function copyTemplate(lead: Lead, templateId: string) {
    const template = messageTemplates.find((item) => item.id === templateId || item.key === templateId);
    if (!template) return;

    const rendered = renderTemplate(template, lead);
    await copyToClipboard(rendered);
    setCopiedKey(`${lead.id}-${template.id}`);
    showToast(`${template.name} copied`);
    setTimeout(() => setCopiedKey(""), 1600);
  }

  function openNewTemplateModal() {
    setEditingTemplate(null);
    setTemplateModalOpen(true);
  }

  function saveTemplateForm(form: TemplateFormState) {
    const trimmedName = form.name.trim();
    const trimmedBody = form.body.trim();
    if (!trimmedName || !trimmedBody) return;

    if (editingTemplate) {
      setMessageTemplates((current) =>
        current.map((template) =>
          template.id === editingTemplate.id
            ? {
                ...template,
                name: trimmedName,
                category: form.category,
                body: trimmedBody,
                updatedAt: new Date().toISOString()
              }
            : template
        )
      );
      showToast("Template updated");
    } else {
      setMessageTemplates((current) => [
        createTemplate({
          name: trimmedName,
          category: form.category,
          body: trimmedBody
        }),
        ...current
      ]);
      showToast("Template created");
    }

    setTemplateModalOpen(false);
    setEditingTemplate(null);
  }

  function editTemplate(template: MessageTemplate) {
    setEditingTemplate(template);
    setTemplateModalOpen(true);
  }

  function deleteTemplate(id: string) {
    if (!window.confirm("Delete this template? This cannot be undone.")) return;

    setMessageTemplates((current) => current.filter((template) => template.id !== id));
    if (editingTemplate?.id === id) {
      setEditingTemplate(null);
      setTemplateModalOpen(false);
    }
    showToast("Template deleted");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">W</div>
          <div>
            <strong>Website Sales CRM</strong>
            <span>Local outreach pipeline</span>
          </div>
        </div>

        <nav className="nav">
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>
            <LayoutDashboard size={18} /> Dashboard
          </button>
          <button className={view === "leads" ? "active" : ""} onClick={() => setView("leads")}>
            <Users size={18} /> Leads
          </button>
          <button className={view === "discovery" ? "active" : ""} onClick={() => setView("discovery")}>
            <Sparkles size={18} /> AI Finder
          </button>
          <button className={view === "templates" ? "active" : ""} onClick={() => setView("templates")}>
            <Clipboard size={18} /> Templates
          </button>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Personal CRM</p>
            <h1>
              {view === "dashboard"
                ? "Sales dashboard"
                : view === "leads"
                  ? "Lead pipeline"
                  : view === "discovery"
                    ? "AI lead finder"
                    : "Message templates"}
            </h1>
          </div>
          {view !== "discovery" && (
            <button className="primary-button" onClick={view === "templates" ? openNewTemplateModal : addLead}>
              <Plus size={18} /> {view === "templates" ? "New Template" : "New lead"}
            </button>
          )}
        </header>

        {view === "dashboard" && (
          <DashboardView
            metrics={metrics}
            leads={leads}
            onSelect={(id) => {
              setSelectedLeadId(id);
              setView("leads");
            }}
          />
        )}

        {view === "leads" && (
          <LeadsView
            copiedKey={copiedKey}
            businessTypeOptions={businessTypeOptions}
            filters={filters}
            leads={filteredLeads}
            selectedLead={selectedLead}
            setFilters={setFilters}
            setSelectedLeadId={setSelectedLeadId}
            updateLead={updateLead}
            addNoteActivity={addNoteActivity}
            copyTemplate={copyTemplate}
            messageTemplates={messageTemplates}
            deleteLead={deleteLead}
            generateLeadInsight={generateLeadInsight}
            auditingId={auditingId}
            copySuggestedMessage={copySuggestedMessage}
            addSelectedImportedLeads={addSelectedImportedLeads}
            generateRecentImportedInsights={generateRecentImportedInsights}
            importRows={importRows}
            importText={importText}
            parseImportPreview={parseImportPreview}
            recentImportedLeadIds={recentImportedLeadIds}
            setAllImportRows={setAllImportRows}
            setImportRowSelected={setImportRowSelected}
            setImportText={setImportText}
            toggleImportRow={toggleImportRow}
          />
        )}

        {view === "discovery" && (
          <DiscoveryView
            addPlacesCandidateToCrm={addPlacesCandidateToCrm}
            auditingId={auditingId}
            excludeChains={excludeChains}
            excludeInactive={excludeInactive}
            generatePlacesCandidateInsight={generatePlacesCandidateInsight}
            includeNoWebsite={includeNoWebsite}
            includeWeakWebsite={includeWeakWebsite}
            isSearchingPlaces={isSearchingPlaces}
            minimumRating={minimumRating}
            minimumReviewCount={minimumReviewCount}
            passedPlaceIds={passedPlaceIds}
            passPlacesCandidate={passPlacesCandidate}
            placesArea={placesArea}
            placesBatchLabel={placesBatchLabel}
            placesDebug={placesDebug}
            placesLocation={placesLocation}
            placesMessage={placesMessage}
            placesResults={placesResults}
            placesSearchTerm={placesSearchTerm}
            prioritizeNoWebsite={prioritizeNoWebsite}
            searchRealLeads={searchRealLeads}
            setExcludeChains={setExcludeChains}
            setExcludeInactive={setExcludeInactive}
            setIncludeNoWebsite={setIncludeNoWebsite}
            setIncludeWeakWebsite={setIncludeWeakWebsite}
            setMinimumRating={setMinimumRating}
            setMinimumReviewCount={setMinimumReviewCount}
            setPlacesArea={setPlacesArea}
            setPlacesLocation={setPlacesLocation}
            setPlacesSearchTerm={setPlacesSearchTerm}
            setPrioritizeNoWebsite={setPrioritizeNoWebsite}
            setShowPassedPlaces={setShowPassedPlaces}
            resetRealLeadSearchState={resetRealLeadSearchState}
            showPassedPlaces={showPassedPlaces}
            undoPassPlacesCandidate={undoPassPlacesCandidate}
            useMinimumRating={useMinimumRating}
            useMinimumReviewCount={useMinimumReviewCount}
            setUseMinimumRating={setUseMinimumRating}
            setUseMinimumReviewCount={setUseMinimumReviewCount}
            findSimilarPlaces={findSimilarPlaces}
          />
        )}

        {view === "templates" && (
          <TemplatesView
            copiedKey={copiedKey}
            copyTemplate={copyTemplate}
            deleteTemplate={deleteTemplate}
            editTemplate={editTemplate}
            selectedLead={selectedLead}
            templates={messageTemplates}
          />
        )}

        <RecoveryPanel
          currentLeadCount={leads.length}
          exportBackup={exportBackup}
          importBackupFile={importBackupFile}
          refreshStorageKeyInfo={refreshStorageKeyInfo}
          restoreLeadsFromStorageKey={restoreLeadsFromStorageKey}
          storageKeyInfo={storageKeyInfo}
        />
      </section>

      {templateModalOpen && (
        <TemplateModal
          editingTemplate={editingTemplate}
          key={editingTemplate?.id ?? "new-template"}
          onClose={() => {
            setTemplateModalOpen(false);
            setEditingTemplate(null);
          }}
          onSave={saveTemplateForm}
        />
      )}

      {toastMessage && (
        <div className="toast" role="status">
          <Check size={16} />
          {toastMessage}
        </div>
      )}
    </main>
  );
}

function DashboardView({
  metrics,
  leads,
  onSelect
}: {
  metrics: Array<{ label: string; value: number | string; icon: LucideIcon; urgent?: boolean }>;
  leads: Lead[];
  onSelect: (id: string) => void;
}) {
  const activeFollowUps = leads
    .filter((lead) => ["Due today", "Overdue"].includes(followUpState(lead)))
    .sort((a, b) => a.nextFollowUpDate.localeCompare(b.nextFollowUpDate))
    .slice(0, 6);

  return (
    <div className="dashboard-grid">
      <section className="metric-grid">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article className={metric.urgent ? "metric metric-urgent" : "metric"} key={metric.label}>
              <div>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
              <Icon size={20} />
            </article>
          );
        })}
      </section>

      <section className="panel wide">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Priority</p>
            <h2>Follow-ups to handle</h2>
          </div>
        </div>
        <div className="followup-list">
          {activeFollowUps.length === 0 ? (
            <p className="empty-state">No due or overdue follow-ups.</p>
          ) : (
            activeFollowUps.map((lead) => (
              <button className="followup-row" key={lead.id} onClick={() => onSelect(lead.id)}>
                <span>
                  <strong>{lead.businessName}</strong>
                  <small>{lead.contactName || "No contact"} - {lead.salesStage}</small>
                </span>
                <span className={followUpState(lead) === "Overdue" ? "pill danger" : "pill"}>
                  {followUpState(lead)}
                </span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Pipeline</p>
            <h2>Stage mix</h2>
          </div>
        </div>
        <div className="stage-bars">
          {salesStages.map((stage) => {
            const count = leads.filter((lead) => lead.salesStage === stage).length;
            const width = leads.length ? Math.max((count / leads.length) * 100, count ? 8 : 0) : 0;
            return (
              <div className="stage-bar" key={stage}>
                <span>{stage}</span>
                <div>
                  <i style={{ width: `${width}%` }} />
                </div>
                <b>{count}</b>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function RecoveryPanel({
  currentLeadCount,
  exportBackup,
  importBackupFile,
  refreshStorageKeyInfo,
  restoreLeadsFromStorageKey,
  storageKeyInfo
}: {
  currentLeadCount: number;
  exportBackup: () => void;
  importBackupFile: (file: File) => void;
  refreshStorageKeyInfo: () => void;
  restoreLeadsFromStorageKey: (key: string) => void;
  storageKeyInfo: LocalStorageKeyInfo[];
}) {
  const latestBackup = storageKeyInfo.find((item) => item.key === "local-business-crm-leads-backup-latest");
  const backupLeadCount = latestBackup?.leadCount ?? 0;

  return (
    <section className="panel recovery-panel">
      <details>
        <summary className="recovery-summary">
          <span>
            <strong>Developer Recovery</strong>
            <small>Backup, import, export, and restore tools.</small>
          </span>
        </summary>

        <div className="recovery-body">
          <div className="recovery-header">
            <div>
              <p className="eyebrow">Developer Recovery</p>
              <h2>Backup and restore protection</h2>
            </div>
            <div className="recovery-actions">
              <button className="secondary-button" onClick={exportBackup}>
                <Clipboard size={16} /> Export Backup
              </button>
              <label className="secondary-button import-button">
                <Plus size={16} /> Import Backup
                <input
                  accept="application/json"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) importBackupFile(file);
                    event.target.value = "";
                  }}
                  type="file"
                />
              </label>
              <button className="secondary-button" onClick={refreshStorageKeyInfo}>
                <Search size={16} /> Refresh
              </button>
            </div>
          </div>

          <div className="recovery-stats">
            <span>Current leads: <strong>{currentLeadCount}</strong></span>
            <span>Latest backup leads: <strong>{backupLeadCount}</strong></span>
          </div>

          <details className="recovery-details">
            <summary>Show localStorage lead and CRM keys</summary>
            <div className="storage-key-list">
              {storageKeyInfo.length === 0 ? (
                <p className="empty-state">No localStorage keys containing lead or crm were found.</p>
              ) : (
                storageKeyInfo.map((item) => (
                  <div className="storage-key-row" key={item.key}>
                    <span>{item.key}</span>
                    <small>{item.leadCount} leads</small>
                    {item.leadCount > 0 && item.key !== "local-business-crm-leads" && (
                      <button className="secondary-button" onClick={() => restoreLeadsFromStorageKey(item.key)}>
                        Restore
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </details>
        </div>
      </details>
    </section>
  );
}

function LeadsView({
  addSelectedImportedLeads,
  auditingId,
  businessTypeOptions,
  copiedKey,
  copySuggestedMessage,
  deleteLead,
  filters,
  generateLeadInsight,
  generateRecentImportedInsights,
  importRows,
  importText,
  leads,
  messageTemplates,
  parseImportPreview,
  recentImportedLeadIds,
  setAllImportRows,
  selectedLead,
  setFilters,
  setImportRowSelected,
  setImportText,
  setSelectedLeadId,
  toggleImportRow,
  updateLead,
  addNoteActivity,
  copyTemplate
}: {
  addSelectedImportedLeads: () => void;
  auditingId: string;
  businessTypeOptions: string[];
  copiedKey: string;
  copySuggestedMessage: (message: string, label: string) => void;
  deleteLead: (id: string) => void;
  filters: LeadFilters;
  generateLeadInsight: (lead: Lead) => void;
  generateRecentImportedInsights: () => void;
  importRows: ImportedLeadRow[];
  importText: string;
  leads: Lead[];
  messageTemplates: MessageTemplate[];
  parseImportPreview: () => void;
  recentImportedLeadIds: string[];
  setAllImportRows: (selected: boolean) => void;
  selectedLead?: Lead;
  setFilters: (filters: LeadFilters) => void;
  setImportRowSelected: (id: string, selected: boolean) => void;
  setImportText: (value: string) => void;
  setSelectedLeadId: (id: string) => void;
  toggleImportRow: (id: string) => void;
  updateLead: (id: string, patch: Partial<Lead>) => void;
  addNoteActivity: (lead: Lead) => void;
  copyTemplate: (lead: Lead, templateId: string) => void;
}) {
  return (
    <section className="leads-page">
      <ImportLeadsPanel
        addSelectedImportedLeads={addSelectedImportedLeads}
        generateRecentImportedInsights={generateRecentImportedInsights}
        importRows={importRows}
        importText={importText}
        parseImportPreview={parseImportPreview}
        recentImportedLeadIds={recentImportedLeadIds}
        setAllImportRows={setAllImportRows}
        setImportRowSelected={setImportRowSelected}
        setImportText={setImportText}
        toggleImportRow={toggleImportRow}
      />

      <div className="lead-layout">
        <section className="panel lead-table-panel">
          <Filters businessTypeOptions={businessTypeOptions} filters={filters} setFilters={setFilters} />
          <div className="table-wrap">
            <table className="lead-table">
              <colgroup>
                <col className="lead-col-business" />
                <col className="lead-col-type" />
                <col className="lead-col-source" />
                <col className="lead-col-website" />
                <col className="lead-col-stage" />
                <col className="lead-col-followup" />
              </colgroup>
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Type</th>
                  <th>Source</th>
                  <th>Website</th>
                  <th>Stage</th>
                  <th>Follow-up</th>
                </tr>
              </thead>
              <tbody>
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <p className="empty-state">No leads match these filters.</p>
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => (
                    <tr
                      className={selectedLead?.id === lead.id ? "selected-row" : ""}
                      key={lead.id}
                      onClick={() => setSelectedLeadId(lead.id)}
                    >
                      <td>
                        <strong>{lead.businessName}</strong>
                        <small>{lead.contactName || "No contact name"}</small>
                      </td>
                      <td>{lead.businessType || "Not set"}</td>
                      <td>{lead.source}</td>
                      <td>
                        <span className={websiteClass[lead.websiteStatus]}>{lead.websiteStatus}</span>
                      </td>
                      <td>
                        <span className={stageClass[lead.salesStage]}>{lead.salesStage}</span>
                      </td>
                      <td>
                        <span className={followUpState(lead) === "Overdue" ? "pill danger" : "pill"}>
                          {formatDate(lead.nextFollowUpDate)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {selectedLead && (
          <LeadDetail
            copiedKey={copiedKey}
            key={selectedLead.id}
            lead={selectedLead}
            updateLead={updateLead}
            addNoteActivity={addNoteActivity}
            copyTemplate={copyTemplate}
            deleteLead={deleteLead}
            messageTemplates={messageTemplates}
            generateLeadInsight={generateLeadInsight}
            isAuditing={auditingId === selectedLead.id}
            copySuggestedMessage={copySuggestedMessage}
          />
        )}
      </div>
    </section>
  );
}

function ImportLeadsPanel({
  addSelectedImportedLeads,
  generateRecentImportedInsights,
  importRows,
  importText,
  parseImportPreview,
  recentImportedLeadIds,
  setAllImportRows,
  setImportRowSelected,
  setImportText,
  toggleImportRow
}: {
  addSelectedImportedLeads: () => void;
  generateRecentImportedInsights: () => void;
  importRows: ImportedLeadRow[];
  importText: string;
  parseImportPreview: () => void;
  recentImportedLeadIds: string[];
  setAllImportRows: (selected: boolean) => void;
  setImportRowSelected: (id: string, selected: boolean) => void;
  setImportText: (value: string) => void;
  toggleImportRow: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="panel import-leads-section">
      <button className="import-panel-toggle" onClick={() => setExpanded((current) => !current)}>
        <span>
          <span className="eyebrow">Import Leads</span>
          <strong>Paste bulk lead research</strong>
        </span>
        <span>{expanded ? "Hide" : "Import Leads"}</span>
      </button>

      {expanded && (
        <div className="import-panel-body">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Bulk import</p>
              <h2>Add researched leads</h2>
            </div>
            {recentImportedLeadIds.length > 0 && (
              <button className="secondary-button" onClick={generateRecentImportedInsights}>
                <Sparkles size={16} /> Run AI on imported leads
              </button>
            )}
          </div>

          <label className="field">
            <span>Paste rows</span>
            <textarea
              className="import-textarea"
              onChange={(event) => setImportText(event.target.value)}
              placeholder={"Business Name | Website/Facebook | Phone | Notes\nBusiness Name, Website/Facebook, Phone, Notes"}
              rows={6}
              value={importText}
            />
          </label>

          <div className="import-actions">
            <button className="primary-button" disabled={!importText.trim()} onClick={parseImportPreview}>
              Preview Import
            </button>
            <button className="secondary-button" disabled={importRows.length === 0} onClick={() => setAllImportRows(true)}>
              Select All
            </button>
            <button className="secondary-button" disabled={importRows.length === 0} onClick={() => setAllImportRows(false)}>
              Select None
            </button>
            <button className="primary-button" disabled={!importRows.some((row) => row.selected)} onClick={addSelectedImportedLeads}>
              <Plus size={16} /> Add Selected Leads
            </button>
          </div>

          {importRows.length > 0 && (
            <div className="import-preview-wrap">
              <table className="import-preview-table">
                <thead>
                  <tr>
                    <th>Add</th>
                    <th>Business</th>
                    <th>Website or Facebook</th>
                    <th>Phone</th>
                    <th>Notes</th>
                    <th>Duplicate check</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((row) => (
                    <tr className={row.duplicateStatus !== "none" ? `possible-duplicate ${row.duplicateStatus}` : ""} key={row.id}>
                      <td>
                        <input checked={row.selected} onChange={() => toggleImportRow(row.id)} type="checkbox" />
                      </td>
                      <td>{row.businessName}</td>
                      <td>{row.link || "No link"}</td>
                      <td>{row.phone || "No phone"}</td>
                      <td>{row.notes || "No notes"}</td>
                      <td>
                        {row.duplicateStatus !== "none" ? (
                          <ImportDuplicateCell row={row} setImportRowSelected={setImportRowSelected} />
                        ) : (
                          <span className="status status-green">No match</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Filters({
  businessTypeOptions,
  filters,
  setFilters
}: {
  businessTypeOptions: string[];
  filters: LeadFilters;
  setFilters: (filters: LeadFilters) => void;
}) {
  return (
    <div className="filters">
      <label className="filter-field search-filter">
        <span>Business</span>
        <div className="search-box">
          <Search size={18} />
          <input
            value={filters.query}
            onChange={(event) => setFilters({ ...filters, query: event.target.value })}
            placeholder="Search"
          />
        </div>
      </label>

      <label className="filter-field">
        <span>Type</span>
        <select
          aria-label="Type filter"
          value={filters.businessType}
          onChange={(event) => setFilters({ ...filters, businessType: event.target.value })}
        >
          <option>All</option>
          {businessTypeOptions.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      </label>

      <label className="filter-field">
        <span>Source</span>
        <select value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value as LeadFilters["source"] })}>
          <option>All</option>
          {sources.map((source) => (
            <option key={source}>{source}</option>
          ))}
        </select>
      </label>

      <label className="filter-field">
        <span>Website</span>
        <select
          value={filters.websiteStatus}
          onChange={(event) => setFilters({ ...filters, websiteStatus: event.target.value as LeadFilters["websiteStatus"] })}
        >
          <option>All</option>
          {websiteStatuses.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
      </label>

      <label className="filter-field">
        <span>Stage</span>
        <select value={filters.stage} onChange={(event) => setFilters({ ...filters, stage: event.target.value as LeadFilters["stage"] })}>
          <option>All</option>
          {salesStages.map((stage) => (
            <option key={stage}>{stage}</option>
          ))}
        </select>
      </label>

      <label className="filter-field">
        <span>Follow-up</span>
        <select
          value={filters.followUp}
          onChange={(event) => setFilters({ ...filters, followUp: event.target.value as LeadFilters["followUp"] })}
        >
          <option>All</option>
          <option>Due today</option>
          <option>Overdue</option>
          <option>Upcoming</option>
          <option>No date</option>
        </select>
      </label>
    </div>
  );
}

function LeadDetail({
  copySuggestedMessage,
  copiedKey,
  deleteLead,
  generateLeadInsight,
  isAuditing,
  lead,
  messageTemplates,
  updateLead,
  addNoteActivity,
  copyTemplate
}: {
  copySuggestedMessage: (message: string, label: string) => void;
  copiedKey: string;
  deleteLead: (id: string) => void;
  generateLeadInsight: (lead: Lead) => void;
  isAuditing: boolean;
  lead: Lead;
  messageTemplates: MessageTemplate[];
  updateLead: (id: string, patch: Partial<Lead>) => void;
  addNoteActivity: (lead: Lead) => void;
  copyTemplate: (lead: Lead, templateId: string) => void;
}) {
  const phone = normalizePhone(lead.phone);
  const websiteUrl = normalizeUrl(lead.websiteUrl);
  const facebookUrl = normalizeUrl(lead.facebookUrl);
  const getTemplate = (key: MessageTemplateKey) => messageTemplates.find((template) => template.key === key);
  const savedLeadTemplates = messageTemplates.filter(
    (template) =>
      ![
        "outreachWeakWebsite",
        "outreachNoWebsite",
        "outreachBrokenWebsite",
        "followUpGeneral",
        "followUpNoWebsite",
        "followUpBrokenWebsite"
      ].includes(template.key ?? "")
  );
  const outreachTemplates = [
    getTemplate("outreachWeakWebsite"),
    getTemplate("outreachNoWebsite"),
    getTemplate("outreachBrokenWebsite")
  ].filter((template): template is MessageTemplate => Boolean(template));
  const followUpTemplates = [
    getTemplate("followUpGeneral"),
    getTemplate("followUpNoWebsite"),
    getTemplate("followUpBrokenWebsite")
  ].filter((template): template is MessageTemplate => Boolean(template));
  const hasAiInsight = Boolean(lead.problemType || lead.leadInsight || lead.firstMessage || lead.followUpMessage);

  return (
    <aside className="panel detail-panel">
      <div className="detail-header">
        <div>
          <p className="eyebrow">Lead workspace</p>
          <h2>{lead.businessName}</h2>
        </div>
        <span className={stageClass[lead.salesStage]}>{lead.salesStage}</span>
      </div>

      <div className="lead-summary-grid">
        <span><b>Contact</b>{lead.contactName || "No contact"}</span>
        <span><b>Type</b>{lead.businessType || "Not set"}</span>
        <span><b>Source</b>{lead.source}</span>
        <span><b>Website</b>{lead.websiteStatus}</span>
        <span><b>Phone</b>{lead.phone || "No phone"}</span>
        <span><b>Email</b>{lead.email || "No email"}</span>
      </div>

      <div className="quick-actions">
        <button onClick={() => generateLeadInsight(lead)} disabled={isAuditing}>
          <Sparkles size={16} /> {isAuditing ? "Generating" : "Generate Lead Insight"}
        </button>
        <a className={!websiteUrl ? "disabled" : ""} href={websiteUrl || undefined} rel="noreferrer" target="_blank">
          <ExternalLink size={16} /> Website
        </a>
        <a className={!facebookUrl ? "disabled" : ""} href={facebookUrl || undefined} rel="noreferrer" target="_blank">
          <Facebook size={16} /> Facebook
        </a>
        <a
          className={!phone ? "disabled" : ""}
          href={phone ? `https://wa.me/${phone.replace(/^\+/, "")}` : undefined}
          rel="noreferrer"
          target="_blank"
        >
          <MessageCircle size={16} /> WhatsApp
        </a>
        <a className={!phone ? "disabled" : ""} href={phone ? `tel:${phone}` : undefined}>
          <Phone size={16} /> Call
        </a>
        <a className={!lead.email ? "disabled" : ""} href={lead.email ? `mailto:${lead.email}` : undefined}>
          <Mail size={16} /> Email
        </a>
        <button className="danger-button" onClick={() => deleteLead(lead.id)}>
          <Trash2 size={16} /> Delete Lead
        </button>
      </div>

      <div className="detail-sections">
        <LeadDetailSection title="AI Insight" defaultOpen={hasAiInsight}>
          <LeadInsightPanel lead={lead} onCopy={copySuggestedMessage} />
        </LeadDetailSection>

        <LeadDetailSection title="Outreach">
          <TemplatePreviewList copiedKey={copiedKey} lead={lead} templates={outreachTemplates} onCopy={copyTemplate} />
        </LeadDetailSection>

        <LeadDetailSection title="Follow-up">
          <TemplatePreviewList copiedKey={copiedKey} lead={lead} templates={followUpTemplates} onCopy={copyTemplate} />
        </LeadDetailSection>

        {savedLeadTemplates.length > 0 && (
          <LeadDetailSection title="Saved Templates">
            <TemplatePreviewList copiedKey={copiedKey} lead={lead} templates={savedLeadTemplates} onCopy={copyTemplate} />
          </LeadDetailSection>
        )}

        <LeadDetailSection title="Notes">
          <label className="field full">
            <span>Notes</span>
            <textarea value={lead.notes} onChange={(event) => updateLead(lead.id, { notes: event.target.value })} rows={5} />
          </label>
          <button className="secondary-button" onClick={() => addNoteActivity(lead)}>
            <Plus size={16} /> Save note to timeline
          </button>

          <div className="timeline">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Activity</p>
                <h3>Timeline</h3>
              </div>
            </div>
            {lead.activities.map((activity) => (
              <div className="timeline-item" key={activity.id}>
                <i />
                <div>
                  <strong>{activity.title}</strong>
                  <span>{formatDateTime(activity.createdAt)}</span>
                  {activity.description && <p>{activity.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </LeadDetailSection>

        <LeadDetailSection title="Lead Details" defaultOpen={!hasAiInsight}>
          <div className="form-grid">
            <TextField label="Business name" value={lead.businessName} onChange={(value) => updateLead(lead.id, { businessName: value })} />
            <TextField label="Contact name" value={lead.contactName} onChange={(value) => updateLead(lead.id, { contactName: value })} />
            <TextField label="Business type" value={lead.businessType} onChange={(value) => updateLead(lead.id, { businessType: value })} />
            <SelectField
              label="Source"
              value={lead.source}
              options={sources}
              onChange={(value) => updateLead(lead.id, { source: value as LeadSource })}
            />
            <TextField label="Current website URL" value={lead.websiteUrl} onChange={(value) => updateLead(lead.id, { websiteUrl: value })} />
            <TextField label="Facebook/page URL" value={lead.facebookUrl} onChange={(value) => updateLead(lead.id, { facebookUrl: value })} />
            <TextField label="Phone number" value={lead.phone} onChange={(value) => updateLead(lead.id, { phone: value })} />
            <TextField label="Email" value={lead.email} onChange={(value) => updateLead(lead.id, { email: value })} />
            <SelectField
              label="Website status"
              value={lead.websiteStatus}
              options={websiteStatuses}
              onChange={(value) => updateLead(lead.id, { websiteStatus: value as WebsiteStatus })}
            />
            <SelectField
              label="Sales stage"
              value={lead.salesStage}
              options={salesStages}
              onChange={(value) => updateLead(lead.id, { salesStage: value as Lead["salesStage"] })}
            />
            <TextField
              label="Last contacted"
              type="date"
              value={lead.lastContactedDate}
              onChange={(value) => updateLead(lead.id, { lastContactedDate: value })}
            />
            <TextField
              label="Next follow-up"
              type="date"
              value={lead.nextFollowUpDate}
              onChange={(value) => updateLead(lead.id, { nextFollowUpDate: value })}
            />
          </div>
        </LeadDetailSection>
      </div>
    </aside>
  );
}

function LeadInsightPanel({
  lead,
  onCopy
}: {
  lead: Lead;
  onCopy: (message: string, label: string) => void;
}) {
  if (!lead.problemType && !lead.leadInsight && !lead.firstMessage) {
    return (
      <section className="lead-ai-panel empty">
        <div>
          <p className="eyebrow">AI insight</p>
          <h3>No lead insight yet</h3>
        </div>
        <p>Generate an insight to classify the opportunity and draft outreach.</p>
      </section>
    );
  }

  return (
    <section className="lead-ai-panel">
      <div className="lead-ai-summary">
        <div>
          <p className="eyebrow">AI insight</p>
          <h3>{lead.problemType ?? "Not classified"}</h3>
        </div>
        {lead.leadScore && <strong>{lead.leadScore}/10</strong>}
      </div>
      {lead.leadInsight && <p>{lead.leadInsight}</p>}
      <div className="suggested-messages">
        {lead.firstMessage && (
          <div>
            <span>First message</span>
            <p>{lead.firstMessage}</p>
            <button className="secondary-button" onClick={() => onCopy(lead.firstMessage!, "First message")}>
              <Clipboard size={16} /> Copy
            </button>
          </div>
        )}
        {lead.followUpMessage && (
          <div>
            <span>Follow-up</span>
            <p>{lead.followUpMessage}</p>
            <button className="secondary-button" onClick={() => onCopy(lead.followUpMessage!, "Follow-up")}>
              <Clipboard size={16} /> Copy
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function LeadDetailSection({
  children,
  defaultOpen = false,
  title
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  title: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <details className="detail-section" onToggle={(event) => setIsOpen(event.currentTarget.open)} open={isOpen}>
      <summary>{title}</summary>
      <div>{children}</div>
    </details>
  );
}

function TemplatePreviewList({
  copiedKey,
  lead,
  onCopy,
  templates
}: {
  copiedKey: string;
  lead: Lead;
  onCopy: (lead: Lead, templateId: string) => void;
  templates: MessageTemplate[];
}) {
  if (templates.length === 0) return <p className="muted-copy">No templates saved for this section.</p>;

  return (
    <div className="template-preview-list">
      {templates.map((template) => {
        const copied = copiedKey === `${lead.id}-${template.id}`;
        return (
          <article className="template-preview-card" key={template.id}>
            <div>
              <span>{template.category}</span>
              <strong>{template.name}</strong>
            </div>
            <p>{renderTemplate(template.body, lead)}</p>
            <button className={copied ? "secondary-button copied" : "secondary-button"} onClick={() => onCopy(lead, template.id)}>
              {copied ? <Check size={16} /> : <Clipboard size={16} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </article>
        );
      })}
    </div>
  );
}

function TemplateCopyButton({
  children,
  copiedKey,
  lead,
  template,
  onCopy
}: {
  children: string;
  copiedKey: string;
  lead: Lead;
  template: MessageTemplate;
  onCopy: (lead: Lead, templateId: string) => void;
}) {
  const copied = copiedKey === `${lead.id}-${template.id}`;

  return (
    <button className={copied ? "copied" : ""} onClick={() => onCopy(lead, template.id)}>
      {copied ? <Check size={16} /> : <Clipboard size={16} />}
      {children}
    </button>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField<T extends readonly string[]>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: T;
  onChange: (value: T[number]) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as T[number])}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function DiscoveryView({
  addPlacesCandidateToCrm,
  auditingId,
  excludeChains,
  excludeInactive,
  generatePlacesCandidateInsight,
  includeNoWebsite,
  includeWeakWebsite,
  isSearchingPlaces,
  minimumRating,
  minimumReviewCount,
  passedPlaceIds,
  passPlacesCandidate,
  placesArea,
  placesBatchLabel,
  placesDebug,
  placesLocation,
  placesMessage,
  placesResults,
  placesSearchTerm,
  prioritizeNoWebsite,
  searchRealLeads,
  setExcludeChains,
  setExcludeInactive,
  setIncludeNoWebsite,
  setIncludeWeakWebsite,
  setMinimumRating,
  setMinimumReviewCount,
  setPlacesArea,
  setPlacesLocation,
  setPlacesSearchTerm,
  setPrioritizeNoWebsite,
  setShowPassedPlaces,
  resetRealLeadSearchState,
  showPassedPlaces,
  undoPassPlacesCandidate,
  useMinimumRating,
  useMinimumReviewCount,
  setUseMinimumRating,
  setUseMinimumReviewCount,
  findSimilarPlaces
}: {
  addPlacesCandidateToCrm: (candidate: PlacesLeadCandidate) => void;
  auditingId: string;
  excludeChains: boolean;
  excludeInactive: boolean;
  generatePlacesCandidateInsight: (candidate: PlacesLeadCandidate) => void;
  includeNoWebsite: boolean;
  includeWeakWebsite: boolean;
  isSearchingPlaces: boolean;
  minimumRating: string;
  minimumReviewCount: string;
  passedPlaceIds: string[];
  passPlacesCandidate: (candidate: PlacesLeadCandidate) => void;
  placesArea: string;
  placesBatchLabel: string;
  placesDebug: PlacesSearchDebug | null;
  placesLocation: string;
  placesMessage: string;
  placesResults: PlacesLeadCandidate[];
  placesSearchTerm: string;
  prioritizeNoWebsite: boolean;
  searchRealLeads: () => void;
  setExcludeChains: (value: boolean) => void;
  setExcludeInactive: (value: boolean) => void;
  setIncludeNoWebsite: (value: boolean) => void;
  setIncludeWeakWebsite: (value: boolean) => void;
  setMinimumRating: (value: string) => void;
  setMinimumReviewCount: (value: string) => void;
  setPlacesArea: (value: string) => void;
  setPlacesLocation: (value: string) => void;
  setPlacesSearchTerm: (value: string) => void;
  setPrioritizeNoWebsite: (value: boolean) => void;
  setShowPassedPlaces: (value: boolean) => void;
  resetRealLeadSearchState: () => void;
  showPassedPlaces: boolean;
  undoPassPlacesCandidate: (candidateId: string) => void;
  useMinimumRating: boolean;
  useMinimumReviewCount: boolean;
  setUseMinimumRating: (value: boolean) => void;
  setUseMinimumReviewCount: (value: boolean) => void;
  findSimilarPlaces: (candidate: PlacesLeadCandidate) => void;
}) {
  const visiblePlacesResults = showPassedPlaces
    ? placesResults
    : placesResults.filter((candidate) => !passedPlaceIds.includes(candidate.id));
  const passedResults = placesResults.filter((candidate) => passedPlaceIds.includes(candidate.id));

  return (
    <section className="discovery-page">
      <div className="panel discovery-note">
        Search real local businesses, review the best fits, and add the right ones to your CRM.
      </div>

      <section className="panel real-search-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Real Lead Search</p>
            <h2>Search Google Places</h2>
          </div>
          <button className="secondary-button" onClick={resetRealLeadSearchState}>
            Reset Search State
          </button>
        </div>

        <div className="real-search-form">
          <TextField label="Search term" value={placesSearchTerm} onChange={setPlacesSearchTerm} />
          <TextField label="Location" value={placesLocation} onChange={setPlacesLocation} />
          <TextField label="Radius or area" value={placesArea} onChange={setPlacesArea} />
          <button className="primary-button" disabled={!placesSearchTerm.trim() || isSearchingPlaces} onClick={searchRealLeads}>
            <Search size={18} /> {isSearchingPlaces ? "Searching" : "Search"}
          </button>
        </div>

        <div className="real-search-filters">
          <label className="checkbox-field">
            <input checked={includeNoWebsite} onChange={(event) => setIncludeNoWebsite(event.target.checked)} type="checkbox" />
            No website
          </label>
          <label className="checkbox-field">
            <input checked={includeWeakWebsite} onChange={(event) => setIncludeWeakWebsite(event.target.checked)} type="checkbox" />
            Has website but likely weak
          </label>
          <label className="checkbox-field">
            <input
              checked={prioritizeNoWebsite}
              onChange={(event) => setPrioritizeNoWebsite(event.target.checked)}
              type="checkbox"
            />
            Prioritize businesses with no website
          </label>
          <label className="checkbox-field with-input">
            <input checked={useMinimumRating} onChange={(event) => setUseMinimumRating(event.target.checked)} type="checkbox" />
            Minimum rating
            <input min="0" max="5" step="0.1" value={minimumRating} onChange={(event) => setMinimumRating(event.target.value)} type="number" />
          </label>
          <label className="checkbox-field with-input">
            <input checked={useMinimumReviewCount} onChange={(event) => setUseMinimumReviewCount(event.target.checked)} type="checkbox" />
            Minimum review count
            <input min="0" value={minimumReviewCount} onChange={(event) => setMinimumReviewCount(event.target.value)} type="number" />
          </label>
          <label className="checkbox-field">
            <input checked={excludeInactive} onChange={(event) => setExcludeInactive(event.target.checked)} type="checkbox" />
            Exclude inactive-looking businesses
          </label>
          <label className="checkbox-field">
            <input checked={excludeChains} onChange={(event) => setExcludeChains(event.target.checked)} type="checkbox" />
            Exclude chains and franchises
          </label>
        </div>

        {placesMessage && <p className="setup-message">{placesMessage}</p>}

        {placesDebug && (
          <div className="places-debug">
            <span>Google returned {placesDebug.googleReturned} places</span>
            <span>Removed as exact CRM duplicates: {placesDebug.removedExactCrmDuplicates}</span>
            <span>Hidden as passed: {showPassedPlaces ? 0 : passedResults.length}</span>
            <span>Showing: {visiblePlacesResults.length}</span>
          </div>
        )}

        {placesResults.length > 0 && (
          <div className="places-result-header">
            <div>
              <p className="eyebrow">Results</p>
              <h3>{placesBatchLabel || "Current search results"}</h3>
            </div>
            {passedResults.length > 0 && (
              <button className="secondary-button" onClick={() => setShowPassedPlaces(!showPassedPlaces)}>
                {showPassedPlaces ? "Hide passed" : `Show passed (${passedResults.length})`}
              </button>
            )}
          </div>
        )}

        {visiblePlacesResults.length > 0 && (
          <div className="places-grid">
            {visiblePlacesResults.map((candidate) => {
              const isPassed = passedPlaceIds.includes(candidate.id);
              return (
                <article className={isPassed ? "places-card passed" : "places-card"} key={candidate.id}>
                  <div className="candidate-header">
                    <div>
                      <h3>{candidate.name}</h3>
                      <span className="muted-inline">{candidate.category}</span>
                    </div>
                    <div className="places-score">
                      <span className={`lead-label ${(candidate.leadLabel || "Maybe").toLowerCase().replaceAll(" ", "-")}`}>{candidate.leadLabel || "Maybe"}</span>
                      <strong>{candidate.opportunityScore}/10</strong>
                    </div>
                  </div>

                  <div className="places-meta">
                    {candidate.possibleDuplicate && <span className="possible-duplicate-label">Possible duplicate</span>}
                    <span>{candidate.rating ? `${candidate.rating} stars` : "No rating"}</span>
                    <span>{candidate.reviewCount} reviews</span>
                    <span>{candidate.websiteStatus}</span>
                    <span>{candidate.activitySignal}</span>
                    <span>{candidate.businessStatus}</span>
                    {candidate.openNow && <span>Open now</span>}
                  </div>

                  <p className="muted-copy">{candidate.opportunityReason}</p>
                  {candidate.possibleDuplicate && candidate.duplicateReason && (
                    <p className="muted-copy">Possible duplicate: {candidate.duplicateReason}</p>
                  )}
                  {candidate.websiteWeakReasons.length > 0 && (
                    <ul className="weak-reasons">
                      {candidate.websiteWeakReasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  )}
                  <p className="muted-copy">{candidate.address || "No address returned"}</p>
                  <p className="muted-copy">{candidate.phone || "No phone returned"}</p>

                  <div className="quick-actions">
                    {candidate.website && (
                      <a href={normalizeUrl(candidate.website)} rel="noreferrer" target="_blank">
                        <ExternalLink size={16} /> Website
                      </a>
                    )}
                    {candidate.googleListingLink && (
                      <a href={candidate.googleListingLink} rel="noreferrer" target="_blank">
                        <ExternalLink size={16} /> Google listing
                      </a>
                    )}
                  </div>

                  {candidate.audit && (
                    <div className="candidate-audit">
                      <span className="template-category">{candidate.audit.problem_type}</span>
                      <p>{candidate.audit.insight}</p>
                    </div>
                  )}

                  <div className="candidate-actions">
                    <button className="secondary-button" disabled={auditingId === candidate.id} onClick={() => generatePlacesCandidateInsight(candidate)}>
                      <Sparkles size={16} /> {auditingId === candidate.id ? "Generating" : "Generate AI Insight"}
                    </button>
                    <button className="secondary-button" onClick={() => findSimilarPlaces(candidate)}>
                      <Search size={16} /> Find similar
                    </button>
                    {isPassed ? (
                      <button className="secondary-button" onClick={() => undoPassPlacesCandidate(candidate.id)}>
                        Undo pass
                      </button>
                    ) : (
                      <button className="secondary-button" onClick={() => passPlacesCandidate(candidate)}>
                        Pass
                      </button>
                    )}
                    <button className="primary-button" onClick={() => addPlacesCandidateToCrm(candidate)}>
                      <Plus size={16} /> Add to CRM
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {placesResults.length > 0 && visiblePlacesResults.length === 0 && (
          <p className="muted-copy">All visible results are passed. Use Show passed to review them.</p>
        )}
      </section>

    </section>
  );
}

function ImportDuplicateCell({
  row,
  setImportRowSelected
}: {
  row: ImportedLeadRow;
  setImportRowSelected: (id: string, selected: boolean) => void;
}) {
  const primaryMatch = row.duplicateMatches.find((match) => match.type === row.duplicateStatus) ?? row.duplicateMatches[0];
  const isExact = row.duplicateStatus === "exact";

  if (!primaryMatch) return <span className="status status-green">No match</span>;

  const fields = [
    {
      label: "Name",
      existing: primaryMatch.leadName || "No name",
      incoming: row.businessName || "No name",
      different: normalizeDuplicateName(primaryMatch.leadName) !== normalizeDuplicateName(row.businessName)
    },
    {
      label: "Link",
      existing: primaryMatch.leadLink || "No link",
      incoming: row.link || "No link",
      different: normalizeDuplicateUrl(primaryMatch.leadLink) !== normalizeDuplicateUrl(row.link)
    },
    {
      label: "Phone",
      existing: primaryMatch.leadPhone || "No phone",
      incoming: row.phone || "No phone",
      different: normalizeDuplicatePhone(primaryMatch.leadPhone) !== normalizeDuplicatePhone(row.phone)
    }
  ];

  return (
    <div className="duplicate-detail">
      <span className={isExact ? "duplicate-warning exact" : "duplicate-warning"}>
        {isExact ? "Duplicate" : "Possible duplicate"}
      </span>
      <small>
        Matches {primaryMatch.leadName}: {primaryMatch.reason}
      </small>

      {!isExact && (
        <>
          <div className="duplicate-comparison">
            <div className="comparison-heading">Existing lead</div>
            <div className="comparison-heading">Incoming lead</div>
            {fields.map((field) => (
              <div className="comparison-row" key={field.label}>
                <span>{field.label}</span>
                <b className={field.different ? "field-different" : ""}>{field.existing}</b>
                <b className={field.different ? "field-different" : ""}>{field.incoming}</b>
              </div>
            ))}
          </div>
          <div className="duplicate-actions">
            <button className="secondary-button" onClick={() => setImportRowSelected(row.id, false)}>
              Skip
            </button>
            <button className="secondary-button" onClick={() => setImportRowSelected(row.id, true)}>
              Add anyway
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function TemplatesView({
  selectedLead,
  copiedKey,
  copyTemplate,
  deleteTemplate,
  editTemplate,
  templates
}: {
  selectedLead?: Lead;
  copiedKey: string;
  copyTemplate: (lead: Lead, templateId: string) => void;
  deleteTemplate: (id: string) => void;
  editTemplate: (template: MessageTemplate) => void;
  templates: MessageTemplate[];
}) {
  return (
    <section className="templates-page">
      <div className="templates-intro panel">
        <div>
          <p className="eyebrow">Template library</p>
          <h2>Saved outreach messages</h2>
        </div>
        <p>
          Use placeholders like {"{contactName}"}, {"{businessName}"}, {"{websiteUrl}"}, and {"{businessType}"}.
          Copies from this page use the selected lead when one exists.
        </p>
      </div>

      <div className="template-grid">
        {templates.length === 0 ? (
          <article className="panel template-card">
            <p className="empty-state">No templates saved yet. Use New Template to create one.</p>
          </article>
        ) : (
          templates.map((template) => {
            const copied = selectedLead ? copiedKey === `${selectedLead.id}-${template.id}` : false;
            return (
              <article className="panel template-card" key={template.id}>
                <div className="template-card-header">
                  <div>
                    <span className="template-category">{template.category}</span>
                    <h2>{template.name}</h2>
                  </div>
                  <div className="template-card-actions">
                    <button className="icon-button" onClick={() => editTemplate(template)} title={`Edit ${template.name}`}>
                      <Pencil size={17} />
                    </button>
                    <button className="icon-button danger-icon" onClick={() => deleteTemplate(template.id)} title={`Delete ${template.name}`}>
                      <Trash2 size={17} />
                    </button>
                    {selectedLead && (
                      <button className="icon-button" onClick={() => copyTemplate(selectedLead, template.id)} title={`Copy ${template.name}`}>
                        {copied ? <Check size={18} /> : <Clipboard size={18} />}
                      </button>
                    )}
                  </div>
                </div>
                <p>{selectedLead ? renderTemplate(template, selectedLead) : template.body}</p>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function TemplateModal({
  editingTemplate,
  onClose,
  onSave
}: {
  editingTemplate: MessageTemplate | null;
  onClose: () => void;
  onSave: (form: TemplateFormState) => void;
}) {
  const [form, setForm] = useState<TemplateFormState>({
    name: editingTemplate?.name ?? "",
    category: editingTemplate?.category ?? "First Outreach",
    body: editingTemplate?.body ?? ""
  });

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal-card"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(form);
        }}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">Template</p>
            <h2>{editingTemplate ? "Edit template" : "New template"}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="form-grid one-column">
          <TextField label="Template name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
          <SelectField
            label="Template category"
            value={form.category}
            options={templateCategories}
            onChange={(value) => setForm({ ...form, category: value as TemplateCategory })}
          />
          <label className="field">
            <span>Message body</span>
            <textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} rows={9} />
          </label>
        </div>

        <p className="placeholder-help">Supported placeholders: {"{contactName}"}, {"{businessName}"}, {"{websiteUrl}"}, {"{businessType}"}.</p>

        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="primary-button" disabled={!form.name.trim() || !form.body.trim()} type="submit">
            {editingTemplate ? "Save Template" : "Create Template"}
          </button>
        </div>
      </form>
    </div>
  );
}
