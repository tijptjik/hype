const scannerProbePath =
  /(?:^|\/)\.(?!well-known(?:\/|$))|(?:^|\/)(?:env|config(?:uration)?|settings|application|bootstrap|appsettings|credentials?|creds|keyfile|service[_-]?account|client_secret|aws|firebase|secrets?)(?:[./_-]|$)|^\/@fs(?:\/|$)|^\/(?:actuator|cgi-bin|__debug__|_debugbar|_ignition|debug|execute|exec|run|system)(?:\/|$)|^\/api\/(?:debug|execute|exec|run|system|ping|openapi\.json|keys\.json|v\d+\/run_sql)(?:\/|$)|^\/(?:__env\.js|graphql(?:\/console)?|v1\/graphql|api\/graphql)\/?$|^\/(?:wp-admin|wp-content|wp-includes|administrator|phpmyadmin|pma|cpanel|webmail|typo3|magento)(?:\/|$)|^\/(?:wp-login\.php|adminer(?:\.php)?)\/?$/i

const sensitiveArtifactPath =
  /(?:^|\/)(?:amplifyconfiguration|app-config|auth|docker-compose|elmah|gc(?:p)?|google|gradle|host|id|index|info|key|local\.settings|localhost|openapi|phpinfo|private(?:key)?|rclone|runtime-config|sa|sendgrid|server|serverless|serviceaccountkey|stripe|swagger|terraform|web)[._-]/i

/**
 * Returns whether a URL path is a high-confidence automated probe for files or
 * endpoints that this application does not expose.
 *
 * @param pathname - Request pathname, excluding its query string.
 * @returns `true` when the path should be rejected before application hooks run.
 * @remarks Keep this deliberately narrow: it must not block a legitimate route.
 */
export function isScannerProbePath(pathname: string): boolean {
  return scannerProbePath.test(pathname) || sensitiveArtifactPath.test(pathname)
}
