import { NextResponse } from "next/server";
import type { LeadAuditResult, LeadProblemType } from "@/lib/types";

type AuditRequest = {
  businessName?: string;
  websiteUrl?: string;
  facebookUrl?: string;
};

const problemTypes: LeadProblemType[] = ["no website", "broken website", "weak presence", "solid"];

function fallbackAudit({ businessName, websiteUrl, facebookUrl }: AuditRequest): LeadAuditResult {
  const name = businessName?.trim() || "the business";
  const hasWebsite = Boolean(websiteUrl?.trim());
  const hasFacebook = Boolean(facebookUrl?.trim());
  const looksBroken = /404|broken|not-found|unreachable|expired/i.test(websiteUrl ?? "");
  const isFacebookOnly = !hasWebsite && hasFacebook;

  if (isFacebookOnly) {
    return {
      problem_type: "weak presence",
      lead_score: 8,
      insight: `${name} seems to be using Facebook as the main online presence. That can work, but it can leave contact details, services, quotes, and follow-up spread across different places.`,
      first_message: `Hi there, I came across ${name} and noticed the business seems to be using Facebook as the main online spot.\n\nThat can work, but it can make it harder for people to see services, send a quote request, or find the best way to contact you.\n\nI run Onward Systems. I help local businesses connect the pieces into one simple setup. That can include a website, contact form, Google listing, and basic lead tracking.\n\nWould you be open to me sending over a simple example?`,
      follow_up_message: `Hi there, just following up on my note about ${name}.\n\nI can send over a couple of practical changes that could help customers understand what you do and contact you more easily.\n\nNo pressure. Would that be useful?`
    };
  }

  if (!hasWebsite) {
    return {
      problem_type: "no website",
      lead_score: 9,
      insight: `${name} does not seem to have a dedicated website listed. That can make it harder for local customers to check services, trust the business, and request a quote.`,
      first_message: `Hi there, I came across ${name} and noticed I couldn't find a website for the business.\n\nI run Onward Systems. I help local businesses create a simple online home that shows services, builds trust, and makes it easier for customers to call or request a quote.\n\nWould you be open to me sending over a simple example of what that could look like?`,
      follow_up_message: `Hi there, just following up on my note about ${name}.\n\nI can send over a couple of practical changes that could help customers understand what you do and contact you more easily.\n\nNo pressure. Would that be useful?`
    };
  }

  if (looksBroken) {
    return {
      problem_type: "broken website",
      lead_score: 8,
      insight: `${name}'s website may not be loading properly. That can make it harder for customers to check services, trust the business, or request a quote.`,
      first_message: `Hi there, I came across ${name} and noticed the website doesn't seem to be loading properly.\n\nThat can make it harder for people to check your services or get in touch.\n\nI run Onward Systems. I can help find what is broken, get the site working again, or replace it with a cleaner version if needed.\n\nWould you be open to me sending over what I noticed?`,
      follow_up_message: `Hi there, just following up on my note about ${name}.\n\nI can send over a couple of practical changes that could help customers understand what you do and contact you more easily.\n\nNo pressure. Would that be useful?`
    };
  }

  if (!hasFacebook || websiteUrl?.includes("facebook.com")) {
    return {
      problem_type: "weak presence",
      lead_score: 7,
      insight: `${name} has an online presence, but the next step for customers could be clearer. The site may need simpler wording and easier ways to contact the business.`,
      first_message: `Hi there, I came across ${name} and noticed the website might not be making the next step as clear as it could.\n\nI run Onward Systems. I help local businesses improve the wording, make services easier to understand, and make it easier for people to contact the business.\n\nWould you be open to me sending over what I noticed?`,
      follow_up_message: `Hi there, just following up on my note about ${name}.\n\nI can send over a couple of practical changes that could help customers understand what you do and contact you more easily.\n\nNo pressure. Would that be useful?`
    };
  }

  return {
    problem_type: "solid",
    lead_score: 3,
    insight: `${name} appears to have a basic website and online presence already. This is a lower-priority lead unless there are clear issues with wording, speed, or the contact path.`,
    first_message: `Hi there, I came across ${name} and took a look at the website.\n\nIt already gives people a place to learn about the business. I noticed a few small things that might make the next step clearer for customers.\n\nI run Onward Systems. I help local businesses make their sites easier to understand and easier to contact from.\n\nWould you be open to me sending over what I noticed?`,
    follow_up_message: `Hi there, just following up on my note about ${name}.\n\nI can send over a couple of practical changes that could help customers understand what you do and contact you more easily.\n\nNo pressure. Would that be useful?`
  };
}

function extractOutputText(response: unknown) {
  if (typeof response !== "object" || response === null) return "";
  const data = response as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  if (data.output_text) return data.output_text;
  return data.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("") ?? "";
}

function normalizeAudit(value: Partial<LeadAuditResult>, fallback: LeadAuditResult): LeadAuditResult {
  const problem = problemTypes.includes(value.problem_type as LeadProblemType)
    ? (value.problem_type as LeadProblemType)
    : fallback.problem_type;
  const score = Number(value.lead_score);

  return {
    problem_type: problem,
    lead_score: Number.isFinite(score) ? Math.min(10, Math.max(1, Math.round(score))) : fallback.lead_score,
    insight: value.insight?.trim() || fallback.insight,
    first_message: value.first_message?.trim() || fallback.first_message,
    follow_up_message: value.follow_up_message?.trim() || fallback.follow_up_message
  };
}

export async function POST(request: Request) {
  const body = (await request.json()) as AuditRequest;
  const fallback = fallbackAudit(body);

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ...fallback, usedFallback: true });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.4-nano",
        input: [
          {
            role: "system",
            content:
              "You qualify Halifax/HRM local service business leads for Onward Systems, a local website and lead tracking service. Return only JSON that matches the schema. Style rules: do not use em dashes or en dashes. Use short sentences. Keep grammar simple and relatable. Sound like a real local person who looked at the business. Do not sound corporate, salesy, or robotic. Keep outreach low pressure. Do not promise results. Do not mention SEO unless the issue clearly calls for it. For no website, say Onward Systems can create a simple online home that shows services, builds trust, and makes it easier to call or request a quote. For broken website, say Onward Systems can help find what is broken, get the site working again, or replace it with a cleaner version if needed. For weak website, say Onward Systems can make the next step clearer, improve the wording, and make it easier for people to contact the business. For Facebook-only or scattered presence, say Onward Systems can connect the pieces into one simple system: website, contact form, Google listing, and basic lead tracking. Follow-ups should offer practical changes that help customers understand what the business does and contact them more easily."
          },
          {
            role: "user",
            content: JSON.stringify({
              business_name: body.businessName,
              website_url: body.websiteUrl,
              facebook_url: body.facebookUrl
            })
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "lead_audit",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                problem_type: { type: "string", enum: problemTypes },
                lead_score: { type: "integer", minimum: 1, maximum: 10 },
                insight: { type: "string" },
                first_message: { type: "string" },
                follow_up_message: { type: "string" }
              },
              required: ["problem_type", "lead_score", "insight", "first_message", "follow_up_message"]
            }
          }
        }
      })
    });

    if (!response.ok) {
      return NextResponse.json({ ...fallback, usedFallback: true }, { status: 200 });
    }

    const data = await response.json();
    const output = extractOutputText(data);
    const parsed = JSON.parse(output) as Partial<LeadAuditResult>;

    return NextResponse.json({ ...normalizeAudit(parsed, fallback), usedFallback: false });
  } catch {
    return NextResponse.json({ ...fallback, usedFallback: true }, { status: 200 });
  }
}
