import { Router } from 'express';
import { prisma } from '../prisma';

const router = Router();

// Únicos nombres de nivel de triaje permitidos en la base
const NIVELES_VALIDOS = ['Emergencia', 'Urgente', 'Moderado', 'Leve', 'Sin urgencia'];

const PRIORIDAD: Record<string, number> = {
  'Emergencia': 0, 'Urgente': 1, 'Moderado': 2, 'Leve': 3, 'Sin urgencia': 4,
  
  'Resucitación': 0, 'Urgencia': 1, 'Menos Urgente': 3, 'No Urgente': 4,
};
const prioridad = (nivel: string) => PRIORIDAD[nivel] ?? 99;
const MINUTOS_POR_PACIENTE = 15; // el mismo valor que usa /hospitales/:id/stats
const enteroOpcional = (v: unknown) =>
  v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v);

const texto = (v: unknown) => (v == null || String(v).trim() === '' ? null : String(v).trim());

const decimal = (v: unknown) =>
  v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v);
// Busca si ese usuario ya creó un turno que sigue pendiente o activo
const turnoVigentePorUsuario = (usuarioId: number) =>
  prisma.turno.findFirst({
    where: {
      creadorId: usuarioId,
      valido: true,
      estado: { in: ['Pendiente', 'Activo'] },
    },
    include: { hospital: { select: { nombre: true } } },
  });
// ─────────────────────────────────────────────────────────────
// CREAR TURNOS
// ─────────────────────────────────────────────────────────────

// POST /api/turnos - El paciente crea un pre-registro desde la app
router.post('/', async (req, res) => {
  try {
    const {
      hospitalId, creadorId, pacienteNombre, pacienteDni, pacienteEdad, pacienteTelefono,
      motivo, nivel, color, triaje,
    } = req.body;

    if (!NIVELES_VALIDOS.includes(nivel)) {
      return res.status(400).json({ error: `Nivel de triaje inválido: ${nivel}` });
    }
    if (creadorId != null) {
      const vigente = await turnoVigentePorUsuario(Number(creadorId));
      if (vigente) {
        return res.status(409).json({
          error: `Ya tenés un turno ${vigente.estado === 'Activo' ? 'activo' : 'pendiente'} en ${vigente.hospital.nombre}. Cancelalo antes de sacar otro.`,
        });
      }
    }
    const nuevoTurno = await prisma.turno.create({
      data: {
        hospitalId,
        creadorId: creadorId != null ? Number(creadorId) : null,
        pacienteNombre,
        pacienteDni: String(pacienteDni ?? '').replace(/\D/g, ''),
        pacienteEdad: enteroOpcional(pacienteEdad),
        pacienteTelefono: texto(pacienteTelefono),
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
          },
        },
      },
    });

    return res.status(201).json(nuevoTurno);
  } catch (error) {
    console.error('Error creando el turno:', error);
    return res.status(500).json({ error: 'No se pudo crear el turno' });
  }
});

// POST /api/turnos/presencial - La secretaria ingresa un paciente que llegó sin pre-registro
router.post('/presencial', async (req, res) => {
  try {
    const { secretariaId, pacienteNombre, pacienteDni, pacienteEdad, motivo, nivel, color } = req.body;

    if (!secretariaId || !pacienteNombre?.trim() || !pacienteDni?.trim() || !motivo?.trim() || !nivel) {
      return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }
    if (!NIVELES_VALIDOS.includes(nivel)) {
      return res.status(400).json({ error: `Nivel de triaje inválido: ${nivel}` });
    }

    // El hospital sale de la secretaria, no del frontend
    const secretaria = await prisma.usuario.findUnique({ where: { id: Number(secretariaId) } });
    if (!secretaria || secretaria.rol !== 'Secretaria' || !secretaria.activo) {
      return res.status(403).json({ error: 'No tenés permisos para ingresar pacientes' });
    }
    if (!secretaria.hospitalId) {
      return res.status(400).json({ error: 'Tu cuenta no tiene hospital asignado' });
    }

    const turno = await prisma.turno.create({
      data: {
        hospitalId: secretaria.hospitalId,
        creadorId: secretaria.id,
        pacienteNombre: String(pacienteNombre).trim(),
        pacienteDni: String(pacienteDni).replace(/\D/g, ''),
        pacienteEdad: enteroOpcional(pacienteEdad),
        motivo: String(motivo).trim(),
        nivel: String(nivel),
        color: color ?? null,
        estado: 'Activo', // entra directo a la sala de espera
      },
    });

    return res.status(201).json(turno);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'No se pudo registrar el ingreso' });
  }
});

// POST /api/turnos/ambulancia - La ambulancia notifica un traslado al hospital de destino
router.post('/ambulancia', async (req, res) => {
  try {
    const {
      ambulanciaId, hospitalId, pacienteNombre, pacienteDni, pacienteEdad, pacienteSexo,
      pacientePresion, motivo, tipoIncidente, nivel, color, signos,
    } = req.body;

    if (!ambulanciaId || !hospitalId || !nivel) {
      return res.status(400).json({ error: 'Faltan el hospital de destino o la prioridad' });
    }
    if (!NIVELES_VALIDOS.includes(nivel)) {
      return res.status(400).json({ error: `Nivel de triaje inválido: ${nivel}` });
    }

    const ambulancia = await prisma.usuario.findUnique({ where: { id: Number(ambulanciaId) } });
    if (!ambulancia || !['Ambulancia', 'Profesional'].includes(ambulancia.rol) || !ambulancia.activo) {
      return res.status(403).json({ error: 'No tenés permisos para notificar traslados' });
    }

    const hospital = await prisma.hospital.findUnique({ where: { id: String(hospitalId) } });
    if (!hospital) return res.status(404).json({ error: 'Hospital no encontrado' });

    const turno = await prisma.turno.create({
      data: {
        hospitalId: hospital.id,
        creadorId: ambulancia.id,
        pacienteNombre: texto(pacienteNombre) ?? 'NN (no identificado)',
        pacienteDni: String(pacienteDni ?? '').replace(/\D/g, ''),
        pacienteEdad: enteroOpcional(pacienteEdad),
        pacienteSexo: texto(pacienteSexo),
        pacientePresion: texto(pacientePresion),
        motivo: texto(motivo) ?? texto(tipoIncidente) ?? 'Traslado en ambulancia',
        tipoIncidente: texto(tipoIncidente) ?? 'Sin especificar', // marca que vino en ambulancia
        nivel: String(nivel),
        color: color ?? null,
        estado: 'Pendiente', // en camino
        triaje: {
          create: {
            estadoConciencia: texto(signos?.estadoConciencia),
            frecuenciaCardiaca: enteroOpcional(signos?.frecuenciaCardiaca),
            frecuenciaRespiratoria: enteroOpcional(signos?.frecuenciaRespiratoria),
            saturacionOxigeno: enteroOpcional(signos?.saturacionOxigeno),
            temperatura: decimal(signos?.temperatura),
            glucemia: enteroOpcional(signos?.glucemia),
            glasgow: enteroOpcional(signos?.glasgow),
            tratamientoPrevio: texto(signos?.tratamiento),
          },
        },
      },
      include: { hospital: true },
    });

    return res.status(201).json(turno);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'No se pudo notificar el traslado' });
  }
});

// ─────────────────────────────────────────────────────────────
// LISTADOS
// ─────────────────────────────────────────────────────────────

// GET /api/turnos/hospital/:hospitalId?estados=Pendiente,Activo&hoy=1
router.get('/hospital/:hospitalId', async (req, res) => {
  try {
    const estados = String(req.query.estados ?? 'Pendiente,Activo')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const where: any = { hospitalId: req.params.hospitalId, estado: { in: estados } };

    // hoy=1 → atendidos hoy, o cancelados creados hoy (no tienen fechaAtencion)
    if (req.query.hoy === '1') {
      const inicioDelDia = new Date();
      inicioDelDia.setHours(0, 0, 0, 0);
      where.OR = [
        { fechaAtencion: { gte: inicioDelDia } },
        { fechaAtencion: null, fechaCreacion: { gte: inicioDelDia } },
      ];
    }

    const turnos = await prisma.turno.findMany({
      where,
      orderBy: { fechaCreacion: 'asc' },
    });

    return res.json(turnos);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error al obtener los turnos del hospital' });
  }
});

// GET /api/turnos/ambulancia/:usuarioId - Traslados realizados por esa ambulancia
router.get('/ambulancia/:usuarioId', async (req, res) => {
  try {
    const usuarioId = Number(req.params.usuarioId);
    if (Number.isNaN(usuarioId)) return res.status(400).json({ error: 'Id inválido' });

    const traslados = await prisma.turno.findMany({
      where: { creadorId: usuarioId },
      include: { hospital: { select: { id: true, nombre: true } } },
      orderBy: { fechaCreacion: 'desc' },
    });

    return res.json(traslados);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error al obtener los traslados' });
  }
});

// GET /api/turnos/paciente/:usuarioId/activo - Turno vigente del paciente (o null)
router.get('/paciente/:usuarioId/activo', async (req, res) => {
  try {
    const usuarioId = Number(req.params.usuarioId);
    if (Number.isNaN(usuarioId)) return res.status(400).json({ error: 'Id inválido' });

    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    const turno = await prisma.turno.findFirst({
      where: {
        valido: true,
        estado: { in: ['Pendiente', 'Activo'] },
        OR: [
          { creadorId: usuarioId },
          ...(usuario.dni ? [{ pacienteDni: usuario.dni }] : []),
        ],
      },
      include: { hospital: true },
      orderBy: { fechaCreacion: 'desc' },
    });

        if (!turno) return res.json(null);

    // Pacientes que ya están en la sala de ese hospital (sin contar este turno)
    const enSala = await prisma.turno.findMany({
      where: {
        hospitalId: turno.hospitalId,
        valido: true,
        estado: 'Activo',
        id: { not: turno.id },
      },
      select: { nivel: true, fechaCreacion: true },
    });

    const miPrioridad = prioridad(turno.nivel);
    const personasAdelante = enSala.filter((t) => {
      const p = prioridad(t.nivel);
      if (p !== miPrioridad) return p < miPrioridad;   // más urgente → va antes
      // Mismo nivel: si todavía no llegué, todos los que ya están en sala van antes;
      // si ya llegué, solo los que se registraron antes que yo
      return turno.estado === 'Pendiente' || t.fechaCreacion < turno.fechaCreacion;
    }).length;

    return res.json({
      ...turno,
      personasAdelante,
      posicion: personasAdelante + 1,
      esperaEstimadaMin: personasAdelante * MINUTOS_POR_PACIENTE,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error al obtener el turno' });
  }
});

// GET /api/turnos/paciente/:usuarioId/historial - Finalizados y cancelados del paciente
router.get('/paciente/:usuarioId/historial', async (req, res) => {
  try {
    const usuarioId = Number(req.params.usuarioId);
    if (Number.isNaN(usuarioId)) return res.status(400).json({ error: 'Id inválido' });

    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    const turnos = await prisma.turno.findMany({
      where: {
        estado: { in: ['Finalizado', 'Cancelado'] },
        OR: [
          { creadorId: usuarioId },
          ...(usuario.dni ? [{ pacienteDni: usuario.dni }] : []),
        ],
      },
      include: { hospital: true },
      orderBy: { fechaCreacion: 'desc' },
    });

    return res.json(turnos);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error al obtener el historial' });
  }
});

// ─────────────────────────────────────────────────────────────
// UN TURNO (estas rutas van al final porque usan /:id)
// ─────────────────────────────────────────────────────────────
// GET /api/turnos/usuario/:usuarioId/vigente - ¿Este usuario ya tiene un turno pendiente o activo?
router.get('/usuario/:usuarioId/vigente', async (req, res) => {
  try {
    const usuarioId = Number(req.params.usuarioId);
    if (Number.isNaN(usuarioId)) return res.status(400).json({ error: 'Id inválido' });
    const turno = await turnoVigentePorUsuario(usuarioId);
    return res.json(turno); // null si no tiene
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error al verificar turnos' });
  }
});
// GET /api/turnos/:id - Detalle de un turno (con triaje y hospital)
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Id inválido' });

    const turno = await prisma.turno.findUnique({
      where: { id },
      include: { hospital: true, triaje: true },
    });
    if (!turno) return res.status(404).json({ error: 'Turno no encontrado' });

    return res.json(turno);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error al obtener el turno' });
  }
});

// PATCH /api/turnos/:id - La secretaria edita la ficha (re-evaluación)
router.patch('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Id inválido' });

    const { motivo, nivel, color } = req.body;

    if (nivel !== undefined && !NIVELES_VALIDOS.includes(nivel)) {
      return res.status(400).json({ error: `Nivel de triaje inválido: ${nivel}` });
    }

    const data: any = {};
    if (motivo !== undefined) {
      if (!String(motivo).trim()) return res.status(400).json({ error: 'El motivo no puede quedar vacío' });
      data.motivo = String(motivo).trim();
    }
    if (nivel !== undefined) data.nivel = String(nivel);
    if (color !== undefined) data.color = color;

    const turno = await prisma.turno.update({ where: { id }, data });
    return res.json(turno);
  } catch (error: any) {
    if (error?.code === 'P2025') return res.status(404).json({ error: 'Turno no encontrado' });
    console.error(error);
    return res.status(500).json({ error: 'Error al actualizar la ficha' });
  }
});

// PATCH /api/turnos/:id/estado  body: { estado: 'Activo' | 'Cancelado' | 'Finalizado' }
router.patch('/:id/estado', async (req, res) => {
  try {
    const { estado } = req.body;
    const permitidos = ['Activo', 'Cancelado', 'Finalizado'];
    if (!permitidos.includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    const turno = await prisma.turno.update({
      where: { id: Number(req.params.id) },
      data: {
        estado,
        ...(estado === 'Cancelado' ? { valido: false } : {}),
        ...(estado === 'Finalizado' ? { fechaAtencion: new Date() } : {}),
      },
      include: { hospital: true },
    });

    return res.json(turno);
  } catch (error: any) {
    if (error?.code === 'P2025') return res.status(404).json({ error: 'Turno no encontrado' });
    console.error(error);
    return res.status(500).json({ error: 'Error al actualizar el turno' });
  }
});

export default router;