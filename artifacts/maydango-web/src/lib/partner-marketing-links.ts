export function buildPartnerFacilityUrl(
  baseUrl: string,
  facilityId: string | undefined,
  origin?: string,
): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = new URL(`${base}facilities`, origin ?? 'https://maydango.invalid');

  if (facilityId) {
    url.searchParams.set('facility', facilityId);
    url.hash = 'public-facilities';
  }

  return origin ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
}
