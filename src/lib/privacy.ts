// Facts shown in the privacy notice. Keep in sync with the actual setup
// (Supabase region, retention in the `set_event_derived_dates` trigger).
export const privacy = {
  controller: "The A Society",
  // TODO: replace with the organizer's real contact address before the first event.
  contactEmail: "privacy@example.com",
  storageLocation: "the United Kingdom (London)",
  retentionDays: 90,
} as const;
