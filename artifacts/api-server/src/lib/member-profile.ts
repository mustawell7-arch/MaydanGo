type MemberGender = "female" | "male" | "unspecified";

export function buildMemberProfileUpsert(input: { gender?: MemberGender; birthDate: string }) {
  return {
    insert: {
      gender: input.gender ?? "unspecified",
      birthDate: input.birthDate,
    },
    update: {
      birthDate: input.birthDate,
      ...(input.gender ? { gender: input.gender } : {}),
    },
  };
}
