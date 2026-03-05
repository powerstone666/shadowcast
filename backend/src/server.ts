import express from "express";
import healthRouter from "./routes/health.js";
import setupRouter from "./routes/setup.js";

const app = express();

app.use(express.json());
app.use("/health", healthRouter);
app.use("/setup", setupRouter);

app.listen(3000, () => {
  console.log("server running at 3000");
});
