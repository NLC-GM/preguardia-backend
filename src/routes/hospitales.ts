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

// GET /api/hospitales/:id — uno solo
// GET /api/hospitales/:id/stats - Estadísticas de ocupación
router.get("/:id/stats", async (req, res) => {
  try {
    const { id } = req.params;

    // Buscamos los turnos usando el estado 'Pendiente' de tu schema
    const turnos = await prisma.turno.findMany({
      where: {
        hospitalId: id,
        estado: 'Pendiente', 
      },
    });

    const totalEnEspera = turnos.length;
    
    // Filtramos usando la propiedad 'nivel' de tu schema
    const niveles = {
      'Resucitación': turnos.filter(t => t.nivel === 'Resucitación').length,
      'Emergencia': turnos.filter(t => t.nivel === 'Emergencia').length,
      'Urgencia': turnos.filter(t => t.nivel === 'Urgencia').length,
      'Menos Urgente': turnos.filter(t => t.nivel === 'Menos Urgente').length,
      'No Urgente': turnos.filter(t => t.nivel === 'No Urgente').length,
    };

    const demoraEstimadaMinutos = totalEnEspera * 15; 

    res.json({
      totalEnEspera,
      demoraEstimadaMinutos,
      niveles
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al calcular estadísticas" });
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