export type SessionType = "unspecified" | "women_only" | "men_only" | "mixed" | "family" | "children" | "private";
export type GenderAccess = "all" | "female" | "male";

export function sessionAudienceIssue(
  sessionType: SessionType,
  gender: GenderAccess,
  minAge: number,
  maxAge: number | null,
): string | null {
  if ((sessionType === "women_only" && gender !== "female")
    || (sessionType === "men_only" && gender !== "male")
    || (sessionType === "mixed" && gender !== "all")) {
    return "Match the access rule to the selected session audience.";
  }
  if (maxAge !== null && maxAge < minAge) {
    return "Maximum age must not be lower than minimum age.";
  }
  if (sessionType === "children" && (maxAge === null || maxAge >= 18)) {
    return "Children’s sessions need a maximum age below 18.";
  }
  return null;
}
