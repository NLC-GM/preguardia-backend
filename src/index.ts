import "dotenv/config";
import express from "express";
import cors from "cors";
import hospitalesRouter from "./routes/hospitales";
import usuariosRoutes from "./routes/usuarios";
import authRoutes from "./routes/auth";
import turnosRoutes from "./routes/turnos";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/turnos", turnosRoutes);
app.use("/api/hospitales", hospitalesRouter);
app.use("/api", usuariosRoutes);

app.listen(port, "0.0.0.0", () => {
  console.log(`API escuchando en http://localhost:${port}`);
});