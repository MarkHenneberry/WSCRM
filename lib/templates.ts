import type { Lead, MessageTemplate } from "@/lib/types";

const now = "2026-04-29T00:00:00.000Z";

export const defaultTemplates: MessageTemplate[] = [
  {
    id: "outreachWeakWebsite",
    key: "outreachWeakWebsite",
    name: "Outreach: weak website",
    category: "First Outreach",
    body:
      "Hi {contactName}, I came across {businessName} and noticed the website might not be making the next step as clear as it could.\n\nI run Onward Systems. I help local businesses improve the wording, make services easier to understand, and make it easier for people to contact the business.\n\nWould you be open to me sending over what I noticed?",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "outreachNoWebsite",
    key: "outreachNoWebsite",
    name: "Outreach: no website",
    category: "First Outreach",
    body:
      "Hi {contactName}, I came across {businessName} and noticed I couldn't find a website for the business.\n\nI run Onward Systems. I help local businesses create a simple online home that shows services, builds trust, and makes it easier for customers to call or request a quote.\n\nWould you be open to me sending over a simple example of what that could look like?",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "outreachBrokenWebsite",
    key: "outreachBrokenWebsite",
    name: "Outreach: broken website",
    category: "First Outreach",
    body:
      "Hi {contactName}, I came across {businessName} and noticed the website doesn't seem to be loading properly.\n\nThat can make it harder for people to check your services or get in touch.\n\nI run Onward Systems. I can help find what is broken, get the site working again, or replace it with a cleaner version if needed.\n\nWould you be open to me sending over what I noticed?",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "followUpGeneral",
    key: "followUpGeneral",
    name: "Follow-up: general",
    category: "Follow-Up",
    body:
      "Hi {contactName}, just following up on my note about {businessName}.\n\nI can send over a couple of practical changes that could help customers understand what you do and contact you more easily.\n\nNo pressure. Would that be useful?",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "followUpNoWebsite",
    key: "followUpNoWebsite",
    name: "Follow-up: no website",
    category: "Follow-Up",
    body:
      "Hi {contactName}, just following up on my note about {businessName}.\n\nSince I couldn't find a website, I can send over a simple example of an online home that shows services and makes it easier for people to call or request a quote.\n\nNo pressure. Would that be useful?",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "followUpBrokenWebsite",
    key: "followUpBrokenWebsite",
    name: "Follow-up: broken website",
    category: "Follow-Up",
    body:
      "Hi {contactName}, just following up on my note about {businessName}.\n\nSince the website didn't seem to be loading properly, I can send over what I noticed and a few practical options for getting it working again.\n\nNo pressure. Would that be useful?",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "demoSent",
    key: "demoSent",
    name: "Demo sent",
    category: "Demo Sent",
    body:
      "Hi {contactName}, I sent over the example for {businessName}.\n\nI kept it simple. The goal is to make the services clear and make it easier for people to get in touch.\n\nTake a look when you have a chance.",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "softClose",
    key: "softClose",
    name: "Soft close",
    category: "Soft Close",
    body:
      "Hi {contactName}, I do not want to keep bothering you about {businessName}.\n\nShould I close the loop on this, or would it still be helpful if I sent over a simple option?",
    createdAt: now,
    updatedAt: now
  }
];

export function renderTemplate(template: MessageTemplate, lead: Lead) {
  const body = template?.body || "";
  const contactName = lead?.contactName || "";
  const businessName = lead?.businessName || "your business";
  const websiteUrl = lead?.websiteUrl || "your website";
  const businessType = lead?.businessType || "your business";

  return body
    .replaceAll("{{contactName}}", contactName)
    .replaceAll("{contactName}", contactName)
    .replaceAll("{{businessName}}", businessName)
    .replaceAll("{businessName}", businessName)
    .replaceAll("{{websiteUrl}}", websiteUrl)
    .replaceAll("{websiteUrl}", websiteUrl)
    .replaceAll("{{businessType}}", businessType)
    .replaceAll("{businessType}", businessType);
}
