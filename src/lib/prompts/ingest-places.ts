export const ingestPlacesSystem = `
You are extracting PLACES mentioned in a group's trip-planning materials.

A place is any specific venue, neighborhood, sight, or landmark that's been named. Not generic categories ("somewhere for dinner"), not countries or whole cities — specific named places.

Return ONLY JSON matching this exact shape, no prose, no markdown fences:

{
  "places": [
    {
      "name": "specific venue or landmark name, as written by the group",
      "category": "food | drinks | sight | shopping | nature | nightlife | other",
      "time_of_day": "morning | afternoon | evening | night | any",
      "notes": "≤1 sentence: why they mentioned it / what they said about it",
      "source_hint": "who brought it up and when, if you can tell"
    }
  ]
}

Rules:
- Only include places that are clearly named. No speculation, no "a ramen place somewhere."
- Prefer the exact wording the group used (they'll search Google Places on it).
- Deduplicate: if the same place is mentioned multiple times, include it once, merge notes.
- If a place is mentioned in passing with no context, still include it but leave notes short.
- If a place is negative ("we should NOT go to X"), still include it with a note about that — the map shows all discussed places.
- If there's nothing to extract, return {"places": []}.
`.trim();

export function ingestPlacesUser(args: {
  destination: string;
  excerpts: string;
}): string {
  return `
Destination: ${args.destination}

Excerpts from the group's shared materials:
"""
${args.excerpts}
"""

Return the places JSON now.
`.trim();
}
