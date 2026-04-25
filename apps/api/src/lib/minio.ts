import { randomUUID } from "node:crypto";
import { extname } from "node:path";

import { DeleteObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client, CreateBucketCommand, GetObjectCommand } from "@aws-sdk/client-s3";

import { env } from "../config/env.js";

const s3Client = new S3Client({
  region: env.MINIO_REGION,
  endpoint: env.MINIO_ENDPOINT,
  credentials: {
    accessKeyId: env.MINIO_ACCESS_KEY_ID,
    secretAccessKey: env.MINIO_SECRET_ACCESS_KEY,
  },
  forcePathStyle: env.MINIO_FORCE_PATH_STYLE,
});

let bucketReady = false;

export function buildMediaAssetUrl(objectKey: string, bucket = env.MINIO_BUCKET) {
  const normalizedKey = objectKey.replace(/^\/+/, "");
  return `/api/v1/assets/${encodeURIComponent(bucket)}/${normalizedKey}`;
}

export async function ensureBucket() {
  if (bucketReady) {
    return;
  }

  try {
    await s3Client.send(
      new HeadBucketCommand({
        Bucket: env.MINIO_BUCKET,
      }),
    );
  } catch {
    await s3Client.send(
      new CreateBucketCommand({
        Bucket: env.MINIO_BUCKET,
      }),
    );
  }

  bucketReady = true;
}

export async function uploadExerciseMedia(params: {
  exerciseId: string;
  fileName: string;
  contentType: string;
  data: Buffer;
}) {
  await ensureBucket();

  const extension = extname(params.fileName) || ".bin";
  const objectKey = `exercises/${params.exerciseId}/${Date.now()}-${randomUUID()}${extension}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: env.MINIO_BUCKET,
      Key: objectKey,
      Body: params.data,
      ContentType: params.contentType,
    }),
  );

  return {
    objectKey,
    url: buildMediaAssetUrl(objectKey),
  };
}

export async function deleteExerciseMedia(objectKey: string) {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: env.MINIO_BUCKET,
      Key: objectKey,
    }),
  );
}

export async function uploadProgramTechniqueMedia(params: {
  programTemplateId: string;
  fileName: string;
  contentType: string;
  data: Buffer;
}) {
  await ensureBucket();

  const extension = extname(params.fileName) || ".bin";
  const objectKey = `program-technique/${params.programTemplateId}/${Date.now()}-${randomUUID()}${extension}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: env.MINIO_BUCKET,
      Key: objectKey,
      Body: params.data,
      ContentType: params.contentType,
    }),
  );

  return {
    objectKey,
    url: buildMediaAssetUrl(objectKey),
  };
}

export async function deleteProgramTechniqueMedia(objectKey: string) {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: env.MINIO_BUCKET,
      Key: objectKey,
    }),
  );
}

export async function uploadAvatarMedia(params: {
  userId: string;
  fileName: string;
  contentType: string;
  data: Buffer;
}) {
  await ensureBucket();

  const extension = extname(params.fileName) || ".jpg";
  const objectKey = `avatars/${params.userId}/${Date.now()}-${randomUUID()}${extension}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: env.MINIO_BUCKET,
      Key: objectKey,
      Body: params.data,
      ContentType: params.contentType,
    }),
  );

  return { objectKey, url: buildMediaAssetUrl(objectKey) };
}

export async function getMediaObject(params: {
  bucket?: string;
  objectKey: string;
  range?: string;
}) {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: params.bucket ?? env.MINIO_BUCKET,
      Key: params.objectKey,
      ...(params.range ? { Range: params.range } : {}),
    }),
  );

  return response;
}
