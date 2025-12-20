import { createRequestHandler } from "@react-router/express";
import express from "express";

const app = express();

// Serve static assets
app.use(
  "/assets",
  express.static("build/client/assets", { immutable: true, maxAge: "1y" })
);
app.use(express.static("build/client", { maxAge: "1h" }));

// Handle all SSR requests
app.all(
  "*",
  createRequestHandler({
    build: await import("./build/server/index.js"),
  })
);

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`✅ Express server listening on http://0.0.0.0:${port}`);
});
