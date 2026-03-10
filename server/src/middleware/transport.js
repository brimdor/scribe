const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function getRequestHost(req) {
  const hostHeader = req.headers.host || '';
  return hostHeader.split(':')[0].trim().toLowerCase();
}

export function isLocalhostRequest(req) {
  return LOCAL_HOSTS.has(getRequestHost(req));
}

export function isSecureRequest(req) {
  if (req.secure) {
    return true;
  }

  const forwardedProto = req.headers['x-forwarded-proto'];
  if (!forwardedProto) {
    return false;
  }

  const first = String(forwardedProto).split(',')[0].trim().toLowerCase();
  return first === 'https';
}

export function enforceSecureTransport(req, res, next) {
  if (isLocalhostRequest(req) || isSecureRequest(req)) {
    next();
    return;
  }

  res.status(426).json({
    error: 'HTTPS is required for this environment. Please retry over a secure connection.',
  });
}
