import type { BookingModel } from "@workspace/db";

export function getOfferingBookingModel(input: {
  kind: string;
  accessType: string;
  bookingModel?: string | null;
}): BookingModel {
  if (input.bookingModel === "open_access") return "open_access";
  if (input.bookingModel === "resource_booking") return "resource_booking";
  if (input.kind === "event") return "event";
  if (input.kind === "coach") return "booking_request";
  if (input.accessType === "live") return "live_class";
  return "booking_required";
}
