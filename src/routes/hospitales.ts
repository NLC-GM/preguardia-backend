import { Router } from "express";
import { prisma } from "../prisma";

const router = Router();

// GET /api/hospitales — listar todos
router.get("/", async (_req, res) => {
  try {
    const hospitales = await prisma.hospital.findMany({
      orderBy: { nombre: "asc" },
    });
    res.json(hospitales);
  } catch {
    res.status(500).json({ error: "No se pudieron leer los hospitales" });
  }
});



// GET /api/hospitales/:id/stats - Ocupación actual de la guardia
const NIVELES_TRIAJE = ['Emergencia', 'Urgente', 'Moderado', 'Leve', 'Sin urgencia'];

// Por si quedó algún turno con los nombres viejos
const NOMBRES_VIEJOS: Record<string, string> = {
  'Resucitación': 'Emergencia',
  'Urgencia': 'Urgente',
  'Menos Urgente': 'Leve',
  'No Urgente': 'Sin urgencia',
};

router.get("/:id/stats", async (req, res) => {
  try {
    const turnos = await prisma.turno.findMany({
      where: {
        hospitalId: req.params.id,
        valido: true,
        estado: { in: ['Pendiente', 'Activo'] },
      },
      select: { nivel: true, estado: true },
    });

    // Ocupación real: solo los pacientes que ya están en la guardia
    const enGuardia = turnos.filter((t) => t.estado === 'Activo');
    const enCamino = turnos.filter((t) => t.estado === 'Pendiente').length;

    const niveles: Record<string, number> = Object.fromEntries(NIVELES_TRIAJE.map((n) => [n, 0]));
    for (const t of enGuardia) {
      const nivel = NOMBRES_VIEJOS[t.nivel] ?? t.nivel;
      niveles[nivel] = (niveles[nivel] ?? 0) + 1;
    }

    return res.json({
      totalEnEspera: enGuardia.length,
      enSala: enGuardia.length,
      enCamino,
      demoraEstimadaMinutos: enGuardia.length * 15,
      niveles,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al calcular estadísticas" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const hospital = await prisma.hospital.findUnique({
      where: { id: req.params.id },
    });
    if (!hospital) return res.status(404).json({ error: "No existe" });
    res.json(hospital);
  } catch {
    res.status(500).json({ error: "Error inesperado" });
  }
});

// POST /api/hospitales — crear uno
router.post("/", async (req, res) => {
  const { nombre, direccion, lat, lon } = req.body;

  if (!String(nombre ?? "").trim() || !String(direccion ?? "").trim()) {
    return res.status(400).json({ error: "Faltan nombre o direccion" });
  }

  try {
    const hospital = await prisma.hospital.create({
      data: {
        nombre: String(nombre).trim(),
        direccion: String(direccion).trim(),
        lat: lat != null ? Number(lat) : null,
        lon: lon != null ? Number(lon) : null,
      },
    });
    res.status(201).json(hospital);
  } catch {
    res.status(500).json({ error: "No se pudo crear el hospital" });
  }
});

export default router;