import "server-only";
import type { Profile } from "./service";
import { maskPhone } from "./phone";

/** Public/self-safe user DTO — explicit fields only, never `select *` to client (Doc9 §17). */
export function toUserDTO(p: Profile) {
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    phoneMasked: maskPhone(p.phone),
    cityId: p.city_id,
    photoUrl: p.photo_url,
    isRegistered: p.is_registered,
    state: p.state,
  };
}

export const TC_VERSION = "2026-07-01";
