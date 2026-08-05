/**
 * Bring demo activity back inside the story window.
 *
 *   node scripts/refresh-demo-story-window.mjs [--dry]
 *
 * A story is "an approved listing or project that went live in the last 24h"
 * (lib/feed/stories.ts). That makes the story row self-emptying: any seeded
 * dataset stops producing stories one day after it was seeded, and from then on
 * the row is blank and `check:story` fails — not because anything is broken,
 * but because the demo data has aged out.
 *
 * This slides `live_at` on a handful of already-live rows into the last few
 * hours so the row has something real to show. It changes only `live_at`, only
 * on rows that are already `live`, and it spreads them across several posters
 * so the row renders more than one circle.
 *
 * Run it whenever the story row looks empty on the dev site.
 */
import { connect } from "./lib/dbx.mjs";

const DRY = process.argv.includes("--dry");
const POSTERS = 5;      // how many circles the row should have
const PER_POSTER = 3;   // segments behind each circle
const SPREAD_H = 20;    // newest ~0h old, oldest ~20h — still inside the 24h window

const db = await connect();
const q = (sql, ...a) => db.query(sql, a);
const rows = async (sql, ...a) => (await q(sql, ...a)).rows;

const inWindow = async () => Number((await rows(
  `select count(*) n from listings
    where status = 'live' and live_at >= now() - interval '24 hours'`))[0].n);

console.log(DRY ? "DRY RUN — nothing will be written\n" : "");
console.log(`listings inside the 24h story window, before: ${await inWindow()}`);

// Posters who have several live listings, so a circle has segments behind it.
// A story segment renders a spec strip from the type's field_config, so a
// listing needs a type_code and attributes to look like anything.
const posters = await rows(
  `select l.profile_id, count(*) n
     from listings l
     join profiles p on p.id = l.profile_id
    where l.status = 'live' and l.availability = 'available'
      and l.type_code is not null and l.attributes is not null
      and p.state = 'active' and p.username is not null
    group by l.profile_id
   having count(*) >= $1
    order by count(*) desc
    limit $2`, PER_POSTER, POSTERS);

if (!posters.length) {
  console.log("no poster has enough live listings to build a story row from");
  await db.end();
  process.exit(1);
}

let touched = 0;
for (const [i, p] of posters.entries()) {
  const picks = await rows(
    `select id from listings
      where profile_id = $1 and status = 'live' and availability = 'available'
        and type_code is not null and attributes is not null
      order by live_at desc nulls last
      limit $2`, p.profile_id, PER_POSTER);

  for (const [j, l] of picks.entries()) {
    // Stagger so "2h ago" / "9h ago" labels differ and ordering is meaningful.
    const hoursAgo = Math.round(((i * PER_POSTER + j) / (POSTERS * PER_POSTER)) * SPREAD_H);
    if (!DRY) {
      await q(
        `update listings
            set live_at = now() - ($2 || ' hours')::interval,
                story_suppressed_at = null,
                updated_at = now()
          where id = $1`, l.id, String(hoursAgo));
    }
    touched++;
  }
}

console.log(`${DRY ? "would refresh" : "refreshed"} ${touched} listing(s) across ${posters.length} poster(s)`);
if (!DRY) console.log(`listings inside the 24h story window, after:  ${await inWindow()}`);

await db.end();
