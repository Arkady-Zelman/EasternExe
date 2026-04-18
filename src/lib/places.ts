import "server-only";

export interface PlaceSearchResult {
  name: string;
  place_id: string;
  lat: number;
  lng: number;
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
  types?: string[];
}

/**
 * Google Places Text Search (new) — biased to a destination string when given.
 * Returns [] on any error so the pipeline can continue.
 */
export async function googlePlacesTextSearch(
  query: string,
  destination?: string | null
): Promise<PlaceSearchResult[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.warn("GOOGLE_PLACES_API_KEY missing — skipping place lookup");
    return [];
  }

  const textQuery = destination ? `${query} in ${destination}` : query;

  try {
    const res = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.location,places.formattedAddress,places.rating,places.userRatingCount,places.types",
        },
        body: JSON.stringify({ textQuery, maxResultCount: 5 }),
      }
    );
    if (!res.ok) {
      console.warn(
        `Places API error ${res.status}:`,
        await res.text().catch(() => "")
      );
      return [];
    }
    const json = (await res.json()) as {
      places?: {
        id: string;
        displayName?: { text?: string };
        location?: { latitude: number; longitude: number };
        formattedAddress?: string;
        rating?: number;
        userRatingCount?: number;
        types?: string[];
      }[];
    };

    return (json.places ?? [])
      .filter((p) => p.location)
      .map((p) => ({
        name: p.displayName?.text ?? "Unknown",
        place_id: p.id,
        lat: p.location!.latitude,
        lng: p.location!.longitude,
        formatted_address: p.formattedAddress,
        rating: p.rating,
        user_ratings_total: p.userRatingCount,
        types: p.types,
      }));
  } catch (e) {
    console.warn("Places lookup failed:", e);
    return [];
  }
}

export async function geocodeDestination(
  destination: string
): Promise<{ lat: number; lng: number } | null> {
  const results = await googlePlacesTextSearch(destination);
  if (results.length === 0) return null;
  const top = results[0];
  return { lat: top.lat, lng: top.lng };
}
