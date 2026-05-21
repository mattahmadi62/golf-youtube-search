import {
  type AnyPgColumn,
  bigint,
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    aliases: text("aliases").array().notNull().default([]),
    slug: text("slug").notNull(),
    country: text("country"),
    state: text("state"),
    lat: numeric("lat", { precision: 9, scale: 6 }),
    lng: numeric("lng", { precision: 9, scale: 6 }),
    osmId: bigint("osm_id", { mode: "number" }),
    isCurated: boolean("is_curated").notNull().default(false),
    parentCourseId: uuid("parent_course_id").references(
      (): AnyPgColumn => courses.id,
      { onDelete: "set null" },
    ),
    // Public-facing course info (sourced from OSM tags and/or manual curation).
    website: text("website"),
    phone: text("phone"),
    address: text("address"),
    description: text("description"),
    holeCount: integer("hole_count"),
    accessType: text("access_type"), // 'public' | 'private' | 'resort' | 'semi-private'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("courses_slug_unique").on(t.slug),
    index("courses_name_idx").on(t.name),
    index("courses_curated_idx").on(t.isCurated),
    index("courses_parent_idx").on(t.parentCourseId),
  ],
);

export const channels = pgTable(
  "channels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ytChannelId: text("yt_channel_id").notNull(),
    handle: text("handle"),
    name: text("name").notNull(),
    subscriberCt: integer("subscriber_ct"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("channels_yt_channel_id_unique").on(t.ytChannelId)],
);

export const videos = pgTable(
  "videos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ytVideoId: text("yt_video_id").notNull(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    durationS: integer("duration_s"),
    thumbnailUrl: text("thumbnail_url"),
    viewCount: bigint("view_count", { mode: "number" }),
    captionsText: text("captions_text"),
    extractedAt: timestamp("extracted_at", { withTimezone: true }),
    extractionModel: text("extraction_model"),
  },
  (t) => [
    uniqueIndex("videos_yt_video_id_unique").on(t.ytVideoId),
    index("videos_channel_id_idx").on(t.channelId),
    index("videos_published_at_idx").on(t.publishedAt),
    index("videos_extracted_at_idx").on(t.extractedAt),
  ],
);

export const videoCourses = pgTable(
  "video_courses",
  {
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    source: text("source").notNull(),
    evidence: text("evidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.videoId, t.courseId] }),
    index("video_courses_course_id_idx").on(t.courseId),
  ],
);

export const extractionReviewQueue = pgTable(
  "extraction_review_queue",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    candidateName: text("candidate_name").notNull(),
    evidence: text("evidence"),
    status: text("status").notNull().default("pending"),
    resolvedCourseId: uuid("resolved_course_id").references(() => courses.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("review_queue_status_idx").on(t.status),
    index("review_queue_video_id_idx").on(t.videoId),
  ],
);

/**
 * Email subscriptions: anonymous email follow-on-course.
 *
 *   - confirmedAt is set when the user clicks the magic-link in their
 *     confirmation email (double opt-in).
 *   - lastNotifiedAt is the timestamp of the most-recent video_courses row
 *     that we've already alerted this subscription about; the daily-digest
 *     cron looks for video_courses.created_at > lastNotifiedAt.
 *   - confirmationToken authenticates the confirm endpoint; unsubscribeToken
 *     authenticates the unsubscribe endpoint. Both are opaque random strings.
 */
export const courseSubscriptions = pgTable(
  "course_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    confirmationToken: text("confirmation_token").notNull(),
    unsubscribeToken: text("unsubscribe_token").notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("course_subscriptions_email_course_unique").on(t.email, t.courseId),
    uniqueIndex("course_subscriptions_confirmation_token_unique").on(t.confirmationToken),
    uniqueIndex("course_subscriptions_unsubscribe_token_unique").on(t.unsubscribeToken),
    index("course_subscriptions_email_idx").on(t.email),
    index("course_subscriptions_course_id_idx").on(t.courseId),
    index("course_subscriptions_confirmed_idx").on(t.confirmedAt),
  ],
);

export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
export type Channel = typeof channels.$inferSelect;
export type NewChannel = typeof channels.$inferInsert;
export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;
export type VideoCourse = typeof videoCourses.$inferSelect;
export type NewVideoCourse = typeof videoCourses.$inferInsert;
export type CourseSubscription = typeof courseSubscriptions.$inferSelect;
export type NewCourseSubscription = typeof courseSubscriptions.$inferInsert;
