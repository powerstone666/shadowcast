import express from "express";
import healthRouter from "./routes/health.js";

const app = express();

app.use(express.json());
app.use("/health", healthRouter);

app.listen(3000, () => {
  console.log("server running at 3000");
});
