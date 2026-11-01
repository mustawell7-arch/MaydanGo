export type Coordinates = { latitude: number; longitude: number };

export function distanceKm(from: Coordinates, to: Coordinates) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function formatDistance(kilometers: number, language: 'en' | 'ar' | 'ku') {
  const locale = language === 'ar' ? 'ar-IQ' : language === 'ku' ? 'ckb-IQ' : 'en-IQ';
  const isMeters = kilometers < 1;
  const value = isMeters ? kilometers * 1000 : kilometers;
  const unit = isMeters ? 'meter' : 'kilometer';
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: isMeters ? 0 : 1,
  }).format(value);
}

export function directionsUrl(
  platform: 'ios' | 'android' | 'web' | string,
  destination: Coordinates | null,
  address: string,
  name: string,
) {
  const destinationText = destination
    ? `${destination.latitude},${destination.longitude}`
    : address.trim();
  if (!destinationText) return null;

  if (platform === 'ios') {
    return `https://maps.apple.com/?daddr=${encodeURIComponent(destinationText)}&q=${encodeURIComponent(name)}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destinationText)}`;
}
