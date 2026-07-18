# AusHomeValue promotion automation foundation

Baseline: `11cd68142ba8c4f3eb44e60ed9b1155a315447d4`
Audit date: 2026-07-18

## What already exists

- Weekly suburb research HTML generation and sitemap updates.
- Draft formats for Xiaohongshu, WeChat outlines and short videos.
- Google Analytics tag on the homepage and core opportunity pages.
- GitHub scheduled jobs for suburb metrics and production smoke tests.

## Gaps found

- Existing social generators are fragmented and some still read legacy score fields.
- There is no shared campaign ID, UTM convention, approval state or publishing audit trail.
- There is no measured funnel from campaign click to valuation, registration and purchase.
- The existing content deploy helper commits and pushes the current branch; it must not be reused as a social publisher.
- No official social-platform credentials or approved publishing applications are configured in the repository.

## Phase 1 implemented here

The promotion draft builder creates platform-specific drafts for LinkedIn, Facebook, Instagram, Google Business Profile, WeChat, Xiaohongshu, TikTok and newsletter.

Safety properties:

- Reads only the public Opportunity API or an explicit local fixture.
- Uses the canonical public `score.value` field and displays scores as `/100`.
- Fails closed when the canonical score is unavailable.
- Adds campaign, source, medium and content UTM attribution.
- Marks every platform output as draft and approval-required.
- Has no publishing API calls, tokens, database access or advertising controls.
- Writes generated drafts only under the ignored `output/` directory unless an explicit output path is supplied.

Run a local draft:

```sh
npm run promotion:draft -- --strategy balanced
```

## Next phases

1. Confirm ownership/admin access for Google Business Profile, Meta Business, Instagram Business and LinkedIn Company Page.
2. Register official applications and obtain the minimum publish scopes. Keep credentials in platform secret stores, never Git.
3. Add a review screen and immutable approval record before any external publish action.
4. Connect official APIs one platform at a time, beginning with LinkedIn and Google Business Profile.
5. Add GA4 conversion events for campaign landing, valuation start/completion, registration, paid report and Investor Watch.
6. Keep WeChat and Xiaohongshu in manual-publish mode until an approved official API path is confirmed.
7. Enable scheduled publishing only after a two-week draft and measurement trial.

## Promotion operating metrics

- Impressions and clicks by platform and campaign.
- Landing-page engagement and valuation starts.
- Completed valuations and registrations.
- Full report purchases and Investor Watch subscriptions.
- Conversion rate and cost per qualified lead; paid media remains disabled in Phase 1.
