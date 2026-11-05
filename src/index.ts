import "dotenv/config";
import express from "express";
import cors from "cors";
import hospitalesRouter from "./routes/hospitales";
import usuariosRoutes from "./routes/usuarios";
import authRoutes from "./routes/auth";
import turnosRoutes from "./routes/turnos";
import { requiereAuth } from "./middleware/auth";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Públicas: /api/health (arriba) y /api/auth (login, registro, restablecer)
app.use("/api/auth", authRoutes);

// Todo lo que sigue exige un token de sesión válido
app.use("/api", requiereAuth);
app.use("/api/turnos", turnosRoutes);
app.use("/api/hospitales", hospitalesRouter);
app.use("/api", usuariosRoutes);

app.listen(port, "0.0.0.0", () => {
  console.log(`API escuchando en http://localhost:${port}`);
});