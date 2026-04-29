import { NextResponse } from "next/server";

type PlacesSearchRequest = {
  searchTerm?: string;
  searchTerms?: string[];
  location?: string;
  area?: string;
  prioritizeNoWebsite?: boolean;
  includeNoWebsite?: boolean;
  includeWeakWebsite?: boolean;
  useMinimumRating?: boolean;
  minimumRating?: number;
  useMinimumReviewCount?: boolean;
  minimumReviewCount?: number;
  excludeInactive?: boolean;
  excludeChains?: boolean;
  excludedPlaceIds?: string[];
  excludedUrls?: string[];
  excludedNames?: string[];
  excludedPhones?: string[];
};

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  googleMapsUri?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  formattedAddress?: string;
  types?: string[];
  businessStatus?: string;
  currentOpeningHours?: { openNow?: boolean };
  regularOpeningHours?: { openNow?: boolean };
  reviews?: Array<{ publishTime?: string; relativePublishTimeDescription?: string }>;
};

const serviceWords = [
  "roof",
  "landscap",
  "clean",
  "driveway",
  "plumb",
  "electric",
  "hvac",
  "paint",
  "floor",
  "repair",
  "contractor",
  "septic",
  "pest",
  "snow",
  "lawn",
  "masonry",
  "renovation"
];

const chainWords = [
  "walmart",
  "canadian tire",
  "home depot",
  "lowe",
  "costco",
  "rona",
  "kent",
  "u-haul",
  "enterprise"
];

const inventoryWords = [
  "store",
  "shop",
  "retail",
  "dealer",
  "parts",
  "supply",
  "warehouse",
  "restaurant",
  "cafe",
  "bar",
  "food"
];

const builderDomains = [
  "wixsite.com",
  "squarespace.com",
  "godaddysites.com",
  "webflow.io",
  "wordpress.com",
  "weebly.com",
  "square.site",
  "business.site",
  "sites.google.com",
  "linktr.ee"
];

const websiteKeywords = ["phone", "call", "contact", "quote", "service", "services", "book", "estimate"];

function isServiceBusiness(place: GooglePlace, searchTerm: string) {
  const text = [
    place.displayName?.text,
    place.primaryType,
    place.primaryTypeDisplayName?.text,
    searchTerm,
    ...(place.types ?? [])
  ]
    .join(" ")
    .toLowerCase();

  return serviceWords.some((word) => text.includes(word));
}

function looksLikeLargeChain(place: GooglePlace) {
  const text = [place.displayName?.text, place.primaryTypeDisplayName?.text, ...(place.types ?? [])]
    .join(" ")
    .toLowerCase();

  return chainWords.some((word) => text.includes(word)) || text.includes("department_store");
}

function looksInventoryBased(place: GooglePlace) {
  const text = [place.displayName?.text, place.primaryTypeDisplayName?.text, place.primaryType, ...(place.types ?? [])]
    .join(" ")
    .toLowerCase();

  return inventoryWords.some((word) => text.includes(word));
}

function hasRecentReview(place: GooglePlace) {
  const reviews = place.reviews ?? [];
  const now = Date.now();
  const oneYear = 1000 * 60 * 60 * 24 * 365;

  return reviews.some((review) => {
    if (review.relativePublishTimeDescription && /day|week|month/i.test(review.relativePublishTimeDescription)) return true;
    if (!review.publishTime) return false;
    const published = new Date(review.publishTime).getTime();
    return Number.isFinite(published) && now - published <= oneYear;
  });
}

function normalizeWebsiteUrl(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return url.toLowerCase();
  }
}

function normalizeComparableUrl(url: string) {
  return url.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "").split("?")[0];
}

function normalizeComparableName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\b(ltd|limited|inc|incorporated|co|company)\b/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparablePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

async function checkWebsite(url: string) {
  if (!url) {
    return { status: "No website", isWeak: false, reasons: ["No website is listed"] };
  }

  const reasons: string[] = [];
  const host = normalizeWebsiteUrl(url);

  if (url.startsWith("http://")) reasons.push("Website is not using HTTPS");
  if (host.includes("facebook.com")) reasons.push("Website appears to be a Facebook page");
  if (builderDomains.some((domain) => host.includes(domain))) reasons.push("Website uses a basic builder or subdomain");

  if (!host.includes("facebook.com")) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 CRM lead research bot"
        }
      });
      const contentType = response.headers.get("content-type") ?? "";

      if (!response.ok) reasons.push("Website did not load cleanly");
      if (response.ok && contentType.includes("text/html")) {
        const html = await response.text();
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .toLowerCase();

        if (text.length < 700) reasons.push("Homepage has very little useful text");
        if (!websiteKeywords.some((keyword) => text.includes(keyword))) {
          reasons.push("Homepage does not clearly show contact or service keywords");
        }
      }
    } catch {
      reasons.push("Website failed to load from the backend check");
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    status: reasons.length > 0 ? "Weak website" : "Has website",
    isWeak: reasons.length > 0,
    reasons
  };
}

function getActivitySignal(place: GooglePlace) {
  if (place.businessStatus && place.businessStatus !== "OPERATIONAL") return "inactive";
  if (place.currentOpeningHours?.openNow || place.regularOpeningHours?.openNow) return "active";
  if (hasRecentReview(place)) return "active";
  if ((place.userRatingCount ?? 0) >= 10) return "active";
  return "unclear";
}

function labelFromScore(score: number) {
  if (score >= 8) return "Best lead";
  if (score >= 6) return "Good lead";
  if (score >= 4) return "Maybe";
  return "Skip";
}

function scorePlace(
  place: GooglePlace,
  searchTerm: string,
  prioritizeNoWebsite: boolean,
  websiteCheck: Awaited<ReturnType<typeof checkWebsite>>
) {
  let score = 4;
  const reasons: string[] = [];
  const reviewCount = place.userRatingCount ?? 0;
  const rating = place.rating ?? 0;
  const activitySignal = getActivitySignal(place);
  const hasPhone = Boolean(place.nationalPhoneNumber || place.internationalPhoneNumber);
  const hasLocalAddress = Boolean(place.formattedAddress);

  if (!place.websiteUri) {
    score += prioritizeNoWebsite ? 4 : 3;
    reasons.push("No website is listed");
  } else if (websiteCheck.isWeak) {
    score += 3;
    reasons.push(websiteCheck.reasons[0]);
  } else {
    score -= 1;
    reasons.push("Has a website and stronger online presence");
  }

  if (activitySignal === "active") {
    score += 2;
    reasons.push("The business looks active");
  } else if (activitySignal === "inactive") {
    score -= 4;
    reasons.push("The business may be closed or inactive");
  }

  if (rating >= 4.2 && reviewCount >= 20) {
    score += 2;
    reasons.push(`Good reviews with ${reviewCount} reviews`);
  } else if (rating >= 4 && reviewCount >= 3) {
    score += 1;
    reasons.push("Some good reviews are already in place");
  }

  if (isServiceBusiness(place, searchTerm)) {
    score += 1;
    reasons.push("It looks like a local service business");
  }

  if (hasPhone) {
    score += 1;
    reasons.push("A phone number is listed");
  }

  if (hasLocalAddress) {
    score += 1;
    reasons.push("A local address or area is listed");
  }

  if (looksLikeLargeChain(place)) {
    score -= 3;
    reasons.push("It may be a larger chain");
  }

  if (looksInventoryBased(place)) {
    score -= 2;
    reasons.push("It may be more store or inventory based");
  }

  score = Math.min(10, Math.max(1, score));

  return {
    opportunityScore: score,
    leadLabel: labelFromScore(score),
    activitySignal,
    opportunityReason:
      reasons.length > 0
        ? `${reasons.slice(0, 3).join(". ")}.`
        : "This may be worth a closer look if the site or contact path is weak"
  };
}

function matchesFilters(
  place: GooglePlace,
  body: PlacesSearchRequest,
  websiteCheck: Awaited<ReturnType<typeof checkWebsite>>
) {
  const rating = place.rating ?? 0;
  const reviews = place.userRatingCount ?? 0;
  const includeNoWebsite = Boolean(body.includeNoWebsite);
  const includeWeakWebsite = Boolean(body.includeWeakWebsite);

  if (body.excludeInactive && getActivitySignal(place) === "inactive") return false;
  if (body.excludeChains && looksLikeLargeChain(place)) return false;
  if (body.useMinimumRating && rating < (body.minimumRating ?? 0)) return false;
  if (body.useMinimumReviewCount && reviews < (body.minimumReviewCount ?? 0)) return false;

  if (includeNoWebsite || includeWeakWebsite) {
    const noWebsiteMatch = includeNoWebsite && !place.websiteUri;
    const weakWebsiteMatch = includeWeakWebsite && Boolean(place.websiteUri) && websiteCheck.isWeak;
    return noWebsiteMatch || weakWebsiteMatch;
  }

  return true;
}

function placeDedupeKey(place: GooglePlace) {
  return place.id ?? `${place.displayName?.text ?? ""}-${place.formattedAddress ?? ""}`;
}

function getDuplicateReason(
  place: GooglePlace,
  excludedUrls: Set<string>,
  excludedNames: Set<string>,
  excludedPhones: Set<string>
) {
  const websiteKey = normalizeComparableUrl(place.websiteUri ?? "");
  const mapsKey = normalizeComparableUrl(place.googleMapsUri ?? "");
  const nameKey = normalizeComparableName(place.displayName?.text ?? "");
  const phoneKey = normalizeComparablePhone(place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? "");

  if (phoneKey && excludedPhones.has(phoneKey)) return "phone matches an existing CRM lead";
  if (websiteKey && excludedUrls.has(websiteKey)) return "website matches an existing CRM lead";
  if (mapsKey && excludedUrls.has(mapsKey)) return "Google listing matches an existing CRM lead";
  if (nameKey && excludedNames.has(nameKey)) return "business name matches an existing CRM lead";
  return "";
}

function isExactCrmDuplicate(place: GooglePlace, excludedUrls: Set<string>, excludedPhones: Set<string>) {
  const websiteKey = normalizeComparableUrl(place.websiteUri ?? "");
  const mapsKey = normalizeComparableUrl(place.googleMapsUri ?? "");
  const phoneKey = normalizeComparablePhone(place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? "");

  if (phoneKey && excludedPhones.has(phoneKey)) return true;
  if (websiteKey && excludedUrls.has(websiteKey)) return true;
  if (mapsKey && excludedUrls.has(mapsKey)) return true;
  return false;
}

export async function POST(request: Request) {
  const body = (await request.json()) as PlacesSearchRequest;
  const searchTerm = body.searchTerm?.trim() || "";
  const searchTerms = Array.from(
    new Set((body.searchTerms?.length ? body.searchTerms : [searchTerm]).map((term) => term.trim()).filter(Boolean))
  );
  const location = body.location?.trim() || "Halifax, NS";
  const area = body.area?.trim() || "HRM";
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const excludedPlaceIds = new Set(body.excludedPlaceIds ?? []);
  const excludedUrls = new Set((body.excludedUrls ?? []).map(normalizeComparableUrl).filter(Boolean));
  const excludedNames = new Set((body.excludedNames ?? []).map(normalizeComparableName).filter(Boolean));
  const excludedPhones = new Set((body.excludedPhones ?? []).map(normalizeComparablePhone).filter(Boolean));

  console.log("[places-search] API key exists:", Boolean(apiKey));
  console.log("[places-search] request body:", {
    ...body,
    excludedPlaceIds: body.excludedPlaceIds?.length ?? 0,
    excludedUrls: body.excludedUrls?.length ?? 0,
    excludedNames: body.excludedNames?.length ?? 0,
    excludedPhones: body.excludedPhones?.length ?? 0
  });

  if (searchTerms.length === 0) {
    return NextResponse.json({ error: "Search term is required" }, { status: 400 });
  }

  if (!apiKey) {
    return NextResponse.json({
      setupRequired: true,
      message: "Add GOOGLE_PLACES_API_KEY to .env.local to use Real Lead Search.",
      results: []
    });
  }

  const queryLocation = `${location} ${area}`.trim();
  const queryVariations = Array.from(
    new Set(
      searchTerms.flatMap((term) => [
        `${term} ${queryLocation}`,
        `${term} near ${queryLocation}`,
        `${term} services ${queryLocation}`,
        `${term} contractor ${queryLocation}`
      ])
    )
  );

  const rawPlaces: GooglePlace[] = [];
  const googleErrors: string[] = [];

  for (const textQuery of queryVariations) {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.googleMapsUri,places.websiteUri,places.nationalPhoneNumber,places.internationalPhoneNumber,places.rating,places.userRatingCount,places.primaryType,places.primaryTypeDisplayName,places.formattedAddress,places.types,places.businessStatus,places.currentOpeningHours,places.regularOpeningHours,places.reviews"
      },
      body: JSON.stringify({
        textQuery,
        pageSize: 8
      })
    });

    console.log("[places-search] Google Places response status:", response.status, response.statusText, "query:", textQuery);
    const data = (await response.json().catch(() => null)) as {
      places?: GooglePlace[];
      results?: GooglePlace[];
      error?: { message?: string; status?: string };
    } | null;

    if (!response.ok) {
      const googleMessage = data?.error?.message ?? `Google Places returned ${response.status} ${response.statusText}`;
      googleErrors.push(googleMessage);
      console.log("[places-search] Google Places error:", googleMessage);
      continue;
    }

    rawPlaces.push(...(data?.places ?? data?.results ?? []));
  }

  console.log("[places-search] raw result count before filtering:", rawPlaces.length);

  if (rawPlaces.length === 0) {
    const error = googleErrors[0];
    return NextResponse.json({
      error: error ?? "Google returned zero places for this search.",
      message: error ? `Google returned an error: ${error}` : "Google returned zero places for this search.",
      results: [],
      setupRequired: false
    });
  }

  const parsedPlaces = rawPlaces.filter((place) => placeDedupeKey(place));
  console.log("[places-search] result count after parsing:", parsedPlaces.length);

  if (parsedPlaces.length === 0) {
    return NextResponse.json({
      error: "Google returned places, but the app could not parse the place data.",
      message: "Google returned places, but the app could not parse the place data.",
      results: [],
      setupRequired: false
    });
  }

  const dedupedMap = new Map<string, GooglePlace>();
  parsedPlaces.forEach((place) => {
    const key = placeDedupeKey(place);
    if (key && !dedupedMap.has(key)) dedupedMap.set(key, place);
  });

  const dedupedPlaces = Array.from(dedupedMap.values());
  console.log("[places-search] result count after dedupe:", dedupedPlaces.length);

  const exactDuplicatePlaces = dedupedPlaces.filter((place) => isExactCrmDuplicate(place, excludedUrls, excludedPhones));
  const nonDuplicatePlaces = dedupedPlaces.filter((place) => !isExactCrmDuplicate(place, excludedUrls, excludedPhones));
  const duplicateChecksRemoveMost = exactDuplicatePlaces.length > 0 && nonDuplicatePlaces.length < Math.min(5, dedupedPlaces.length / 2);
  const placesForChecking = duplicateChecksRemoveMost ? dedupedPlaces : nonDuplicatePlaces;
  const removedExactCrmDuplicates = duplicateChecksRemoveMost ? 0 : exactDuplicatePlaces.length;
  console.log("[places-search] result count after exact CRM duplicate checks:", placesForChecking.length);

  const checkedResults = await Promise.all(
    placesForChecking.map(async (place) => {
      const websiteCheck = await checkWebsite(place.websiteUri ?? "");
      const score = scorePlace(place, searchTerms.join(" "), Boolean(body.prioritizeNoWebsite), websiteCheck);
      const passesRequestedFilters = matchesFilters(place, body, websiteCheck);
      const duplicateReason = getDuplicateReason(place, excludedUrls, excludedNames, excludedPhones);

      return {
        id: place.id ?? placeDedupeKey(place),
        name: place.displayName?.text ?? "Unnamed business",
        googleListingLink: place.googleMapsUri ?? "",
        website: place.websiteUri ?? "",
        phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? "",
        rating: place.rating ?? null,
        reviewCount: place.userRatingCount ?? 0,
        category: place.primaryTypeDisplayName?.text ?? place.primaryType ?? "Local business",
        address: place.formattedAddress ?? "",
        businessStatus: place.businessStatus ?? "UNKNOWN",
        openNow: Boolean(place.currentOpeningHours?.openNow ?? place.regularOpeningHours?.openNow),
        websiteStatus: websiteCheck.status,
        websiteWeakReasons: websiteCheck.reasons,
        passesRequestedFilters,
        possibleDuplicate: Boolean(duplicateReason),
        duplicateReason,
        ...score
      };
    })
  );

  const passingResults = checkedResults.filter((result) => result.passesRequestedFilters);
  console.log("[places-search] result count after filters:", passingResults.length);

  const fallbackUsed = duplicateChecksRemoveMost || (passingResults.length === 0 && checkedResults.length > 0);
  const selectedResults = (passingResults.length > 0 ? passingResults : checkedResults)
    .map(({ passesRequestedFilters, ...result }) => ({
      ...result,
      leadLabel: fallbackUsed && result.leadLabel === "Best lead" ? "Good lead" : result.leadLabel,
      opportunityReason:
        fallbackUsed && !passesRequestedFilters
          ? `${result.opportunityReason} This did not match every active filter, but Google returned it for the search.`
          : result.opportunityReason
    }))
    .sort((a, b) => b.opportunityScore - a.opportunityScore);

  if (selectedResults.length === 0) {
    return NextResponse.json({
      error: "Google returned places, but the app could not prepare result cards.",
      message: "Google returned places, but the app could not prepare result cards.",
      results: [],
      setupRequired: false
    });
  }

  const message = duplicateChecksRemoveMost
    ? "Duplicate checks matched most results. Showing them with possible duplicate labels."
    : passingResults.length === 0
      ? "Google returned places, but the active filters removed them. Showing lower priority results."
      : googleErrors.length > 0
        ? `Some Google queries returned an error: ${googleErrors[0]}`
        : "";

  return NextResponse.json({
    results: selectedResults,
    message,
    setupRequired: false,
    debug: {
      googleReturned: rawPlaces.length,
      removedExactCrmDuplicates
    }
  });
}
