# Hubs

Hubs are hosted on subdomains and, optionally, on domains which have been delegated to us. For the latter, the domain needs to be [connected to Cloudflare](https://dash.cloudflare.com/a6eeace4b6d9f8e07ab307964e74d801/add-site), and its nameservers updated to cloudflare's.

- **subdomain** : `https://{code}.hype.hk`
- **domain** : `https://{domain}` (optional)

## HYPE

Add a [new hub](http://hype.hk/admin/hubs) specifying its `code` and (optionally) the `domain`. The `code` is used as the subdomain on `{code}.hype.hk` and the domain is an alias for `hype.hk` but ensures that the app is loaded in the context of that hub.

## Cloudflare

Bind the domains to Cloudflare Workers:

```toml
[[env.production.routes]]
pattern = "https://{domain.tld}"
custom_domain = true

[[env.production.routes]]
pattern = `https://{code}.hype.hk`
custom_domain = true
```

## Protomaps Server

Add the domains to tile server's [allowed origin domains](https://dash.cloudflare.com/a6eeace4b6d9f8e07ab307964e74d801/workers/services/view/protomap/production/settings#variables).


## Google OAuth

Add the domains to the [Google Cloud Console](https://console.cloud.google.com/auth/clients/234870059065-fb1jvv6e72jb7ogtd755424bjm8pqgij.apps.googleusercontent.com?inv=1&invt=Abz-Pg&project=hypehk):

### Authorized JavaScript origins
- `https://{domain.tld}`
- `https://{code}.hype.hk`

### Authorized redirect URIs
- `https://{domain.tld}/api/auth/callback/google`
- `https://{code}.hype.hk/api/auth/callback/google`

Do the same for the preview environment if the hub will have custom development.

## Better Auth

Add the domains to `trustedOrigins` in `src/lib/auth/config.ts`

```js
// HUBS :: SUBDOMAINS
'https://{code}.hype.hk',
// HUBS :: DOMAINS
'https://{domain.tld}',
// HUBS :: PREVIEW
'https://preview.{domain.tld}',
```