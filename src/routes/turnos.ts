import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// POST /api/turnos - Crear un nuevo turno con su triaje
router.post('/', async (req, res) => {
  try {
    const { 
      hospitalId, 
      creadorId, // <--- Acá recibimos el ID del usuario logueado
      pacienteNombre, 
      pacienteDni, 
      pacienteEdad, 
      motivo, 
      nivel, 
      color, 
      triaje 
    } = req.body;

    const nuevoTurno = await prisma.turno.create({
      data: {
        hospitalId,
        creadorId, 
        pacienteNombre,
        pacienteDni,
        pacienteEdad,
        motivo: motivo || 'Emergencia',
        nivel,
        color,
        estado: 'Pendiente',
        triaje: {
          create: {
            dificultadRespiratoria: triaje?.dificultadRespiratoria || false,
            dolorPechoConSintomas: triaje?.dolorPechoConSintomas || false,
            signosACV: triaje?.signosACV || false,
            perdidaConciencia: triaje?.perdidaConciencia || false,
            sangradoIncontrolable: triaje?.sangradoIncontrolable || false,
            embarazoConAlarma: triaje?.embarazoConAlarma || false,
            convulsionReciente: triaje?.convulsionReciente || false,
            escalaDolor: triaje?.escalaDolor,
            tiempoSintomas: triaje?.tiempoSintomas,
            evolucion: triaje?.evolucion,
            temperatura: triaje?.temperatura,
            frecuenciaCardiaca: triaje?.frecuenciaCardiaca,
            enfermedadCronica: triaje?.enfermedadCronica || false,
            embarazo: triaje?.embarazo || false,
          }
        }
      }
    });

    res.status(201).json(nuevoTurno);
  } catch (error) {
    console.error("Error creando el turno:", error);
    res.status(500).json({ error: 'No se pudo crear el turno' });
  }
});

export default router;