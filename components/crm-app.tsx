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
  Trash2,
  Users,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  LeadFilters,
  LeadSource,
  MessageTemplate,
  MessageTemplateKey,
  TemplateCategory,
  WebsiteStatus
} from "@/lib/types";

type View = "dashboard" | "leads" | "templates";
type TemplateFormState = {
  name: string;
  category: TemplateCategory;
  body: string;
};

const initialFilters: LeadFilters = {
  query: "",
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

function followUpState(lead: Lead) {
  if (!lead.nextFollowUpDate) return "No date";
  const today = todayDate();
  if (lead.nextFollowUpDate < today) return "Overdue";
  if (lead.nextFollowUpDate === today) return "Due today";
  return "Upcoming";
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

  useEffect(() => {
    const loaded = loadLeads();
    setLeads(loaded);
    setMessageTemplates(loadTemplates());
    setSelectedLeadId(loaded[0]?.id ?? "");
    setHasLoaded(true);
  }, []);

  useEffect(() => {
    if (hasLoaded) saveLeads(leads);
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
          <button className={view === "templates" ? "active" : ""} onClick={() => setView("templates")}>
            <Clipboard size={18} /> Templates
          </button>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Personal CRM</p>
            <h1>{view === "dashboard" ? "Sales dashboard" : view === "leads" ? "Lead pipeline" : "Message templates"}</h1>
          </div>
          <button className="primary-button" onClick={view === "templates" ? openNewTemplateModal : addLead}>
            <Plus size={18} /> {view === "templates" ? "New Template" : "New lead"}
          </button>
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

function LeadsView({
  copiedKey,
  deleteLead,
  filters,
  leads,
  messageTemplates,
  selectedLead,
  setFilters,
  setSelectedLeadId,
  updateLead,
  addNoteActivity,
  copyTemplate
}: {
  copiedKey: string;
  deleteLead: (id: string) => void;
  filters: LeadFilters;
  leads: Lead[];
  messageTemplates: MessageTemplate[];
  selectedLead?: Lead;
  setFilters: (filters: LeadFilters) => void;
  setSelectedLeadId: (id: string) => void;
  updateLead: (id: string, patch: Partial<Lead>) => void;
  addNoteActivity: (lead: Lead) => void;
  copyTemplate: (lead: Lead, templateId: string) => void;
}) {
  return (
    <div className="lead-layout">
      <section className="panel lead-table-panel">
        <Filters filters={filters} setFilters={setFilters} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th>Type</th>
                <th>Source</th>
                <th>Website</th>
                <th>Stage</th>
                <th>Follow-up</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <p className="empty-state">No leads match these filters.</p>
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id} onClick={() => setSelectedLeadId(lead.id)}>
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
                    <td>
                      <button
                        className="row-delete-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteLead(lead.id);
                        }}
                        title="Delete lead"
                      >
                        <Trash2 size={16} />
                        Delete
                      </button>
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
          lead={selectedLead}
          updateLead={updateLead}
          addNoteActivity={addNoteActivity}
          copyTemplate={copyTemplate}
          deleteLead={deleteLead}
          messageTemplates={messageTemplates}
        />
      )}
    </div>
  );
}

function Filters({
  filters,
  setFilters
}: {
  filters: LeadFilters;
  setFilters: (filters: LeadFilters) => void;
}) {
  return (
    <div className="filters">
      <label className="search-box">
        <Search size={18} />
        <input
          value={filters.query}
          onChange={(event) => setFilters({ ...filters, query: event.target.value })}
          placeholder="Search business, contact, or type"
        />
      </label>

      <select value={filters.stage} onChange={(event) => setFilters({ ...filters, stage: event.target.value as LeadFilters["stage"] })}>
        <option>All</option>
        {salesStages.map((stage) => (
          <option key={stage}>{stage}</option>
        ))}
      </select>

      <select
        value={filters.websiteStatus}
        onChange={(event) => setFilters({ ...filters, websiteStatus: event.target.value as LeadFilters["websiteStatus"] })}
      >
        <option>All</option>
        {websiteStatuses.map((status) => (
          <option key={status}>{status}</option>
        ))}
      </select>

      <select value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value as LeadFilters["source"] })}>
        <option>All</option>
        {sources.map((source) => (
          <option key={source}>{source}</option>
        ))}
      </select>

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
    </div>
  );
}

function LeadDetail({
  copiedKey,
  deleteLead,
  lead,
  messageTemplates,
  updateLead,
  addNoteActivity,
  copyTemplate
}: {
  copiedKey: string;
  deleteLead: (id: string) => void;
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

  return (
    <aside className="panel detail-panel">
      <div className="detail-header">
        <div>
          <p className="eyebrow">Lead detail</p>
          <h2>{lead.businessName}</h2>
        </div>
        <span className={stageClass[lead.salesStage]}>{lead.salesStage}</span>
      </div>

      <div className="message-actions">
        <div className="message-action-group">
          <span>Outreach</span>
          <div>
            {getTemplate("outreachWeakWebsite") && (
              <TemplateCopyButton copiedKey={copiedKey} lead={lead} template={getTemplate("outreachWeakWebsite")!} onCopy={copyTemplate}>
                Copy outreach: weak website
              </TemplateCopyButton>
            )}
            {getTemplate("outreachNoWebsite") && (
              <TemplateCopyButton copiedKey={copiedKey} lead={lead} template={getTemplate("outreachNoWebsite")!} onCopy={copyTemplate}>
                Copy outreach: no website
              </TemplateCopyButton>
            )}
            {getTemplate("outreachBrokenWebsite") && (
              <TemplateCopyButton copiedKey={copiedKey} lead={lead} template={getTemplate("outreachBrokenWebsite")!} onCopy={copyTemplate}>
                Copy outreach: broken website
              </TemplateCopyButton>
            )}
          </div>
        </div>

        <div className="message-action-group">
          <span>Follow-up</span>
          <div>
            {getTemplate("followUpGeneral") && (
              <TemplateCopyButton copiedKey={copiedKey} lead={lead} template={getTemplate("followUpGeneral")!} onCopy={copyTemplate}>
                Copy follow-up: general
              </TemplateCopyButton>
            )}
            {getTemplate("followUpNoWebsite") && (
              <TemplateCopyButton copiedKey={copiedKey} lead={lead} template={getTemplate("followUpNoWebsite")!} onCopy={copyTemplate}>
                Copy follow-up: no website
              </TemplateCopyButton>
            )}
            {getTemplate("followUpBrokenWebsite") && (
              <TemplateCopyButton copiedKey={copiedKey} lead={lead} template={getTemplate("followUpBrokenWebsite")!} onCopy={copyTemplate}>
                Copy follow-up: broken website
              </TemplateCopyButton>
            )}
          </div>
        </div>

        {savedLeadTemplates.length > 0 && (
          <div className="message-action-group">
            <span>Saved templates</span>
            <div>
              {savedLeadTemplates.map((template) => (
                <TemplateCopyButton copiedKey={copiedKey} key={template.id} lead={lead} template={template} onCopy={copyTemplate}>
                  {template.name}
                </TemplateCopyButton>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="quick-actions">
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
      </div>

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

      <label className="field full">
        <span>Notes</span>
        <textarea value={lead.notes} onChange={(event) => updateLead(lead.id, { notes: event.target.value })} rows={5} />
      </label>
      <button className="secondary-button" onClick={() => addNoteActivity(lead)}>
        <Plus size={16} /> Save note to timeline
      </button>

      <div className="detail-danger-zone">
        <button className="danger-button" onClick={() => deleteLead(lead.id)}>
          <Trash2 size={16} /> Delete Lead
        </button>
      </div>

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
    </aside>
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
