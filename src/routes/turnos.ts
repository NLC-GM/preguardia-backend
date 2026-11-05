import { Router } from 'express';
import { prisma } from '../prisma';
import { requiereRol, soloPropio, type UsuarioSesion } from '../middleware/auth';
import { ERROR_DNI, esDniValido, limpiarDni } from '../utils/validaciones';

const router = Router();

// Personal del hospital: puede ver y gestionar los turnos de SU hospital
const ROLES_PERSONAL = ['Secretaria', 'Admin'];
const esPersonalDelHospital = (usuario: UsuarioSesion, hospitalId: string) =>
  ROLES_PERSONAL.includes(usuario.rol) && usuario.hospitalId === hospitalId;

// ¿El usuario creó el turno, o es el paciente del turno (mismo DNI)?
const esDuenioDelTurno = async (
  usuario: UsuarioSesion,
  turno: { creadorId: number | null; pacienteDni: string | null },
) => {
  if (turno.creadorId === usuario.id) return true;
  if (usuario.rol !== 'Paciente' || !turno.pacienteDni) return false;
  const yo = await prisma.usuario.findUnique({ where: { id: usuario.id }, select: { dni: true } });
  return !!yo?.dni && yo.dni === turno.pacienteDni;
};

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
router.post('/', requiereRol('Paciente'), async (req, res) => {
  try {
    const {
      hospitalId, pacienteNombre, pacienteDni, pacienteEdad, pacienteTelefono,
      motivo, nivel, color, triaje,
    } = req.body;
    const creadorId = req.usuario!.id; // sale del token, no del body

    if (!NIVELES_VALIDOS.includes(nivel)) {
      return res.status(400).json({ error: `Nivel de triaje inválido: ${nivel}` });
    }
    if (!esDniValido(pacienteDni)) {
      return res.status(400).json({ error: ERROR_DNI });
    }
    const vigente = await turnoVigentePorUsuario(creadorId);
    if (vigente) {
      return res.status(409).json({
        error: `Ya tenés un turno ${vigente.estado === 'Activo' ? 'activo' : 'pendiente'} en ${vigente.hospital.nombre}. Cancelalo antes de sacar otro.`,
      });
    }
    const nuevoTurno = await prisma.turno.create({
      data: {
        hospitalId,
        creadorId,
        pacienteNombre,
        pacienteDni: limpiarDni(pacienteDni),
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
router.post('/presencial', requiereRol('Secretaria'), async (req, res) => {
  try {
    const { pacienteNombre, pacienteDni, pacienteEdad, motivo, nivel, color } = req.body;

    if (!pacienteNombre?.trim() || !pacienteDni?.trim() || !motivo?.trim() || !nivel) {
      return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }
    if (!NIVELES_VALIDOS.includes(nivel)) {
      return res.status(400).json({ error: `Nivel de triaje inválido: ${nivel}` });
    }
    if (!esDniValido(pacienteDni)) {
      return res.status(400).json({ error: ERROR_DNI });
    }

    // La secretaria (y su hospital) salen del token, no del frontend
    const secretaria = req.usuario!;
    if (!secretaria.hospitalId) {
      return res.status(400).json({ error: 'Tu cuenta no tiene hospital asignado' });
    }

    const turno = await prisma.turno.create({
      data: {
        hospitalId: secretaria.hospitalId,
        creadorId: secretaria.id,
        pacienteNombre: String(pacienteNombre).trim(),
        pacienteDni: limpiarDni(pacienteDni),
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
router.post('/ambulancia', requiereRol('Ambulancia', 'Profesional'), async (req, res) => {
  try {
    const {
      hospitalId, pacienteNombre, pacienteDni, pacienteEdad, pacienteSexo,
      pacientePresion, motivo, tipoIncidente, nivel, color, signos,
    } = req.body;

    if (!hospitalId || !nivel) {
      return res.status(400).json({ error: 'Faltan el hospital de destino o la prioridad' });
    }
    if (!NIVELES_VALIDOS.includes(nivel)) {
      return res.status(400).json({ error: `Nivel de triaje inválido: ${nivel}` });
    }

    // El DNI es opcional (paciente NN), pero si viene tiene que ser válido
    if (limpiarDni(pacienteDni) && !esDniValido(pacienteDni)) {
      return res.status(400).json({ error: `${ERROR_DNI} (o dejalo vacío)` });
    }

    const ambulancia = req.usuario!; // sale del token, no del body

    const hospital = await prisma.hospital.findUnique({ where: { id: String(hospitalId) } });
    if (!hospital) return res.status(404).json({ error: 'Hospital no encontrado' });

    const turno = await prisma.turno.create({
      data: {
        hospitalId: hospital.id,
        creadorId: ambulancia.id,
        pacienteNombre: texto(pacienteNombre) ?? 'NN (no identificado)',
        pacienteDni: limpiarDni(pacienteDni),
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
    if (!esPersonalDelHospital(req.usuario!, req.params.hospitalId)) {
      return res.status(403).json({ error: 'Solo podés ver los turnos de tu hospital' });
    }

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
router.get('/ambulancia/:usuarioId', soloPropio('usuarioId'), async (req, res) => {
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
router.get('/paciente/:usuarioId/activo', soloPropio('usuarioId'), async (req, res) => {
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
router.get('/paciente/:usuarioId/historial', soloPropio('usuarioId'), async (req, res) => {
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
router.get('/usuario/:usuarioId/vigente', soloPropio('usuarioId'), async (req, res) => {
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

    const usuario = req.usuario!;
    if (!esPersonalDelHospital(usuario, turno.hospitalId) && !(await esDuenioDelTurno(usuario, turno))) {
      return res.status(403).json({ error: 'No tenés permisos para ver este turno' });
    }

    return res.json(turno);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error al obtener el turno' });
  }
});

// PATCH /api/turnos/:id - La secretaria edita la ficha (re-evaluación)
router.patch('/:id', requiereRol(...ROLES_PERSONAL), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Id inválido' });

    const existente = await prisma.turno.findUnique({ where: { id }, select: { hospitalId: true } });
    if (!existente) return res.status(404).json({ error: 'Turno no encontrado' });
    if (!esPersonalDelHospital(req.usuario!, existente.hospitalId)) {
      return res.status(403).json({ error: 'Solo podés editar turnos de tu hospital' });
    }

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

    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Id inválido' });

    const existente = await prisma.turno.findUnique({
      where: { id },
      select: { hospitalId: true, creadorId: true, pacienteDni: true },
    });
    if (!existente) return res.status(404).json({ error: 'Turno no encontrado' });

    // El personal del hospital puede cualquier estado; el creador o el paciente
    // solo pueden avisar que llegaron (Activo) o cancelar
    const usuario = req.usuario!;
    if (!esPersonalDelHospital(usuario, existente.hospitalId)) {
      if (!(await esDuenioDelTurno(usuario, existente))) {
        return res.status(403).json({ error: 'No tenés permisos para modificar este turno' });
      }
      if (estado === 'Finalizado') {
        return res.status(403).json({ error: 'Solo el personal del hospital puede finalizar un turno' });
      }
    }

    const turno = await prisma.turno.update({
      where: { id },
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