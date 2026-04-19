import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { googlePlacesNearbySearch } from "@/lib/places";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rotating type buckets so every refresh surfaces a different slice of the
// city rather than the same Google Places top-20 over and over. Keep each
// bucket small (3-4 types max) so results within it are coherent.
const NEARBY_BUCKETS: Record<string, string[]> = {
  food: ["restaurant", "cafe", "bakery", "meal_takeaway"],
  drinks: ["bar", "night_club"],
  sights: ["tourist_attraction", "museum"],
  nature: ["park"],
  shopping: ["shopping_mall"],
};
const BUCKET_ORDER = ["food", "sights", "drinks", "nature", "shopping"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tripId = url.searchParams.get("trip_id");
  if (!tripId) {
    return NextResponse.json({ error: "trip_id required" }, { status: 400 });
  }

  const latParam = url.searchParams.get("lat");
  const lngParam = url.searchParams.get("lng");

  const supabase = getSupabaseServerClient();

  // Get trip destination coordinates if lat/lng not provided
  let lat = latParam ? Number(latParam) : null;
  let lng = lngParam ? Number(lngParam) : null;

  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
    const { data: trip } = await supabase
      .from("trips")
      .select("destination_lat, destination_lng")
      .eq("id", tripId)
      .maybeSingle();

    if (trip) {
      lat = trip.destination_lat;
      lng = trip.destination_lng;
    }
  }

  if (lat == null || lng == null) {
    return NextResponse.json(
      { error: "No coordinates available for this trip" },
      { status: 400 }
    );
  }

  // Optional `bucket` param rotates the type filter so refresh produces a
  // different slice. If omitted, pick one deterministically from the current
  // minute so two consecutive refreshes without a param differ too.
  const bucketParam = url.searchParams.get("bucket");
  const bucketKey =
    bucketParam && NEARBY_BUCKETS[bucketParam]
      ? bucketParam
      : BUCKET_ORDER[new Date().getMinutes() % BUCKET_ORDER.length];
  const includedTypes = NEARBY_BUCKETS[bucketKey];

  const results = await googlePlacesNearbySearch(
    lat,
    lng,
    1500,
    includedTypes
  );

  // Get existing places for this trip to mark duplicates
  const { data: existing } = await supabase
    .from("places")
    .select("google_place_id")
    .eq("trip_id", tripId);

  const existingIds = new Set(
    (existing ?? []).map((p) => p.google_place_id).filter(Boolean)
  );

  const enriched = results.map((r) => ({
    ...r,
    already_saved: existingIds.has(r.place_id),
  }));

  return NextResponse.json(
    { results: enriched, bucket: bucketKey },
    // No cache — we WANT every refresh to re-run the bucket rotation.
    { headers: { "cache-control": "no-store" } }
  );
}
