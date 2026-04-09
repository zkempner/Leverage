import express, { type Express } from "express";
import path from "path";

export function serveStatic(app: Express) {
  const publicPath = path.resolve(import.meta.dirname, "..", "public");
  app.use(express.static(publicPath));

  // SPA fallback — serve index.html for all non-API routes
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(publicPath, "index.html"));
  });
}
