const scannerProbePath =
  /(?:^|\/)(?:\.env(?:[./]|$)|env\.(?:php|json|txt)|credentials\.(?:ini|json)|\.git(?:\/|$))|^\/(?:graphql(?:\/console)?|v1\/graphql|api\/graphql)\/?$|^\/(?:wp-admin|wp-content|wp-includes|administrator|phpmyadmin|pma|cpanel|webmail|typo3|magento)(?:\/|$)|^\/(?:wp-login\.php|adminer(?:\.php)?)\/?$/i

/**
 * Returns whether a URL path is a high-confidence automated probe for files or
 * endpoints that this application does not expose.
 *
 * @param pathname - Request pathname, excluding its query string.
 * @returns `true` when the path should be rejected before application hooks run.
 * @remarks Keep this deliberately narrow: it must not block a legitimate route.
 */
export function isScannerProbePath(pathname: string): boolean {
  return scannerProbePath.test(pathname)
}
