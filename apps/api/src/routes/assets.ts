import { type Request, type Response, Router } from "express";

import { env } from "../config/env.js";
import { getMediaObject } from "../lib/minio.js";

export const assetsRouter = Router();

assetsRouter.get("/assets/:bucket/*", async (req: Request, res: Response) => {
  const bucket = typeof req.params.bucket === "string" ? req.params.bucket : "";
  const objectKey = Array.isArray(req.params[0]) ? req.params[0][0] : req.params[0];

  if (!bucket || !objectKey) {
    res.status(400).json({ message: "Bucket and object key are required" });
    return;
  }

  if (bucket !== env.MINIO_BUCKET) {
    res.status(404).json({ message: "Asset not found" });
    return;
  }

  try {
    const range = typeof req.headers.range === "string" ? req.headers.range : null;
    const object = await getMediaObject({
      bucket,
      objectKey,
      ...(range ? { range } : {}),
    });

    if (!object.Body) {
      res.status(404).json({ message: "Asset not found" });
      return;
    }

    res.setHeader("Accept-Ranges", "bytes");
    if (object.ContentType) {
      res.setHeader("Content-Type", object.ContentType);
    }
    if (typeof object.ContentLength === "number") {
      res.setHeader("Content-Length", String(object.ContentLength));
    }
    if (object.ETag) {
      res.setHeader("ETag", object.ETag);
    }
    if (object.LastModified) {
      res.setHeader("Last-Modified", object.LastModified.toUTCString());
    }
    if (object.ContentRange) {
      res.status(206);
      res.setHeader("Content-Range", object.ContentRange);
    }
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    const body = object.Body;
    if (typeof (body as NodeJS.ReadableStream).pipe === "function") {
      (body as NodeJS.ReadableStream).pipe(res);
      return;
    }

    const bytes = await body.transformToByteArray();
    res.end(Buffer.from(bytes));
  } catch (error) {
    console.error("Failed to stream media asset", error);
    res.status(404).json({ message: "Asset not found" });
  }
});