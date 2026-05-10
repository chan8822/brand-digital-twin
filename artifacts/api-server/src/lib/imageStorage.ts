import { Storage } from "@google-cloud/storage";
import { randomUUID } from "node:crypto";

// Standard Google Cloud Storage client. Authentication uses Application
// Default Credentials (ADC) so the same code works across deploy targets
// without modification:
//   * Cloud Run / GKE / Cloud Build: runtime service account is used
//   * Local dev: set GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
//   * CI: same env var, or workload-identity federation
// See https://cloud.google.com/docs/authentication/application-default-credentials
const storage = new Storage();

function privateRoot(): { bucket: string; prefix: string } {
  const dir = process.env["PRIVATE_OBJECT_DIR"];
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR not set");
  // Format is /<bucket>/<prefix...>
  const parts = dir.replace(/^\/+/, "").split("/");
  const bucket = parts.shift();
  if (!bucket) throw new Error(`PRIVATE_OBJECT_DIR malformed: ${dir}`);
  return { bucket, prefix: parts.join("/") };
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function extForMime(mime: string): string {
  return EXT_BY_MIME[mime.toLowerCase()] ?? "bin";
}

// Persists a buffer in object storage and returns the storage path plus a
// public-serve URL the API will route bytes through.
export async function saveAssetBytes(input: {
  slug: string;
  kind: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<{ storagePath: string; publicUrl: string }> {
  const { bucket, prefix } = privateRoot();
  const id = randomUUID();
  const objectName = [
    prefix,
    "menu-assets",
    input.slug,
    `${input.kind}-${id}.${extForMime(input.mimeType)}`,
  ]
    .filter(Boolean)
    .join("/");
  const file = storage.bucket(bucket).file(objectName);
  await file.save(input.buffer, {
    contentType: input.mimeType,
    resumable: false,
  });
  return {
    storagePath: `${bucket}/${objectName}`,
    publicUrl: `/api/storage/menu-assets/${input.slug}/${objectName.split("/").pop()}`,
  };
}

export async function readAssetBytes(
  storagePath: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const slash = storagePath.indexOf("/");
  if (slash <= 0) throw new Error(`bad storagePath: ${storagePath}`);
  const bucket = storagePath.slice(0, slash);
  const objectName = storagePath.slice(slash + 1);
  const file = storage.bucket(bucket).file(objectName);
  const [meta] = await file.getMetadata();
  const [buf] = await file.download();
  return {
    buffer: buf,
    mimeType: (meta.contentType as string) || "application/octet-stream",
  };
}

// Resolves the storage path for a given served URL and streams the bytes back
// to the express response. Used by GET /storage/menu-assets/:slug/:filename.
export async function serveStoredAsset(
  slug: string,
  filename: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const { bucket, prefix } = privateRoot();
  const objectName = [prefix, "menu-assets", slug, filename]
    .filter(Boolean)
    .join("/");
  const file = storage.bucket(bucket).file(objectName);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [meta] = await file.getMetadata();
  const [buf] = await file.download();
  return {
    buffer: buf,
    mimeType: (meta.contentType as string) || "application/octet-stream",
  };
}
