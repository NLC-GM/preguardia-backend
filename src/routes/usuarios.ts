import { Router } from 'express';
import { prisma } from '../prisma';
import { requiereRol, soloPropio } from '../middleware/auth';
import { hashearPassword } from '../utils/password';
import { ERROR_DNI, errorFechaNacimiento, esDniValido, limpiarDni } from '../utils/validaciones';

const router = Router();

const campoDuplicado = (error: any): 'email' | 'dni' | null => {
  if (error?.code !== 'P2002') return null;
  const target = JSON.stringify(error?.meta?.target ?? '');
  if (target.includes('dni')) return 'dni';
  if (target.includes('email')) return 'email';
  return null;
};

const SELECT_USUARIO = {
  id: true,
  nombre: true,
  email: true,
  dni: true,
  fechaNacimiento: true,
  celular: true,
  direccion: true,
  rol: true,
  hospital: { select: { id: true, nombre: true } },
} as const;

router.post('/usuarios/personal', requiereRol('Admin'), async (req, res) => {
  try {
    const { nombre, dni, email, password, rol } = req.body;

    if (!nombre?.trim() || !dni?.trim() || !email?.trim() || !password || !rol) {
      return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }
    if (!['Secretaria', 'Ambulancia'].includes(rol)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }
    if (!esDniValido(dni)) {
      return res.status(400).json({ error: ERROR_DNI });
    }

    const admin = req.usuario!;
    if (!admin.hospitalId) {
      return res.status(400).json({ error: 'Tu cuenta de administrador no tiene hospital asignado' });
    }

    const nuevoUsuario = await prisma.usuario.create({
      data: {
        nombre: String(nombre).trim(),
        dni: limpiarDni(dni),
        email: String(email).toLowerCase().trim(),
        password: await hashearPassword(password),
        rol,
        hospitalId: admin.hospitalId,
        activo: true,
      },
    });

    const { password: _pw, ...usuarioSinPassword } = nuevoUsuario;
    return res.status(201).json({ mensaje: 'Usuario creado con éxito', usuario: usuarioSinPassword });
  } catch (error: any) {
    const duplicado = campoDuplicado(error);
    if (duplicado === 'dni') return res.status(409).json({ error: 'Ya existe una cuenta con ese DNI' });
    if (duplicado === 'email') return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
    console.error(error);
    return res.status(500).json({ error: 'Error al crear el usuario' });
  }
});

router.get('/hospitales/:hospitalId/personal', requiereRol('Admin'), async (req, res) => {
  try {
    if (req.usuario!.hospitalId !== req.params.hospitalId) {
      return res.status(403).json({ error: 'Solo podés ver el personal de tu hospital' });
    }

    const personal = await prisma.usuario.findMany({
      where: {
        hospitalId: req.params.hospitalId,
        activo: true,
        rol: { in: ['Secretaria', 'Ambulancia'] },
      },
      select: { id: true, email: true, rol: true },
    });
    return res.json(personal);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error al obtener el personal' });
  }
});

router.patch('/usuarios/:id/desactivar', requiereRol('Admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Id inválido' });

    const usuario = await prisma.usuario.findUnique({ where: { id } });
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (
      !['Secretaria', 'Ambulancia'].includes(usuario.rol) ||
      usuario.hospitalId !== req.usuario!.hospitalId
    ) {
      return res.status(403).json({ error: 'Solo podés desactivar personal de tu hospital' });
    }

    await prisma.usuario.update({ where: { id }, data: { activo: false } });
    return res.json({ mensaje: 'Usuario desactivado correctamente' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error al desactivar el usuario' });
  }
});

router.get('/usuarios/:id', soloPropio('id'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Id inválido' });

    const usuario = await prisma.usuario.findUnique({ where: { id }, select: SELECT_USUARIO });
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    return res.json(usuario);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error al obtener el usuario' });
  }
});

router.patch('/usuarios/:id', soloPropio('id'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Id inválido' });

    const camposPermitidos = ['nombre', 'email', 'dni', 'fechaNacimiento', 'celular', 'direccion'] as const;
    const data: Record<string, string | null> = {};

    for (const campo of camposPermitidos) {
      if (campo in req.body) {
        const valor = req.body[campo];
        const limpio = valor == null ? '' : String(valor).trim();
        data[campo] = limpio === '' ? null : limpio;
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No se enviaron datos para actualizar' });
    }
    if ('nombre' in data && !data.nombre) {
      return res.status(400).json({ error: 'El nombre no puede quedar vacío' });
    }
    if ('email' in data) {
      if (!data.email) return res.status(400).json({ error: 'El email no puede quedar vacío' });
      data.email = data.email.toLowerCase();
    }
    if ('dni' in data && data.dni) {
      if (!esDniValido(data.dni)) return res.status(400).json({ error: ERROR_DNI });
      data.dni = limpiarDni(data.dni);
    }
    if ('fechaNacimiento' in data && data.fechaNacimiento) {
      const errorFecha = errorFechaNacimiento(data.fechaNacimiento);
      if (errorFecha) return res.status(400).json({ error: errorFecha });
    }

    const usuario = await prisma.usuario.update({ where: { id }, data, select: SELECT_USUARIO });
    return res.json(usuario);
  } catch (error: any) {
    const duplicado = campoDuplicado(error);
    if (duplicado === 'dni') return res.status(409).json({ error: 'Ese DNI ya está registrado en otra cuenta' });
    if (duplicado === 'email') return res.status(409).json({ error: 'Ese email ya está en uso por otra cuenta' });
    if (error?.code === 'P2025') return res.status(404).json({ error: 'Usuario no encontrado' });
    console.error(error);
    return res.status(500).json({ error: 'Error al actualizar el usuario' });
  }
});

const aplanarFamiliar = (p: any) => ({
  id: p.familiar.id,
  parentesco: p.parentesco,
  nombre: p.familiar.nombre,
  dni: p.familiar.dni,
  fechaNacimiento: p.familiar.fechaNacimiento,
 
  celular: p.familiar.celular,
  
});

router.get('/usuarios/:id/familiares', soloPropio('id'), async (req, res) => {
  try {
    const usuarioId = Number(req.params.id);
    if (Number.isNaN(usuarioId)) return res.status(400).json({ error: 'Id inválido' });

    const vinculos = await prisma.parentesco.findMany({
      where: { usuarioId },
      include: { familiar: true },
      orderBy: { id: 'asc' },
    });

    return res.json(vinculos.map(aplanarFamiliar));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error al obtener los familiares' });
  }
});

router.post('/usuarios/:id/familiares', soloPropio('id'), async (req, res) => {
  try {
    const usuarioId = Number(req.params.id);
    if (Number.isNaN(usuarioId)) return res.status(400).json({ error: 'Id inválido' });

    const { parentesco, nombre, dni, fechaNacimiento, celular } = req.body;

    if (!parentesco || !nombre?.trim() || !dni?.trim() || !fechaNacimiento?.trim()) {
      return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }
    if (!esDniValido(dni)) {
      return res.status(400).json({ error: ERROR_DNI });
    }
    const errorFecha = errorFechaNacimiento(fechaNacimiento);
    if (errorFecha) return res.status(400).json({ error: errorFecha });

    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    const dniLimpio = limpiarDni(dni);
    const opcional = (v: unknown) => (v == null || String(v).trim() === '' ? null : String(v).trim());

    let familiar = await prisma.familiar.findFirst({ where: { dni: dniLimpio } });
    if (!familiar) {
      familiar = await prisma.familiar.create({
        data: {
          nombre: String(nombre).trim(),
          dni: dniLimpio,
          fechaNacimiento: String(fechaNacimiento).trim(),
         
          celular: opcional(celular),
          
        },
      });
    }

    const vinculo = await prisma.parentesco.create({
      data: { usuarioId, familiarId: familiar.id, parentesco: String(parentesco) },
      include: { familiar: true },
    });

    return res.status(201).json(aplanarFamiliar(vinculo));
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'Esa persona ya está en tu grupo familiar' });
    }
    console.error(error);
    return res.status(500).json({ error: 'Error al agregar el familiar' });
  }
});

router.delete('/usuarios/:id/familiares/:familiarId', soloPropio('id'), async (req, res) => {
  try {
    const usuarioId = Number(req.params.id);
    const familiarId = Number(req.params.familiarId);
    if (Number.isNaN(usuarioId) || Number.isNaN(familiarId)) {
      return res.status(400).json({ error: 'Id inválido' });
    }

    await prisma.parentesco.delete({
      where: { usuarioId_familiarId: { usuarioId, familiarId } },
    });

    const restantes = await prisma.parentesco.count({ where: { familiarId } });
    if (restantes === 0) {
      await prisma.familiar.delete({ where: { id: familiarId } });
    }

    return res.json({ mensaje: 'Familiar eliminado' });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ error: 'Ese familiar no está en tu grupo' });
    }
    console.error(error);
    return res.status(500).json({ error: 'Error al eliminar el familiar' });
  }
});

export default router;