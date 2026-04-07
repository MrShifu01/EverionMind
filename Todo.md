# OpenBrain — Todo

## Database Migration (Required)

- [ ] Run `supabase/migrations/012_brain_api_keys.sql` in your Supabase SQL editor to create the `brain_api_keys` table. The Brain API key feature won't work until this is done.

## Vercel / Hosting

- [ ] Add `/api/external` to your Vercel rewrites (if not using catch-all) so the new external API endpoint is accessible.

## Testing

- [ ] Test Brain API key generation in Settings > Brain API tab
- [ ] Test external API access: `curl /api/external?action=entries&api_key=ob_...`
- [ ] Verify Todo view no longer shows date of birth, ID dates, licence dates as overdue
- [ ] Run Refine and confirm new suggestion types appear (Stale, Needs Detail, Life Change, AI Question)
- [ ] Verify Refine suggestions persist after page refresh and survive re-analysis
- [ ] Check suggestions auto-expire after 7 days

## Future Considerations

- [ ] Build standalone Calendar app that pulls from OpenBrain via Brain API key
- [ ] Build standalone Todo app that pulls from OpenBrain via Brain API key
- [ ] Consider adding write access to the external API (currently read-only)
- [ ] Consider hashing brain API keys in the database instead of storing plain text
