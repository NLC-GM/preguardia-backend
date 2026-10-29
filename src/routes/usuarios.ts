import { Router } from 'express';
// En vez de crear un PrismaClient nuevo, importamos el que ya tenés en src/prisma.ts
import {prisma} from '../prisma'; 

const router = Router();

// POST: Crear usuario de personal
router.post('/usuarios/personal', async (req, res) => {
  try {
    const { nombre, dni, email, password, rol, hospitalId } = req.body;

    if (!nombre || !dni || !email || !password || !rol || !hospitalId) {
      return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }

    const nuevoUsuario = await prisma.usuario.create({
      data: {
        nombre,
        dni,
        email,
        password, 
        rol,
        hospitalId, 
        activo: true
      }
    });

    res.status(201).json({ mensaje: 'Usuario creado con éxito', usuario: nuevoUsuario });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear el usuario' });
  }
});

// GET: Obtener personal activo de un hospital
router.get('/hospitales/:hospitalId/personal', async (req, res) => {
  try {
    const { hospitalId } = req.params;

    const personal = await prisma.usuario.findMany({
      where: {
        hospitalId: hospitalId,
        activo: true,
        rol: {
          in: ['Secretaria', 'Ambulancia']
        }
      },
      select: {
        id: true,
        email: true,
        rol: true
      }
    });

    res.json(personal);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener el personal' });
  }
});

// PATCH: Desactivar (borrado lógico) un usuario
router.patch('/usuarios/:id/desactivar', async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.usuario.update({
      where: { id: Number(id) },
      data: { activo: false }
    });

    res.json({ mensaje: 'Usuario desactivado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al desactivar el usuario' });
  }
});

export default router;