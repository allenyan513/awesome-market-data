# Contributing

Thanks for helping. The most valuable contribution here is a **correction to the terms columns**: if a vendor changed its terms, or we read them wrong, say so.

## The easy way: open an issue

- [Suggest a source](../../issues/new?template=new-source.yml)
- [Report outdated or wrong information](../../issues/new?template=correction.yml)

## The direct way: a pull request

1. Copy [`data/TEMPLATE.yml`](data/TEMPLATE.yml) to `data/sources/<id>.yml` (kebab-case, e.g. `sec-edgar-apis.yml`).
2. Fill it in. Read the source's actual terms page; don't infer from its marketing page or another list.
3. Run `npm install` once, then `npm run build`. It validates every entry and regenerates `README.md` and `sources.json`.
4. Commit all three and open the PR.

Never edit `README.md` by hand. CI fails when it doesn't match the YAML.

## What gets in

- **Useful for US stocks, filings or macro data.** Global sources are fine when they cover US markets well. Crypto, FX and banking APIs belong in other lists.
- **Reachable by an individual developer.** Free, a free tier, or a self-serve paid plan. No "contact sales" only products.
- **A terms page exists and is linked.** An entry without `terms.url` is rejected by the build. If the terms don't answer a question, the answer is `unclear`, not a guess.
- **Facts, not adjectives.** Descriptions say what the data is. "Best", "powerful" and "lightning-fast" will be edited out.
- **No affiliate or referral links.**
- **Vendors may submit their own product.** Say so in the PR, and expect the terms columns to be checked like any other entry.

## How to answer the terms questions

| Field | `yes` | `conditional` | `no` |
| --- | --- | --- | --- |
| `store` | You may keep the data in your own database indefinitely. | Allowed with limits (cache only, delete on cancellation, a plan required). | The terms forbid storing or caching. |
| `redistribute` | You may show it to your users or publish derived files. | Needs attribution, share-alike, a display license or a higher plan. | Personal use only, or explicitly forbidden. |
| `commercial` | A commercial product may use it. | Only on certain plans or with permission. | Non-commercial only. |
| `pit` | Every value carries when it became known (filing timestamp, vintage). | Some fields do, or originals get overwritten by restatements. | No way to tell what was known when. |

Put the decisive sentence in `terms.quote`, verbatim. It lets a reviewer check the answer in seconds and is the reason this list can be trusted.

## Gotchas

Two or three at most, each one something you actually hit: a parameter that is silently ignored, a timezone that isn't stated, a User-Agent that gets you blocked. Skip general advice like "respect rate limits".
