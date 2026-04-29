import type { Lead, MessageTemplate } from "@/lib/types";

const now = "2026-04-29T00:00:00.000Z";

export const defaultTemplates: MessageTemplate[] = [
  {
    id: "outreachWeakWebsite",
    key: "outreachWeakWebsite",
    name: "Outreach: weak website",
    category: "First Outreach",
    body:
      "Hi {contactName}, I came across {businessName} and noticed the website might not be doing as much as it could for you.\n\nI help local businesses build clean, fast websites that make it easier for customers to call, book, or request a quote.\n\nWould you be open to me sending over a simple improvement idea?",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "outreachNoWebsite",
    key: "outreachNoWebsite",
    name: "Outreach: no website",
    category: "First Outreach",
    body:
      "Hi {contactName}, I came across {businessName} and noticed I couldn't find a website for the business.\n\nI help local businesses get simple, clean websites that make it easier for customers to find them, trust them, and request a quote.\n\nWould you be open to me sending over a quick example of what that could look like?",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "outreachBrokenWebsite",
    key: "outreachBrokenWebsite",
    name: "Outreach: broken website",
    category: "First Outreach",
    body:
      "Hi {contactName}, I came across {businessName} and noticed the website doesn't seem to be loading properly.\n\nThat can make it harder for potential customers to check your services, trust the business, or request a quote.\n\nI help local businesses fix or replace websites with something clean, fast, and easy to use.\n\nWould you be open to me sending over a simple improvement idea?",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "followUpGeneral",
    key: "followUpGeneral",
    name: "Follow-up: general",
    category: "Follow-Up",
    body:
      "Hi {contactName}, just following up on my note about {businessName}.\n\nI had a couple of quick ideas that could make it easier for local customers to find and contact you.\n\nWorth sending over?",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "followUpNoWebsite",
    key: "followUpNoWebsite",
    name: "Follow-up: no website",
    category: "Follow-Up",
    body:
      "Hi {contactName}, just following up on my note about {businessName}.\n\nSince I couldn't find a website, I had a simple idea for how the business could show up more clearly online and make it easier for customers to request a quote.\n\nWorth sending over?",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "followUpBrokenWebsite",
    key: "followUpBrokenWebsite",
    name: "Follow-up: broken website",
    category: "Follow-Up",
    body:
      "Hi {contactName}, just following up on my note about {businessName}.\n\nSince the website didn't seem to be loading properly, I had a couple of simple ideas that could help avoid losing potential customers who try to check you out online.\n\nWorth sending over?",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "demoSent",
    key: "demoSent",
    name: "Demo sent",
    category: "Demo Sent",
    body:
      "Hi {contactName}, I sent over the demo idea for {businessName}. The goal is to make the business look more professional online and make contacting you easier. Let me know what you think when you have a chance.",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "softClose",
    key: "softClose",
    name: "Soft close",
    category: "Soft Close",
    body:
      "Hi {contactName}, I do not want to keep bugging you. Should I close the loop on the website idea for {businessName}, or would it still be useful for me to send over a simple option?",
    createdAt: now,
    updatedAt: now
  }
];

export function renderTemplate(template: MessageTemplate, lead: Lead) {
  const contactName = lead.contactName || "there";

  return template.body
    .replaceAll("{contactName}", contactName)
    .replaceAll("{businessName}", lead.businessName || "your business")
    .replaceAll("{websiteUrl}", lead.websiteUrl || "your website")
    .replaceAll("{businessType}", lead.businessType || "your business");
}
