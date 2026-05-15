const API_BASE = "https://www.googleapis.com/youtube/v3";

function requireKey(): string {
  const k = process.env.YOUTUBE_API_KEY;
  if (!k) throw new Error("YOUTUBE_API_KEY is not set");
  return k;
}

async function ytGet<T>(
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(`${API_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  url.searchParams.set("key", requireKey());
  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTube API ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export type ChannelInfo = {
  id: string;
  name: string;
  handle: string | null;
  subscriberCount: number | null;
};

type ChannelListResponse = {
  items?: Array<{
    id: string;
    snippet: { title: string; customUrl?: string };
    statistics: {
      subscriberCount?: string;
      hiddenSubscriberCount?: boolean;
    };
  }>;
};

export async function getChannel(channelId: string): Promise<ChannelInfo> {
  const data = await ytGet<ChannelListResponse>("channels", {
    part: "snippet,statistics",
    id: channelId,
  });
  const item = data.items?.[0];
  if (!item) throw new Error(`Channel not found: ${channelId}`);
  return {
    id: item.id,
    name: item.snippet.title,
    handle: item.snippet.customUrl ?? null,
    subscriberCount: item.statistics.hiddenSubscriberCount
      ? null
      : item.statistics.subscriberCount
        ? parseInt(item.statistics.subscriberCount, 10)
        : null,
  };
}

// Convention: a channel's "uploads" playlist always shares its ID with the
// channel except the leading UC -> UU. Saves an API call per channel.
export function uploadsPlaylistId(channelId: string): string {
  if (!channelId.startsWith("UC")) {
    throw new Error(`Unexpected channel ID format: ${channelId}`);
  }
  return "UU" + channelId.slice(2);
}

type PlaylistItemsResponse = {
  items?: Array<{ contentDetails: { videoId: string } }>;
  nextPageToken?: string;
};

export async function* iterateVideoIds(
  playlistId: string,
): AsyncGenerator<string> {
  let pageToken: string | undefined = undefined;
  do {
    const data: PlaylistItemsResponse = await ytGet("playlistItems", {
      part: "contentDetails",
      playlistId,
      maxResults: 50,
      pageToken,
    });
    for (const item of data.items ?? []) {
      yield item.contentDetails.videoId;
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
}

export type VideoDetails = {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  durationSec: number | null;
  viewCount: number | null;
  thumbnailUrl: string | null;
};

type VideoListResponse = {
  items?: Array<{
    id: string;
    snippet: {
      title: string;
      description?: string;
      publishedAt: string;
      thumbnails?: Record<string, { url: string } | undefined>;
    };
    statistics?: { viewCount?: string };
    contentDetails: { duration: string };
  }>;
};

export async function getVideoDetails(
  videoIds: string[],
): Promise<VideoDetails[]> {
  const results: VideoDetails[] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const data = await ytGet<VideoListResponse>("videos", {
      part: "snippet,statistics,contentDetails",
      id: chunk.join(","),
    });
    for (const item of data.items ?? []) {
      results.push({
        id: item.id,
        title: item.snippet.title,
        description: item.snippet.description ?? "",
        publishedAt: item.snippet.publishedAt,
        durationSec: parseISO8601Duration(item.contentDetails.duration),
        viewCount: item.statistics?.viewCount
          ? parseInt(item.statistics.viewCount, 10)
          : null,
        thumbnailUrl: pickBestThumbnail(item.snippet.thumbnails),
      });
    }
  }
  return results;
}

function pickBestThumbnail(
  thumbs?: Record<string, { url: string } | undefined>,
): string | null {
  if (!thumbs) return null;
  return (
    thumbs.maxres?.url ??
    thumbs.high?.url ??
    thumbs.medium?.url ??
    thumbs.default?.url ??
    null
  );
}

function parseISO8601Duration(s: string): number | null {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(s);
  if (!m) return null;
  const h = parseInt(m[1] ?? "0", 10);
  const min = parseInt(m[2] ?? "0", 10);
  const sec = parseInt(m[3] ?? "0", 10);
  return h * 3600 + min * 60 + sec;
}
