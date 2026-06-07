# Breadline Production TODO

## Cloudflare Custom Domain

- [ ] Add `breadline.hk` as a production Worker custom domain after we control the zone/DNS records.

## Notes

- `breadline.hk` was removed from `wrangler.toml` production routes because the project does not currently control the domain.
- Keeping it in Wrangler causes production deploys to fail during custom-domain record reconciliation after the Worker upload succeeds.
