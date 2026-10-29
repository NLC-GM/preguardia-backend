import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Endpoint para Iniciar Sesión
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { hospital: true } // Traemos los datos del hospital al que pertenece
    });

    if (!usuario || usuario.password !== password) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }
    
    if (!usuario.activo) {
      return res.status(403).json({ error: 'Esta cuenta fue desactivada' });
    }

    // Si todo está bien, devolvemos los datos del usuario
    res.json(usuario);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// Endpoint para Registrar Paciente (desde Crear Cuenta)
router.post('/registro', async (req, res) => {
  const { nombre, email, password } = req.body;
  
  try {
    const nuevoPaciente = await prisma.usuario.create({
      data: {
        nombre,
        email: email.toLowerCase().trim(),
        password,
        rol: 'Paciente',
        activo: true
      }
    });
    res.json(nuevoPaciente);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear la cuenta' });
  }
});

export default router;